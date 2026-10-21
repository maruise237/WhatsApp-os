"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLoseLead } from "@/hooks/kanban/useUpdateLead";
import { CANONICAL_LOST_REASONS } from "@/lib/schemas/leads";
import { useT } from "@/hooks/i18n/useT";

const REASON_LABELS: Record<(typeof CANONICAL_LOST_REASONS)[number], string> = {
  requested_by_customer: "Le client a demandé l’annulation",
  price: "Prix",
  no_response: "Aucune réponse du client",
  product_unavailable: "Produit indisponible",
  cancelled_by_store: "Annulé par le magasin",
  cancelled_by_customer: "Annulé par le client",
  payment_failed: "Échec du paiement",
  other: "Autre motif",
};

interface LoseLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  pipelineId: string;
}

const MAX_LEN = 500;

export function LoseLeadDialog({ open, onOpenChange, leadId, pipelineId }: LoseLeadDialogProps) {
  const t = useT();
  const [reasonCode, setReasonCode] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const mutation = useLoseLead(pipelineId);

  const finalReason = reasonCode === "other" ? otherText.trim() || "other" : reasonCode;
  const disabled =
    !reasonCode || finalReason.length === 0 || finalReason.length > MAX_LEN || mutation.isPending;

  const handleSubmit = async () => {
    if (disabled) return;
    try {
      await mutation.mutateAsync({ leadId, lostReason: finalReason });
      setReasonCode("");
      setOtherText("");
      onOpenChange(false);
    } catch {
      // error already toasted
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Marquer comme perdu")}</DialogTitle>
          <DialogDescription>
            {t("Indiquez le motif. Cette information aide à améliorer le pipeline.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Label>{t("Motif")}</Label>
          <div className="grid grid-cols-1 gap-1.5">
            {CANONICAL_LOST_REASONS.map((code) => (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                <input
                  type="radio"
                  name="lost-reason"
                  value={code}
                  checked={reasonCode === code}
                  onChange={(e) => setReasonCode(e.target.value)}
                />
                <span>{t(REASON_LABELS[code])}</span>
              </label>
            ))}
          </div>
          {reasonCode === "other" && (
            <div className="grid gap-1.5">
              <Label htmlFor="lost-reason-other">{t("Détail (facultatif)")}</Label>
              <Textarea
                id="lost-reason-other"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder={t("Ex. : Le client s’est désisté pour telle raison")}
                maxLength={MAX_LEN}
                rows={3}
              />
              <div className="text-right text-[11px] tabular-nums text-muted-foreground">
                {otherText.length}/{MAX_LEN}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t("Annuler")}
          </Button>
          <Button onClick={handleSubmit} disabled={disabled}>
            {mutation.isPending ? t("Enregistrement…") : t("Confirmer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
