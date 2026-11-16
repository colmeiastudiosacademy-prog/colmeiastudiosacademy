import { getDatabase } from "@netlify/database";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  initialSettings,
  blankLead,
  duplicate,
  sentTransition,
  replyTransition,
  type Lead,
  type Interaction,
  type Settings,
} from "../../src/domain";
import {
  leadSchema,
  interactionSchema,
  settingsSchema,
  customerSchema,
  CRMError,
  type Customer,
} from "./schema";
export type Workspace = {
  leads: Lead[];
  history: Interaction[];
  settings: Settings;
  customers: Customer[];
  trash: {
    kind: "lead" | "customer";
    record: Lead | Customer;
    history: Interaction[];
    deletedAt: string;
  }[];
};
export type Snapshot = Workspace & { version: number };
export const initialWorkspace = (): Workspace => ({
  leads: [],
  history: [],
  settings: { ...initialSettings(), revision: 0 },
  customers: [],
  trash: [],
});
export async function transaction<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = (await getDatabase().pool.connect()) as unknown as PoolClient;
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function ensure(c: PoolClient) {
  await c.query(
    "INSERT INTO crm_workspace (id,data) VALUES ('personal',$1::jsonb) ON CONFLICT DO NOTHING",
    [JSON.stringify(initialWorkspace())],
  );
}
export async function readWorkspace(): Promise<Snapshot> {
  return transaction(async (c) => {
    await ensure(c);
    const { rows } = await c.query(
      "SELECT version,data FROM crm_workspace WHERE id='personal'",
    );
    return { ...rows[0].data, version: rows[0].version };
  });
}
function conflict(current: number | undefined, provided: unknown) {
  if ((current ?? 0) !== provided)
    throw new CRMError(
      409,
      "Este registro mudou em outra sessão ou no ChatGPT. Atualize e tente novamente.",
    );
}
function leadOf(w: Workspace, id: unknown) {
  const l = w.leads.find((l) => l.id === id);
  if (!l) throw new CRMError(404, "Salão não encontrado");
  return l;
}
function putLead(w: Workspace, l: Lead) {
  const d = duplicate(l, w.leads);
  if (d) throw new CRMError(409, `Contato já cadastrado em ${d.name}`);
  w.leads = w.leads.filter((x) => x.id !== l.id).concat(l);
}
function bump(l: Lead): Lead {
  return { ...l, revision: (l.revision ?? 0) + 1 };
}
function cleanImportedLead(l: Lead): Lead {
  return {
    ...l,
    revision: 1,
    ...(l.blocked || ["Fechado", "Perdido"].includes(l.stage)
      ? { nextAt: null }
      : {}),
  };
}
export function applyCommand(
  w: Workspace,
  action: string,
  input: any,
  now = new Date(),
): unknown {
  const p = input ?? {};
  switch (action) {
    case "save_lead": {
      const l = leadSchema.parse(p.lead);
      const old = w.leads.find((x) => x.id === l.id);
      conflict(old?.revision, p.expectedRevision);
      if (l.blocked || ["Fechado", "Perdido"].includes(l.stage))
        l.nextAt = null;
      if (l.stage === "Perdido" && !l.lostReason.trim())
        throw new CRMError(400, "Informe o motivo da perda");
      if (old && old.blocked && !l.blocked) l.nextAt = null;
      const next = { ...l, revision: (old?.revision ?? 0) + 1 };
      putLead(w, next);
      return { id: l.id };
    }
    case "record_interaction": {
      let i = interactionSchema.parse(p.interaction);
      const l = leadOf(w, i.leadId);
      conflict(l.revision, p.expectedRevision);
      if (l.blocked)
        throw new CRMError(
          409,
          "Não contatar: contato e follow-ups bloqueados",
        );
      if (l.example)
        throw new CRMError(400, "Não registre contato com salões de exemplo");
      if (w.history.some((h) => h.id === i.id))
        throw new CRMError(409, "Interação já registrada");
      let next: Lead;
      if (i.direction === "enviado") {
        next = sentTransition(l, w.history, w.settings, new Date(i.at));
      } else {
        const last = w.history
          .filter((h) => h.leadId === l.id && h.direction === "enviado")
          .sort((a, b) => b.at.localeCompare(a.at))[0];
        i = { ...i, variant: last?.variant, attempt: last?.attempt };
        next = replyTransition(
          l,
          p.nextAt === null ? null : leadSchema.shape.nextAt.parse(p.nextAt),
          leadSchema.shape.nextAction.parse(p.nextAction || ""),
        );
      }
      w.history.push(i);
      putLead(w, bump(next));
      return { id: i.id };
    }
    case "schedule": {
      const l = leadOf(w, p.id);
      conflict(l.revision, p.expectedRevision);
      if (l.blocked)
        throw new CRMError(409, "Não contatar: follow-up bloqueado");
      putLead(
        w,
        bump({
          ...l,
          nextAt: leadSchema.shape.nextAt.parse(p.nextAt),
          nextAction: leadSchema.shape.nextAction.parse(p.nextAction),
        }),
      );
      return { id: l.id };
    }
    case "save_settings": {
      const next = settingsSchema.parse(p.settings);
      conflict(w.settings.revision, p.expectedRevision);
      if (
        new Set(next.products.map((x) => x.name)).size !== next.products.length
      )
        throw new CRMError(400, "Produtos devem ter nomes diferentes");
      const renamed = new Map(
        w.settings.products.map((x, i) => [
          x.name,
          next.products[i]?.name || x.name,
        ]),
      );
      w.leads = w.leads.map((l) =>
        renamed.get(l.product) !== l.product && renamed.has(l.product)
          ? bump({ ...l, product: renamed.get(l.product)! })
          : l,
      );
      w.settings = { ...next, revision: (w.settings.revision ?? 0) + 1 };
      return { saved: true };
    }
    case "delete_lead": {
      const l = leadOf(w, p.id);
      conflict(l.revision, p.expectedRevision);
      w.trash.push({
        kind: "lead",
        record: l,
        history: w.history.filter((h) => h.leadId === l.id),
        deletedAt: now.toISOString(),
      });
      w.leads = w.leads.filter((x) => x.id !== l.id);
      w.history = w.history.filter((h) => h.leadId !== l.id);
      return { id: l.id, recoverable: true };
    }
    case "restore_record": {
      const i = w.trash.findIndex((x) => x.record.id === p.id);
      if (i < 0) throw new CRMError(404, "Registro não encontrado na lixeira");
      const item = w.trash[i];
      if (item.kind === "lead") {
        const l = item.record as Lead;
        putLead(w, bump(l));
        w.history.push(...item.history);
      } else {
        const c = item.record as Customer;
        if (w.customers.some((x) => x.id === c.id))
          throw new CRMError(409, "Cliente já existe");
        w.customers.push({ ...c, revision: (c.revision ?? 0) + 1 });
      }
      w.trash.splice(i, 1);
      return { id: p.id };
    }
    case "import_data": {
      const leads = leadSchema.array().max(10000).parse(p.leads);
      const history = interactionSchema
        .array()
        .max(30000)
        .parse(p.history || []);
      let added = 0,
        skipped = 0;
      for (const l of leads) {
        if (
          w.leads.some((x) => x.id === l.id) ||
          w.trash.some((x) => x.record.id === l.id) ||
          duplicate(l, w.leads)
        ) {
          skipped++;
          continue;
        }
        w.leads.push(cleanImportedLead(l));
        added++;
      }
      for (const h of history) {
        if (
          w.leads.some((l) => l.id === h.leadId) &&
          !w.history.some((x) => x.id === h.id)
        )
          w.history.push(h);
      }
      if (p.settings) {
        if (w.leads.length !== added)
          throw new CRMError(
            409,
            "Configurações do backup só podem ser importadas em uma conta vazia. Importe somente os contatos.",
          );
        w.settings = {
          ...settingsSchema.parse(p.settings),
          revision: (w.settings.revision ?? 0) + 1,
        };
      }
      let customersAdded = 0;
      for (const customer of customerSchema
        .array()
        .max(10000)
        .parse(p.customers || [])) {
        if (
          w.customers.some((c) => c.id === customer.id) ||
          w.trash.some((t) => t.record.id === customer.id)
        )
          continue;
        w.customers.push({ ...customer, revision: 1 });
        customersAdded++;
      }
      if (!Array.isArray(p.trash || []))
        throw new CRMError(400, "Lixeira inválida");
      for (const item of p.trash || []) {
        if (!["lead", "customer"].includes(item.kind))
          throw new CRMError(400, "Tipo de registro inválido");
        const record =
          item.kind === "lead"
            ? leadSchema.parse(item.record)
            : customerSchema.parse(item.record);
        if (
          w.trash.some((t) => t.record.id === record.id) ||
          w.leads.some((l) => l.id === record.id) ||
          w.customers.some((c) => c.id === record.id)
        )
          continue;
        w.trash.push({
          kind: item.kind,
          record,
          history: interactionSchema.array().parse(item.history || []),
          deletedAt: leadSchema.shape.createdAt.parse(item.deletedAt),
        });
      }
      return { added, skipped, customersAdded };
    }
    case "remove_examples": {
      const ids = w.leads.filter((l) => l.example).map((l) => l.id);
      for (const id of ids)
        applyCommand(
          w,
          "delete_lead",
          { id, expectedRevision: leadOf(w, id).revision ?? 0 },
          now,
        );
      return { removed: ids.length };
    }
    case "save_customer": {
      const c = customerSchema.parse(p.customer);
      const old = w.customers.find((x) => x.id === c.id);
      conflict(old?.revision, p.expectedRevision);
      if (c.leadId && !w.leads.some((l) => l.id === c.leadId))
        throw new CRMError(400, "Salão vinculado não existe");
      const next = { ...c, revision: (old?.revision ?? 0) + 1 };
      w.customers = w.customers.filter((x) => x.id !== c.id).concat(next);
      return { id: c.id };
    }
    case "delete_customer": {
      const c = w.customers.find((x) => x.id === p.id);
      if (!c) throw new CRMError(404, "Cliente não encontrado");
      conflict(c.revision, p.expectedRevision);
      w.trash.push({
        kind: "customer",
        record: c,
        history: [],
        deletedAt: now.toISOString(),
      });
      w.customers = w.customers.filter((x) => x.id !== c.id);
      return { id: c.id, recoverable: true };
    }
    default:
      throw new CRMError(400, "Operação desconhecida");
  }
}
export function auditDelta(before: Workspace, after: Workspace) {
  const previous: Record<string, unknown> = {},
    next: Record<string, unknown> = {};
  for (const key of ["leads", "history", "customers", "trash"] as const) {
    const identity = (x: any) => x.id || x.record.id;
    const a = new Map(
      (before[key] as any[]).map((x) => [identity(x), JSON.stringify(x)]),
    );
    const b = new Map(
      (after[key] as any[]).map((x) => [identity(x), JSON.stringify(x)]),
    );
    const changed = new Set(
      [...a.keys(), ...b.keys()].filter((id) => a.get(id) !== b.get(id)),
    );
    if (changed.size) {
      previous[key] = (before[key] as any[]).filter((x) =>
        changed.has(identity(x)),
      );
      next[key] = (after[key] as any[]).filter((x) => changed.has(identity(x)));
    }
  }
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
    previous.settings = before.settings;
    next.settings = after.settings;
  }
  return { before: previous, after: next };
}
export async function mutate(
  action: string,
  input: unknown,
  actor: string,
  requestId: string,
  fingerprint?: string,
) {
  if (!/^[\w-]{16,100}$/.test(requestId))
    throw new CRMError(400, "Informe um request_id único (UUID)");
  const hash = createHash("sha256")
    .update(fingerprint || JSON.stringify({ action, input }))
    .digest("hex");
  return transaction(async (c) => {
    await ensure(c);
    const { rows } = await c.query(
      "SELECT version,data FROM crm_workspace WHERE id='personal' FOR UPDATE",
    );
    const row = rows[0];
    const prev = await c.query(
      "SELECT actor,input_hash,result FROM crm_requests WHERE id=$1",
      [requestId],
    );
    if (prev.rows.length) {
      const r = prev.rows[0];
      if (r.actor !== actor || r.input_hash !== hash)
        throw new CRMError(
          409,
          "request_id reutilizado com conteúdo diferente",
        );
      return {
        snapshot: { ...row.data, version: row.version } as Snapshot,
        result: r.result,
      };
    }
    const before = structuredClone(row.data) as Workspace;
    const w = structuredClone(before);
    const result = applyCommand(w, action, input);
    const version = row.version + 1;
    if (Buffer.byteLength(JSON.stringify(w)) > 4_000_000)
      throw new CRMError(
        413,
        "Limite de 4 MB do espaço atingido. Exporte os dados antes de continuar.",
      );
    await c.query(
      "UPDATE crm_workspace SET data=$1::jsonb,version=$2,updated_at=now() WHERE id='personal'",
      [JSON.stringify(w), version],
    );
    const delta = auditDelta(before, w);
    await c.query(
      "INSERT INTO crm_audit (actor,action,workspace_version,before_data,after_data) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)",
      [
        actor,
        action,
        version,
        JSON.stringify(delta.before),
        JSON.stringify(delta.after),
      ],
    );
    await c.query(
      "INSERT INTO crm_requests (id,actor,input_hash,result) VALUES ($1,$2,$3,$4::jsonb)",
      [requestId, actor, hash, JSON.stringify(result)],
    );
    return { snapshot: { ...w, version }, result };
  });
}
export async function listAudit(limit = 50) {
  return transaction(
    async (c) =>
      (
        await c.query(
          "SELECT id,at,actor,action,workspace_version FROM crm_audit ORDER BY id DESC LIMIT $1",
          [Math.min(100, Math.max(1, limit))],
        )
      ).rows,
  );
}
