"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useApproveLgpdRequest } from "@/hooks/useApproveLgpdRequest";
import type { LgpdRequestType } from "@/hooks/useLgpdRequests";

interface ApproveButtonProps {
  requestId: string;
  requestType: LgpdRequestType;
  status: string;
}

const VARIANT_LABELS: Record<LgpdRequestType, { button: string; title: string; description: string }> = {
  data_request: {
    button: "Aprovar export",
    title: "Approuver l’export des données",
    description:
      "En confirmant, cette demande sera mise en file pour l’export des données de la personne concernée. Cette action est irréversible.",
  },
  redact: {
    button: "Aprovar anonimização",
    title: "Approuver l’anonymisation du contact",
    description:
      "En confirmant, toutes les données personnelles de la personne concernée seront anonymisées (irréversible). L’historique des horodatages est conservé.",
  },
  store_redact: {
    button: "Aprovar anonimização (tenant)",
    title: "Approuver l’anonymisation de l’organisation",
    description:
      "En confirmant, toutes les données personnelles de l’organisation seront anonymisées (irréversible). Cette action concerne tous les contacts de l’organisation.",
  },
};

export function ApproveButton({ requestId, requestType, status }: ApproveButtonProps) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useApproveLgpdRequest();

  // Only show if status is 'received'
  if (status !== "received") return null;

  const labels = VARIANT_LABELS[requestType];
  const isValid = reason.trim().length >= 10;

  function handleConfirm() {
    if (!isValid) return;
    mutate(
      { id: requestId, approved_reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success("Approbation enregistrée — la demande est passée en traitement");
          setOpen(false);
          setReason("");
        },
        onError: () => {
          toast.error("Échec de l’approbation de la demande. Réessayez.");
        },
      },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <CheckCircle size={16} aria-hidden />
          {labels.button}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.title}</AlertDialogTitle>
          <AlertDialogDescription>{labels.description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="approved_reason">
            Justificativa{" "}
            <span className="text-muted-foreground text-xs">(10 caractères minimum)</span>
          </Label>
          <Textarea
            id="approved_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Décrivez le motif de l’approbation manuelle de cette demande…"
            rows={3}
            maxLength={500}
            className="resize-none"
            aria-describedby="approved_reason_hint"
          />
          <p id="approved_reason_hint" className="text-xs text-muted-foreground">
            {reason.trim().length}/500 caracteres
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={!isValid || isPending}
          >
            {isPending ? "Aprovando…" : "Confirmer l’approbation"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
