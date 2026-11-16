import { z } from "zod";
import { stages, channels } from "../../src/domain";
const text = z.string().max(1000);
const date = z.string().datetime({ offset: true });
export const leadSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative().optional(),
    name: text.trim().min(1),
    owner: text,
    city: text,
    state: text,
    country: text,
    timezone: text.refine((v) => {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Fuso IANA inválido"),
    whatsapp: text,
    email: text.refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "E-mail inválido",
    ),
    instagram: text,
    website: text,
    hasSite: z.boolean(),
    google: text,
    brazilian: z.enum(["Sim", "Não", "A confirmar"]),
    languages: z.array(z.enum(["PT", "EN", "ES"])).max(3),
    source: text,
    product: text,
    value: z.number().finite().nonnegative(),
    tags: text,
    notes: z.string().max(20000),
    stage: z.enum(stages),
    blocked: z.boolean(),
    lostReason: text,
    nextAt: date.nullable(),
    nextAction: text,
    createdAt: date,
    example: z.boolean().optional(),
  })
  .strict();
export const interactionSchema = z
  .object({
    id: z.string().uuid(),
    leadId: z.string().uuid(),
    at: date,
    channel: z.enum(channels as ["whatsapp", "email", "instagram"]),
    direction: z.enum(["enviado", "recebido"]),
    text: z.string().max(20000),
    result: text,
    variant: z.enum(["A", "B"]).optional(),
    attempt: z.number().int().min(1).max(4).optional(),
    example: z.boolean().optional(),
  })
  .strict();
export const settingsSchema = z
  .object({
    revision: z.number().int().nonnegative().optional(),
    goal: z.number().int().min(1).max(10000),
    link: z
      .string()
      .url()
      .refine((v) => ["http:", "https:"].includes(new URL(v).protocol)),
    cadence: z.array(z.number().int().min(1).max(365)).length(3),
    weights: z
      .object({
        brazilian: z.number().min(0).max(100),
        channels: z.number().min(0).max(100),
        noSite: z.number().min(0).max(100),
        portuguese: z.number().min(0).max(100),
      })
      .strict(),
    signature: z.object({ name: text, company: text, address: text }).strict(),
    products: z
      .array(
        z
          .object({
            name: text.trim().min(1),
            price: z.number().nonnegative(),
            recurring: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    templates: z
      .array(
        z
          .object({
            channel: z.enum(["whatsapp", "email", "instagram"]),
            attempt: z.number().int().min(1).max(4),
            variant: z.enum(["A", "B"]),
            subject: text,
            text: z.string().min(1).max(20000),
          })
          .strict(),
      )
      .length(24)
      .refine(
        (ts) =>
          new Set(ts.map((t) => t.channel + t.attempt + t.variant)).size === 24,
        "Informe os 24 modelos únicos",
      ),
    lastBackup: z.string().max(50),
  })
  .strict();
export const customerSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative().optional(),
    name: text.trim().min(1),
    email: text,
    phone: text,
    leadId: z.string().uuid().nullable(),
    product: text,
    value: z.number().nonnegative(),
    status: z.enum(["Ativo", "Pausado", "Cancelado"]),
    notes: z.string().max(20000),
    createdAt: date,
  })
  .strict();
export type Customer = z.infer<typeof customerSchema>;
export class CRMError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
