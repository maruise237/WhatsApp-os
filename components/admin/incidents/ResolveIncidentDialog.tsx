"use client";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useResolveIncident } from "@/hooks/useResolveIncident";

interface ResolveIncidentDialogProps {
  incidentId: string;
}

export function ResolveIncidentDialog({ incidentId }: ResolveIncidentDialogProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { mutate, isPending } = useResolveIncident();

  const isValid = note.trim().length >= 10;

  function handleResolve() {
    if (!isValid) return;
    mutate(
      { id: incidentId, resolution_note: note.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          setNote("");
        },
      },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="default" size="sm">
          Résoudre l’incident
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Résoudre l’incident</AlertDialogTitle>
          <AlertDialogDescription>
            Décrivez comment l’incident a été résolu. Cette action est enregistrée dans le journal d’audit et est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="resolution-note">
            Note de résolution{" "}
            <span className="text-muted-foreground font-normal">(10 caractères min.)</span>
          </Label>
          <Textarea
            id="resolution-note"
            placeholder="Décrivez la cause racine et les actions menées pour résoudre l’incident..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="resize-none"
            disabled={isPending}
          />
          {note.trim().length > 0 && note.trim().length < 10 && (
            <p className="text-xs text-destructive">
              10 caractères minimum ({note.trim().length}/10)
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleResolve}
            disabled={!isValid || isPending}
          >
            {isPending ? "Résolution…" : "Confirmer la résolution"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
