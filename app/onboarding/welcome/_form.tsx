"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { FUSEAU_PAR_DEFAUT } from "@/lib/marche/defauts";
import { FUSOS_OFERECIDOS } from "@/lib/tempo/fusos";

/**
 * Cidade, não identificador de fuso. A lista mostrava "America/Bahia" e
 * "America/Fortaleza" e esperava que a pessoa soubesse em qual delas mora — o
 * identificador é do sistema, o que ela reconhece é a cidade.
 *
 * A lista é a MESMA das configurações (`FUSOS_OFERECIDOS`), África francófona
 * em primeiro: duas listas divergiam (esta chegou a rotular `America/Sao_Paulo`
 * como « Douala, Yaoundé, Abidjan » — quem escolhia isso ficava 4h atrasado).
 */
const FUSOS = FUSOS_OFERECIDOS.map((f) => ({ id: f.codigo, cidade: f.rotulo }));

export function WelcomeForm({ defaultOrgName }: { defaultOrgName: string }) {
  const t = useT();
  const [displayName, setDisplayName] = useState(defaultOrgName);
  const [oQueFaz, setOQueFaz] = useState("");
  const [timezone, setTimezone] = useState(FUSEAU_PAR_DEFAUT);
  const [accepted, setAccepted] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5 rounded-lg border bg-background p-6"
      action={(formData) => {
        if (!accepted) {
          toast.error(t("Acceptez les conditions pour continuer."));
          return;
        }
        startTransition(async () => {
          const res = await acceptWelcome(formData);
          if (res && !res.ok) {
            toast.error(`${t("Échec")}: ${res.error}`);
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="display_name">{t("Comment s’appelle votre entreprise ?")}</Label>
        <Input
          id="display_name"
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          maxLength={120}
          required
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "É o nome que aparece para o seu time e nos relatórios. Pode ser clínica, loja, escritório — o que for seu.",
          )}
        </p>
      </div>

      {/*
        A pergunta que faltava no produto inteiro. Sem ela, o funcionário nasce
        se apresentando como atendente de uma "loja online" — era o que os três
        modelos de prompt diziam — e o quadro de clientes nasce com as colunas
        de e-commerce que o gatilho semeia. Os dois defeitos têm a mesma origem:
        uma instalação que nunca pergunta em que ramo entrou.
      */}
      <div className="space-y-2">
        <Label htmlFor="o_que_faz">{t("Que fait votre entreprise ?")}</Label>
        <Input
          id="o_que_faz"
          name="o_que_faz"
          value={oQueFaz}
          onChange={(e) => setOQueFaz(e.target.value)}
          maxLength={280}
          placeholder={t("Ex. : vente de pagnes, salon de coiffure")}
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "Uma linha basta. É com isso que seu funcionário aprende com quem ele está falando — e que a gente monta o quadro de clientes do seu jeito.",
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">{t("Où exercez-vous votre activité ?")}</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger id="timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FUSOS.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {t(f.cidade)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="timezone" value={timezone} />
        <p className="text-xs text-muted-foreground">
          {t("Détermine les horaires pendant lesquels votre assistant peut échanger avec les clients.")}
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
          required
        />
        <span>
          {t("J’ai lu et j’accepte les")}{" "}
          <a className="underline" href="/legal/terms" target="_blank" rel="noreferrer">
            {t("Conditions d’utilisation")}
          </a>{" "}
          {t("et la")}{" "}
          <a className="underline" href="/legal/privacy" target="_blank" rel="noreferrer">
            {t("Politique de confidentialité")}
          </a>
          .
        </span>
      </label>

      <div className="onb-acoes flex sm:justify-end">
        <Button type="submit" disabled={pending || !accepted} className="w-full sm:w-auto">
          {pending ? t("Enregistrement…") : t("Continuer")}
        </Button>
      </div>
    </form>
  );
}
