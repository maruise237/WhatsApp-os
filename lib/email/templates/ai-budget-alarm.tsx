/**
 * AI budget alarm email (PT-BR). Plain HTML — no React Email runtime.
 *
 * SEM CHAMADOR HOJE. O único era `workers/ai-budget-checker.cron.ts`, apagado na
 * limpeza do teto de orçamento (0159) por nunca ter tido agendador. Quem avisa o
 * cliente que o gasto passou do ponto escolhido é o item `budget_warning` na
 * Central (`agent_inbox_items`), aberto pelo próprio gate. Este arquivo fica de
 * pé porque o alarme POR E-MAIL continua sendo uma peça desejada — e é a dívida
 * D1 de marca (`tests/unit/branding.test.ts`): ele ainda escreve o nosso nome,
 * o que só passa a importar no dia em que ele voltar a ser enviado.
 */
export interface BudgetAlarmEmailOptions {
  pct: number;
  consumedCents: number;
  limitCents: number;
  orgName?: string | null;
  dashboardUrl: string;
}

const brl = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
});

function fmt(cents: number): string {
  return brl.format(cents / 100);
}

export function buildBudgetAlarmEmail(opts: BudgetAlarmEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const pctStr = `${opts.pct.toFixed(2)}%`;
  const subject = `Alerte IA : budget atteint à ${pctStr} — DeskcommCRM`;
  const orgLine = opts.orgName
    ? `<p style="margin:0 0 16px;font-size:14px;color:#57534e">Entreprise : <strong>${escapeHtml(opts.orgName)}</strong></p>`
    : "";

  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f5f5f4;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1917">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:#0c0a09">
      Le budget IA du mois a atteint ${escapeHtml(pctStr)}
    </h1>
    ${orgLine}
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">
      Consommation du mois : <strong>${escapeHtml(fmt(opts.consumedCents))}</strong>
      sur <strong>${escapeHtml(fmt(opts.limitCents))}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#57534e">
      À 100 %, l’assistant IA sera automatiquement mis en pause ou désactivé
      selon la règle configurée. Les réponses par votre équipe continuent normalement.
    </p>
    <p style="margin:24px 0">
      <a href="${opts.dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#0ea5e9;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">
        Voir le tableau de bord de consommation
      </a>
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#78716c">
      Cette alerte est envoyée automatiquement une fois toutes les 24 h tant que la
      consommation reste au-dessus de la limite configurée.
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Le budget IA du mois a atteint ${pctStr}.`,
    opts.orgName ? `Entreprise : ${opts.orgName}` : "",
    `Consommation : ${fmt(opts.consumedCents)} sur ${fmt(opts.limitCents)}.`,
    "",
    `Tableau de bord : ${opts.dashboardUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
