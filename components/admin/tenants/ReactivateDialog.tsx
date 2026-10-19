"use client";
import { useState } from "react";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useReactivateTenant } from "@/hooks/useReactivateTenant";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const reasonSchema = z.string().min(10, "Mínimo 10 caracteres").max(500, "Máximo 500 caracteres");

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReactivateDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReactivateDialog({ open, onClose, organizationId }: ReactivateDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reactivate = useReactivateTenant();
  const validation = reasonSchema.safeParse(reason);
  const isValid = validation.success;

  function handleConfirm() {
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Motif invalide");
      return;
    }
    reactivate.mutate(
      { id: organizationId, reason: parsed.data },
      {
        onSuccess: () => {
          setReason("");
          setError(null);
          onClose();
        },
      },
    );
  }

  function handleClose() {
    setReason("");
    setError(null);
    onClose();
  }

  return (
    <AlertDialog open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Réactiver l’organisation</AlertDialogTitle>
          <AlertDialogDescription>
            La réactivation rétablit l’accès des utilisateurs de cette organisation à la plateforme. Indiquez le motif de la réactivation pour le journal d’audit.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="reactivate-reason">
            Motif de la réactivation{" "}
            <span className="text-muted-foreground text-xs font-normal">
              ({reason.length}/500)
            </span>
          </Label>
          <Textarea
            id="reactivate-reason"
            placeholder="Décrivez le motif de la réactivation (10 caractères minimum)..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={4}
            maxLength={500}
            aria-describedby={error ? "reactivate-reason-error" : undefined}
          />
          {error && (
            <p id="reactivate-reason-error" className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Annuler</AlertDialogCancel>
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={!isValid || reactivate.isPending}
          >
            {reactivate.isPending ? "Reativando..." : "Confirmer la réactivation"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
