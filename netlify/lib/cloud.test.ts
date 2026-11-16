import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { NetlifyDB } from "@netlify/database-dev";
import pg from "pg";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { blankLead, uid, initialSettings } from "../../src/domain";
const runtime = vi.hoisted(() => ({
  pool: null as any,
  vars: new Map<string, string>(),
}));
vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ pool: runtime.pool }),
}));
import { readWorkspace, mutate } from "./store";
import sessionHandler from "../functions/session.mts";
import apiHandler from "../functions/api.mts";
import setupHandler from "../functions/setup.mts";
import connectionHandler from "../functions/connection.mts";
import oauthHandler from "../functions/oauth.mts";
import mcpHandler from "../functions/mcp.mts";
const base = "https://crm.test";
const password = "test-password-only";
let database: NetlifyDB;
beforeAll(async () => {
  (globalThis as any).Netlify = {
    env: { get: (key: string) => runtime.vars.get(key) },
  };
  const salt = randomBytes(16).toString("hex");
  runtime.vars.set(
    "CRM_OWNER_PASSWORD_HASH",
    `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`,
  );
  runtime.vars.set("CRM_ORIGIN", base);
  runtime.vars.set("CRM_SIGNING_SECRET", randomBytes(32).toString("hex"));
  runtime.vars.set("CRM_OAUTH_CLIENT_ID", "test-client");
  runtime.vars.set("CRM_OAUTH_CLIENT_SECRET", randomBytes(32).toString("hex"));
  runtime.vars.set(
    "CRM_OAUTH_REDIRECT_URIS",
    "https://chatgpt.com/connector_platform_oauth_redirect",
  );
  database = new NetlifyDB({ logger: () => {} });
  const url = await database.start();
  runtime.pool = new pg.Pool({ connectionString: url });
  await database.applyMigrations("netlify/database/migrations");
}, 60000);
afterAll(async () => {
  await runtime.pool?.end();
  await database?.stop();
}, 30000);
beforeEach(async () => {
  await runtime.pool.query(
    "TRUNCATE crm_workspace,crm_audit,crm_requests,crm_auth_codes,crm_tokens,crm_owner RESTART IDENTITY",
  );
});
const mutation = (action: string, p: any, key = uid()) =>
  mutate(action, p, "test", key);
