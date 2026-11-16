import type { Config } from "@netlify/functions";
import { requireSession, sameOrigin, jsonError, noStore } from "../lib/auth";
import { readWorkspace, mutate, listAudit } from "../lib/store";
import { CRMError } from "../lib/schema";
export default async (req: Request) => {
  try {
    await requireSession(req);
    if (req.method === "GET") {
      if (new URL(req.url).searchParams.get("audit") === "true")
        return Response.json(await listAudit(), { headers: noStore });
      return Response.json(await readWorkspace(), { headers: noStore });
    }
    if (req.method === "POST") {
      sameOrigin(req);
      if (Number(req.headers.get("content-length") || 0) > 4_000_000)
        throw new CRMError(413, "Arquivo muito grande");
      const body = await req.text();
      if (Buffer.byteLength(body) > 4_000_000)
        throw new CRMError(413, "Arquivo muito grande");
      const p = JSON.parse(body);
      return Response.json(
        await mutate(p.action, p.input, "browser", p.requestId),
        { headers: noStore },
      );
    }
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  } catch (e) {
    return jsonError(e);
  }
};
export const config: Config = {
  path: "/api/crm",
  rateLimit: {
    windowSize: 60,
    windowLimit: 120,
    aggregateBy: ["ip", "domain"],
  },
};
