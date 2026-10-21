"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTenant } from "@/app/actions/settings/updateTenant";
import { tenantSchema, type Locale, type TenantInput } from "@/lib/schemas/settings";
import { fusosComAtual } from "@/lib/tempo/fusos";

interface Props {
  initial: TenantInput;
}

export function TenantForm({ initial }: Props) {
  const t = useT();
  const [form, setForm] = useState<TenantInput>(initial);
  const [reasonsText, setReasonsText] = useState((initial.lost_reasons_extra ?? []).join(", "));
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof TenantInput>(key: K, value: TenantInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const reasons = reasonsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const candidate = { ...form, lost_reasons_extra: reasons };
    const parsed = tenantSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(t("Données invalides."));
      return;
    }
    startTransition(async () => {
      const r = await updateTenant(parsed.data);
      if (r.ok) toast.success(t("Organisation mise à jour."));
      else toast.error(`${t("Erreur")}: ${r.error}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <Card className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="display_name">{t("Nom d’affichage")}</Label>
            <Input
              id="display_name"
              value={form.display_name}
              onChange={(e) => set("display_name", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="legal_name">{t("Raison sociale")}</Label>
            <Input
              id="legal_name"
              value={form.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnpj">{t("Identifiant fiscal (NIU)")}</Label>
            <Input
              id="cnpj"
              placeholder="Ex. : M012345678901X"
              maxLength={20}
              value={form.cnpj ?? ""}
              onChange={(e) => set("cnpj", e.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dpo_email">{t("E-mail du DPO")}</Label>
            <Input
              id="dpo_email"
              type="email"
              value={form.dpo_email ?? ""}
              onChange={(e) => set("dpo_email", e.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">{t("Fuseau horaire")}</Label>
            <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fusosComAtual(form.timezone).map((f) => (
                  <SelectItem key={f.codigo} value={f.codigo}>
                    {f.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone_country_code">{t("Indicatif téléphonique par défaut")}</Label>
            <Input
              id="phone_country_code"
              inputMode="tel"
              value={form.phone_country_code ? `+${form.phone_country_code.replace(/^\+/, "")}` : ""}
              onChange={(e) => set("phone_country_code", e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              placeholder="+237"
            />
            <p className="text-xs text-muted-foreground">
              {t("Ajouté aux numéros saisis sans indicatif (ex. : 6XX XX XX XX → +237 6XX XX XX XX).")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="locale">{t("Langue")}</Label>
            <Select value={form.locale} onValueChange={(v) => set("locale", v as Locale)}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr-FR">Français</SelectItem>
                <SelectItem value="en-US">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="media_retention_days">{t("Rétention des médias (jours)")}</Label>
            <Input
              id="media_retention_days"
              type="number"
              min={30}
              max={3650}
              value={form.media_retention_days}
              onChange={(e) => set("media_retention_days", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="privacy_policy_url">{t("URL de la politique de confidentialité")}</Label>
            <Input
              id="privacy_policy_url"
              type="url"
              value={form.privacy_policy_url ?? ""}
              onChange={(e) => set("privacy_policy_url", e.target.value || null)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="lost_reasons">
            {t("Motifs de perte supplémentaires (séparés par des virgules)")}
          </Label>
          <Input
            id="lost_reasons"
            value={reasonsText}
            onChange={(e) => setReasonsText(e.target.value)}
            placeholder={t("ex. : Budget insuffisant, Concurrent")}
          />
          <p className="text-xs text-muted-foreground">
            {t("Ajoutés à l’ensemble par défaut. Chaque pipeline peut avoir ses propres motifs.")}
          </p>
        </div>

        <div className="flex sm:justify-end">
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? t("Enregistrement…") : t("Enregistrer")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
