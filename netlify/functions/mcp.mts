import type { Config } from "@netlify/functions";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "../lib/mcp-server";
import { requireMCP, origin, jsonError, noStore } from "../lib/auth";
import { CRMError } from "../lib/schema";
export default async (req: Request) => {
  try {
    await requireMCP(req);
    if (req.method !== "POST")
      return new Response(null, {
        status: 405,
        headers: { ...noStore, Allow: "POST" },
      });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createServer();
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    if (e instanceof CRMError && e.status === 401)
      return Response.json(
        { error: "unauthorized" },
        {
          status: 401,
          headers: {
            ...noStore,
            "WWW-Authenticate": `Bearer resource_metadata="${origin()}/.well-known/oauth-protected-resource/mcp", scope="crm"`,
          },
        },
      );
    return jsonError(e);
  }
};
export const config: Config = {
  path: "/mcp",
  rateLimit: {
    windowSize: 60,
    windowLimit: 100,
    aggregateBy: ["ip", "domain"],
  },
};
