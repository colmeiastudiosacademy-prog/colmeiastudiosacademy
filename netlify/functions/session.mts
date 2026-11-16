import type { Config } from "@netlify/functions";
import {
  checkOwner,
  newSession,
  sessionCookie,
  requireSession,
  sameOrigin,
  jsonError,
  noStore,
  cookieToken,
  hash,
} from "../lib/auth";
import { transaction } from "../lib/store";
import { CRMError } from "../lib/schema";
export default async (req: Request) => {
  try {
    if (req.method === "GET") {
      await requireSession(req);
      return Response.json({ authenticated: true }, { headers: noStore });
    }
    if (req.method === "POST") {
      sameOrigin(req);
      const p = await req.json();
      if (
        typeof p.password !== "string" ||
        p.password.length > 256 ||
        !(await checkOwner(p.password))
      )
        throw new CRMError(401, "Senha incorreta");
      const token = await newSession();
      return Response.json(
        { authenticated: true },
        { headers: { ...noStore, "Set-Cookie": sessionCookie(token) } },
      );
    }
    if (req.method === "DELETE") {
      sameOrigin(req);
      if (new URL(req.url).searchParams.get("connections") === "1") {
        await requireSession(req);
        await transaction((c) =>
          c.query("DELETE FROM crm_tokens WHERE kind IN ('access','refresh')"),
        );
        return Response.json({ revoked: true }, { headers: noStore });
      }
      const token = cookieToken(req);
      if (token)
        await transaction((c) =>
          c.query("DELETE FROM crm_tokens WHERE token_hash=$1", [hash(token)]),
        );
      return Response.json(
        { authenticated: false },
        { headers: { ...noStore, "Set-Cookie": sessionCookie("", 0) } },
      );
    }
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, POST, DELETE" },
    });
  } catch (e) {
    return jsonError(e);
  }
};
export const config: Config = {
  path: "/api/session",
  rateLimit: { windowSize: 60, windowLimit: 15, aggregateBy: ["ip", "domain"] },
};
