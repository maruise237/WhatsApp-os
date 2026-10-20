/**
 * Zod schemas for `/api/v1/contacts/*` endpoints (EPIC-05 waves 1, 2, 8).
 *
 * Contracts:
 *  - contactCreateSchema    → POST /api/v1/contacts
 *  - contactPatchSchema     → PATCH /api/v1/contacts/[id]
 *  - contactListQuerySchema → GET /api/v1/contacts (search/tag/source/cursor)
 *  - lgpdAnonymizeSchema    → POST /api/v1/lgpd/anonymize (irreversible)
 */
import { z } from "zod";

const PHONE_REGEX = /^\+\d{8,15}$/;
/**
 * Numéro d'identification (CNI, NIU, passeport…) — texte libre, facultatif.
 *
 * La colonne s'appelle encore `cpf` (contrat d'API et de schéma), mais aucune
 * validation de format nationale n'est appliquée : les pièces d'identité des
 * pays d'Afrique francophone n'ont ni longueur ni chiffre de contrôle communs.
 * On borne seulement la taille et on refuse le vide.
 */
export const NUMERO_IDENTIFICATION_MAX = 64;

export const contactCreateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  display_name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone_number: z
    .string()
    .regex(PHONE_REGEX, "Le téléphone doit être au format E.164 (+237699998888)")
    .optional(),
  cpf: z.string().trim().min(1).max(NUMERO_IDENTIFICATION_MAX).optional(),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().min(1).default("manual"),
  source_metadata: z.record(z.string(), z.unknown()).optional(),
  consent: z.record(z.string(), z.unknown()).optional(),
});
export type ContactCreate = z.infer<typeof contactCreateSchema>;

export const contactPatchSchema = contactCreateSchema.partial().extend({
  source: z.string().min(1).optional(),
});
export type ContactPatch = z.infer<typeof contactPatchSchema>;

export const CONTACT_ORDER_BY = [
  "last_activity_at",
  "created_at",
  "display_name",
  "email",
  "phone_number",
] as const;

export const contactListQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  source: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  order_by: z.enum(CONTACT_ORDER_BY).default("last_activity_at"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ContactListQuery = z.output<typeof contactListQuerySchema>;
export type ContactListQueryParams = z.input<typeof contactListQuerySchema>;
export type ContactOrderBy = (typeof CONTACT_ORDER_BY)[number];

export const lgpdAnonymizeSchema = z.object({
  contact_id: z.string().uuid(),
  justification: z.string().min(10).max(1000),
});
export type LgpdAnonymizeInput = z.infer<typeof lgpdAnonymizeSchema>;
