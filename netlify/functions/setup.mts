import type { Config } from "@netlify/functions";
import { randomBytes, scryptSync } from "node:crypto";
import {
  env,
  hash,
  equal,
  sameOrigin,
  newSession,
  sessionCookie,
  noStore,
  jsonError,
} from "../lib/auth";
import { transaction } from "../lib/store";
import { CRMError } from "../lib/schema";
export default async (req: Request) => {
  try {
    if (req.method === "GET") {
      const nonce = randomBytes(18).toString("base64");
      return new Response(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ativar Colmeia CRM</title><style>body{background:#101014;color:#eee;font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0}main{width:400px;max-width:85vw;padding:30px;background:#1c171e;border:1px solid #443142;border-radius:16px}p{color:#ae96a5;line-height:1.7}label{display:block;margin-top:20px}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:10px;background:#151016;color:white;border:1px solid #69445e;border-radius:8px;font:inherit}button{background:#f43f8e;cursor:pointer}small{color:#967e91;line-height:1.7;display:block;margin-top:18px}</style><main><h1>Ative sua Colmeia</h1><p>Escolha a senha de acesso ao seu CRM. Este link de ativação só pode ser usado uma vez.</p><form method="post" action="/setup"><input type="hidden" name="token" id="token"><label>Nova senha (mínimo 12 caracteres)<input type="password" name="password" id="password" autocomplete="new-password" minlength="12" maxlength="256" required></label><label>Confirme a senha<input type="password" id="confirm" autocomplete="new-password" required></label><button>Definir senha e entrar</button></form><small>A senha não é enviada ao ChatGPT e é armazenada somente como hash seguro no banco.</small><p id="message"></p><script nonce="${nonce}">const token=location.hash.slice(1);history.replaceState(null,'','/setup');document.getElementById('token').value=token;if(!token){document.getElementById('message').textContent='Abra o link completo de ativação fornecido na conversa.';document.querySelector('button').disabled=true}document.querySelector('form').addEventListener('submit',event=>{if(document.getElementById('password').value!==document.getElementById('confirm').value){event.preventDefault();document.getElementById('message').textContent='As senhas não conferem.'}});</script></main></html>`,
        {
          headers: {
            ...noStore,
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
            "Referrer-Policy": "no-referrer",
          },
        },
      );
    }
    if (req.method !== "POST") return new Response(null, { status: 405 });
    sameOrigin(req);
    const p = await req.formData();
    const token = String(p.get("token") || ""),
      password = String(p.get("password") || "");
    if (!token || !equal(hash(token), env("CRM_SETUP_TOKEN_HASH")))
      throw new CRMError(403, "Link de ativação inválido");
    if (password.length < 12 || password.length > 256)
      throw new CRMError(400, "A senha deve ter de 12 a 256 caracteres");
    const salt = randomBytes(16).toString("hex");
    const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
    await transaction(async (c) => {
      const r = await c.query(
        "INSERT INTO crm_owner (id,password_hash) VALUES ('owner',$1) ON CONFLICT DO NOTHING RETURNING id",
        [passwordHash],
      );
      if (!r.rowCount)
        throw new CRMError(
          409,
          "O CRM já foi ativado. Entre com a senha cadastrada.",
        );
    });
    const session = await newSession();
    return new Response(null, {
      status: 303,
      headers: {
        ...noStore,
        "Set-Cookie": sessionCookie(session),
        Location: "/",
      },
    });
  } catch (e) {
    return jsonError(e);
  }
};
export const config: Config = {
  path: "/setup",
  rateLimit: { windowSize: 60, windowLimit: 10, aggregateBy: ["ip", "domain"] },
};
