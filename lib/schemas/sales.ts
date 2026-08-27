import { z } from "zod";

const currencySchema = z.string().regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code");
const uuidSchema = z.string().uuid();

export const createProductSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).nullable().optional(),
  price_cents: z.number().int().nonnegative(),
  currency: currencySchema.default("BRL"),
  stock: z.number().int().nonnegative().default(0),
  is_active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const updateProductSchema = createProductSchema.partial();

export const createSalesOrderSchema = z.object({
  conversation_id: uuidSchema,
  contact_id: uuidSchema,
  items: z
    .array(
      z.object({
        product_id: uuidSchema,
        quantity: z.number().int().positive().max(999),
      }),
    )
    .min(1)
    .max(100),
  currency: currencySchema.default("BRL"),
});

export const createPaymentProofSchema = z.object({
  order_id: uuidSchema,
  message_id: uuidSchema.nullable().optional(),
  storage_key: z.string().trim().min(1).max(1024),
  mime_type: z.string().trim().min(1).max(160),
  amount_cents: z.number().int().nonnegative().nullable().optional(),
  reference: z.string().trim().max(240).nullable().optional(),
  operator: z.string().trim().max(240).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  extraction: z.record(z.string(), z.unknown()).default({}),
});

export const reviewPaymentSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const transitionSalesOrderSchema = z.object({
  status: z.enum(["en_attente_paiement", "a_livrer", "livree", "refusee", "annulee"]),
  fulfillment_note: z.string().trim().max(1000).nullable().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;
export type CreatePaymentProofInput = z.infer<typeof createPaymentProofSchema>;
