import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  Hexagon,
  Sun,
  Users,
  Columns3,
  ChartNoAxesCombined,
  MessageSquare,
  Settings as SettingsIcon,
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Check,
  Clock,
  Globe,
  Mail,
  Instagram,
  Phone,
  MoreHorizontal,
  X,
  Calendar,
  Download,
  Upload,
  ShieldCheck,
  Copy,
  Send,
  CheckCheck,
  Bell,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Trash2,
  Menu,
  Info,
  Target,
  TrendingUp,
  Database,
  FileText,
  ExternalLink,
  Undo2,
} from "lucide-react";
import Papa from "papaparse";
import { loadCloud, mutateCloud, type Snapshot, type Customer } from "./cloud";
import CloudGate from "./components/CloudGate";
import CloudTools from "./components/CloudTools";
import CustomersPage from "./components/CustomersPage";
import {
  stages,
  channels,
  channelNames,
  uid,
  money,
  score,
  addDays,
  sentTransition,
  replyTransition,
  suggestChannel,
  timezoneFor,
  localTime,
  normalize,
  duplicate,
  message,
  blankLead,
  type Lead,
  type Interaction,
  type Settings,
  type Channel,
  type Template,
} from "./domain";
type Page =
  | "Hoje"
  | "Salões"
  | "Clientes"
  | "Funil de vendas"
  | "Painel"
  | "Modelos de mensagem"
  | "Configurações";
const nav = [
  { title: "Hoje", icon: Sun },
  { title: "Salões", icon: Users },
  { title: "Clientes", icon: Users },
  { title: "Funil de vendas", icon: Columns3 },
  { title: "Painel", icon: ChartNoAxesCombined },
  { title: "Modelos de mensagem", icon: MessageSquare },
] as const;
const dateKey = (v: string) => new Date(v).toLocaleDateString("en-CA");
const shortDate = (v: string) =>
  new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const attempt = (l: Lead, h: Interaction[]) =>
  Math.min(
    4,
    h.filter((x) => x.leadId === l.id && x.direction === "enviado").length + 1,
  );
