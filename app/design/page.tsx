"use client";

import { useState } from "react";
import { Switcher } from "./components/Switcher";
import { SectionTokens } from "./sections/SectionTokens";
import { SectionPalettes } from "./sections/SectionPalettes";
import { SectionTypography } from "./sections/SectionTypography";
import { SectionDensity } from "./sections/SectionDensity";
import { SectionComponents } from "./sections/SectionComponents";
import { SectionPatterns } from "./sections/SectionPatterns";
import { SectionMotion } from "./sections/SectionMotion";
import { SectionIcons } from "./sections/SectionIcons";
import { useVariant } from "./lib/variant-context";
import { PALETTES, TYPOS, DENSITIES } from "./lib/tokens";

type SectionId =
  | "tokens" | "paletas" | "tipografia" | "densidade"
  | "componentes" | "padroes" | "motion" | "icones";

const NAV: Array<{ id: SectionId; label: string }> = [
  { id: "tokens",      label: "Tokens" },
  { id: "paletas",     label: "Paletas" },
  { id: "tipografia",  label: "Typographie" },
  { id: "densidade",   label: "Densité" },
  { id: "componentes", label: "Composants" },
  { id: "padroes",     label: "Modèles" },
  { id: "motion",      label: "Motion" },
  { id: "icones",      label: "Iconographie" },
];

export default function DesignShowcasePage() {
  const [active, setActive] = useState<SectionId>("tokens");
  const v = useVariant();

  const content = (() => {
    switch (active) {
      case "tokens":      return <SectionTokens />;
      case "paletas":     return <SectionPalettes />;
      case "tipografia":  return <SectionTypography />;
      case "densidade":   return <SectionDensity />;
      case "componentes": return <SectionComponents />;
      case "padroes":     return <SectionPatterns />;
      case "motion":      return <SectionMotion />;
      case "icones":      return <SectionIcons />;
    }
  })();

  return (
    <div className="ds-shell">
      <aside className="ds-sidebar">
        <h1>DeskcommCRM</h1>
        <div className="ds-sub">design system · v0.1</div>

        <div className="ds-nav-section">Foundation</div>
        {NAV.slice(0, 4).map((n) => (
          <button
            key={n.id}
            className="ds-nav-link"
            data-active={active === n.id}
            onClick={() => setActive(n.id)}
          >
            {n.label}
          </button>
        ))}

        <div className="ds-nav-section">Composants</div>
        {NAV.slice(4, 6).map((n) => (
          <button
            key={n.id}
            className="ds-nav-link"
            data-active={active === n.id}
            onClick={() => setActive(n.id)}
          >
            {n.label}
          </button>
        ))}

        <div className="ds-nav-section">Sensation</div>
        {NAV.slice(6).map((n) => (
          <button
            key={n.id}
            className="ds-nav-link"
            data-active={active === n.id}
            onClick={() => setActive(n.id)}
          >
            {n.label}
          </button>
        ))}

        <div style={{ marginTop: 32, padding: 12, border: "1px solid var(--ds-border)", borderRadius: 8, fontSize: 11, color: "var(--ds-text-muted)", lineHeight: 1.55 }}>
          <div style={{ color: "var(--ds-accent)", fontFamily: "var(--ds-font-mono)", marginBottom: 6 }}>SÉLECTION</div>
          <div>Palette · <span style={{ color: "var(--ds-text)" }}>{PALETTES[v.palette].name}</span></div>
          <div>Type · <span style={{ color: "var(--ds-text)" }}>{TYPOS[v.typo].name}</span></div>
          <div>Densité · <span style={{ color: "var(--ds-text)" }}>{DENSITIES[v.density].label}</span></div>
          <div>Thème · <span style={{ color: "var(--ds-text)" }}>{v.theme}</span></div>
        </div>
      </aside>

      <main className="ds-canvas">
        <div className="ds-topbar">
          <div className="ds-topbar-title">
            Vitrine du design system
            <small>naviguez via la barre latérale · changez les variantes ci-dessus</small>
          </div>
          <Switcher />
        </div>

        <div className="ds-scroll">
          <div className="ds-banner">
            <h1>Vitrine du design system — DeskcommCRM</h1>
            <p>
              Utilisez la barre latérale pour parcourir les sections. Utilisez le sélecteur (coin supérieur droit) pour changer
              <strong> palette · typographie · densité · thème</strong> à l’exécution — les choix sont conservés dans localStorage. Quand vous trouvez le bon réglage, dites-le-moi : <em>palette X + type Y + densité Z</em>.
            </p>
          </div>
          {content}
        </div>
      </main>
    </div>
  );
}
