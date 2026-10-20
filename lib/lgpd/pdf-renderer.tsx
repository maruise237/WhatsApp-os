/**
 * LGPD export PDF renderer (PT-BR).
 *
 * Template para Art. 18, II — direito de acesso aos dados. Renderizado para
 * Buffer via @react-pdf/renderer e entregue ao titular via Resend.
 *
 * ── ESTE DOCUMENTO NÃO LEVA MARCA. É decisão, não esquecimento ──────────────
 *
 * O rodapé imprime o CONTROLADOR (`organizations.legal_name`) e o Encarregado
 * resolvido. Não imprime a marca do revendedor, não imprime a nossa, não leva
 * logo e não leva cor.
 *
 * O motivo: o relatório do Art. 18 II responde a um DIREITO LEGAL do titular.
 * Nomear ali o revendedor — que é OPERADOR, não controlador — inverteria os
 * papéis num documento jurídico. Trocar `DeskcommCRM` por `Vendas Turbo CRM`
 * no rodapé não é "completar o white-label": é piorar o defeito, porque hoje o
 * nome é obviamente o do software, e depois passaria a parecer a declaração de
 * quem responde pelos dados.
 *
 * Consequência boa e deliberada: a armadilha do @react-pdf não nos alcança.
 * `var(--x)` e `oklch()` renderizam PDF VÁLIDO e descartam a cor em silêncio
 * (medido: 1514 bytes contra 1538 do hex), então qualquer prova do tipo "gerei
 * o PDF e ele abriu" passaria com a marca perdida. Como o documento não recebe
 * cor de marca nenhuma, o `styles` de módulo abaixo pode continuar de módulo:
 * zero risco assumido. Não parametrize, não mova para dentro do componente.
 *
 * A tela que resolve o outro lado disto é `/app/settings/tenant` (campo "Razão
 * social"): `legal_name` nasce IGUAL a `display_name` no bootstrap
 * (`scripts/bootstrap-owner.ts`, os dois recebem `ORG_NAME`), então o caso ruim
 * aqui não é o campo vazio — é o nome fantasia impresso como razão social. Uma
 * guarda "se vazio, use X" nunca dispararia; o que resolve é preencher a tela.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { env } from "@/lib/env";

import type { ExportPayload } from "./export-collector";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1f2937",
  },
  header: {
    borderBottom: "1pt solid #d1d5db",
    paddingBottom: 8,
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#6b7280" },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    backgroundColor: "#f3f4f6",
    padding: 4,
    marginBottom: 6,
  },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 110, color: "#6b7280" },
  value: { flex: 1 },
  small: { fontSize: 8, color: "#9ca3af" },
  itemBlock: {
    marginBottom: 4,
    paddingBottom: 4,
    borderBottom: "0.5pt dashed #e5e7eb",
  },
  warningBanner: {
    marginTop: 14,
    padding: 6,
    border: "1pt solid #f59e0b",
    backgroundColor: "#fffbeb",
    fontSize: 9,
    color: "#92400e",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#9ca3af",
    borderTop: "0.5pt solid #e5e7eb",
    paddingTop: 4,
  },
});

interface Props {
  data: ExportPayload;
  /** When true, appends an unsigned-PADES warning banner. */
  unsignedWarning?: boolean;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("fr-FR", { timeZone: "Africa/Douala" });
  } catch {
    return s;
  }
}

function fmtMoney(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null) return "—";
  const v = cents / 100;
  return `${v.toFixed(2)} ${currency ?? "XAF"}`;
}

/**
 * A MESMA cadeia que `lib/lgpd/sla-alarm.ts:93` já usa
 * (`organizationDpoEmail || env.LGPD_DPO_EMAIL`). Reusar a ordem, e não
 * inventar outra, é o que impede o documento e o alarme de apontarem para
 * encarregados diferentes na mesma organização.
 *
 * O texto anterior era `DPO: contato via canal oficial do controlador` — um
 * não-resposta num campo cuja função é dizer a quem o titular reclama.
 */
function encarregado(data: ExportPayload): string {
  return data.dpo_email || env.LGPD_DPO_EMAIL || "non renseigné par le responsable du traitement";
}

