import type { Config } from "@netlify/functions";
import { env, origin, requireSession, jsonError, noStore } from "../lib/auth";
export default async (req: Request) => {
  try {
    await requireSession(req);
    if (req.method !== "GET") return new Response(null, { status: 405 });
    return Response.json(
      {
        url: origin() + "/mcp",
        clientId: env("CRM_OAUTH_CLIENT_ID"),
        clientSecret: env("CRM_OAUTH_CLIENT_SECRET"),
        redirectUris: env("CRM_OAUTH_REDIRECT_URIS"),
      },
      { headers: noStore },
    );
  } catch (e) {
    return jsonError(e);
  }
};
export const config: Config = {
  path: "/api/connection",
  rateLimit: { windowSize: 60, windowLimit: 15, aggregateBy: ["ip", "domain"] },
};
