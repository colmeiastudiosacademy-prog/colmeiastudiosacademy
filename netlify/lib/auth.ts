import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { transaction } from "./store";
import { CRMError } from "./schema";
export const env = (key: string) => {
  const v = Netlify.env.get(key);
  if (!v) throw new CRMError(503, `Configuração pendente: ${key}`);
  return v;
};
export const origin = () => {
  const u = new URL(env("CRM_ORIGIN"));
  if (
    u.protocol !== "https:" &&
    u.hostname !== "localhost" &&
    u.hostname !== "127.0.0.1"
  )
    throw new CRMError(503, "CRM_ORIGIN deve usar HTTPS");
  return u.origin;
};
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const random = () => randomBytes(32).toString("base64url");
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function checkOwner(password: string) {
  const parts = env("CRM_OWNER_PASSWORD_HASH").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt")
    throw new CRMError(503, "Hash da senha inválido");
  return equal(scryptSync(password, parts[1], 64).toString("hex"), parts[2]);
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== origin())
    throw new CRMError(403, "Origem não autorizada");
}
export function cookieToken(req: Request) {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("crm_session="))
    ?.slice("crm_session=".length);
}
export async function validToken(
  token: string | undefined,
  kind: "access" | "session",
) {
  if (!token) return false;
  return transaction(
    async (c) =>
      (
        await c.query(
          "SELECT token_hash FROM crm_tokens WHERE token_hash=$1 AND kind=$2 AND resource=$3 AND expires_at>now()",
          [hash(token), kind, kind === "access" ? origin() + "/mcp" : origin()],
        )
      ).rowCount === 1,
  );
}
export async function requireSession(req: Request) {
  if (!(await validToken(cookieToken(req), "session")))
    throw new CRMError(401, "Entre no CRM para continuar");
}
export async function requireMCP(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!(await validToken(token, "access")))
    throw new CRMError(401, "Conecte sua conta do CRM");
}
export async function newSession() {
  const token = random();
  await transaction((c) =>
    c.query(
      "INSERT INTO crm_tokens(token_hash,kind,client_id,family,resource,expires_at) VALUES ($1,'session','browser',$2,$3,now()+interval '7 days')",
      [hash(token), random(), origin()],
    ),
  );
  return token;
}
export const sessionCookie = (token: string, maxAge = 604800) =>
  `crm_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
function signingKey() {
  const secret = env("CRM_SIGNING_SECRET");
  if (secret.length < 32)
    throw new CRMError(
      503,
      "CRM_SIGNING_SECRET deve ter no mínimo 32 caracteres",
    );
  return new TextEncoder().encode(secret);
}
export async function signForm(data: Record<string, unknown>) {
  return new SignJWT(data)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(origin())
    .setAudience("crm-oauth-consent")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(signingKey());
}
export async function readForm(token: string) {
  return (
    await jwtVerify(token, signingKey(), {
      issuer: origin(),
      audience: "crm-oauth-consent",
      algorithms: ["HS256"],
    })
  ).payload;
}
export const noStore = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};
export function jsonError(e: unknown) {
  if (e instanceof SyntaxError)
    return Response.json(
      { error: "JSON inválido" },
      { status: 400, headers: noStore },
    );
  if (e instanceof CRMError)
    return Response.json(
      { error: e.message },
      { status: e.status, headers: noStore },
    );
  if (e && typeof e === "object" && "issues" in e)
    return Response.json(
      {
        error: "Dados inválidos",
        details: (e as any).issues.map((i: any) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 400, headers: noStore },
    );
  console.error("CRM request failed", e instanceof Error ? e.name : "Unknown");
  return Response.json(
    {
      error:
        "Falha no servidor. Seus dados não foram alterados por esta operação.",
    },
    { status: 500, headers: noStore },
  );
}
