/**
 * Labels pt-br congelados da aba Automações (UI-T3). Fonte única — a timeline
 * de atividade (UI-T4) importa os mesmos mapas, nunca redeclara os textos.
 */
import type { TRIGGER_EVENTS } from "@/lib/schemas/webhooks";

export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];
export type ActionType =
  | "create_or_move_lead"
  | "send_whatsapp_message"
  | "send_ai_message"
  | "add_tag"
  | "assign_owner"
  | "call_webhook";

export const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  "lead.created": "Lorsqu’un nouveau contact arrive (webhook)",
  "lead.stage_changed": "Lorsqu’un lead change d’étape",
  "message.received": "Lorsqu’un message arrive sur WhatsApp",
  "lead.tag_added": "Lorsqu’un lead reçoit une étiquette",
  "contact.tag_added": "Lorsqu’un contact reçoit une étiquette",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  create_or_move_lead: "Créer/déplacer un lead dans le tableau",
  send_whatsapp_message: "Envoyer un message sur WhatsApp",
  send_ai_message: "Message rédigé par l’IA",
  add_tag: "Ajouter une étiquette",
  assign_owner: "Attribuer à un agent",
  call_webhook: "Prévenir un autre système (webhook)",
};
