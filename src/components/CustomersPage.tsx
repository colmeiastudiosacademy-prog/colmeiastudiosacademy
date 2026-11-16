import { useState } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { uid, money, type Lead, type Settings } from "../domain";
import type { Customer } from "../cloud";
export default function CustomersPage({
  customers,
  leads,
  settings,
  onMutate,
}: {
  customers: Customer[];
  leads: Lead[];
  settings: Settings;
  onMutate: (a: string, p: unknown) => Promise<any>;
}) {
  const [edit, setEdit] = useState<Customer | null>(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const create = () =>
    setEdit({
      id: uid(),
      name: "",
      email: "",
      phone: "",
      leadId: null,
      product: settings.products[0]?.name || "",
      value: settings.products[0]?.price || 0,
      status: "Ativo",
      notes: "",
      createdAt: new Date().toISOString(),
    });
  return (
    <>
      <div className="page-heading secondary">
        <div>
          <div className="eyebrow">COLMEIA CRM</div>
          <h1>Clientes da sua Colmeia</h1>
          <p>Acompanhe seus clientes e mantenha o ChatGPT atualizado.</p>
        </div>
        <button className="btn primary" onClick={create}>
          <Plus size={16} /> Novo cliente
        </button>
      </div>
      <label className="search">
        <input
          placeholder="Buscar cliente, e-mail ou telefone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="table-wrap" style={{ marginTop: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Produto</th>
              <th>Status</th>
              <th>Valor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {customers
              .filter((c) =>
                [c.name, c.email, c.phone]
                  .join(" ")
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <tr
                  key={c.id}
                  onClick={() => {
                    setError("");
                    setEdit(c);
                  }}
                >
                  <td>
                    <b>{c.name}</b>
                    <small>{c.email || c.phone}</small>
                  </td>
                  <td>{c.product}</td>
                  <td>
                    <span className="tag">{c.status}</span>
                  </td>
                  <td>{money(c.value)}</td>
                  <td>Editar</td>
                </tr>
              ))}
          </tbody>
        </table>
        {!customers.length && (
          <div className="empty">
            <h3>Pronto para o primeiro cliente</h3>
            <p>Cadastre aqui ou peça ao ChatGPT após conectar o MCP.</p>
          </div>
        )}
      </div>
      {edit && (
        <div className="overlay">
          <section className="modal">
            <div className="modal-head">
              <h2>{edit.revision ? "Editar cliente" : "Novo cliente"}</h2>
              <button
                className="iconbtn"
                aria-label="Fechar"
                onClick={() => setEdit(null)}
              >
                <X size={20} />
              </button>
            </div>
            <form
              className="form-body"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await onMutate("save_customer", {
                    customer: edit,
                    expectedRevision: edit.revision ?? 0,
                  });
                  setEdit(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Nome *
                <input
                  required
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label>
                  E-mail
                  <input
                    type="email"
                    value={edit.email}
                    onChange={(e) =>
                      setEdit({ ...edit, email: e.target.value })
                    }
                  />
                </label>
                <label>
                  Telefone
                  <input
                    type="tel"
                    value={edit.phone}
                    onChange={(e) =>
                      setEdit({ ...edit, phone: e.target.value })
                    }
                  />
                </label>
                <label>
                  Salão vinculado
                  <select
                    value={edit.leadId || ""}
                    onChange={(e) =>
                      setEdit({ ...edit, leadId: e.target.value || null })
                    }
                  >
                    <option value="">Sem vínculo</option>
                    {leads.map((l) => (
                      <option value={l.id} key={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Produto
                  <select
                    value={edit.product}
                    onChange={(e) => {
                      const p = settings.products.find(
                        (p) => p.name === e.target.value,
                      )!;
                      setEdit({ ...edit, product: p.name, value: p.price });
                    }}
                  >
                    {settings.products.map((p) => (
                      <option key={p.name}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Valor R$
                  <input
                    type="number"
                    min={0}
                    required
                    value={edit.value}
                    onChange={(e) =>
                      setEdit({ ...edit, value: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={edit.status}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        status: e.target.value as Customer["status"],
                      })
                    }
                  >
                    {["Ativo", "Pausado", "Cancelado"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Observações
                <textarea
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </label>
              {error && <p className="warning">{error}</p>}
              <div className="modal-actions">
                {edit.revision && (
                  <button
                    disabled={busy}
                    type="button"
                    className="btn danger"
                    onClick={async () => {
                      if (!confirm("Mover cliente para a lixeira?")) return;
                      setBusy(true);
                      try {
                        await onMutate("delete_customer", {
                          id: edit.id,
                          expectedRevision: edit.revision,
                        });
                        setEdit(null);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Trash2 size={15} /> Excluir
                  </button>
                )}
                <button disabled={busy} className="btn primary">
                  Salvar cliente
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
