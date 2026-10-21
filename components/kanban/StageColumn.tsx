"use client";
import { Droppable } from "@hello-pangea/dnd";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { formatMontant } from "@/lib/money";
import type { Lead } from "@/lib/types/leads";
import type { Stage } from "@/lib/kanban/types";
import { buildCardInput } from "@/lib/kanban/card-state";
import { KanbanCard } from "./KanbanCard";

interface StageColumnProps {
  stage: Stage;
  leads: Lead[];
  pipelineId: string;
  /** owner_user_id → nome, resolvido no board. O dono agente vem no lead. */
  ownerNames?: Map<string, string | null>;
  /** ids que o radar classificou como esfriando (fonte única, não recalculada). */
  coolingIds?: Set<string>;
  /** Propostas de retomada vivas, por lead. */
  reactivations?: Map<string, { proposalId: string; expiresAt: string }>;
  /** `settings.canonical_tags` do pipeline — a única tag que fica no card. */
  canonicalTags?: string[];
  selectedLeadIds?: Set<string>;
  /** leadId → quantos eventos remotos já chegaram (muda = pulsa de novo). */
  pulses?: Map<string, number>;
  onSelect?: (leadId: string, additive: boolean) => void;
  /** Abrir o dossiê — atravessa o board até o card, como `pulses`. */
  onOpen?: (leadId: string) => void;
}

/**
 * Le total de la colonne, dans la devise de ses leads. Une seule devise ⇒ elle ;
 * aucune ou un mélange ⇒ la devise par défaut (XAF) — additionner des FCFA et
 * des euros n'a pas de sens, mais le cas est marginal et le total reste lisible.
 */
function deviseDaColuna(leads: Lead[]): string | null {
  const devises = new Set(leads.filter((l) => l.value_cents != null).map((l) => l.currency ?? null));
  return devises.size === 1 ? [...devises][0]! : null;
}

export function StageColumn({
  stage,
  leads,
  pipelineId,
  ownerNames,
  coolingIds,
  reactivations,
  canonicalTags,
  selectedLeadIds,
  pulses,
  onSelect,
  onOpen,
}: StageColumnProps) {
  const totalCents = leads.reduce((sum, l) => sum + (l.value_cents ?? 0), 0);
  const accentStyle: CSSProperties | undefined = stage.color
    ? { backgroundColor: stage.color }
    : undefined;

  return (
    <div className="flex w-80 shrink-0 flex-col rounded-lg border border-border bg-surface-muted/40">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            !stage.color && "bg-text-muted/40",
          )}
          style={accentStyle}
          aria-hidden
        />
        <h2 className="flex-1 truncate text-sm font-semibold text-text">
          {stage.name}
        </h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium tabular-nums text-text-muted">
          {leads.length}
        </span>
      </div>

      {totalCents > 0 && (
        <div className="border-b border-border px-3 py-1.5 text-[11px] tabular-nums text-text-muted">
          {formatMontant(totalCents, deviseDaColuna(leads))}
        </div>
      )}

      <Droppable droppableId={stage.id} type="LEAD">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex flex-1 flex-col gap-2 p-2 transition-colors",
              snapshot.isDraggingOver && "bg-accent/5",
            )}
          >
            {leads.map((lead, idx) => (
              <KanbanCard
                key={lead.id}
                card={buildCardInput(lead, {
                  stageName: stage.name,
                  ownerNames,
                  coolingIds,
                  reactivations,
                  canonicalTags,
                })}
                lead={lead}
                index={idx}
                pipelineId={pipelineId}
                isSelected={selectedLeadIds?.has(lead.id)}
                pulseCount={pulses?.get(lead.id) ?? 0}
                onSelect={onSelect}
                onOpen={onOpen}
              />
            ))}
            {provided.placeholder}
            {leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex h-20 items-center justify-center text-[11px] text-text-muted/70">
                vide
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