const lead = () => ({
  ...blankLead(),
  name: "Salão real",
  whatsapp: "14075551234",
});
async function createLead() {
  const l = lead();
  const r = await mutation("save_lead", { lead: l, expectedRevision: 0 });
  return r.snapshot.leads[0];
}
async function loginCookie() {
  const r = await sessionHandler(
    new Request(base + "/api/session", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  );
  expect(r.status).toBe(200);
  return r.headers.get("set-cookie")!.split(";")[0];
}
async function oauthCode() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: "test-client",
    response_type: "code",
    redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: "state-check",
    resource: base + "/mcp",
    scope: "crm offline_access",
  });
  const consent = await oauthHandler(
    new Request(base + "/oauth/authorize?" + params),
  );
  expect(consent.status).toBe(200);
  const html = await consent.text();
  const form = html.match(/name="form" value="([^"]+)"/)![1];
  const result = await oauthHandler(
    new Request(base + "/oauth/authorize", {
      method: "POST",
      headers: { Origin: base },
      body: new URLSearchParams({ form, password }),
    }),
  );
  expect(result.status).toBe(303);
  const callback = new URL(result.headers.get("location")!);
  expect(callback.searchParams.get("state")).toBe("state-check");
  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    code: callback.searchParams.get("code")!,
    redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
    client_id: "test-client",
    client_secret: runtime.vars.get("CRM_OAUTH_CLIENT_SECRET")!,
    code_verifier: verifier,
  });
  return payload;
}
async function oauthAccess() {
  const payload = await oauthCode();
  const token = await oauthHandler(
    new Request(base + "/oauth/token", { method: "POST", body: payload }),
  );
  expect(token.status).toBe(200);
  return { tokens: await token.json(), payload };
}
async function rpc(
  token: string | undefined,
  method: string,
  params: any = {},
  rpcId = 1,
) {
  return mcpHandler(
    new Request(base + "/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        "Mcp-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
    }),
  );
}
describe("Netlify Database — persistência e integridade", () => {
  it("aplica a migration e começa com banco vazio", async () => {
    const w = await readWorkspace();
    expect(w.leads).toEqual([]);
    expect(w.settings.templates).toHaveLength(24);
    expect(w.version).toBe(0);
  });
  it("cria, edita e recusa uma revisão antiga", async () => {
    const l = await createLead();
    expect(l.revision).toBe(1);
    await mutation("save_lead", {
      lead: { ...l, city: "Boston" },
      expectedRevision: 1,
    });
    await expect(
      mutation("save_lead", {
        lead: { ...l, city: "Miami" },
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readWorkspace()).leads[0].city).toBe("Boston");
  });
  it("detecta duplicados normalizados no servidor", async () => {
    await createLead();
    await expect(
      mutation("save_lead", {
        lead: { ...lead(), name: "Outro", whatsapp: "+1 (407) 555-1234" },
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readWorkspace()).leads).toHaveLength(1);
  });
  it("torna repetição idempotente e recusa reutilização com outro conteúdo", async () => {
    const l = lead(),
      id = uid();
    const p = { lead: l, expectedRevision: 0 };
    await mutation("save_lead", p, id);
    await mutation("save_lead", p, id);
    expect((await readWorkspace()).version).toBe(1);
    await expect(
      mutation("save_lead", { ...p, lead: { ...l, name: "Alterado" } }, id),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("move salão e interações para lixeira e recupera", async () => {
    let l = await createLead();
    const i = {
      id: uid(),
      leadId: l.id,
      at: new Date().toISOString(),
      channel: "whatsapp",
      direction: "enviado",
      text: "Olá",
      result: "Enviado",
    };
    const sent = await mutation("record_interaction", {
      interaction: i,
      expectedRevision: 1,
    });
    l = sent.snapshot.leads[0];
    await mutation("delete_lead", { id: l.id, expectedRevision: l.revision });
    let w = await readWorkspace();
    expect(w.leads).toHaveLength(0);
    expect(w.history).toHaveLength(0);
    expect(w.trash[0].history).toHaveLength(1);
    await mutation("restore_record", { id: l.id });
    w = await readWorkspace();
    expect(w.leads).toHaveLength(1);
    expect(w.history).toHaveLength(1);
    expect(w.trash).toHaveLength(0);
  });
  it("impede contato e follow-up quando bloqueado", async () => {
    let l = await createLead();
    let w = await mutation("save_lead", {
      lead: { ...l, blocked: true },
      expectedRevision: l.revision,
    });
    l = w.snapshot.leads[0];
    expect(l.nextAt).toBeNull();
    await expect(
      mutation("schedule", {
        id: l.id,
        expectedRevision: l.revision,
        nextAt: new Date().toISOString(),
        nextAction: "Contato",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      mutation("record_interaction", {
        expectedRevision: l.revision,
        interaction: {
          id: uid(),
          leadId: l.id,
          at: new Date().toISOString(),
          channel: "whatsapp",
          direction: "enviado",
          text: "oi",
          result: "ok",
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("calcula a cadência no servidor e encerra o quarto envio", async () => {
    let l = await createLead();
    for (let n = 1; n <= 4; n++) {
      const r = await mutation("record_interaction", {
        expectedRevision: l.revision,
        interaction: {
          id: uid(),
          leadId: l.id,
          at: "2026-11-16T12:00:00.000Z",
          channel: "whatsapp",
          direction: "enviado",
          text: "Oi",
          result: "Enviado",
        },
      });
      l = r.snapshot.leads[0];
      if (n === 1) expect(l.nextAt).toBe("2026-11-19T12:00:00.000Z");
    }
    expect(l.stage).toBe("Perdido");
    expect(l.lostReason).toBe("Sem resposta");
  });
  it("registra resposta, próxima ação e atribuição A/B", async () => {
    let l = await createLead();
    let r = await mutation("record_interaction", {
      expectedRevision: l.revision,
      interaction: {
        id: uid(),
        leadId: l.id,
        at: new Date().toISOString(),
        channel: "email",
        direction: "enviado",
        text: "Oi",
        result: "Ok",
        variant: "B",
        attempt: 1,
      },
    });
    l = r.snapshot.leads[0];
    r = await mutation("record_interaction", {
      expectedRevision: l.revision,
      nextAt: "2026-11-20T12:00:00Z",
      nextAction: "Demo",
      interaction: {
        id: uid(),
        leadId: l.id,
        at: new Date().toISOString(),
        channel: "email",
        direction: "recebido",
        text: "Quero",
        result: "Interesse",
      },
    });
    expect(r.snapshot.leads[0].stage).toBe("Respondeu");
    expect(r.snapshot.history.at(-1)?.variant).toBe("B");
  });
  it("cria cliente, exclui e restaura sem perder cadastro", async () => {
    const customer = {
      id: uid(),
      name: "Ana",
      email: "ana@example.com",
      phone: "",
      leadId: null,
      product: "Essencial",
      value: 297,
      status: "Ativo",
      notes: "",
      createdAt: new Date().toISOString(),
    };
    const r = await mutation("save_customer", {
      customer,
      expectedRevision: 0,
    });
    expect(r.snapshot.customers[0].revision).toBe(1);
    await mutation("delete_customer", { id: customer.id, expectedRevision: 1 });
    await mutation("restore_record", { id: customer.id });
    expect((await readWorkspace()).customers[0].name).toBe("Ana");
  });
  it("importa sem apagar existentes e ignora duplicados", async () => {
    const l = await createLead();
    const other = { ...lead(), name: "Outro", whatsapp: "5511999990000" };
    const r = await mutation("import_data", { leads: [l, other] });
    expect(r.result).toMatchObject({ added: 1, skipped: 1 });
    expect(r.snapshot.leads).toHaveLength(2);
  });
  it("valida configurações e não aceita modelos A/B duplicados", async () => {
    const settings = initialSettings();
    settings.templates[1] = settings.templates[0];
    await expect(
      mutation("save_settings", { settings, expectedRevision: 0 }),
    ).rejects.toHaveProperty("issues");
  });
  it("registra autoria e mudança na auditoria", async () => {
    await createLead();
    const { rows } = await runtime.pool.query(
      "SELECT actor,action,workspace_version FROM crm_audit",
    );
    expect(rows).toEqual([
      { actor: "test", action: "save_lead", workspace_version: 1 },
    ]);
    const audit = (
      await runtime.pool.query("SELECT before_data,after_data FROM crm_audit")
    ).rows[0];
    expect(audit.after_data.leads).toHaveLength(1);
    expect(audit.after_data.settings).toBeUndefined();
  });
});
describe("Autenticação do site e OAuth MCP", () => {
  it("ativa proprietário uma única vez e permite login com a senha escolhida", async () => {
    const token = randomBytes(32).toString("base64url");
    runtime.vars.set(
      "CRM_SETUP_TOKEN_HASH",
      createHash("sha256").update(token).digest("hex"),
    );
    const password = "owner-chosen-password";
    const activate = () =>
      setupHandler(
        new Request(base + "/setup", {
          method: "POST",
          headers: { Origin: base },
          body: new URLSearchParams({ token, password }),
        }),
      );
    const r = await activate();
    expect(r.status).toBe(303);
    expect(r.headers.get("set-cookie")).toContain("HttpOnly");
    expect((await activate()).status).toBe(409);
    const login = await sessionHandler(
      new Request(base + "/api/session", {
        method: "POST",
        headers: { Origin: base },
        body: JSON.stringify({ password }),
      }),
    );
    expect(login.status).toBe(200);
  });
  it("rejeita ativação sem o token correto", async () => {
    runtime.vars.set(
      "CRM_SETUP_TOKEN_HASH",
      createHash("sha256").update("valid-token").digest("hex"),
    );
    const r = await setupHandler(
      new Request(base + "/setup", {
        method: "POST",
        headers: { Origin: base },
        body: new URLSearchParams({
          token: "wrong",
          password: "owner-chosen-password",
        }),
      }),
    );
    expect(r.status).toBe(403);
  });
  it("mantém credenciais OAuth disponíveis somente ao dono autenticado", async () => {
    expect(
      (await connectionHandler(new Request(base + "/api/connection"))).status,
    ).toBe(401);
    const cookie = await loginCookie();
    const r = await connectionHandler(
      new Request(base + "/api/connection", { headers: { Cookie: cookie } }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await r.json()).clientId).toBe("test-client");
  });

  it("não aceita token em recurso ou origem diferente", async () => {
    const { tokens } = await oauthAccess();
    runtime.vars.set("CRM_ORIGIN", "https://other.test");
    try {
      expect((await rpc(tokens.access_token, "tools/list")).status).toBe(401);
    } finally {
      runtime.vars.set("CRM_ORIGIN", base);
    }
  });
  it("não troca código com verificador PKCE incorreto", async () => {
    const payload = await oauthCode();
    payload.set("code_verifier", randomBytes(32).toString("base64url"));
    const response = await oauthHandler(
      new Request(base + "/oauth/token", { method: "POST", body: payload }),
    );
    expect(response.status).toBe(400);
  });

  it("API e MCP exigem autenticação; MCP informa discovery OAuth", async () => {
    expect((await apiHandler(new Request(base + "/api/crm"))).status).toBe(401);
    const r = await rpc(undefined, "tools/list");
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(
      "/.well-known/oauth-protected-resource/mcp",
    );
  });
  it("login cria cookie HttpOnly e bloqueia origem diferente", async () => {
    const cookie = await loginCookie();
    expect(cookie).toContain("crm_session=");
    const data = await apiHandler(
      new Request(base + "/api/crm", { headers: { Cookie: cookie } }),
    );
    expect(data.status).toBe(200);
    const bad = await sessionHandler(
      new Request(base + "/api/session", {
        method: "POST",
        headers: { Origin: "https://evil.test" },
        body: JSON.stringify({ password }),
      }),
    );
    expect(bad.status).toBe(403);
  });
  it("não aceita senha incorreta", async () => {
    const r = await sessionHandler(
      new Request(base + "/api/session", {
        method: "POST",
        headers: { Origin: base },
        body: JSON.stringify({ password: "wrong" }),
      }),
    );
    expect(r.status).toBe(401);
  });
  it("publica metadata e recusa callback não autorizado", async () => {
    const r = await oauthHandler(
      new Request(base + "/.well-known/oauth-authorization-server"),
    );
    expect((await r.json()).code_challenge_methods_supported).toContain("S256");
    const bad = await oauthHandler(
      new Request(
        base +
          "/oauth/authorize?client_id=test-client&redirect_uri=https://evil.test",
      ),
    );
    expect(bad.status).toBe(400);
  });
  it("troca código PKCE uma única vez e renova tokens", async () => {
    const { tokens, payload } = await oauthAccess();
    expect(tokens.token_type).toBe("Bearer");
    const repeat = await oauthHandler(
      new Request(base + "/oauth/token", { method: "POST", body: payload }),
    );
    expect(repeat.status).toBe(400);
    const refresh = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: "test-client",
      client_secret: runtime.vars.get("CRM_OAUTH_CLIENT_SECRET")!,
    });
    const r = await oauthHandler(
      new Request(base + "/oauth/token", { method: "POST", body: refresh }),
    );
    expect(r.status).toBe(200);
    expect((await r.json()).access_token).not.toBe(tokens.access_token);
    const reuse = await oauthHandler(
      new Request(base + "/oauth/token", { method: "POST", body: refresh }),
    );
    expect(reuse.status).toBe(400);
  });
  it("lista ferramentas e cadastra salão pelo protocolo MCP", async () => {
    const { tokens } = await oauthAccess();
    const listed = await rpc(tokens.access_token, "tools/list");
    expect(listed.status).toBe(200);
    const catalog = await listed.json();
    expect(catalog.result.tools.map((t: any) => t.name)).toContain(
      "adicionar_salao",
    );
    const args = {
      campos: { name: "MCP Salon", city: "Orlando" },
      request_id: uid(),
    };
    const r = await rpc(
      tokens.access_token,
      "tools/call",
      { name: "adicionar_salao", arguments: args },
      2,
    );
    const payload = await r.json();
    expect(payload.result.isError).not.toBe(true);
    expect((await readWorkspace()).leads[0].name).toBe("MCP Salon");
    const retried = await rpc(
      tokens.access_token,
      "tools/call",
      { name: "adicionar_salao", arguments: args },
      3,
    );
    expect((await retried.json()).result.isError).not.toBe(true);
    expect((await readWorkspace()).leads).toHaveLength(1);
  });
  it("permite revogar o acesso do ChatGPT pela sessão do dono", async () => {
    const { tokens } = await oauthAccess();
    const cookie = await loginCookie();
    const r = await sessionHandler(
      new Request(base + "/api/session?connections=1", {
        method: "DELETE",
        headers: { Origin: base, Cookie: cookie },
      }),
    );
    expect(r.status).toBe(200);
    expect((await rpc(tokens.access_token, "tools/list")).status).toBe(401);
    expect(
      (
        await apiHandler(
          new Request(base + "/api/crm", { headers: { Cookie: cookie } }),
        )
      ).status,
    ).toBe(200);
  });
});
