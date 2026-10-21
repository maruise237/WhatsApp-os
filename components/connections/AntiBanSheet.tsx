"use client";
/**
 * Proteção de envio (anti-ban) por conexão — Operação Visível F2ii. Edita os
 * knobs que o engine JÁ respeita (channel_knobs + teto diário). Modelo mental
 * honesto com o motor: campo vazio = padrão conservador do engine (placeholder
 * mostra o valor); preenchido = override desta conexão.
 */
import { useEffect, useMemo, useState } from "react";
import { fusosComAtual } from "@/lib/tempo/fusos";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useUpdatePacingKnobs, type PacingKnobsItem } from "@/hooks/channels/usePacingKnobs";
import { ApiError } from "@/lib/api/types";
import { nomeDoCanal } from "@/lib/channels/estado";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  item: PacingKnobsItem | null;
  canWrite: boolean;
  onClose: () => void;
}

/** estado do form: strings cruas dos inputs ('' = usar padrão do motor). */
interface FormState {
  window_start_hour: string;
  window_end_hour: string;
  throttle_s: string;
  jitter_s: string;
  daily_message_limit: string;
  allow_sunday: boolean;
  timezone: string;
  /** `yyyy-mm-dd` do input date; '' = não declarado (o motor trata como idade 0). */
  numero_em_uso_desde: string;
  pular_aquecimento: boolean;
}

function fromItem(item: PacingKnobsItem): FormState {
  const o = item.overrides;
  return {
    window_start_hour: o?.window_start_hour != null ? String(o.window_start_hour) : "",
    window_end_hour: o?.window_end_hour != null ? String(o.window_end_hour) : "",
    throttle_s: o?.throttle_ms != null ? String(o.throttle_ms / 1000) : "",
    jitter_s: o?.jitter_max_ms != null ? String(o.jitter_max_ms / 1000) : "",
    daily_message_limit:
      item.channel_session.daily_message_limit != null
        ? String(item.channel_session.daily_message_limit)
        : "",
    allow_sunday: o?.allow_sunday ?? item.defaults.allowSunday,
    timezone: o?.timezone ?? "",
    numero_em_uso_desde: item.warmup.number_activated_at
      ? item.warmup.number_activated_at.slice(0, 10)
      : "",
    pular_aquecimento: item.warmup.skipped,
  };
}

const intOrNull = (s: string): number | null => (s.trim() === "" ? null : Math.round(Number(s)));
const msOrNull = (s: string): number | null =>
  s.trim() === "" ? null : Math.round(Number(s) * 1000);

