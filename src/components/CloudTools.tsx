import { useEffect, useState } from "react";
import {
  Download,
  Upload,
  Undo2,
  ShieldCheck,
  Database,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { db } from "../db";
import { request, logout, type Snapshot } from "../cloud";
export default function CloudTools({
  snapshot,
  onMutate,
  onLogout,
}: {
  snapshot: Snapshot;
  onMutate: (action: string, input: unknown) => Promise<any>;
  onLogout: () => void;
}) {
  const [connection, setConnection] = useState<{
    clientId: string;
    clientSecret: string;
    redirectUris: string;
  } | null>(null);
  const [legacy, setLegacy] = useState<{
      leads: any[];
      history: any[];
      settings: any;
    } | null>(null),
    [audit, setAudit] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      db.leads.toArray(),
      db.interactions.toArray(),
      db.settings.get("main"),
    ])
      .then(([leads, history, settings]) => {
        if (leads.length || history.length)
          setLegacy({ leads, history, settings: settings?.value });
      })
      .catch(() => {});
    void refreshAudit();
  }, []);
  async function refreshAudit() {
    try {
      setAudit(await request<any[]>("/api/crm?audit=true"));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setMessage("Operação concluída.");
      void refreshAudit();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel cloud-tools">
      <div className="panel-heading">
        <h2>Banco conectado e ChatGPT</h2>
        <ShieldCheck size={20} />
      </div>
      <div className="form-body">
        <p className="muted">
          Site e MCP usam o mesmo Netlify Database. Alterações do ChatGPT
          aparecem ao atualizar ou automaticamente em até 20 segundos enquanto a
          tela está aberta.
        </p>
        <label>
          Endereço do MCP
          <input readOnly value={location.origin + "/mcp"} />
        </label>
        <p className="muted">
          A conexão com o ChatGPT usa OAuth e precisa ser adicionada à sua conta
          de ChatGPT. A hospedagem não conecta o app automaticamente.
        </p>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              setConnection(await request("/api/connection")),
            )
          }
        >
          Exibir dados para conectar ao ChatGPT
        </button>
        {connection && (
          <div className="migration-box">
            <p>
              Ao adicionar o MCP no ChatGPT, escolha OAuth e credenciais
              estáticas. Estes dados são privados da sua integração.
            </p>
            <label>
              Client ID
              <input readOnly value={connection.clientId} />
            </label>
            <label>
              Client Secret
              <input type="password" readOnly value={connection.clientSecret} />
            </label>
            <button
              className="btn"
              onClick={() =>
                void navigator.clipboard
                  .writeText(connection.clientSecret)
                  .then(() =>
                    setMessage(
                      "Segredo copiado. Cole apenas na configuração OAuth do ChatGPT.",
                    ),
                  )
                  .catch(() =>
                    setMessage("Copie pelo campo de senha usando o navegador."),
                  )
              }
            >
              Copiar Client Secret
            </button>
            <button className="btn" onClick={() => setConnection(null)}>
              Ocultar dados
            </button>
            <p>Callback permitido: {connection.redirectUris}</p>
          </div>
        )}
        {legacy && (
          <div className="migration-box">
            <b>{legacy.leads.length} salões encontrados neste navegador</b>
            <p>
              A migração adiciona dados ao banco sem apagar a cópia local.
              Cadastros duplicados são ignorados.
            </p>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Importar os contatos locais para a conta conectada? A cópia local será preservada.",
                  )
                )
                  void run(async () => {
                    const r = await onMutate("import_data", {
                      ...legacy,
                      settings:
                        snapshot.leads.length === 0
                          ? legacy.settings
                          : undefined,
                    });
                    setLegacy(null);
                    return r;
                  });
              }}
            >
              <Upload size={16} /> Migrar dados locais
            </button>
          </div>
        )}
        <div className="cloud-actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await request("/api/session?connections=1", {
                  method: "DELETE",
                });
                setMessage(
                  "Conexões MCP revogadas. Reconecte no ChatGPT para voltar a usar.",
                );
              })
            }
          >
            Revogar conexões do ChatGPT
          </button>
          <button
            className="btn"
            onClick={() =>
              void run(async () => {
                await logout();
                onLogout();
              })
            }
          >
            <LogOut size={15} /> Sair do CRM
          </button>
        </div>
        <div className="panel-heading inline-heading">
          <h3>Lixeira recuperável</h3>
          <span className="tag">{snapshot.trash.length} registros</span>
        </div>
        {snapshot.trash.length ? (
          <div className="trash-list">
            {snapshot.trash.map((t) => (
              <div key={t.record.id}>
                <div>
                  <b>{t.record.name}</b>
                  <small>
                    {t.kind === "lead" ? "Salão" : "Cliente"} ·{" "}
                    {new Date(t.deletedAt).toLocaleString("pt-BR")}
                  </small>
                </div>
                <button
                  disabled={busy}
                  className="btn"
                  onClick={() =>
                    void run(() =>
                      onMutate("restore_record", { id: t.record.id }),
                    )
                  }
                >
                  <Undo2 size={14} /> Restaurar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum registro na lixeira.</p>
        )}
        <div className="panel-heading inline-heading">
          <h3>Histórico de alterações</h3>
          <button
            className="iconbtn"
            onClick={() => void refreshAudit()}
            aria-label="Atualizar auditoria"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="audit-list">
          {audit.map((a) => (
            <div key={a.id}>
              <span>
                {a.actor === "chatgpt" ? "ChatGPT" : "Site"} · {a.action}
              </span>
              <small>
                {new Date(a.at).toLocaleString("pt-BR")} · v
                {a.workspace_version}
              </small>
            </div>
          ))}
        </div>
        {message && (
          <p className="warning" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
