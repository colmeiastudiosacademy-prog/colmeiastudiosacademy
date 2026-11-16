import type { Lead, Interaction, Settings } from "./domain";
export type Customer = {
  id: string;
  revision?: number;
  name: string;
  email: string;
  phone: string;
  leadId: string | null;
  product: string;
  value: number;
  status: "Ativo" | "Pausado" | "Cancelado";
  notes: string;
  createdAt: string;
};
export type Snapshot = {
  leads: Lead[];
  history: Interaction[];
  settings: Settings;
  customers: Customer[];
  version: number;
  trash: {
    kind: "lead" | "customer";
    record: Lead | Customer;
    deletedAt: string;
    history: Interaction[];
  }[];
};
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const r = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await r.json().catch(() => ({
    error: "Servidor indisponível. Publique esta versão com Netlify Functions.",
  }));
  if (!r.ok)
    throw Object.assign(new Error(data.error || "Falha na operação"), {
      status: r.status,
    });
  return data as T;
}
export const loadCloud = () => request<Snapshot>("/api/crm");
export const mutateCloud = (action: string, input: unknown) =>
  request<{ snapshot: Snapshot; result: any }>("/api/crm", {
    method: "POST",
    body: JSON.stringify({ action, input, requestId: crypto.randomUUID() }),
  });
export const login = (password: string) =>
  request("/api/session", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
export const logout = () => request("/api/session", { method: "DELETE" });
