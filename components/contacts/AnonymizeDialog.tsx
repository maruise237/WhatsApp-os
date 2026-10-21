"use client";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAnonymizeContact } from "@/hooks/contacts/useAnonymizeContact";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  contactId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const CONFIRM_TEXT = "ANONIMIZAR";

export function AnonymizeDialog({ contactId, open, onOpenChange }: Props) {
  const t = useT();
  const anon = useAnonymizeContact();
  const [step, setStep] = useState<1 | 2>(1);
  const [justification, setJustification] = useState("");
  const [confirm, setConfirm] = useState("");

  function reset() {
    setStep(1);
    setJustification("");
    setConfirm("");
  }

  async function handleSubmit() {
    try {
      const res = await anon.mutateAsync({
        contact_id: contactId,
        justification: justification.trim(),
      });
      if (res.data.action === "already_anonymized") {
        toast.info(t("Le contact était déjà anonymisé."));
      } else {
        toast.success(t("Contact anonymisé."));
      }
      reset();
      onOpenChange(false);
    } catch {
      // hook handles toast
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-error-fg">{t("Anonymiser le contact (données personnelles)")}</DialogTitle>
          <DialogDescription>
            {t(
              "Cette action est irréversible. Le nom sera remplacé par « Client Anonymisé #N », l’e-mail, le téléphone et le numéro d’identité seront effacés, et le contenu des activités sera masqué.",
            )}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="anon-justif">{t("Justification (10 caractères minimum)")}</Label>
              <Textarea
                id="anon-justif"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder={t("Ex. : Demande formelle de la personne concernée par e-mail le JJ/MM/AAAA")}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                {justification.trim().length}/10 {t("caractères minimum")}
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                {t("Annuler")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setStep(2)}
                disabled={justification.trim().length < 10}
              >
                {t("Continuer")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-error-fg/30 rounded-md border bg-error-bg p-3 text-sm text-error-fg">
              {t("Pour confirmer, saisissez")} <strong>{CONFIRM_TEXT}</strong> ci-dessous.
            </div>
            <div className="space-y-2">
              <Label htmlFor="anon-confirm">{t("Confirmation")}</Label>
              <Input
                id="anon-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM_TEXT}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(1)} disabled={anon.isPending}>
                {t("Retour")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={confirm !== CONFIRM_TEXT || anon.isPending}
              >
                {anon.isPending ? t("Anonymisation…") : t("Anonymiser définitivement")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