export function AntiBanSheet({ item, canWrite, onClose }: Props) {
  const t = useT();
  const update = useUpdatePacingKnobs();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    setForm(item ? fromItem(item) : null);
  }, [item]);

  const label = useMemo(() => {
    if (!item) return "";
    // Mesma cadeia que vazava `org_xxxx` no seletor do editor de agente: o
    // identificador do transporte era o penúltimo degrau, então uma conexão sem
    // apelido e sem número aparecia com ele no título do painel.
    return nomeDoCanal(item.channel_session);
  }, [item]);

  if (!item || !form) return null;
  const eff = item.effective;
  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        channel_session_id: item.channel_session.id,
        window_start_hour: intOrNull(form.window_start_hour),
        window_end_hour: intOrNull(form.window_end_hour),
        throttle_ms: msOrNull(form.throttle_s),
        jitter_max_ms: msOrNull(form.jitter_s),
        allow_sunday: form.allow_sunday,
        timezone: form.timezone.trim() === "" ? null : form.timezone.trim(),
        ...(form.daily_message_limit.trim() !== ""
          ? { daily_message_limit: Math.round(Number(form.daily_message_limit)) }
          : {}),
        // Meio-dia UTC, não meia-noite: a data é um DIA declarado pelo operador, e
        // meia-noite vira o dia anterior em qualquer fuso a oeste — o número
        // envelheceria um dia a menos do que ele informou.
        number_activated_at:
          form.numero_em_uso_desde.trim() === ""
            ? null
            : new Date(`${form.numero_em_uso_desde}T12:00:00.000Z`).toISOString(),
        skip_warmup: form.pular_aquecimento,
      });
      toast.success(t("Protection des envois mise à jour."));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Impossible d’enregistrer."));
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {t("Protection des envois")} — {label}
          </SheetTitle>
          <SheetDescription>
            {t(
              "Ces limites protègent le numéro contre le blocage de WhatsApp. Un champ vide utilise la valeur sûre par défaut du système (affichée dans le champ).",
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 py-2" data-testid="anti-ban-form">
          <fieldset className="flex flex-col gap-2" data-testid="aquecimento">
            <Label htmlFor="numero-em-uso-desde">{t("Ce numéro est utilisé depuis")}</Label>
            <Input
              id="numero-em-uso-desde"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={form.numero_em_uso_desde}
              onChange={(e) => set({ numero_em_uso_desde: e.target.value })}
              disabled={!canWrite || form.pular_aquecimento}
              className="w-48"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "La connexion peut être nouvelle sans que le numéro le soit. Le réchauffement tient compte de l’âge du NUMÉRO : si vous laissez ce champ vide, il est considéré comme nouveau et commence avec un faible plafond quotidien.",
              )}
            </p>

            <div className="mt-1 flex items-center gap-2">
              <Switch
                id="pular-aquecimento"
                checked={form.pular_aquecimento}
                onCheckedChange={(v) => set({ pular_aquecimento: v })}
                disabled={!canWrite}
              />
              <Label htmlFor="pular-aquecimento" className="font-normal">
                {t("Ce numéro est déjà réchauffé — ignorer le réchauffement")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {form.pular_aquecimento
                ? t(
                    "Seul le plafond quotidien ci-dessous s’applique. Utilisez cette option uniquement si le numéro envoie depuis plusieurs semaines : ignorer le réchauffement d’un nouveau numéro est le chemin le plus rapide vers le blocage.",
                  )
                : item.warmup.cap_today === null
                  ? `${t("Numéro utilisé depuis")} ${item.warmup.age_days} ${t("jour(s) — déjà établi. Seul le plafond quotidien ci-dessous s’applique.")}`
                  : `${t("Aujourd’hui, le réchauffement autorise")} ${item.warmup.cap_today} ${t("envoi(s) — le numéro est utilisé depuis")} ${item.warmup.age_days} ${t("jour(s).")} ${t("Tant que ce nombre est inférieur au plafond quotidien, c’est lui qui limite l’envoi ; modifier le plafond quotidien ne change rien.")}`}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <Label>{t("Fenêtre d’envoi (heure locale)")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={23}
                inputMode="numeric"
                placeholder={String(eff.windowStartHour)}
                value={form.window_start_hour}
                onChange={(e) => set({ window_start_hour: e.target.value })}
                disabled={!canWrite}
                aria-label={t("Heure de début de la fenêtre")}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">{t("h à")}</span>
              <Input
                type="number"
                min={1}
                max={24}
                inputMode="numeric"
                placeholder={String(eff.windowEndHour)}
                value={form.window_end_hour}
                onChange={(e) => set({ window_end_hour: e.target.value })}
                disabled={!canWrite}
                aria-label={t("Heure de fin de la fenêtre")}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">h</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "L’assistant n’envoie des messages que pendant cette fenêtre. En dehors, la réponse est planifiée pour la prochaine ouverture ; la raison apparaît dans la conversation.",
              )}
            </p>
          </fieldset>

          <fieldset className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="allow-sunday">{t("Envoyer le dimanche")}</Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Activé par défaut : une personne qui écrit le dimanche attend une réponse le dimanche. Désactivez cette option si vous prospectez activement et préférez ne pas déranger le week-end.",
                )}
              </p>
            </div>
            <Switch
              id="allow-sunday"
              checked={form.allow_sunday}
              onCheckedChange={(v) => set({ allow_sunday: v })}
              disabled={!canWrite}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <Label>{t("Intervalle entre les envois (secondes)")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                placeholder={String(eff.throttleMs / 1000)}
                value={form.throttle_s}
                onChange={(e) => set({ throttle_s: e.target.value })}
                disabled={!canWrite}
                aria-label={t("Intervalle minimal entre les envois, en secondes")}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{t("+ variation maximale de")}</span>
              <Input
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                placeholder={String(eff.jitterMaxMs / 1000)}
                value={form.jitter_s}
                onChange={(e) => set({ jitter_s: e.target.value })}
                disabled={!canWrite}
                aria-label={t("Variation aléatoire maximale, en secondes")}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">s</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Intervalle minimal entre les messages du même numéro, avec une variation aléatoire : un rythme parfaitement régulier ressemble à un robot pour WhatsApp.",
              )}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <Label>{t("Plafond quotidien d’envois")}</Label>
            <Input
              type="number"
              min={item.bounds.daily_limit.min}
              max={item.bounds.daily_limit.max}
              inputMode="numeric"
              placeholder={t("aucun plafond défini")}
              value={form.daily_message_limit}
              onChange={(e) => set({ daily_message_limit: e.target.value })}
              disabled={!canWrite}
              aria-label={t("Plafond quotidien de messages")}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Nombre maximal de messages envoyés par ce numéro chaque jour. Les nouveaux numéros respectent également le réchauffement automatique ci-dessous ; la limite la plus basse s’applique.",
              )}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <Label>{t("Fuseau horaire de la fenêtre")}</Label>
            {/* LISTA, e não texto livre. A API já REJEITA fuso inválido — mas
                rejeitar é devolver um erro a quem digitou certo na cabeça e
                errado no teclado (`America/Asunción`, com o acento que um
                hispanofalante escreve natural). Escolher não erra. */}
            <select
              value={form.timezone}
              onChange={(e) => set({ timezone: e.target.value })}
              disabled={!canWrite}
              aria-label={t("Fuseau horaire IANA")}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            >
              <option value="">
                {t("Utiliser la valeur par défaut")} ({eff.timezone})
              </option>
              {fusosComAtual(form.timezone).map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.rotulo} — {f.codigo}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("La fenêtre d’envoi est évaluée dans ce fuseau (ex. : Africa/Douala).")}
            </p>
          </fieldset>

          <div className="bg-muted/30 rounded-md border border-border p-3">
            <p className="text-xs font-medium">{t("Réchauffement automatique d’un nouveau numéro")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {eff.warmupDailyCaps
                .map((s) =>
                  s.cap === null
                    ? `${t("à partir de")} ${s.minAgeDays} ${t("jours : aucun plafond de réchauffement")}`
                    : `${s.minAgeDays} ${t("+ jours : jusqu’à")} ${s.cap}${t("/jour")}`,
                )
                .join(" · ")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Un numéro nouvellement connecté envoie peu de messages et augmente progressivement ; envoyer trop au début est la première cause de blocage.",
              )}
            </p>
          </div>
        </div>

        <div className="mt-auto flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            {canWrite ? t("Annuler") : t("Fermer")}
          </Button>
          {canWrite ? (
            <Button onClick={handleSave} disabled={update.isPending} data-testid="anti-ban-save">
              {update.isPending ? t("Enregistrement…") : t("Enregistrer la protection")}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
