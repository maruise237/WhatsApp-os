"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import type { Lead } from "@/lib/types/leads";
import { updateLeadSchema, type UpdateLeadInput } from "@/lib/schemas/leads";
import { centsVersSaisie, parseMontantEnCents } from "@/lib/money";
import { EcoDoValor } from "./EcoDoValor";
import { useT } from "@/hooks/i18n/useT";

interface FormShape {
  title: string;
  description: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
}

interface Props {
  lead: Lead;
  pipelineId: string;
  /** Quando o salvamento dá certo. O dossiê NÃO fecha aqui — ver abaixo. */
  onSaved?: () => void;
  /** O dossiê não tem "cancelar"; o diálogo tem. */
  onCancel?: () => void;
}


/**
 * Os campos do lead — extraídos do `EditLeadDialog` para o dossiê usar os
 * MESMOS, em vez de uma cópia que diverge no mês.
 *
 * `onSaved` existe para o dossiê NÃO FECHAR ao salvar: quem edita precisa ver a
 * atividade que acabou de gerar entrar na timeline. Fechar esconderia o
 * registro justamente de quem o produziu — a funcionalidade que prova "sua ação
 * fica registrada" provaria isso para todo mundo menos para o autor.
 */
export function LeadFieldsForm({ lead, pipelineId, onSaved, onCancel }: Props) {
  const t = useT();
  const edit = useEditLead(pipelineId);

  const form = useForm<FormShape>({
    defaultValues: {
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centsVersSaisie(lead.value_cents, lead.currency),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centsVersSaisie(lead.value_cents, lead.currency),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function onSubmit(values: FormShape) {
    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const reais = values.valueReais.trim();
    let valueCents: number | null = null;
    if (reais.length > 0) {
      valueCents = parseMontantEnCents(reais, lead.currency);
      if (valueCents === null) {
        form.setError("valueReais", { message: t("Valeur invalide") });
        return;
      }
    }

    const patch: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim() ? values.description.trim() : null,
      value_cents: valueCents,
      tags,
      expected_close_date: values.expected_close_date || null,
    };

    const parsed = updateLeadSchema.safeParse(patch);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(t(first?.message ?? "Données invalides"));
      return;
    }

    try {
      await edit.mutateAsync({
        leadId: lead.id,
        patch: parsed.data as UpdateLeadInput,
      });
      toast.success(t("Lead mis à jour"));
      onSaved?.();
    } catch {
      // toast already shown
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">{t("Titre")}</Label>
        <Input id="title" {...form.register("title", { required: true, minLength: 2 })} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t("Description")}</Label>
        <Textarea id="description" rows={3} {...form.register("description")} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="valueReais">{t("Montant")}</Label>
          <Input
            id="valueReais"
            inputMode="decimal"
            placeholder="15 000"
            {...form.register("valueReais")}
          />
          <EcoDoValor control={form.control} devise={lead.currency} />
          {form.formState.errors.valueReais && (
            <p className="text-xs text-error-fg">{form.formState.errors.valueReais.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="expected_close_date">{t("Clôture prévue")}</Label>
          <Input id="expected_close_date" type="date" {...form.register("expected_close_date")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tagsRaw">{t("Étiquettes (séparées par des virgules)")}</Label>
        <Input id="tagsRaw" placeholder="vip, réachat" {...form.register("tagsRaw")} />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={edit.isPending}>
            {t("Annuler")}
          </Button>
        )}
        <Button type="submit" disabled={edit.isPending}>
          {edit.isPending ? t("Enregistrement…") : t("Enregistrer")}
        </Button>
      </div>
    </form>
  );
}