export function LgpdExportPdf({ data, unsignedWarning }: Props): React.ReactElement {
  const shortId = data.request_id.slice(0, 8);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Rapport RGPD — Demande d’accès aux données</Text>
          <Text style={styles.subtitle}>
            Base légale : droit d’accès de la personne concernée · Demande n°{shortId}
          </Text>
        </View>

        {/* Metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Métadonnées de la demande</Text>
          <View style={styles.row}>
            <Text style={styles.label}>ID:</Text>
            <Text style={styles.value}>{data.request_id}</Text>
          </View>
          {/* A razão social vem primeiro e o uuid vira "ID interno": o campo
              existe para o TITULAR saber de quem são os dados, e um uuid cru
              não responde isso a ninguém. O id continua no documento porque é
              o que o suporte pede quando alguém liga citando o relatório. */}
          <View style={styles.row}>
            <Text style={styles.label}>Organisation :</Text>
            <Text style={styles.value}>{data.organization_legal_name || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>ID interne :</Text>
            <Text style={styles.value}>{data.organization_id}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Généré le :</Text>
            <Text style={styles.value}>{fmtDate(data.generated_at)}</Text>
          </View>
          {data.no_local_footprint ? (
            <View style={styles.row}>
              <Text style={styles.label}>Statut :</Text>
              <Text style={styles.value}>
                Aucune donnée personnelle trouvée dans les systèmes internes.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Contact */}
        {data.contact ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Données personnelles (contact)</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Nom :</Text>
              <Text style={styles.value}>{data.contact.name ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>E-mail :</Text>
              <Text style={styles.value}>{data.contact.email ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Téléphone :</Text>
              <Text style={styles.value}>{data.contact.phone_number ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>N° d’identification :</Text>
              <Text style={styles.value}>
                {data.contact.cpf_present ? "Stocké (chiffré)" : "—"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Origine :</Text>
              <Text style={styles.value}>{data.contact.source ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Créé le :</Text>
              <Text style={styles.value}>{fmtDate(data.contact.created_at)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Anonymisé :</Text>
              <Text style={styles.value}>{data.contact.is_anonymized ? "Oui" : "Non"}</Text>
            </View>
          </View>
        ) : null}

        {/* Consents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Consentements</Text>
          {data.consents.length === 0 ? (
            <Text style={styles.small}>Aucun consentement enregistré.</Text>
          ) : (
            data.consents.map((c, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.label}>{c.scope}:</Text>
                <Text style={styles.value}>
                  {c.granted ? "concedido" : "negado"}
                  {c.granted_at ? ` em ${fmtDate(c.granted_at)}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Conversations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historique des échanges</Text>
          <Text style={styles.small}>
            Total des conversations : {data.conversations.length} · Total des messages :{" "}
            {data.messages_count_total} · Échantillon inclus dans ce rapport :{" "}
            {data.messages_recent.length}
          </Text>
          {data.conversations.slice(0, 10).map((c) => (
            <View key={c.id} style={styles.itemBlock}>
              <Text>
                Conversation n°{c.id.slice(0, 8)} · {c.channel} · {c.status}
              </Text>
              <Text style={styles.small}>
                Dernier message : {fmtDate(c.last_message_at)} · Créée le{" "}
                {fmtDate(c.created_at)}
              </Text>
            </View>
          ))}
        </View>

        {/* Recent messages preview */}
        {data.messages_recent.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Messages récents (échantillon)</Text>
            {data.messages_recent.slice(0, 25).map((m) => (
              <View key={m.id} style={styles.itemBlock}>
                <Text style={styles.small}>
                  {fmtDate(m.created_at)} · {m.direction} · {m.type} · {m.status}
                </Text>
                <Text>{m.body ? m.body.slice(0, 280) : m.has_media ? "[média]" : "—"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Leads */}
        {data.leads.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activité commerciale — Affaires</Text>
            {data.leads.map((l) => (
              <View key={l.id} style={styles.itemBlock}>
                <Text>
                  {l.title ?? "(sans titre)"} · {l.status} ·{" "}
                  {fmtMoney(l.value_cents, l.currency)}
                </Text>
                <Text style={styles.small}>Créé le {fmtDate(l.created_at)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Orders */}
        {data.orders.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Commandes</Text>
            {data.orders.map((o) => (
              <View key={o.id} style={styles.itemBlock}>
                <Text>
                  {o.external_provider ?? "—"} #{o.external_id ?? o.id.slice(0, 8)} ·{" "}
                  {o.status} · {fmtMoney(o.total_cents, o.currency)}
                </Text>
                <Text style={styles.small}>Commande du {fmtDate(o.ordered_at)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Audit */}
        {data.audit_log_extract.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activités d’audit</Text>
            {data.audit_log_extract.slice(0, 50).map((a) => (
              <View key={a.id} style={styles.row}>
                <Text style={styles.label}>{fmtDate(a.created_at)}</Text>
                <Text style={styles.value}>
                  {a.action}
                  {a.resource_type ? ` · ${a.resource_type}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Unsigned warning */}
        {unsignedWarning ? (
          <View style={styles.warningBanner}>
            <Text>
              SIGNATURE NUMÉRIQUE PAdES EN ATTENTE — clé LGPD_SIGNING_KEY non configurée. L’intégrité du document est garantie par un hash SHA-256 enregistré dans un journal auditable.
            </Text>
          </View>
        ) : null}

        {/* Footer */}
        {/* CONTROLADOR, nunca marca — ver o cabeçalho deste arquivo. */}
        <View style={styles.footer} fixed>
          <Text>
            Responsable du traitement : {data.organization_legal_name || "—"} · Rapport de droit d’accès aux données · Délégué à la protection des données (DPO) : {encarregado(data)} · Validité du lien de téléchargement selon l’e-mail reçu
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderLgpdPdf(
  data: ExportPayload,
  options: { unsignedWarning?: boolean } = {},
): Promise<Buffer> {
  const element = <LgpdExportPdf data={data} unsignedWarning={options.unsignedWarning} />;
  const buf = await renderToBuffer(element);
  return buf as Buffer;
}
