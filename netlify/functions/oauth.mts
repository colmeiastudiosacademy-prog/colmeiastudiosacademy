import type { Config } from "@netlify/functions";
import { createHash } from "node:crypto";
import {
  env,
  origin,
  hash,
  random,
  equal,
  checkOwner,
  signForm,
  readForm,
  sameOrigin,
  noStore,
  jsonError,
} from "../lib/auth";
import { transaction } from "../lib/store";
import { CRMError } from "../lib/schema";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function validateAuthorize(p: URLSearchParams) {
  if (p.get("client_id") !== env("CRM_OAUTH_CLIENT_ID"))
    throw new CRMError(400, "Cliente OAuth não autorizado");
  const redirect = p.get("redirect_uri") || "";
  if (
    !env("CRM_OAUTH_REDIRECT_URIS")
      .split(",")
      .map((s) => s.trim())
      .includes(redirect)
  )
    throw new CRMError(400, "Callback OAuth não autorizado");
  if (
    p.get("response_type") !== "code" ||
    p.get("code_challenge_method") !== "S256" ||
    !p.get("code_challenge")?.match(/^[A-Za-z0-9_-]{43}$/)
  )
    throw new CRMError(400, "OAuth requer authorization code e PKCE S256");
  if (p.get("resource") && p.get("resource") !== origin() + "/mcp")
    throw new CRMError(400, "Resource inválido");
  if (
    (p.get("scope") || "crm")
      .split(" ")
      .some((s) => s !== "crm" && s !== "offline_access")
  )
    throw new CRMError(400, "Escopo inválido");
  return {
    clientId: p.get("client_id")!,
    redirect,
    challenge: p.get("code_challenge")!,
    state: p.get("state") || "",
    resource: origin() + "/mcp",
  };
}
async function tokens(c: any, clientId: string, family: string) {
  const access = random(),
    refresh = random();
  await c.query(
    "INSERT INTO crm_tokens(token_hash,kind,client_id,family,resource,expires_at) VALUES ($1,'access',$3,$4,$5,now()+interval '1 hour'),($2,'refresh',$3,$4,$5,now()+interval '30 days')",
    [hash(access), hash(refresh), clientId, family, origin() + "/mcp"],
  );
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refresh,
    scope: "crm",
  };
}
export default async (req: Request) => {
  try {
    const u = new URL(req.url);
    const base = origin();
    if (u.pathname.startsWith("/.well-known/"))
      return Response.json(
        u.pathname.includes("oauth-protected-resource")
          ? {
              resource: base + "/mcp",
              authorization_servers: [base],
              scopes_supported: ["crm"],
              bearer_methods_supported: ["header"],
            }
          : {
              issuer: base,
              authorization_endpoint: base + "/oauth/authorize",
              token_endpoint: base + "/oauth/token",
              revocation_endpoint: base + "/oauth/revoke",
              response_types_supported: ["code"],
              grant_types_supported: ["authorization_code", "refresh_token"],
              code_challenge_methods_supported: ["S256"],
              token_endpoint_auth_methods_supported: [
                "client_secret_post",
                "client_secret_basic",
              ],
              scopes_supported: ["crm", "offline_access"],
            },
        { headers: noStore },
      );
    if (u.pathname === "/oauth/authorize") {
      if (req.method === "GET") {
        const p = validateAuthorize(u.searchParams);
        const form = await signForm(p);
        const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar Colmeia CRM</title><style>body{background:#101014;color:#eee;font:16px system-ui;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:420px;margin:24px;padding:32px;border:1px solid #443142;border-radius:16px;background:#1c171e}h1{font-size:26px}p{color:#b9a7b7;line-height:1.7}input,button{box-sizing:border-box;width:100%;border:1px solid #69445e;border-radius:8px;padding:14px;margin-top:14px;font:inherit;background:#151016;color:white}button{background:#f43f8e;cursor:pointer}small{display:block;margin-top:20px;color:#9b8494}</style><main><h1>Conectar sua Colmeia</h1><p>Você está autorizando o cliente OAuth cadastrado a consultar e alterar salões, clientes, histórico, follow-ups e configurações do CRM.</p><p>As exclusões vão para a lixeira. Nenhuma mensagem será enviada automaticamente.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="form" value="${esc(form)}"><label>Sua senha do CRM<input name="password" type="password" required autocomplete="current-password" maxlength="256"></label><button>Autorizar conexão</button></form><small>Feche esta janela para cancelar.</small></main></html>`;
        return new Response(html, {
          headers: {
            ...noStore,
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      if (req.method === "POST") {
        sameOrigin(req);
        const p = await req.formData();
        const v = await readForm(String(p.get("form") || ""));
        const password = String(p.get("password") || "");
        if (password.length > 256 || !checkOwner(password))
          throw new CRMError(401, "Senha incorreta. Volte e tente novamente.");
        if (
          v.clientId !== env("CRM_OAUTH_CLIENT_ID") ||
          !env("CRM_OAUTH_REDIRECT_URIS")
            .split(",")
            .map((s) => s.trim())
            .includes(String(v.redirect))
        )
          throw new CRMError(400, "Conexão OAuth inválida");
        const code = random();
        await transaction((c) =>
          c.query(
            "INSERT INTO crm_auth_codes(code_hash,client_id,redirect_uri,challenge,resource,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '5 minutes')",
            [hash(code), v.clientId, v.redirect, v.challenge, v.resource],
          ),
        );
        const dest = new URL(String(v.redirect));
        dest.searchParams.set("code", code);
        if (v.state) dest.searchParams.set("state", String(v.state));
        return new Response(null, {
          status: 303,
          headers: { ...noStore, Location: dest.toString() },
        });
      }
    }
    if (
      ["/oauth/token", "/oauth/revoke"].includes(u.pathname) &&
      req.method === "POST"
    ) {
      const p = new URLSearchParams(await req.text());
      let clientId = p.get("client_id") || "",
        secret = p.get("client_secret") || "";
      const basic = req.headers.get("authorization")?.match(/^Basic (.+)$/i);
      if (basic) {
        const b = Buffer.from(basic[1], "base64").toString();
        const sep = b.indexOf(":");
        clientId = decodeURIComponent(b.slice(0, sep));
        secret = decodeURIComponent(b.slice(sep + 1));
      }
      if (
        !equal(clientId, env("CRM_OAUTH_CLIENT_ID")) ||
        !equal(secret, env("CRM_OAUTH_CLIENT_SECRET"))
      )
        throw new CRMError(401, "invalid_client");
      if (u.pathname === "/oauth/revoke") {
        await transaction(async (c) => {
          const r = await c.query(
            "SELECT family FROM crm_tokens WHERE token_hash=$1 AND client_id=$2",
            [hash(p.get("token") || ""), clientId],
          );
          if (r.rows[0])
            await c.query("DELETE FROM crm_tokens WHERE family=$1", [
              r.rows[0].family,
            ]);
        });
        return new Response(null, { status: 200, headers: noStore });
      }
      if (p.get("resource") && p.get("resource") !== base + "/mcp")
        throw new CRMError(400, "invalid_target");
      const result = await transaction(async (c) => {
        if (p.get("grant_type") === "authorization_code") {
          const { rows } = await c.query(
            "DELETE FROM crm_auth_codes WHERE code_hash=$1 AND expires_at>now() RETURNING *",
            [hash(p.get("code") || "")],
          );
          const code = rows[0];
          const verifier = p.get("code_verifier") || "";
          if (
            !code ||
            code.client_id !== clientId ||
            code.resource !== base + "/mcp" ||
            code.redirect_uri !== p.get("redirect_uri") ||
            !verifier.match(/^[A-Za-z0-9._~-]{43,128}$/) ||
            !equal(
              createHash("sha256").update(verifier).digest("base64url"),
              code.challenge,
            )
          )
            throw new CRMError(400, "invalid_grant");
          return tokens(c, clientId, random());
        }
        if (p.get("grant_type") === "refresh_token") {
          const { rows } = await c.query(
            "DELETE FROM crm_tokens WHERE token_hash=$1 AND kind='refresh' AND client_id=$2 AND resource=$3 AND expires_at>now() RETURNING family",
            [hash(p.get("refresh_token") || ""), clientId, base + "/mcp"],
          );
          if (!rows[0]) throw new CRMError(400, "invalid_grant");
          await c.query(
            "DELETE FROM crm_tokens WHERE family=$1 AND kind='access'",
            [rows[0].family],
          );
          return tokens(c, clientId, rows[0].family);
        }
        throw new CRMError(400, "unsupported_grant_type");
      });
      return Response.json(result, { headers: noStore });
    }
    return new Response(null, { status: 405 });
  } catch (e) {
    return jsonError(e);
  }
};
export const config: Config = {
  path: [
    "/oauth/authorize",
    "/oauth/token",
    "/oauth/revoke",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ],
  rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ["ip", "domain"] },
};
