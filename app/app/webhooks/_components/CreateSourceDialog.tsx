"use client";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateWebhookSource,
  usePipelines,
  usePipelineStages,
  type WebhookSourceRow,
} from "@/hooks/webhooks/useWebhookSources";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (source: WebhookSourceRow) => void;
}

export function CreateSourceDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useT();
  const [name, setName] = React.useState("");
  const [pipelineId, setPipelineId] = React.useState<string>("");
  const [stageId, setStageId] = React.useState<string>("");
  const [redirectTo, setRedirectTo] = React.useState("");

  const { data: pipelinesRes, isLoading: pipelinesLoading } = usePipelines();
  const { data: boardRes, isLoading: stagesLoading } = usePipelineStages(pipelineId || null);
  const create = useCreateWebhookSource();

  const pipelines = pipelinesRes?.data ?? [];
  const stages = boardRes?.data?.stages ?? [];

  React.useEffect(() => {
    if (!open) {
      setName("");
      setPipelineId("");
      setStageId("");
      setRedirectTo("");
    }
  }, [open]);

  React.useEffect(() => {
    setStageId("");
  }, [pipelineId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineId || !stageId) {
      toast.error(t("Choisissez le tableau et l’étape d’entrée."));
      return;
    }
    try {
      const res = await create.mutateAsync({
        name,
        default_pipeline_id: pipelineId,
        default_stage_id: stageId,
        redirect_to: redirectTo.trim() || undefined,
      });
      toast.success(t("Source créée. Il ne reste plus qu’à connecter votre site."));
      onOpenChange(false);
      onCreated(res.data);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Nouvelle source d’acquisition")}</DialogTitle>
          <DialogDescription>
            {t(
              "Dê um nome e diga em qual funil o contato deve entrar quando alguém preencher seu formulário.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="src-name">{t("Nom")}</Label>
            <Input
              id="src-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Page d’atterrissage Black Friday")}
              minLength={1}
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("Tableau d’entrée")}</Label>
            <Select value={pipelineId} onValueChange={setPipelineId} disabled={pipelinesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={t("Choisissez le tableau")} />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("Étape d’entrée")}</Label>
            <Select
              value={stageId}
              onValueChange={setStageId}
              disabled={!pipelineId || stagesLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={pipelineId ? t("Choisissez l’étape") : t("Choisissez d’abord le tableau")}
                />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="src-redirect">{t("URL de remerciement (facultative)")}</Label>
            <Input
              id="src-redirect"
              type="url"
              value={redirectTo}
              onChange={(e) => setRedirectTo(e.target.value)}
              placeholder="https://votresite.com/merci"
            />
            <p className="text-xs text-muted-foreground">
              {t("URL vers laquelle rediriger la personne après le remplissage du formulaire.")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Annuler")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t("Créer la source")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