const download = (name: string, data: string, type = "application/json") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
function IconChannel({
  channel,
  size = 16,
}: {
  channel: Channel;
  size?: number;
}) {
  return channel === "whatsapp" ? (
    <Phone size={size} />
  ) : channel === "email" ? (
    <Mail size={size} />
  ) : (
    <Instagram size={size} />
  );
}
function Avatar({ l, small = false }: { l: Lead; small?: boolean }) {
  return (
    <span
      className={
        "avatar " + (small ? "small " : "") + "av" + (l.name.charCodeAt(0) % 5)
      }
    >
      {l.name
        .split(" ")
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
function Modal({
  title,
  sub,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Fechar">
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export default function App() {
  const notified = useRef(false);
  const loadEpoch = useRef(0);
  const currentSnapshot = useRef<Snapshot | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  function applySnapshot(d: Snapshot) {
    if (currentSnapshot.current && d.version < currentSnapshot.current.version)
      return;
    currentSnapshot.current = d;
    setSnapshot(d);
    setLeads(d.leads);
    setHistory(d.history);
    setS(d.settings);
    setDetail((current) =>
      current ? d.leads.find((l) => l.id === current.id) || null : null,
    );
  }
  async function refresh() {
    const epoch = loadEpoch.current;
    try {
      const d = await loadCloud();
      if (epoch !== loadEpoch.current) return;
      applySnapshot(d);
      setAuthenticated(true);
      setError("");
    } catch (e) {
      if (epoch !== loadEpoch.current) return;
      if ((e as any).status === 401) setAuthenticated(false);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function onMutate(action: string, input: unknown) {
    try {
      const r = await mutateCloud(action, input);
      applySnapshot(r.snapshot);
      return r;
    } catch (e) {
      if ((e as any).status === 409) await refresh();
      throw e;
    }
  }

  const [leads, setLeads] = useState<Lead[]>([]),
    [history, setHistory] = useState<Interaction[]>([]),
    [s, setS] = useState<Settings | null>(null),
    [page, setPage] = useState<Page>("Hoje"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [search, setSearch] = useState(""),
    [stageFilter, setStageFilter] = useState("Todos"),
    [countryFilter, setCountryFilter] = useState("Todos"),
    [priorityOnly, setPriorityOnly] = useState(false),
    [tab, setTab] = useState("Todos os contatos"),
    [view, setView] = useState<"board" | "table">("board"),
    [menu, setMenu] = useState(false),
    [edit, setEdit] = useState<Lead | null>(null),
    [detail, setDetail] = useState<Lead | null>(null),
    [compose, setCompose] = useState<{
      lead: Lead;
      channel: Channel;
      template: Template;
      text: string;
      subject: string;
      opened: boolean;
    } | null>(null),
    [reply, setReply] = useState<Lead | null>(null),
    [schedule, setSchedule] = useState<Lead | null>(null),
    [importData, setImportData] = useState<Record<string, string>[] | null>(
      null,
    ),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [install, setInstall] = useState<any>(null),
    [csvOpen, setCsvOpen] = useState(false);
  useEffect(() => {
    void refresh();
    const onError = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setToast(
        event.reason?.message || "Não foi possível salvar. Tente novamente.",
      );
      if (event.reason?.status === 401) setAuthenticated(false);
    };
    window.addEventListener("unhandledrejection", onError);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20000);
    const listener = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => {
      window.removeEventListener("beforeinstallprompt", listener);
      window.removeEventListener("unhandledrejection", onError);
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (v: string) => setToast(v);
  async function saveLead(l: Lead) {
    await onMutate("save_lead", { lead: l, expectedRevision: l.revision ?? 0 });
  }
  async function saveSettings(next: Settings) {
    await onMutate("save_settings", {
      settings: next,
      expectedRevision: next.revision ?? 0,
    });
    notify("Configurações salvas");
  }
  async function record(i: Interaction, l: Lead) {
    await onMutate("record_interaction", {
      interaction: i,
      expectedRevision: l.revision ?? 0,
      nextAt: l.nextAt,
      nextAction: l.nextAction,
    });
  }
  const now = new Date(),
    today = dateKey(now.toISOString());
  const active = leads.filter(
    (l) => !l.blocked && !["Fechado", "Perdido"].includes(l.stage),
  );
  const due = active.filter((l) => l.nextAt && dateKey(l.nextAt) <= today);
  useEffect(() => {
    if (loading) return;
    const n = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (due.length) n.setAppBadge?.(due.length).catch(() => {});
    else n.clearAppBadge?.().catch(() => {});
    if (
      !notified.current &&
      due.length &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      notified.current = true;
      new Notification("Colmeia CRM", {
        body: `Você tem ${due.length} contatos pendentes.`,
        icon: "/icon.svg",
        tag: "colmeia-pendencias",
      });
    }
  }, [loading, due.length]);
  if (loading)
    return (
      <div className="loading">
        <Hexagon size={40} />
        <p>Abrindo sua Colmeia…</p>
      </div>
    );
  if (!authenticated || !s || !snapshot)
    return (
      <CloudGate
        onLogin={() => {
          setLoading(true);
          void refresh();
        }}
        message={error}
      />
    );
  const settings = s;
  const filtered = leads
    .filter(
      (l) =>
        (!search ||
          [
            l.name,
            l.owner,
            l.city,
            l.state,
            l.tags,
            l.email,
            l.whatsapp,
            l.instagram,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (stageFilter === "Todos" ||
          (stageFilter === "Não contatar"
            ? l.blocked
            : l.stage === stageFilter)) &&
        (countryFilter === "Todos" || l.country === countryFilter) &&
        (!priorityOnly || score(l, s.weights) >= 75),
    )
    .sort((a, b) => score(b, s.weights) - score(a, s.weights));
  const todaySent = history.filter(
      (h) => h.direction === "enviado" && dateKey(h.at) === today,
    ),
    newSent = new Set(
      todaySent
        .filter(
          (h) =>
            !history.some(
              (x) =>
                x.leadId === h.leadId &&
                x.direction === "enviado" &&
                x.at < h.at,
            ),
        )
        .map((h) => h.leadId),
    ).size;
  const overdue = due.filter((l) => dateKey(l.nextAt!) < today),
    dueToday = due.filter((l) => dateKey(l.nextAt!) === today),
    upcoming = active.filter(
      (l) =>
        l.nextAt &&
        dateKey(l.nextAt) > today &&
        dateKey(l.nextAt) <= dateKey(addDays(now, 7)),
    );
  function openCompose(l: Lead, c?: Channel) {
    const fresh = leads.find((x) => x.id === l.id)!;
    if (fresh.blocked)
      return notify("Este salão está marcado como Não contatar.");
    if (fresh.example)
      return notify(
        "Este é um salão de exemplo. Cadastre um salão real para iniciar o contato.",
      );
    const ch = c || suggestChannel(fresh, history);
    if (!ch) return notify("Cadastre um canal de contato primeiro.");
    const t = settings.templates.find(
      (t) =>
        t.channel === ch &&
        t.attempt === attempt(l, history) &&
        t.variant ===
          (history.filter((x) => x.direction === "enviado" && x.channel === ch)
            .length % 2
            ? "B"
            : "A"),
    )!;
    setCompose({
      lead: fresh,
      channel: ch,
      template: t,
      text: message(t, fresh, settings),
      subject: t.subject.replaceAll("{salao}", fresh.name),
      opened: false,
    });
  }
  async function launchContact() {
    if (!compose) return;
    const l = leads.find((x) => x.id === compose.lead.id)!;
    if (l.blocked) {
      setCompose(null);
      return notify("Envio bloqueado: Não contatar.");
    }
    if (
      compose.channel === "email" &&
      (!settings.signature.name.trim() || !settings.signature.address.trim())
    )
      return notify(
        "Preencha seu nome e endereço postal na assinatura em Configurações.",
      );
    let url = "";
    if (compose.channel === "whatsapp")
      url =
        "https://wa.me/" +
        normalize("whatsapp", l.whatsapp) +
        "?text=" +
        encodeURIComponent(compose.text);
    else if (compose.channel === "email")
      url =
        "https://mail.google.com/mail/?view=cm&fs=1&to=" +
        encodeURIComponent(l.email) +
        "&su=" +
        encodeURIComponent(compose.subject) +
        "&body=" +
        encodeURIComponent(compose.text);
    else {
      try {
        await navigator.clipboard.writeText(compose.text);
      } catch {
        return notify(
          "Não foi possível copiar. Copie a mensagem manualmente e abra o perfil.",
        );
      }
      url =
        "https://instagram.com/" +
        encodeURIComponent(normalize("instagram", l.instagram));
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setCompose({ ...compose, opened: true });
  }
  async function confirmSent() {
    if (!compose) return;
    const l = leads.find((x) => x.id === compose.lead.id)!;
    if (l.blocked) return;
    const updated = sentTransition(l, history, settings);
    await record(
      {
        id: uid(),
        leadId: l.id,
        at: new Date().toISOString(),
        channel: compose.channel,
        direction: "enviado",
        text: compose.text,
        result: "Enviado manualmente",
        variant: compose.template.variant,
        attempt: compose.template.attempt,
      },
      updated,
    );
    setCompose(null);
    notify(
      updated.stage === "Perdido"
        ? "Quarta tentativa registrada. Movido para Perdido: Sem resposta."
        : updated.nextAt
          ? "Contato registrado. Próximo passo agendado para " +
            shortDate(updated.nextAt) +
            "."
          : "Contato registrado. Defina o próximo passo.",
    );
    if (!updated.nextAt && updated.stage !== "Perdido") setSchedule(updated);
  }
  function calendar(l: Lead) {
    if (!l.nextAt) return;
    const start = new Date(l.nextAt),
      end = new Date(start.getTime() + 30 * 60000);
    const fmt = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const q = new URLSearchParams({
      action: "TEMPLATE",
      text: `${l.nextAction || "Follow-up"} · ${l.name}`,
      dates: fmt(start) + "/" + fmt(end),
      details: `Colmeia CRM\n${l.owner}\n${l.nextAction}\nCanal: ${channelNames[suggestChannel(l, history) || "whatsapp"]}`,
      ctz: l.timezone,
    });
    window.open(
      "https://calendar.google.com/calendar/render?" + q,
      "_blank",
      "noopener,noreferrer",
    );
  }
  async function move(l: Lead, stage: Lead["stage"]) {
    if (l.blocked)
      return notify("Remova Não contatar para reabrir este salão.");
    if (stage === "Perdido") {
      const reason = prompt("Qual o motivo da perda?");
      if (!reason?.trim()) return;
      await saveLead({ ...l, stage, lostReason: reason, nextAt: null });
    } else if (stage === "Respondeu") {
      setReply(l);
      return;
    } else {
      await saveLead({
        ...l,
        stage,
        nextAt: ["Fechado"].includes(stage) ? null : l.nextAt,
      });
    }
    notify("Etapa atualizada");
  }
  async function backup() {
    const next = { ...settings, lastBackup: new Date().toISOString() };
    download(
      "colmeia-backup-" + today + ".json",
      JSON.stringify(
        {
          version: 1,
          leads,
          history,
          settings: next,
          customers: snapshot!.customers,
          trash: snapshot!.trash,
        },
        null,
        2,
      ),
    );
    await saveSettings(next);
    notify("Backup JSON baixado");
  }
  async function restore(file: File) {
    try {
      const d = JSON.parse(await file.text());
      if (
        d.version !== 1 ||
        !Array.isArray(d.leads) ||
        !Array.isArray(d.history) ||
        !d.settings?.templates ||
        !d.leads.every(
          (l: any) =>
            typeof l.id === "string" &&
            typeof l.name === "string" &&
            channels.every((c) => typeof l[c] === "string") &&
            Array.isArray(l.languages) &&
            stages.includes(l.stage),
        ) ||
        !Array.isArray(d.settings.cadence) ||
        d.settings.cadence.length !== 3
      )
        throw Error("Formato inválido");
      const cfg = d.settings;
      const finite = (n: unknown) =>
        typeof n === "number" && Number.isFinite(n) && n >= 0;
      const url = new URL(cfg.link);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !finite(cfg.goal) ||
        cfg.goal < 1 ||
        !cfg.cadence.every((n: unknown) => finite(n) && Number(n) >= 1) ||
        !cfg.signature ||
        !["name", "company", "address"].every(
          (k) => typeof cfg.signature[k] === "string",
        ) ||
        !cfg.weights ||
        !["brazilian", "channels", "noSite", "portuguese"].every((k) =>
          finite(cfg.weights[k]),
        ) ||
        !Array.isArray(cfg.products) ||
        !cfg.products.length ||
        !cfg.products.every(
          (p: any) =>
            typeof p.name === "string" &&
            finite(p.price) &&
            typeof p.recurring === "boolean",
        ) ||
        !channels.every((channel) =>
          [1, 2, 3, 4].every((attempt) =>
            ["A", "B"].every((variant) =>
              cfg.templates.some(
                (t: any) =>
                  t.channel === channel &&
                  t.attempt === attempt &&
                  t.variant === variant &&
                  typeof t.text === "string" &&
                  typeof t.subject === "string",
              ),
            ),
          ),
        ) ||
        !d.history.every(
          (h: any) =>
            typeof h.id === "string" &&
            typeof h.text === "string" &&
            channels.includes(h.channel) &&
            ["enviado", "recebido"].includes(h.direction) &&
            Number.isFinite(Date.parse(h.at)) &&
            d.leads.some((l: Lead) => l.id === h.leadId),
        ) ||
        !d.leads.every(
          (l: any) =>
            typeof l.city === "string" &&
            typeof l.owner === "string" &&
            typeof l.timezone === "string" &&
            typeof l.tags === "string" &&
            finite(l.value) &&
            (l.nextAt === null || Number.isFinite(Date.parse(l.nextAt))),
        )
      )
        throw Error("Backup incompleto");
      if (
        !confirm(
          "Importar os dados deste backup para o banco conectado? Registros existentes serão preservados e duplicados ignorados.",
        )
      )
        return;
      await onMutate("import_data", {
        leads: d.leads,
        history: d.history,
        customers: d.customers || [],
        trash: d.trash || [],
        settings: leads.length === 0 ? d.settings : undefined,
      });
      notify("Backup restaurado");
    } catch (e) {
      notify(
        (e as Error).message ||
          "Backup inválido. Use um JSON exportado pelo Colmeia CRM.",
      );
    }
  }
  function exportCsv() {
    const rows = leads.map((l) => ({ ...l, languages: l.languages.join("|") }));
    download(
      "colmeia-saloes.csv",
      "\uFEFF" + Papa.unparse(rows),
      "text/csv;charset=utf-8",
    );
    notify("CSV exportado");
  }
  async function parseCsv(file: File) {
    Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        if (r.errors.length)
          return notify("Não foi possível ler o CSV: " + r.errors[0].message);
        setImportData(r.data);
        const headers = Object.keys(r.data[0] || {});
        const m: Record<string, string> = {};
        for (const [field, label] of csvFields) {
          const match = headers.find((h) =>
            [field, label].some((n) => n.toLowerCase() === h.toLowerCase()),
          );
          if (match) m[field] = match;
        }
        setMapping(m);
      },
    });
  }
  async function doImport() {
    if (!importData || !mapping.name)
      return notify("Mapeie a coluna Nome do salão.");
    const all = [...leads];
    let added = 0,
      skipped = 0;
    for (const row of importData) {
      const l = blankLead();
      for (const [k, h] of Object.entries(mapping))
        if (h) (l as any)[k] = row[h] || "";
      l.name = l.name.trim();
      l.value =
        Number(
          String(l.value)
            .replace(/[^\d.,-]/g, "")
            .replace(",", "."),
        ) || 297;
      l.hasSite = ["sim", "true", "1"].includes(
        String(l.hasSite).toLowerCase(),
      );
      l.languages =
        typeof l.languages === "string"
          ? (l.languages as string)
              .split(/[|,;]/)
              .map((x) => x.trim().toUpperCase())
              .filter((x) => ["PT", "EN", "ES"].includes(x))
          : ["PT"];
      l.country = l.country || "Estados Unidos";
      l.timezone = row[mapping.timezone] || timezoneFor(l.country, l.state);
      l.brazilian = ["Sim", "Não", "A confirmar"].includes(l.brazilian)
        ? l.brazilian
        : "A confirmar";
      l.stage = stages.includes(l.stage) ? l.stage : "Novo";
      if (!l.name || duplicate(l, all)) {
        skipped++;
        continue;
      }
      all.push(l);
      added++;
    }
    const imported = await onMutate("import_data", {
      leads: all.filter((l) => !leads.some((x) => x.id === l.id)),
    });
    added = imported.result.added;
    skipped += imported.result.skipped;
    setImportData(null);
    setCsvOpen(false);
    notify(
      `${added} salões importados. ${skipped} linhas vazias ou duplicadas ignoradas.`,
    );
  }
  const csvFields = [
    ["name", "Nome do salão"],
    ["owner", "Responsável"],
    ["city", "Cidade"],
    ["state", "Estado"],
    ["country", "País"],
    ["timezone", "Fuso horário"],
    ["whatsapp", "WhatsApp"],
    ["email", "E-mail"],
    ["instagram", "Instagram"],
    ["website", "Site"],
    ["hasSite", "Tem site?"],
    ["google", "Google Business"],
    ["brazilian", "Dono brasileiro"],
    ["languages", "Idiomas (PT|EN|ES)"],
    ["source", "Origem"],
    ["product", "Produto"],
    ["value", "Valor potencial"],
    ["tags", "Tags"],
    ["notes", "Observações"],
    ["stage", "Etapa"],
  ];
  function leadRow(l: Lead) {
    const ch = suggestChannel(l, history),
      time = localTime(l.timezone),
      late = l.nextAt && dateKey(l.nextAt) < today;
    return (
      <article className="lead-row" key={l.id}>
        <button className="lead-identity" onClick={() => setDetail(l)}>
          <Avatar l={l} />
          <div>
            <strong>{l.name}</strong>
            <span>
              {l.owner} <i>·</i> {l.city}, {l.state}{" "}
              {l.example && <em className="example-tag">Exemplo</em>}
            </span>
          </div>
        </button>
        <div className="priority">
          <span className="score-dot" />
          {score(l, s!.weights)}
          <span className="muted"> / 100</span>
        </div>
        <div className="attempt">
          <span className="channel-symbol">
            {ch && <IconChannel channel={ch} />}
          </span>
          <div>
            <b>{ch ? channelNames[ch] : "Sem canal"}</b>
            <span>
              {attempt(l, history)}ª tentativa <i>·</i> de 4
            </span>
          </div>
        </div>
        <div className="local-time">
          <span>
            <Clock size={12} /> {time.text} no salão
          </span>
          <small className={time.open ? "open-time" : ""}>
            {time.open ? "Horário comercial" : "Fora do horário comercial"}
          </small>
        </div>
        <div className="row-actions">
          <button
            title="Registrar resposta"
            aria-label={"Registrar resposta de " + l.name}
            className="iconbtn respond"
            onClick={() => setReply(l)}
          >
            <MessageSquare size={17} />
          </button>
          <button
            className="btn send-btn"
            onClick={() => openCompose(l)}
            disabled={!ch}
          >
            {late ? "Retomar" : "Contatar"}
            <ArrowUpRight size={15} />
          </button>
          <button
            className="iconbtn"
            aria-label={"Próximas ações de " + l.name}
            onClick={() => setSchedule(l)}
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      </article>
    );
  }
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "mobile-open" : "")}>
        <a href="#" className="brand" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon">
            <Hexagon size={26} />
            <span />
          </span>
          <span>
            colmeia<span className="brand-crm">CRM</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">C</span>
          <div>
            <b>Minha Colmeia</b>
            <small>Espaço pessoal</small>
          </div>
          <ShieldCheck size={15} />
        </div>
        <div className="nav-label">ESPAÇO DE TRABALHO</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.title}
              className={page === n.title ? "active" : ""}
              onClick={() => {
                setPage(n.title);
                setSearch("");
                setMenu(false);
              }}
            >
              <n.icon size={19} />
              <span>{n.title}</span>
              {n.title === "Hoje" && <small>{due.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <div>
              <span className="green-dot" /> Seus dados, só seus
            </div>
            <p>
              Salvos no Netlify Database.
              <br />
              Faça um backup regularmente.
            </p>
            <button onClick={backup}>
              Fazer backup <ArrowUpRight size={13} />
            </button>
          </div>
          <button
            className={
              "settings-nav " + (page === "Configurações" ? "active" : "")
            }
            onClick={() => {
              setPage("Configurações");
              setMenu(false);
            }}
          >
            <SettingsIcon size={19} /> Configurações
          </button>
          <div className="profile">
            <span>EU</span>
            <div>
              <b>Meu espaço</b>
              <small>Plano pessoal · Conectado</small>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="iconbtn mobile-toggle"
              onClick={() => setMenu(!menu)}
              aria-label="Menu"
            >
              <Menu size={20} />
            </button>
            <Hexagon size={15} />
            <span>Minha Colmeia</span>
            <ChevronRight size={13} />
            <b>{page}</b>
          </div>
          <div className="top-right">
            <span className="saved-state">
              <span className="green-dot" />
              {error ? "Sem conexão" : "Banco conectado"}
            </span>
            <button
              className="iconbtn notification"
              onClick={async () => {
                if (!("Notification" in window))
                  return notify("Este navegador não oferece notificações.");
                const p = await Notification.requestPermission();
                notify(
                  p === "granted"
                    ? "Notificações ativadas ao abrir o CRM"
                    : `Você tem ${due.length} contatos pendentes.`,
                );
              }}
              aria-label="Ativar notificações"
            >
              <Bell size={19} />
              {due.length > 0 && <i />}
            </button>
            <span className="user-avatar">EU</span>
          </div>
        </header>
        <main>
          {page === "Hoje" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="pink-dot" />
                    {now
                      .toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })
                      .replace(/^./, (s) => s.toUpperCase())}
                  </div>
                  <h1>
                    Pequenos contatos.
                    <br className="mobile-break" />{" "}
                    <span>Grandes conexões.</span>
                  </h1>
                  <p>
                    Sua próxima boa conversa começa aqui. Vamos movimentar a
                    Colmeia?
                  </p>
                </div>
                <button
                  className="btn primary"
                  onClick={() => setEdit(blankLead())}
                >
                  <Plus size={17} /> Novo salão
                </button>
              </div>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    Para contatar hoje{" "}
                    <span className="stat-icon pink">
                      <Send size={16} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {due.length.toString().padStart(2, "0")}
                    <span className="stat-sub">salões na sua fila</span>
                  </div>
                  <div className="stat-bottom">
                    <span className="red-dot" />
                    {overdue.length} atrasados pedindo atenção
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    Novos contatos{" "}
                    <span className="stat-icon purple">
                      <Target size={17} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {newSent.toString().padStart(2, "0")}{" "}
                    <span className="stat-denominator">/ {s.goal}</span>
                    <span className="stat-sub">meta de hoje</span>
                  </div>
                  <div className="progress">
                    <div
                      style={{
                        width: Math.min(100, (newSent / s.goal) * 100) + "%",
                      }}
                    />
                  </div>
                  <div className="stat-bottom">
                    {Math.max(0, s.goal - newSent)} novas oportunidades para
                    começar
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    Conversas em andamento{" "}
                    <span className="stat-icon green">
                      <MessageSquare size={17} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {active
                      .filter((l) =>
                        [
                          "Respondeu",
                          "Conversa agendada",
                          "Demo feita",
                          "Proposta enviada",
                        ].includes(l.stage),
                      )
                      .length.toString()
                      .padStart(2, "0")}
                    <span className="stat-sub">conexões acontecendo</span>
                  </div>
                  <button
                    className="stat-link"
                    onClick={() => setPage("Funil de vendas")}
                  >
                    Acompanhar no funil <ArrowRight size={13} />
                  </button>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    Receita mensal potencial{" "}
                    <span className="stat-icon amber">
                      <TrendingUp size={17} />
                    </span>
                  </div>
                  <div className="stat-value money">
                    {money(
                      active
                        .filter(
                          (l) =>
                            s.products.find((p) => p.name === l.product)
                              ?.recurring,
                        )
                        .reduce((sum, l) => sum + l.value, 0),
                    )}
                  </div>
                  <div className="stat-bottom">
                    <span className="green-dot" />
                    Oportunidades abertas no seu funil
                  </div>
                </div>
              </div>
              <div className="daily-banner">
                <div className="banner-spark">
                  <Sun size={23} />
                </div>
                <div>
                  <b>Cada conversa é uma nova possibilidade.</b>
                  <p>
                    Comece pelos salões de maior prioridade. O próximo passo a
                    gente organiza para você.
                  </p>
                </div>
                <span className="banner-tag">
                  <Hexagon size={13} /> UM CONTATO DE CADA VEZ
                </span>
              </div>
              <div className="queue-head">
                <div>
                  <h2>
                    Sua fila de contatos{" "}
                    <span>{due.length + upcoming.length}</span>
                  </h2>
                  <p>Os salões certos, no momento certo.</p>
                </div>
                <div className="queue-head-right">
                  <span>
                    <span className="score-dot" />
                    Ordenados por prioridade
                  </span>
                  <button
                    className={"btn subtle " + (priorityOnly ? "selected" : "")}
                    onClick={() => setPriorityOnly(!priorityOnly)}
                  >
                    <SlidersHorizontal size={15} />{" "}
                    {priorityOnly ? "Prioridade ≥ 75" : "Filtrar"}
                  </button>
                </div>
              </div>
              <div className="queue-toolbar">
                <div className="tabs">
                  {[
                    "Todos os contatos",
                    "Atrasados",
                    "Hoje",
                    "Próximos 7 dias",
                  ].map((t) => (
                    <button
                      className={tab === t ? "active" : ""}
                      key={t}
                      onClick={() => setTab(t)}
                    >
                      {t}
                      {t === "Atrasados" && (
                        <small className="red">{overdue.length}</small>
                      )}
                      {t === "Hoje" && <small>{dueToday.length}</small>}
                    </button>
                  ))}
                </div>
                <label className="search compact">
                  <Search size={15} />
                  <input
                    placeholder="Buscar salão…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="queue">
                {[
                  {
                    name: "Atrasados",
                    items: overdue,
                    caption: "Uma nova chance de retomar a conversa",
                    cls: "late",
                  },
                  {
                    name: "Hoje",
                    items: dueToday,
                    caption: "Prontos para o seu próximo contato",
                    cls: "today",
                  },
                  {
                    name: "Próximos 7 dias",
                    items: upcoming,
                    caption: "De olho nas próximas conversas",
                    cls: "next",
                  },
                ]
                  .filter((g) => tab === "Todos os contatos" || tab === g.name)
                  .map((g) => {
                    const items = g.items
                      .filter((l) => filtered.some((x) => x.id === l.id))
                      .sort(
                        (a, b) => score(b, s.weights) - score(a, s.weights),
                      );
                    return (
                      <section className={"queue-group " + g.cls} key={g.name}>
                        <div className="group-title">
                          <span className="group-icon">
                            {g.cls === "late" ? (
                              <Clock size={14} />
                            ) : g.cls === "today" ? (
                              <Sun size={15} />
                            ) : (
                              <Calendar size={14} />
                            )}
                          </span>
                          <b>{g.name}</b>
                          <span className="group-count">{items.length}</span>
                          <small>{g.caption}</small>
                        </div>
                        {items.length ? (
                          items.map(leadRow)
                        ) : (
                          <div className="empty-queue">
                            <CheckCheck size={19} />
                            {g.name === "Atrasados"
                              ? "Tudo em dia por aqui."
                              : "Nenhum contato nesta fila."}
                          </div>
                        )}
                      </section>
                    );
                  })}
              </div>
              <div className="queue-footer">
                <ShieldCheck size={14} /> Você controla cada envio. A Colmeia
                cuida do próximo passo.
                <span>Horários locais atualizados ao abrir a tela</span>
              </div>
              {(!s.lastBackup ||
                Date.now() - new Date(s.lastBackup).getTime() >
                  7 * 86400000) && (
                <div className="backup-reminder">
                  <Database size={17} />
                  <div>
                    <b>Uma Colmeia bem cuidada tem backup.</b>
                    <span>
                      Salve uma cópia semanal para proteger suas conexões.
                    </span>
                  </div>
                  <button onClick={backup}>
                    Baixar backup <Download size={14} />
                  </button>
                </div>
              )}
            </>
          )}
          {page === "Salões" && (
            <>
              <PageHeading
                title="Sua rede de oportunidades"
                text="Cada salão tem uma história. Encontre a próxima conexão."
                action={
                  <>
                    <button className="btn" onClick={() => setCsvOpen(true)}>
                      <Upload size={16} /> Importar / exportar
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => setEdit(blankLead())}
                    >
                      <Plus size={16} /> Novo salão
                    </button>
                  </>
                }
              />
              <Filters />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Salão / responsável</th>
                      <th>Localização</th>
                      <th>Prioridade</th>
                      <th>Etapa</th>
                      <th>Potencial</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id} onClick={() => setDetail(l)}>
                        <td>
                          <div className="table-name">
                            <Avatar l={l} small />
                            <div>
                              <b>{l.name}</b>
                              <small>
                                {l.owner}
                                {l.example ? " · Exemplo" : ""}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {l.city}, {l.state}
                          <small>{l.country}</small>
                        </td>
                        <td>
                          <span className="score-pill">
                            {score(l, s.weights)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              "stage-badge st" + stages.indexOf(l.stage)
                            }
                          >
                            {l.blocked ? "Não contatar" : l.stage}
                          </span>
                        </td>
                        <td>
                          {money(l.value)}
                          <small>
                            {s.products.find((p) => p.name === l.product)
                              ?.recurring
                              ? "por mês"
                              : "pagamento único"}
                          </small>
                        </td>
                        <td>
                          <ChevronRight size={16} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && <Empty />}
              </div>
              <p className="table-foot">
                {filtered.length} salões ·{" "}
                {leads.filter((l) => !l.hasSite).length} sem site ·{" "}
                {leads.filter((l) => l.brazilian === "Sim").length} donos
                brasileiros confirmados
              </p>
            </>
          )}
          {page === "Funil de vendas" && (
            <>
              <PageHeading
                title="Cada conexão, um passo à frente"
                text="Visualize suas conversas e acompanhe cada oportunidade."
                action={
                  <button
                    className="btn primary"
                    onClick={() => setEdit(blankLead())}
                  >
                    <Plus size={17} /> Novo salão
                  </button>
                }
              />
              <div className="pipeline-summary">
                <span>
                  <b>{leads.filter((l) => !l.blocked).length}</b> oportunidades
                </span>
                <span>
                  <b>{money(active.reduce((v, l) => v + l.value, 0))}</b> em
                  potencial
                </span>
                <div className="view-switch">
                  <button
                    className={view === "board" ? "active" : ""}
                    onClick={() => setView("board")}
                  >
                    <LayoutGrid size={16} /> Kanban
                  </button>
                  <button
                    className={view === "table" ? "active" : ""}
                    onClick={() => setView("table")}
                  >
                    <List size={16} /> Tabela
                  </button>
                </div>
              </div>
              <Filters />
              {view === "board" ? (
                <div className="kanban">
                  {stages.map((st, i) => (
                    <div
                      key={st}
                      className="kanban-column"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const l = leads.find(
                          (l) => l.id === e.dataTransfer.getData("text/plain"),
                        );
                        if (l) void move(l, st);
                      }}
                    >
                      <div className="kanban-title">
                        <span className={"stage-dot st" + i} />
                        <b>{st}</b>
                        <span>
                          {
                            filtered.filter((l) => l.stage === st && !l.blocked)
                              .length
                          }
                        </span>
                      </div>
                      <small className="kanban-total">
                        {money(
                          filtered
                            .filter((l) => l.stage === st && !l.blocked)
                            .reduce((n, l) => n + l.value, 0),
                        )}
                      </small>
                      {filtered
                        .filter((l) => l.stage === st && !l.blocked)
                        .map((l) => (
                          <article
                            className="kanban-card"
                            draggable
                            onDragStart={(e) =>
                              e.dataTransfer.setData("text/plain", l.id)
                            }
                            key={l.id}
                            onClick={() => setDetail(l)}
                          >
                            <div className="card-top">
                              <Avatar l={l} small />
                              <span className="score-pill">
                                {score(l, s.weights)}
                              </span>
                            </div>
                            <h3>{l.name}</h3>
                            <p>
                              {l.city}, {l.state}
                            </p>
                            <span className="tag">{l.product}</span>
                            <div className="card-bottom">
                              <b>{money(l.value)}</b>
                              <span>
                                {l.nextAt ? shortDate(l.nextAt) : "Sem ação"}
                              </span>
                            </div>
                          </article>
                        ))}
                      <button
                        className="add-to-stage"
                        onClick={() => setEdit({ ...blankLead(), stage: st })}
                      >
                        <Plus size={14} /> Adicionar salão
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Salão</th>
                        <th>Etapa</th>
                        <th>Próxima ação</th>
                        <th>Prioridade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <button
                              className="textbtn"
                              onClick={() => setDetail(l)}
                            >
                              {l.name}
                            </button>
                          </td>
                          <td>
                            <select
                              value={l.blocked ? "Não contatar" : l.stage}
                              disabled={l.blocked}
                              onChange={(e) =>
                                void move(l, e.target.value as Lead["stage"])
                              }
                            >
                              {stages.map((x) => (
                                <option key={x}>{x}</option>
                              ))}
                              {l.blocked && <option>Não contatar</option>}
                            </select>
                          </td>
                          <td>{l.nextAt ? shortDate(l.nextAt) : "—"}</td>
                          <td>{score(l, s.weights)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {page === "Painel" && (
            <Dashboard leads={leads} history={history} settings={s} />
          )}
          {page === "Modelos de mensagem" && (
            <TemplateEditor
              settings={s}
              history={history}
              onSave={saveSettings}
            />
          )}
          {page === "Clientes" && (
            <CustomersPage
              customers={snapshot.customers}
              leads={leads}
              settings={s}
              onMutate={onMutate}
            />
          )}
          {page === "Configurações" && (
            <CloudTools
              snapshot={snapshot}
              onMutate={onMutate}
              onLogout={() => {
                loadEpoch.current++;
                currentSnapshot.current = null;
                setAuthenticated(false);
                setSnapshot(null);
                setS(null);
                setLeads([]);
                setHistory([]);
              }}
            />
          )}
          {page === "Configurações" && (
            <SettingsPage
              settings={s}
              onSave={saveSettings}
              backup={backup}
              restore={restore}
              install={install}
              removeExamples={async () => {
                if (
                  !confirm("Remover todos os salões e interações de exemplo?")
                )
                  return;
                await onMutate("remove_examples", {});
                notify("Dados de exemplo removidos");
              }}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            <Hexagon size={13} /> colmeia CRM
          </span>
          <span>Feito para conexões que fazem sentido.</span>
          <span>
            Netlify Database <span className="green-dot" />
          </span>
        </footer>
      </div>
      {edit && (
        <LeadForm
          lead={edit}
          settings={s}
          onClose={() => setEdit(null)}
          onSave={async (l) => {
            const d = duplicate(l, leads);
            if (d)
              return notify(
                "Possível duplicado: " +
                  d.name +
                  ". Telefone, e-mail ou Instagram já cadastrado.",
              );
            await saveLead(l);
            setEdit(null);
            notify("Salão salvo na sua Colmeia");
          }}
        />
      )}
      {detail && (
        <Modal
          title={detail.name}
          sub={`${detail.owner} · ${detail.city}, ${detail.state}`}
          wide
          onClose={() => setDetail(null)}
        >
          <div className="detail-body">
            <div className="detail-overview">
              <Avatar l={detail} />
              <span className="score-pill">
                Prioridade {score(detail, s.weights)}/100
              </span>
              <span className="tag">
                {detail.example ? "Dados de exemplo" : detail.product}
              </span>
              <button
                className="btn"
                onClick={() => {
                  setEdit(detail);
                  setDetail(null);
                }}
              >
                Editar salão
              </button>
            </div>
            {detail.blocked && (
              <div className="warning">
                Não contatar: ações de contato bloqueadas e follow-ups
                cancelados.
              </div>
            )}
            <div className="detail-grid">
              <div>
                <label>Etapa do funil</label>
                <select
                  value={detail.stage}
                  disabled={detail.blocked}
                  onChange={(e) =>
                    void move(detail, e.target.value as Lead["stage"])
                  }
                >
                  {stages.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Valor potencial</label>
                <b>
                  {money(detail.value)}{" "}
                  {s.products.find((p) => p.name === detail.product)?.recurring
                    ? "/ mês"
                    : "único"}
                </b>
              </div>
              <div>
                <label>Horário local</label>
                <b>
                  {localTime(detail.timezone).text} · {detail.timezone}
                </b>
              </div>
              <div>
                <label>Próximo passo</label>
                <b>
                  {detail.nextAt ? shortDate(detail.nextAt) : "Nenhum agendado"}
                </b>
                <small>{detail.nextAction}</small>
              </div>
            </div>
            <div className="detail-actions">
              {channels
                .filter((c) => detail[c])
                .map((c) => (
                  <button
                    key={c}
                    disabled={detail.blocked}
                    className="btn"
                    onClick={() => openCompose(detail, c)}
                  >
                    <IconChannel channel={c} />
                    {channelNames[c]}
                  </button>
                ))}
              <button
                className="btn"
                disabled={detail.blocked}
                onClick={() => setReply(detail)}
              >
                <MessageSquare size={16} /> Respondeu
              </button>
              <button
                className="btn"
                disabled={detail.blocked}
                onClick={() => setSchedule(detail)}
              >
                <Calendar size={16} /> Próxima ação
              </button>
            </div>
            <div className="detail-meta">
              {[
                ["WhatsApp", detail.whatsapp],
                ["E-mail", detail.email],
                ["Instagram", detail.instagram],
                ["Site", detail.website],
                ["Google Business", detail.google],
                ["Origem", detail.source],
                ["Dono brasileiro", detail.brazilian],
                ["Idiomas atuais", detail.languages.join(", ")],
                ["Tags", detail.tags],
              ].map(
                ([k, v]) =>
                  v && (
                    <div key={k}>
                      <small>{k}</small>
                      <span>{v}</span>
                    </div>
                  ),
              )}
            </div>
            {detail.notes && (
              <div className="notes">
                <label>Observações</label>
                <p>{detail.notes}</p>
              </div>
            )}
            {detail.stage === "Perdido" && (
              <div className="warning">Motivo: {detail.lostReason}</div>
            )}
            <h3 className="timeline-title">Histórico de conversas</h3>
            <div className="timeline">
              {history
                .filter((h) => h.leadId === detail.id)
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((h) => (
                  <article key={h.id}>
                    <span className={"timeline-icon " + h.direction}>
                      <IconChannel channel={h.channel} />
                    </span>
                    <div>
                      <b>
                        {h.direction === "enviado"
                          ? "Mensagem enviada"
                          : "Resposta recebida"}{" "}
                        <span>· {channelNames[h.channel]}</span>
                      </b>
                      <small>
                        {new Date(h.at).toLocaleString("pt-BR")}{" "}
                        {h.variant && `· Modelo ${h.attempt}${h.variant}`}
                      </small>
                      <p>{h.text}</p>
                      <span className="tag">{h.result}</span>
                    </div>
                  </article>
                ))}
              {!history.some((h) => h.leadId === detail.id) && (
                <p className="muted">A primeira conversa ainda está por vir.</p>
              )}
            </div>
            <div className="danger-row">
              <button
                className="textbtn danger"
                onClick={async () => {
                  if (
                    !detail.blocked &&
                    !confirm(
                      "Marcar como Não contatar? Os follow-ups serão cancelados.",
                    )
                  )
                    return;
                  await saveLead({
                    ...detail,
                    blocked: !detail.blocked,
                    nextAt: null,
                  });
                  notify(
                    detail.blocked
                      ? "Bloqueio removido. Defina uma próxima ação."
                      : "Salão marcado como Não contatar",
                  );
                }}
              >
                {detail.blocked ? "Permitir contato novamente" : "Não contatar"}
              </button>
              <button
                className="iconbtn danger"
                aria-label="Excluir salão"
                onClick={async () => {
                  if (
                    !confirm("Mover este salão e seu histórico para a lixeira?")
                  )
                    return;
                  await onMutate("delete_lead", {
                    id: detail.id,
                    expectedRevision: detail.revision ?? 0,
                  });
                  setDetail(null);
                  notify("Salão excluído");
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {compose && (
        <Modal
          title={
            compose.opened ? "Você enviou?" : "Uma boa conversa começa aqui"
          }
          sub={`${compose.lead.name} · ${channelNames[compose.channel]} · ${compose.template.attempt}ª tentativa`}
          onClose={() => setCompose(null)}
        >
          <div className="form-body">
            {!compose.opened ? (
              <>
                <div className="form-row">
                  <label>
                    Variação do modelo
                    <select
                      value={compose.template.variant}
                      onChange={(e) => {
                        const t = s.templates.find(
                          (t) =>
                            t.channel === compose.channel &&
                            t.attempt === compose.template.attempt &&
                            t.variant === e.target.value,
                        )!;
                        setCompose({
                          ...compose,
                          template: t,
                          text: message(t, compose.lead, s),
                          subject: t.subject.replaceAll(
                            "{salao}",
                            compose.lead.name,
                          ),
                        });
                      }}
                    >
                      <option>A</option>
                      <option>B</option>
                    </select>
                  </label>
                  <label>
                    Canal
                    <select
                      value={compose.channel}
                      onChange={(e) =>
                        openCompose(compose.lead, e.target.value as Channel)
                      }
                    >
                      {channels
                        .filter((c) => compose.lead[c])
                        .map((c) => (
                          <option value={c} key={c}>
                            {channelNames[c]}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {compose.channel === "email" && (
                  <label>
                    Assunto
                    <input
                      value={compose.subject}
                      onChange={(e) =>
                        setCompose({ ...compose, subject: e.target.value })
                      }
                    />
                  </label>
                )}
                <label>
                  Mensagem
                  <textarea
                    rows={9}
                    value={compose.text}
                    onChange={(e) =>
                      setCompose({ ...compose, text: e.target.value })
                    }
                  />
                </label>
                <div className="info-line">
                  <Info size={15} /> O envio é manual. Confirme depois para
                  registrar e agendar o próximo passo.
                </div>
                <div className="modal-actions">
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(compose.text);
                        notify("Mensagem copiada");
                      } catch {
                        notify("Selecione e copie a mensagem manualmente");
                      }
                    }}
                  >
                    <Copy size={16} /> Copiar
                  </button>
                  <button className="btn primary" onClick={launchContact}>
                    Abrir {channelNames[compose.channel]}
                    <ExternalLink size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="confirm-illustration">
                  <Send size={32} />
                </div>
                <p className="confirm-text">
                  Confirme apenas se você enviou a mensagem para{" "}
                  <b>{compose.lead.name}</b>.
                </p>
                <div className="modal-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      setCompose(null);
                      notify("Nada foi registrado");
                    }}
                  >
                    Não enviei
                  </button>
                  <button className="btn primary" onClick={confirmSent}>
                    <Check size={16} /> Sim, enviei
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
      {reply && (
        <ReplyForm
          lead={reply}
          onClose={() => setReply(null)}
          onSave={async (date, action, text, channel) => {
            const l = leads.find((x) => x.id === reply.id)!;
            if (l.blocked) return notify("Este salão está bloqueado.");
            const last = history
              .filter((h) => h.leadId === l.id && h.direction === "enviado")
              .sort((a, b) => b.at.localeCompare(a.at))[0];
            await record(
              {
                id: uid(),
                leadId: l.id,
                at: new Date().toISOString(),
                channel,
                direction: "recebido",
                text,
                result: "Resposta registrada",
                variant: last?.variant,
                attempt: last?.attempt,
              },
              replyTransition(l, date, action),
            );
            setReply(null);
            notify("Resposta registrada. Cadência automática cancelada.");
          }}
        />
      )}
      {schedule && (
        <ScheduleForm
          lead={schedule}
          onClose={() => setSchedule(null)}
          onCalendar={() => calendar(schedule)}
          onSave={async (date) => {
            const l = leads.find((x) => x.id === schedule.id)!;
            if (l.blocked) return notify("Este salão está bloqueado.");
            await saveLead({ ...l, ...date });
            setSchedule(null);
            notify("Próximo passo atualizado");
          }}
        />
      )}
      {csvOpen && !importData && (
        <Modal
          title="Importar e exportar salões"
          sub="Seus contatos entram e saem com você."
          onClose={() => setCsvOpen(false)}
        >
          <div className="form-body">
            <label className="upload-zone">
              <Upload size={28} />
              <b>Importar arquivo CSV</b>
              <span>Na próxima etapa, escolha quais colunas usar.</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) =>
                  e.target.files?.[0] && parseCsv(e.target.files[0])
                }
              />
            </label>
            <button className="btn full" onClick={exportCsv}>
              <Download size={17} /> Exportar todos os salões em CSV
            </button>
            <p className="muted">
              Duplicados por telefone, e-mail ou Instagram são ignorados. CSV
              não inclui o histórico; use o backup JSON para isso.
            </p>
          </div>
        </Modal>
      )}
      {importData && (
        <Modal
          title="Mapear colunas do CSV"
          sub={`${importData.length} linhas encontradas · campos sem coluna ficam com o padrão`}
          onClose={() => setImportData(null)}
          wide
        >
          <div className="form-body">
            <div className="form-grid">
              {csvFields.map(([key, label]) => (
                <label key={key}>
                  {label}
                  {key === "name" ? " *" : ""}
                  <select
                    value={mapping[key] || ""}
                    onChange={(e) =>
                      setMapping({ ...mapping, [key]: e.target.value })
                    }
                  >
                    <option value="">Não importar</option>
                    {Object.keys(importData[0] || {}).map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setImportData(null)}>
                Voltar
              </button>
              <button className="btn primary" onClick={doImport}>
                Importar salões <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button
            className="iconbtn"
            onClick={() => setToast("")}
            aria-label="Dispensar"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
  function Filters() {
    return (
      <div className="filters">
        <label className="search">
          <Search size={17} />
          <input
            placeholder="Buscar salão, responsável, cidade ou tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filtrar etapa"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="Todos">Todas as etapas</option>
          {stages.map((x) => (
            <option key={x}>{x}</option>
          ))}
          <option>Não contatar</option>
        </select>
        <select
          aria-label="Filtrar país"
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          <option value="Todos">Todos os países</option>
          <option>Estados Unidos</option>
          <option>Brasil</option>
        </select>
      </div>
    );
  }
}
function PageHeading({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading secondary">
      <div>
        <div className="eyebrow">
          <span className="pink-dot" />
          COLMEIA CRM
        </div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      <div className="heading-actions">{action}</div>
    </div>
  );
}
function Empty() {
  return (
    <div className="empty">
      <Users size={30} />
      <h3>Nenhum salão por aqui</h3>
      <p>Cadastre um salão ou ajuste os filtros para começar.</p>
    </div>
  );
}
function LeadForm({
  lead,
  settings,
  onClose,
  onSave,
}: {
  lead: Lead;
  settings: Settings;
  onClose: () => void;
  onSave: (l: Lead) => void;
}) {
  const [l, setL] = useState({ ...lead });
  const [full, setFull] = useState(false);
  function field(
    key: keyof Lead,
    label: string,
    type = "text",
    required = false,
  ) {
    return (
      <label>
        {label}
        {required ? " *" : ""}
        <input
          type={type}
          required={required}
          value={String(l[key] ?? "")}
          onChange={(e) =>
            setL({
              ...l,
              [key]:
                type === "number" ? Number(e.target.value) : e.target.value,
            })
          }
        />
      </label>
    );
  }
  return (
    <Modal
      title={lead.name ? "Editar salão" : "Uma nova conexão"}
      sub="O essencial agora. Os detalhes, quando você quiser."
      onClose={onClose}
      wide
    >
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!l.name.trim()) return;
          try {
            new Intl.DateTimeFormat("pt-BR", { timeZone: l.timezone });
          } catch {
            return alert("Informe um fuso IANA válido, como America/New_York.");
          }
          onSave({ ...l, name: l.name.trim() });
        }}
      >
        <div className="form-section-title">SOBRE O SALÃO</div>
        <div className="form-grid">
          {field("name", "Nome do salão", "text", true)}
          {field("owner", "Nome do responsável")}
          <label>
            País
            <select
              value={l.country}
              onChange={(e) =>
                setL({
                  ...l,
                  country: e.target.value,
                  timezone: timezoneFor(e.target.value, l.state),
                })
              }
            >
              <option>Estados Unidos</option>
              <option>Brasil</option>
            </select>
          </label>
          {field("city", "Cidade")}
          <label>
            Estado (sigla)
            <input
              value={l.state}
              maxLength={2}
              onChange={(e) =>
                setL({
                  ...l,
                  state: e.target.value.toUpperCase(),
                  timezone: timezoneFor(l.country, e.target.value),
                })
              }
            />
          </label>
          {field("timezone", "Fuso horário (IANA)")}
          <label>
            Dono brasileiro confirmado?
            <select
              value={l.brazilian}
              onChange={(e) => setL({ ...l, brazilian: e.target.value })}
            >
              <option>A confirmar</option>
              <option>Sim</option>
              <option>Não</option>
            </select>
          </label>
          <label>
            Idiomas atendidos hoje
            <div className="checkbox-row">
              {["PT", "EN", "ES"].map((lang) => (
                <label key={lang}>
                  <input
                    type="checkbox"
                    checked={l.languages.includes(lang)}
                    onChange={(e) =>
                      setL({
                        ...l,
                        languages: e.target.checked
                          ? [...l.languages, lang]
                          : l.languages.filter((x) => x !== lang),
                      })
                    }
                  />
                  {lang}
                </label>
              ))}
            </div>
          </label>
        </div>
        <div className="form-section-title">COMO CHEGAR ATÉ ELE</div>
        <div className="form-grid">
          {field("whatsapp", "WhatsApp com DDI", "tel")}
          {field("email", "E-mail", "email")}
          {field("instagram", "Instagram (@usuário)")}
          <label>
            Origem do lead
            <select
              value={l.source}
              onChange={(e) => setL({ ...l, source: e.target.value })}
            >
              {[
                "WhatsApp",
                "Instagram",
                "Google Maps",
                "Indicação",
                "Pesquisa",
                "CSV",
                "Outro",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="textbtn expand-fields"
          type="button"
          onClick={() => setFull(!full)}
        >
          <Plus size={15} />
          {full
            ? "Ocultar detalhes adicionais"
            : "Adicionar site, produto, tags e observações"}
        </button>
        {full && (
          <>
            <div className="form-grid">
              <label>
                Tem site?
                <select
                  value={String(l.hasSite)}
                  onChange={(e) =>
                    setL({ ...l, hasSite: e.target.value === "true" })
                  }
                >
                  <option value="false">Não</option>
                  <option value="true">Sim</option>
                </select>
              </label>
              {field("website", "Site", "url")}
              {field("google", "Link do Google Business", "url")}
              <label>
                Produto de interesse
                <select
                  value={l.product}
                  onChange={(e) => {
                    const p = settings.products.find(
                      (p) => p.name === e.target.value,
                    )!;
                    setL({ ...l, product: p.name, value: p.price });
                  }}
                >
                  {settings.products.map((p) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
              </label>
              {field("value", "Valor potencial (R$)", "number")}
              {field("tags", "Tags (separadas por vírgula)")}
            </div>
            <label>
              Observações
              <textarea
                rows={3}
                value={l.notes}
                onChange={(e) => setL({ ...l, notes: e.target.value })}
              />
            </label>
          </>
        )}
        <div className="info-line">
          <ShieldCheck size={15} /> Verificamos duplicados por telefone, e-mail
          e Instagram ao salvar.
        </div>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" type="submit">
            <Check size={16} /> Salvar salão
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReplyForm({
  lead,
  onClose,
  onSave,
}: {
  lead: Lead;
  onClose: () => void;
  onSave: (d: string | null, a: string, t: string, c: Channel) => void;
}) {
  const [date, setDate] = useState(() => {
      const d = new Date(addDays(new Date(), 1));
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }),
    [action, setAction] = useState("Conversar sobre a demonstração"),
    [text, setText] = useState(""),
    [channel, setChannel] = useState<Channel>(
      channels.find((c) => lead[c]) || "whatsapp",
    );
  return (
    <Modal
      title="Uma conversa começou!"
      sub={`${lead.name} respondeu. A cadência será interrompida.`}
      onClose={onClose}
    >
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(new Date(date).toISOString(), action, text, channel);
        }}
      >
        <label>
          Canal da resposta
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
          >
            {channels.map((c) => (
              <option value={c} key={c}>
                {channelNames[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          O que ele respondeu?
          <textarea
            rows={3}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Registre o contexto da conversa…"
          />
        </label>
        <label>
          Qual é o próximo passo?
          <input
            required
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>
        <label>
          Quando?
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <small className="muted">
          Data no fuso do seu dispositivo. No salão:{" "}
          {localTime(lead.timezone).text} agora.
        </small>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary">
            <Check size={16} /> Registrar resposta
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ScheduleForm({
  lead,
  onClose,
  onSave,
  onCalendar,
}: {
  lead: Lead;
  onClose: () => void;
  onSave: (d: { nextAt: string | null; nextAction: string }) => void;
  onCalendar: () => void;
}) {
  const initial = lead.nextAt || new Date().toISOString();
  const toLocal = (v: string) => {
    const d = new Date(v);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const [date, setDate] = useState(toLocal(initial)),
    [action, setAction] = useState(lead.nextAction || "Retomar a conversa");
  return (
    <Modal title="Organize o próximo passo" sub={lead.name} onClose={onClose}>
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ nextAt: new Date(date).toISOString(), nextAction: action });
        }}
      >
        <label>
          Próxima ação
          <input
            required
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>
        <label>Adiar a partir de hoje</label>
        <div className="snooze-row">
          {[1, 3, 7].map((n) => (
            <button
              type="button"
              className="btn"
              key={n}
              onClick={() => setDate(toLocal(addDays(new Date(), n)))}
            >
              <Clock size={15} /> {n} {n === 1 ? "dia" : "dias"}
            </button>
          ))}
        </div>
        <label>
          Data e hora (no seu dispositivo)
          <input
            required
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {lead.nextAt && (
          <button type="button" className="btn full" onClick={onCalendar}>
            <Calendar size={16} /> Adicionar agendamento atual ao Google
            Calendar
          </button>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="textbtn muted"
            onClick={() => onSave({ nextAt: null, nextAction: "" })}
          >
            Cancelar follow-up
          </button>
          <button className="btn primary">Salvar próximo passo</button>
        </div>
      </form>
    </Modal>
  );
}
function TemplateEditor({
  settings,
  history,
  onSave,
}: {
  settings: Settings;
  history: Interaction[];
  onSave: (s: Settings) => Promise<void>;
}) {
  const [channel, setChannel] = useState<Channel>("whatsapp"),
    [step, setStep] = useState(1),
    [variant, setVariant] = useState<"A" | "B">("A"),
    [draft, setDraft] = useState(settings.templates);
  const [draftRevision, setDraftRevision] = useState(settings.revision ?? 0);
  const t = draft.find(
    (t) => t.channel === channel && t.attempt === step && t.variant === variant,
  )!;
  function update(data: Partial<Template>) {
    setDraft(draft.map((x) => (x === t ? { ...x, ...data } : x)));
  }
  const sample = {
    ...blankLead(),
    name: "Studio Bella",
    owner: "Camila",
    city: "Orlando",
  };
  return (
    <>
      <PageHeading
        title="Palavras que abrem conversas"
        text="Mensagens em português, de brasileiro para brasileiro."
        action={
          <button
            className="btn primary"
            onClick={async () => {
              await onSave({
                ...settings,
                templates: draft,
                revision: draftRevision,
              });
              setDraftRevision((r) => r + 1);
            }}
          >
            <Check size={16} /> Salvar modelos
          </button>
        }
      />
      <div className="editor-layout">
        <div className="editor-menu">
          <div className="form-section-title">CANAL DE CONTATO</div>
          {channels.map((c) => (
            <button
              key={c}
              className={channel === c ? "active" : ""}
              onClick={() => setChannel(c)}
            >
              <IconChannel channel={c} />
              {channelNames[c]}
              <ChevronRight size={14} />
            </button>
          ))}
          <div className="form-section-title">ETAPA DA CADÊNCIA</div>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className={step === n ? "active" : ""}
              onClick={() => setStep(n)}
            >
              <span className="step-number">{n}</span>
              {n === 1
                ? "Primeiro contato"
                : n === 4
                  ? "Última tentativa"
                  : `${n}º contato`}
            </button>
          ))}
          <div className="info-box">
            <Globe size={18} />
            <p>
              As mensagens são sempre em português. O diferencial é atender os
              clientes do salão em três idiomas.
            </p>
          </div>
        </div>
        <div className="editor-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {channelNames[channel]} · {step}º contato
                </h2>
                <p>Curto, pessoal e sem promessas de resultado.</p>
              </div>
              <div className="view-switch">
                {(["A", "B"] as const).map((v) => (
                  <button
                    key={v}
                    className={variant === v ? "active" : ""}
                    onClick={() => setVariant(v)}
                  >
                    Variação {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-body">
              {channel === "email" && (
                <label>
                  Assunto
                  <input
                    value={t.subject}
                    onChange={(e) => update({ subject: e.target.value })}
                  />
                </label>
              )}
              <label>
                Mensagem
                <textarea
                  rows={8}
                  value={t.text}
                  onChange={(e) => update({ text: e.target.value })}
                />
              </label>
              <div className="variable-row">
                {["salao", "responsavel", "cidade", "link"].map((v) => (
                  <button
                    key={v}
                    className="tag"
                    onClick={() => update({ text: t.text + ` {${v}}` })}
                  >
                    {"{" + v + "}"}
                  </button>
                ))}
              </div>
              <div className="info-line">
                <Info size={15} /> O link recebe UTM do canal e campanha
                automaticamente.
              </div>
            </div>
          </section>
          <section className="panel preview-panel">
            <div className="panel-heading">
              <h3>Prévia da mensagem</h3>
              <span className="tag">Studio Bella · Exemplo</span>
            </div>
            <p className="message-bubble">{message(t, sample, settings)}</p>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>Como cada variação está indo</h3>
            </div>
            <div className="ab-stats">
              {(["A", "B"] as const).map((v) => {
                const sent = history.filter(
                  (h) =>
                    !h.example &&
                    h.channel === channel &&
                    h.attempt === step &&
                    h.variant === v &&
                    h.direction === "enviado",
                );
                const replies = new Set(
                  history
                    .filter(
                      (h) =>
                        !h.example &&
                        h.channel === channel &&
                        h.attempt === step &&
                        h.variant === v &&
                        h.direction === "recebido",
                    )
                    .map((h) => h.leadId),
                ).size;
                return (
                  <div key={v}>
                    <span>Variação {v}</span>
                    <b>
                      {sent.length
                        ? Math.round((replies / sent.length) * 100)
                        : 0}
                      %
                    </b>
                    <small>
                      {sent.length} envios · {replies} respostas atribuídas
                    </small>
                  </div>
                );
              })}
            </div>
            <p className="attribution-note">
              A resposta é atribuída ao último modelo enviado ao salão. Dados de
              exemplo não entram nas taxas A/B.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
function SettingsPage({
  settings,
  onSave,
  backup,
  restore,
  removeExamples,
  install,
}: {
  settings: Settings;
  onSave: (s: Settings) => Promise<void>;
  backup: () => void;
  restore: (f: File) => void;
  removeExamples: () => void;
  install: any;
}) {
  const [v, setV] = useState(structuredClone(settings));
  return (
    <>
      <PageHeading
        title="Do seu jeito"
        text="Ajuste a Colmeia à sua rotina de prospecção."
        action={
          <button
            className="btn primary"
            onClick={async () => {
              try {
                const url = new URL(v.link);
                if (!["http:", "https:"].includes(url.protocol)) throw Error();
              } catch {
                return alert("Informe um link de vendas válido com https://.");
              }
              await onSave(v);
              setV((current) => ({
                ...current,
                revision: (current.revision ?? 0) + 1,
              }));
            }}
          >
            <Check size={16} /> Salvar configurações
          </button>
        }
      />
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Sua rotina</h2>
            <Target size={19} />
          </div>
          <div className="form-body">
            <label>
              Meta diária de novos contatos
              <input
                type="number"
                min={1}
                value={v.goal}
                onChange={(e) =>
                  setV({ ...v, goal: Math.max(1, Number(e.target.value)) })
                }
              />
            </label>
            <label>
              Link da página de vendas
              <input
                type="url"
                value={v.link}
                onChange={(e) => setV({ ...v, link: e.target.value })}
              />
            </label>
            <label>Cadência após cada envio (dias)</label>
            <div className="form-row three">
              {v.cadence.map((n, i) => (
                <label key={i}>
                  Após o {i + 1}º contato
                  <input
                    type="number"
                    min={1}
                    value={n}
                    onChange={(e) =>
                      setV({
                        ...v,
                        cadence: v.cadence.map((x, j) =>
                          i === j ? Math.max(1, Number(e.target.value)) : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="info-line">
              <Info size={15} /> Após o 4º envio sem resposta: Perdido · Sem
              resposta.
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Pontuação de prioridade</h2>
            <SlidersHorizontal size={19} />
          </div>
          <div className="form-body">
            <p className="muted">
              Pesos normalizados para uma pontuação de 0 a 100. Canais pontuam
              proporcionalmente até 3.
            </p>
            {(
              [
                ["brazilian", "Dono brasileiro confirmado"],
                ["channels", "Canais de contato cadastrados"],
                ["noSite", "Não ter site"],
                ["portuguese", "Atender só em português"],
              ] as const
            ).map(([key, label]) => (
              <label className="weight-row" key={key}>
                {label}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={v.weights[key]}
                  onChange={(e) =>
                    setV({
                      ...v,
                      weights: {
                        ...v.weights,
                        [key]: Math.max(
                          0,
                          Math.min(100, Number(e.target.value)),
                        ),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Catálogo de produtos</h2>
            <FileText size={19} />
          </div>
          <div className="form-body">
            {v.products.map((p, i) => (
              <div className="product-row" key={i}>
                <label>
                  Produto
                  <input
                    value={p.name}
                    onChange={(e) =>
                      setV({
                        ...v,
                        products: v.products.map((x, j) =>
                          i === j ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Preço R$
                  <input
                    type="number"
                    min={0}
                    value={p.price}
                    onChange={(e) =>
                      setV({
                        ...v,
                        products: v.products.map((x, j) =>
                          i === j
                            ? {
                                ...x,
                                price: Math.max(0, Number(e.target.value)),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={p.recurring}
                    onChange={(e) =>
                      setV({
                        ...v,
                        products: v.products.map((x, j) =>
                          i === j ? { ...x, recurring: e.target.checked } : x,
                        ),
                      })
                    }
                  />{" "}
                  Mensal
                </label>
              </div>
            ))}
            <p className="muted">
              Essencial: 1 canal · Duplo: 2 canais · Total: 3 canais. Mudanças
              de preço valem para novos cadastros.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Assinatura de e-mail</h2>
            <Mail size={19} />
          </div>
          <div className="form-body">
            {(
              [
                ["name", "Seu nome"],
                ["company", "Empresa"],
                ["address", "Endereço postal completo"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  value={v.signature[k]}
                  onChange={(e) =>
                    setV({
                      ...v,
                      signature: { ...v.signature, [k]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
            <div className="signature-preview">
              {v.signature.name || "Seu nome"}
              <br />
              {v.signature.company}
              <br />
              {v.signature.address || "Seu endereço postal"}
              <br />
              <br />
              Se não quiser receber novas mensagens, é só responder SAIR.
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Seus dados</h2>
            <Database size={19} />
          </div>
          <div className="form-body">
            <p className="muted">
              Seus dados ficam no Netlify Database e podem ser acessados em
              diferentes dispositivos. O backup JSON inclui salões, clientes,
              histórico e lixeira. Importar um backup adiciona registros sem
              substituir os existentes.
            </p>
            <button className="btn full" onClick={backup}>
              <Download size={16} /> Baixar backup JSON
            </button>
            <label className="btn full file-btn">
              <Upload size={16} /> Restaurar backup JSON
              <input
                type="file"
                accept=".json"
                onChange={(e) =>
                  e.target.files?.[0] && restore(e.target.files[0])
                }
              />
            </label>
            <small className="muted">
              Último backup:{" "}
              {settings.lastBackup
                ? new Date(settings.lastBackup).toLocaleString("pt-BR")
                : "Ainda não realizado"}
            </small>
            <button className="btn full danger" onClick={removeExamples}>
              <Trash2 size={16} /> Remover dados de exemplo
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Leve a Colmeia com você</h2>
            <Hexagon size={19} />
          </div>
          <div className="form-body">
            <p className="muted">
              Instale o CRM para acessar pelo celular ou computador. O banco
              conectado exige internet para consultar e salvar os dados.
            </p>
            <button
              className="btn full"
              disabled={!install}
              onClick={() => install?.prompt()}
            >
              <Download size={16} /> Instalar aplicativo
            </button>
            {!install && (
              <small className="muted">
                Se a instalação não aparecer, use “Adicionar à tela de início”
                no menu do navegador. No iPhone: Compartilhar → Adicionar à Tela
                de Início.
              </small>
            )}
            <div className="info-box">
              <ShieldCheck size={21} />
              <p>
                Acesso protegido por senha. Site e ChatGPT compartilham as
                mesmas regras do CRM, sem envio automático de mensagens.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
function Dashboard({
  leads,
  history,
  settings,
}: {
  leads: Lead[];
  history: Interaction[];
  settings: Settings;
}) {
  const sends = history.filter((h) => h.direction === "enviado"),
    replied = new Set(
      history.filter((h) => h.direction === "recebido").map((h) => h.leadId),
    );
  const recurring = (l: Lead) =>
    settings.products.find((p) => p.name === l.product)?.recurring;
  const weeks = Array.from({ length: 7 }, (_, i) => {
    const end = new Date();
    end.setDate(end.getDate() - (6 - i) * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return {
      label: shortDate(end.toISOString()),
      n: sends.filter((h) => new Date(h.at) > start && new Date(h.at) <= end)
        .length,
    };
  });
  const max = Math.max(1, ...weeks.map((w) => w.n));
  const states = Object.entries(
    leads.reduce<Record<string, number>>(
      (all, l) => ({
        ...all,
        [l.state || "Não informado"]:
          (all[l.state || "Não informado"] || 0) + 1,
      }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <PageHeading
        title="Uma visão de toda a Colmeia"
        text="Entenda o que está movimentando suas oportunidades."
      />
      <div className="stats-grid dashboard-stats">
        {[
          {
            label: "Contatos enviados",
            value: sends.length,
            sub: "Mensagens registradas",
            icon: Send,
          },
          {
            label: "Taxa de resposta",
            value:
              (new Set(sends.map((h) => h.leadId)).size
                ? Math.round(
                    ([...replied].filter((id) =>
                      sends.some((h) => h.leadId === id),
                    ).length /
                      new Set(sends.map((h) => h.leadId)).size) *
                      100,
                  )
                : 0) + "%",
            sub: "Por salão contatado",
            icon: MessageSquare,
          },
          {
            label: "Mensal potencial",
            value: money(
              leads
                .filter(
                  (l) =>
                    recurring(l) &&
                    !l.blocked &&
                    !["Perdido", "Fechado"].includes(l.stage),
                )
                .reduce((n, l) => n + l.value, 0),
            ),
            sub: "Oportunidades em aberto",
            icon: TrendingUp,
          },
          {
            label: "Mensal fechado",
            value: money(
              leads
                .filter((l) => recurring(l) && l.stage === "Fechado")
                .reduce((n, l) => n + l.value, 0),
            ),
            sub: "Recorrência conquistada",
            icon: CheckCheck,
          },
        ].map((x) => (
          <div className="stat-card" key={x.label}>
            <div className="stat-top">
              {x.label}
              <span className="stat-icon pink">
                <x.icon size={16} />
              </span>
            </div>
            <div className="stat-value money">{x.value}</div>
            <div className="stat-bottom">{x.sub}</div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Contatos enviados por semana</h2>
            <span className="tag">Últimas 7 semanas</span>
          </div>
          <div className="bar-chart">
            {weeks.map((w) => (
              <div key={w.label}>
                <b>{w.n}</b>
                <div className="bar-track">
                  <span
                    style={{ height: Math.max(2, (w.n / max) * 100) + "%" }}
                  />
                </div>
                <small>{w.label}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Respostas por canal</h2>
          </div>
          <div className="channel-metrics">
            {channels.map((c) => {
              const sent = new Set(
                  sends.filter((h) => h.channel === c).map((h) => h.leadId),
                ),
                res = new Set(
                  history
                    .filter(
                      (h) =>
                        h.channel === c &&
                        h.direction === "recebido" &&
                        sent.has(h.leadId),
                    )
                    .map((h) => h.leadId),
                );
              const rate = sent.size
                ? Math.round((res.size / sent.size) * 100)
                : 0;
              return (
                <div key={c}>
                  <div>
                    <span>
                      <IconChannel channel={c} />
                      {channelNames[c]}
                    </span>
                    <b>{rate}%</b>
                  </div>
                  <div className="progress">
                    <div style={{ width: rate + "%" }} />
                  </div>
                  <small>
                    {res.size} respostas / {sent.size} salões contatados
                  </small>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Distribuição no funil</h2>
          </div>
          <div className="funnel-metrics">
            {stages.map((st, i) => {
              const count = leads.filter(
                (l) => l.stage === st && !l.blocked,
              ).length;
              return (
                <div key={st}>
                  <span>
                    <span className={"stage-dot st" + i} />
                    {st}
                  </span>
                  <div className="funnel-track">
                    <i
                      style={{
                        width:
                          Math.max(
                            2,
                            (count / Math.max(1, leads.length)) * 100,
                          ) + "%",
                      }}
                    />
                  </div>
                  <b>{count}</b>
                </div>
              );
            })}
          </div>
          <p className="attribution-note">
            Conversão acumulada estimada por etapa atual:{" "}
            {stages
              .slice(1, -1)
              .map((st, i) => {
                const previous = leads.filter(
                  (l) =>
                    stages.indexOf(l.stage) >= i &&
                    l.stage !== "Perdido" &&
                    !l.blocked,
                ).length;
                const advanced = leads.filter(
                  (l) =>
                    stages.indexOf(l.stage) >= i + 1 &&
                    l.stage !== "Perdido" &&
                    !l.blocked,
                ).length;
                return `${st}: ${previous ? Math.round((advanced / previous) * 100) : 0}%`;
              })
              .join(" · ")}
            . Movimentações retroativas não são reconstruídas.
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Onde estão seus salões</h2>
            <Globe size={18} />
          </div>
          <div className="state-metrics">
            {states.map(([state, count]) => (
              <div key={state}>
                <b>{state}</b>
                <div className="progress">
                  <div
                    style={{
                      width: (count / Math.max(1, leads.length)) * 100 + "%",
                    }}
                  />
                </div>
                <span>{count} salões</span>
              </div>
            ))}
          </div>
          <div className="no-site">
            <Globe size={21} />
            <div>
              <b>{leads.filter((l) => !l.hasSite).length} salões sem site</b>
              <p>Oportunidades para o Pacote Presença Digital.</p>
            </div>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Resposta por modelo</h2>
          <span className="tag">Dados reais · A/B</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th>Tentativa</th>
                <th>Variação</th>
                <th>Enviados</th>
                <th>Respostas</th>
                <th>Taxa</th>
              </tr>
            </thead>
            <tbody>
              {settings.templates.map((t) => {
                const sent = history.filter(
                  (h) =>
                    !h.example &&
                    h.direction === "enviado" &&
                    h.channel === t.channel &&
                    h.attempt === t.attempt &&
                    h.variant === t.variant,
                );
                const res = new Set(
                  history
                    .filter(
                      (h) =>
                        !h.example &&
                        h.direction === "recebido" &&
                        h.channel === t.channel &&
                        h.attempt === t.attempt &&
                        h.variant === t.variant,
                    )
                    .map((h) => h.leadId),
                ).size;
                if (!sent.length && !res) return null;
                return (
                  <tr key={t.channel + t.attempt + t.variant}>
                    <td>{channelNames[t.channel]}</td>
                    <td>{t.attempt}</td>
                    <td>{t.variant}</td>
                    <td>{sent.length}</td>
                    <td>{res}</td>
                    <td>
                      {sent.length ? Math.round((res / sent.length) * 100) : 0}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!history.some((h) => !h.example && h.direction === "enviado") && (
            <div className="empty-queue">
              Seus modelos aparecerão aqui após os primeiros envios reais.
            </div>
          )}
        </div>
      </section>
      <p className="table-foot">
        O painel inclui os dados de exemplo, exceto nas taxas por modelo. Remova
        os exemplos em Configurações para acompanhar apenas seus resultados.
      </p>
    </>
  );
}
