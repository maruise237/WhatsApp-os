"use client";

import { TYPOS } from "../lib/tokens";
import type { TypoId } from "../lib/tokens";
import { useVariant } from "../lib/variant-context";

const TYPO_FONTS: Record<TypoId, { display: string; body: string }> = {
  "bricolage-jakarta": {
    display: "var(--font-bricolage)",
    body: "var(--font-jakarta)",
  },
  "fraunces-manrope": {
    display: "var(--font-fraunces)",
    body: "var(--font-manrope)",
  },
  atkinson: {
    display: "var(--font-atkinson)",
    body: "var(--font-atkinson)",
  },
  "source-plex": {
    display: "var(--font-source-serif)",
    body: "var(--font-plex-sans)",
  },
};

const SAMPLE_PROSE =
  "Commande n° 12 443 expédiée à 14h32 — le client a répondu sur WhatsApp pour confirmer l’adresse de livraison. L’IA a déjà suggéré l’action suivante : demander le reçu de paiement Mobile Money.";

function PairBlock({ id }: { id: TypoId }) {
  const v = useVariant();
  const fonts = TYPO_FONTS[id];
  const meta = TYPOS[id];
  const active = v.typo === id;

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>
            {meta.name}
            {active && <span className="ds-badge ds-badge--accent" style={{ marginLeft: 10 }}>ativa</span>}
          </h3>
          <p style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 4 }}>
            {meta.description} · escala {meta.scale}
          </p>
        </div>
        <button
          className="ds-btn ds-btn--secondary"
          onClick={() => v.setTypo(id)}
          disabled={active}
        >
          Aplicar par
        </button>
      </div>

      <div className="ds-pair-preview" style={{ fontFamily: fonts.body }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 56, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
          Un service client qui passe à l’échelle.
        </div>
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 36, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
          H2 · Boîte de réception du jour
        </div>
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 24 }}>H3 · Commande en cours</div>
        <div style={{ fontFamily: fonts.display, fontWeight: 500, fontSize: 18 }}>H4 · Conversation n° 482</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 6 }}>
          <div>
            <div className="ds-key" style={{ marginBottom: 4 }}>Body · regular</div>
            <p style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 1.55 }}>{SAMPLE_PROSE}</p>
          </div>
          <div>
            <div className="ds-key" style={{ marginBottom: 4 }}>Body · italic + bold</div>
            <p style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 1.55 }}>
              <strong>Maria Silva</strong> respondeu <em>&ldquo;j’ai déjà payé par Mobile Money&rdquo;</em> à 14h32. En attente du reçu automatique.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div className="ds-key" style={{ marginBottom: 4 }}>Numerais tabulares (financeiro)</div>
            <div style={{ fontFamily: fonts.body, fontVariantNumeric: "tabular-nums lining-nums", fontSize: 15 }}>
              <div>R$ 1.234,56</div>
              <div>R$ 9.998,01</div>
              <div>R$&nbsp;&nbsp;&nbsp;&nbsp;42,00</div>
            </div>
          </div>
          <div>
            <div className="ds-key" style={{ marginBottom: 4 }}>Numerais proporcionais (texto)</div>
            <div style={{ fontFamily: fonts.body, fontVariantNumeric: "proportional-nums", fontSize: 15 }}>
              <div>1 234 conversations aujourd’hui</div>
              <div>98% SLA cumprido</div>
              <div>14h32 · 16h05 · 18h11</div>
            </div>
          </div>
        </div>

        <div className="ds-key">Pesos extremos</div>
        <div style={{ display: "flex", gap: 18, alignItems: "baseline", flexWrap: "wrap", fontFamily: fonts.display }}>
          <span style={{ fontWeight: 300, fontSize: 28 }}>Light 300</span>
          <span style={{ fontWeight: 400, fontSize: 28 }}>Regular 400</span>
          <span style={{ fontWeight: 500, fontSize: 28 }}>Medium 500</span>
          <span style={{ fontWeight: 700, fontSize: 28 }}>Bold 700</span>
          <span style={{ fontWeight: 800, fontSize: 28 }}>Extra 800</span>
        </div>

        <div style={{ fontSize: 13, color: "var(--ds-text-muted)", fontFamily: fonts.body }}>
          small · meta · ts · 12.5px
        </div>
        <div style={{ fontSize: 11, color: "var(--ds-text-muted)", fontFamily: fonts.body, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          caption · status · 11px / 0.08em
        </div>
      </div>
    </div>
  );
}

export function SectionTypography() {
  return (
    <div className="ds-section">
      <h2 className="ds-display">Tipografia</h2>
      <p className="ds-lede">
        Quatre associations évaluées. Critères : lisibilité sur des journées de 8 h, chiffres tabulaires, graisses extrêmes disponibles, vraie italique (pas inclinée). Inter / Geist / Space Grotesk ont été écartées car surreprésentées dans les données d’entraînement.
      </p>

      <PairBlock id="bricolage-jakarta" />
      <PairBlock id="fraunces-manrope" />
      <PairBlock id="atkinson" />
      <PairBlock id="source-plex" />
    </div>
  );
}
