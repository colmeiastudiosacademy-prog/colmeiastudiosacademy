export const stages = [
  "Novo",
  "Contatado",
  "Respondeu",
  "Conversa agendada",
  "Demo feita",
  "Proposta enviada",
  "Fechado",
  "Perdido",
] as const;
export type Stage = (typeof stages)[number];
export type Channel = "whatsapp" | "email" | "instagram";
export const channels: Channel[] = ["whatsapp", "email", "instagram"];
export const channelNames = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  instagram: "Instagram",
};
export type Lead = {
  revision?: number;
  id: string;
  name: string;
  owner: string;
  city: string;
  state: string;
  country: string;
  timezone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  website: string;
  hasSite: boolean;
  google: string;
  brazilian: string;
  languages: string[];
  source: string;
  product: string;
  value: number;
  tags: string;
  notes: string;
  stage: Stage;
  blocked: boolean;
  lostReason: string;
  nextAt: string | null;
  nextAction: string;
  createdAt: string;
  example?: boolean;
};
export type Interaction = {
  id: string;
  leadId: string;
  at: string;
  channel: Channel;
  direction: "enviado" | "recebido";
  text: string;
  result: string;
  variant?: "A" | "B";
  attempt?: number;
  example?: boolean;
};
export type Template = {
  channel: Channel;
  attempt: number;
  variant: "A" | "B";
  subject: string;
  text: string;
};
export type Settings = {
  revision?: number;
  goal: number;
  link: string;
  cadence: number[];
  weights: {
    brazilian: number;
    channels: number;
    noSite: number;
    portuguese: number;
  };
  signature: { name: string; company: string; address: string };
  products: { name: string; price: number; recurring: boolean }[];
  templates: Template[];
  lastBackup: string;
};
export const uid = () => crypto.randomUUID();
export const money = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
export function available(l: Lead) {
  return channels.filter((c) => l[c].trim());
}
export function score(l: Lead, w: Settings["weights"]) {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (((l.brazilian === "Sim" ? w.brazilian : 0) +
          (available(l).length / 3) * w.channels +
          (!l.hasSite ? w.noSite : 0) +
          (l.languages.length === 1 && l.languages[0] === "PT"
            ? w.portuguese
            : 0)) /
          total) *
          100,
      ),
    ),
  );
}
export const addDays = (d: Date, days: number) => {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n.toISOString();
};
export function sentTransition(
  l: Lead,
  history: Interaction[],
  s: Settings,
  now = new Date(),
): Lead {
  if (l.blocked) return l;
  const count =
    history.filter((i) => i.leadId === l.id && i.direction === "enviado")
      .length + 1;
  const answered = history.some(
    (i) => i.leadId === l.id && i.direction === "recebido",
  );
  if (answered) return { ...l, nextAt: null };
  if (count >= 4)
    return { ...l, stage: "Perdido", lostReason: "Sem resposta", nextAt: null };
  return {
    ...l,
    stage: l.stage === "Novo" ? "Contatado" : l.stage,
    nextAt: addDays(now, s.cadence[count - 1]),
    nextAction: "Retomar a conversa",
  };
}
export function replyTransition(
  l: Lead,
  date: string | null,
  action: string,
): Lead {
  return { ...l, stage: "Respondeu", nextAt: date, nextAction: action };
}
export function suggestChannel(l: Lead, h: Interaction[]): Channel | undefined {
  const list = available(l);
  const sent = h
    .filter((i) => i.leadId === l.id && i.direction === "enviado")
    .sort((a, b) => a.at.localeCompare(b.at));
  const last = sent.at(-1)?.channel;
  return list[(list.indexOf(last!) + 1) % list.length];
}
const zones: Record<string, string> = {
  FL: "America/New_York",
  MA: "America/New_York",
  NY: "America/New_York",
  NJ: "America/New_York",
  CT: "America/New_York",
  PA: "America/New_York",
  GA: "America/New_York",
  NC: "America/New_York",
  SC: "America/New_York",
  VA: "America/New_York",
  MD: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  RI: "America/New_York",
  VT: "America/New_York",
  NH: "America/New_York",
  ME: "America/New_York",
  OH: "America/New_York",
  MI: "America/Detroit",
  IN: "America/Indiana/Indianapolis",
  KY: "America/New_York",
  TN: "America/Chicago",
  AL: "America/Chicago",
  MS: "America/Chicago",
  LA: "America/Chicago",
  AR: "America/Chicago",
  IL: "America/Chicago",
  IA: "America/Chicago",
  MN: "America/Chicago",
  MO: "America/Chicago",
  WI: "America/Chicago",
  ND: "America/Chicago",
  SD: "America/Chicago",
  NE: "America/Chicago",
  KS: "America/Chicago",
  OK: "America/Chicago",
  TX: "America/Chicago",
  MT: "America/Denver",
  WY: "America/Denver",
  CO: "America/Denver",
  NM: "America/Denver",
  UT: "America/Denver",
  ID: "America/Boise",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  WA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  AK: "America/Anchorage",
  HI: "Pacific/Honolulu",
  WV: "America/New_York",
};
const br: Record<string, string> = {
  AC: "America/Rio_Branco",
  AM: "America/Manaus",
  RR: "America/Boa_Vista",
  RO: "America/Porto_Velho",
  MT: "America/Cuiaba",
  MS: "America/Campo_Grande",
  AP: "America/Belem",
  PA: "America/Belem",
};
export function timezoneFor(country: string, state: string) {
  return country === "Brasil"
    ? br[state.toUpperCase()] || "America/Sao_Paulo"
    : zones[state.toUpperCase()] || "America/New_York";
}
export function localTime(zone: string, date = new Date()) {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(date),
    );
    return {
      text: new Intl.DateTimeFormat("pt-BR", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(date),
      open: hour >= 9 && hour < 18,
    };
  } catch {
    return { text: "Fuso inválido", open: false };
  }
}
export function normalize(c: Channel, v: string) {
  return c === "whatsapp"
    ? v.replace(/\D/g, "")
    : c === "instagram"
      ? v
          .replace(/^@/, "")
          .replace(/^https?:\/\/(www\.)?instagram.com\//, "")
          .replace(/\/$/, "")
          .trim()
          .toLowerCase()
      : v.trim().toLowerCase();
}
export function duplicate(l: Lead, all: Lead[]) {
  return all.find(
    (x) =>
      x.id !== l.id &&
      channels.some(
        (c) => normalize(c, l[c]) && normalize(c, l[c]) === normalize(c, x[c]),
      ),
  );
}
export function message(t: Template, l: Lead, s: Settings) {
  const link = new URL(s.link);
  link.searchParams.set("utm_source", t.channel);
  link.searchParams.set("utm_campaign", "prospeccao");
  let text = t.text;
  for (const [key, v] of Object.entries({
    salao: l.name,
    responsavel: l.owner || "tudo bem",
    cidade: l.city,
    link: link.toString(),
  }))
    text = text.replaceAll(`{${key}}`, v);
  if (t.channel === "email") {
    const sig = s.signature;
    text +=
      "\n\n" +
      [
        sig.name,
        sig.company,
        sig.address,
        "Se não quiser receber novas mensagens, é só responder SAIR.",
      ]
        .filter(Boolean)
        .join("\n");
  }
  return text;
}
export function blankLead(): Lead {
  return {
    id: uid(),
    name: "",
    owner: "",
    city: "",
    state: "FL",
    country: "Estados Unidos",
    timezone: "America/New_York",
    whatsapp: "",
    email: "",
    instagram: "",
    website: "",
    hasSite: false,
    google: "",
    brazilian: "A confirmar",
    languages: ["PT"],
    source: "WhatsApp",
    product: "Essencial",
    value: 297,
    tags: "",
    notes: "",
    stage: "Novo",
    blocked: false,
    lostReason: "",
    nextAt: new Date().toISOString(),
    nextAction: "Primeiro contato",
    createdAt: new Date().toISOString(),
  };
}
export function initialSettings(): Settings {
  const templates: Template[] = [];
  for (const channel of channels)
    for (let attempt = 1; attempt <= 4; attempt++)
      for (const variant of ["A", "B"] as const)
        templates.push({
          channel,
          attempt,
          variant,
          subject:
            attempt === 1
              ? "Uma ideia para o atendimento do {salao}"
              : "Sobre o atendimento do {salao}",
          text:
            attempt === 1
              ? variant === "A"
                ? "Oi, {responsavel}! Tudo bem? Vi o {salao}, em {cidade}. A AI Receptionist atende seus clientes em português, inglês e espanhol e ajuda com os agendamentos. Quer testar a demonstração? {link}"
                : "Olá, {responsavel}! Sou da Colmeia. Já pensou em atender os clientes do {salao} em português, inglês e espanhol, mesmo quando você está ocupado? Você pode conhecer a recepcionista com IA aqui: {link}"
              : attempt === 2
                ? "Oi, {responsavel}! Conseguiu ver a demonstração da recepcionista com IA? Se fizer sentido para o {salao}, posso te mostrar como funciona. {link}"
                : attempt === 3
                  ? "Oi, {responsavel}! Como vocês cuidam dos agendamentos quando estão atendendo? A AI Receptionist pode ajudar por telefone, WhatsApp e site, em três idiomas. Vamos conversar? {link}"
                  : "Oi, {responsavel}! Vou encerrar meus contatos por aqui. Se quiser conhecer a AI Receptionist para o {salao}, a demonstração está neste link: {link}. Obrigado!",
        });
  return {
    goal: 15,
    link: "https://colmeiastudiosacademy.com.br/ai-receptionist/",
    cadence: [3, 7, 14],
    weights: { brazilian: 35, channels: 25, noSite: 20, portuguese: 20 },
    signature: { name: "", company: "Colmeia Studios Academy", address: "" },
    products: [
      { name: "Essencial", price: 297, recurring: true },
      { name: "Duplo", price: 497, recurring: true },
      { name: "Total", price: 647, recurring: true },
      { name: "Pacote Presença Digital", price: 2997, recurring: false },
    ],
    templates,
    lastBackup: "",
  };
}
