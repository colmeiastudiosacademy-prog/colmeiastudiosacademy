import { describe, it, expect } from "vitest";
import {
  blankLead,
  initialSettings,
  sentTransition,
  replyTransition,
  suggestChannel,
  score,
  timezoneFor,
  localTime,
  duplicate,
  message,
  type Interaction,
} from "./domain";
const s = initialSettings();
function sent(leadId: string, n: number): Interaction[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    leadId,
    at: `2026-01-0${i + 1}T12:00:00.000Z`,
    channel: i % 2 ? "email" : "whatsapp",
    direction: "enviado",
    text: "Oi",
    result: "Enviado",
  }));
}
describe("Cadência de contatos", () => {
  it.each([
    [0, 3],
    [1, 7],
    [2, 14],
  ])("após %i envios prévios, agenda em %i dias", (count, days) => {
    const l = blankLead();
    const now = new Date("2026-01-01T12:00:00Z");
    const r = sentTransition(l, sent(l.id, count), s, now);
    expect(r.nextAt).toBe(
      `2026-01-${String(1 + days).padStart(2, "0")}T12:00:00.000Z`,
    );
    expect(r.stage).toBe("Contatado");
  });
  it("encerra no quarto contato sem resposta", () => {
    const l = blankLead();
    const r = sentTransition(l, sent(l.id, 3), s);
    expect(r.stage).toBe("Perdido");
    expect(r.lostReason).toBe("Sem resposta");
    expect(r.nextAt).toBeNull();
  });
  it("resposta cancela cadência e define ação", () => {
    const l = blankLead();
    const r = replyTransition(l, "2026-03-01T12:00:00Z", "Fazer demo");
    expect(r.stage).toBe("Respondeu");
    expect(r.nextAt).toBe("2026-03-01T12:00:00Z");
    expect(r.nextAction).toBe("Fazer demo");
    const h: Interaction = {
      id: "r",
      leadId: l.id,
      at: new Date().toISOString(),
      channel: "email",
      direction: "recebido",
      text: "Sim",
      result: "Respondeu",
    };
    expect(sentTransition(r, [...sent(l.id, 3), h], s).stage).toBe("Respondeu");
  });
  it("não contatar bloqueia transição de envio", () => {
    const l = { ...blankLead(), blocked: true, nextAt: null };
    expect(sentTransition(l, [], s)).toEqual(l);
  });
  it("alterna entre canais disponíveis", () => {
    const l = { ...blankLead(), whatsapp: "123", email: "a@b.com" };
    expect(suggestChannel(l, [])).toBe("whatsapp");
    expect(suggestChannel(l, sent(l.id, 1))).toBe("email");
    expect(suggestChannel(l, sent(l.id, 2))).toBe("whatsapp");
  });
  it("usa a cadência configurada", () => {
    const l = blankLead();
    expect(
      sentTransition(
        l,
        [],
        { ...s, cadence: [1, 2, 3] },
        new Date("2026-01-01T12:00Z"),
      ).nextAt,
    ).toBe("2026-01-02T12:00:00.000Z");
  });
});
describe("Fusos horários e horário comercial", () => {
  it("mapeia estados dos EUA e Brasil", () => {
    expect(timezoneFor("Estados Unidos", "FL")).toBe("America/New_York");
    expect(timezoneFor("Estados Unidos", "CA")).toBe("America/Los_Angeles");
    expect(timezoneFor("Brasil", "SP")).toBe("America/Sao_Paulo");
    expect(timezoneFor("Brasil", "AM")).toBe("America/Manaus");
  });
  it("considera horário de verão dos EUA", () => {
    expect(
      localTime("America/New_York", new Date("2026-01-15T15:00Z")).text,
    ).toBe("10:00");
    expect(
      localTime("America/New_York", new Date("2026-07-15T15:00Z")).text,
    ).toBe("11:00");
  });
  it("abre às 9h e fecha às 18h", () => {
    expect(
      localTime("America/Sao_Paulo", new Date("2026-01-15T11:59Z")).open,
    ).toBe(false);
    expect(
      localTime("America/Sao_Paulo", new Date("2026-01-15T12:00Z")).open,
    ).toBe(true);
    expect(
      localTime("America/Sao_Paulo", new Date("2026-01-15T21:00Z")).open,
    ).toBe(false);
  });
  it("trata fuso inválido", () =>
    expect(localTime("inválido").open).toBe(false));
});
describe("Prioridade", () => {
  it("soma todos os critérios até 100", () => {
    const l = {
      ...blankLead(),
      brazilian: "Sim",
      whatsapp: "123",
      email: "a@b.com",
      instagram: "a",
    };
    expect(score(l, s.weights)).toBe(100);
  });
  it("conta canais proporcionalmente", () => {
    const l = {
      ...blankLead(),
      hasSite: true,
      languages: ["EN"],
      whatsapp: "123",
    };
    expect(score(l, s.weights)).toBe(8);
  });
  it("normaliza pesos editados", () => {
    const l = { ...blankLead(), brazilian: "Sim" };
    expect(
      score(l, { brazilian: 100, channels: 0, noSite: 0, portuguese: 0 }),
    ).toBe(100);
    expect(
      score(l, { brazilian: 0, channels: 0, noSite: 0, portuguese: 0 }),
    ).toBe(0);
  });
});
describe("Mensagens e deduplicação", () => {
  it("detecta telefone com formatação e Instagram com @", () => {
    const l = {
      ...blankLead(),
      whatsapp: "+1 (407) 123-4567",
      instagram: "@bella",
    };
    expect(
      duplicate({ ...blankLead(), whatsapp: "14071234567" }, [l])?.id,
    ).toBe(l.id);
    expect(duplicate({ ...blankLead(), instagram: "BELLA" }, [l])?.id).toBe(
      l.id,
    );
  });
  it("substitui variáveis e adiciona UTM sem perder query", () => {
    const l = { ...blankLead(), name: "Bella", owner: "Ana", city: "Miami" };
    const t = s.templates.find(
      (t) => t.channel === "whatsapp" && t.attempt === 1,
    )!;
    const text = message(t, l, { ...s, link: "https://example.com/demo?x=1" });
    expect(text).toContain("Ana");
    expect(text).toContain("utm_source=whatsapp");
    expect(text).toContain("utm_campaign=prospeccao");
    expect(text).toContain("x=1");
    expect(text).not.toContain("{salao}");
  });
  it("inclui assinatura e opção de saída no e-mail", () => {
    const t = s.templates.find((t) => t.channel === "email")!;
    expect(message(t, blankLead(), s)).toContain(
      "Se não quiser receber novas mensagens, é só responder SAIR.",
    );
  });
});
