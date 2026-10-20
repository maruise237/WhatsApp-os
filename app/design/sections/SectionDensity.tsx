"use client";

import { DENSITIES } from "../lib/tokens";
import type { DensityId } from "../lib/tokens";
import { useVariant } from "../lib/variant-context";

const MOCK = [
  { name: "Aïcha Ndiaye",  preview: "Je confirme l’adresse de livraison pour la commande n° 12 443", ts: "14h32", initial: "AN", badge: "nouveau" },
  { name: "Jean Mbarga",  preview: "J’ai payé par Mobile Money, voici la preuve en pièce jointe",        ts: "14h28", initial: "JP", badge: null },
  { name: "Fatou Diallo",  preview: "Je peux changer la taille ? Le L est trop serré",                ts: "13h51", initial: "FD", badge: null },
  { name: "Paul Essomba",  preview: "La commande est arrivée cassée, j’ai envoyé une photo sur Insta",          ts: "12h17", initial: "PE", badge: "urg" },
  { name: "Grace Fotso",   preview: "Merci pour votre aide hier, super rapide !",          ts: "11h44", initial: "GF", badge: null },
];

function DensityList({ id }: { id: DensityId }) {
  const d = DENSITIES[id];
  return (
    <div
      className="ds-list"
      style={{
        // Override CSS vars locally so each panel shows its own density.
        ["--density-row-h" as string]: d.rowH,
        ["--density-gap" as string]: d.gap,
        ["--density-pad-x" as string]: d.padX,
        ["--density-pad-y" as string]: d.padY,
      } as React.CSSProperties}
    >
      {MOCK.map((m) => (
        <div className="ds-list-item" key={m.name}>
          <div className="ds-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
            {m.initial}
            <span className="ds-avatar-status" />
          </div>
          <div className="body">
            <div className="title">{m.name}</div>
            <div className="preview">{m.preview}</div>
          </div>
          <div className="meta">
            <span className="ts">{m.ts}</span>
            {m.badge && (
              <span className={`ds-badge ${m.badge === "urg" ? "ds-badge--error" : "ds-badge--accent"}`}>
                {m.badge}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionDensity() {
  const v = useVariant();
  return (
    <div className="ds-section">
      <h2 className="ds-display">Densidade</h2>
      <p className="ds-lede">
        Les conseillers qui travaillent 8 h par jour ont besoin d’une densité qui réduit le défilement tout en gardant de l’air visuel. Trois modes, avec row-height + gap comme jetons principaux. Appliqué à une liste de boîte de réception fictive.
      </p>

      {(Object.keys(DENSITIES) as DensityId[]).map((id) => {
        const d = DENSITIES[id];
        const active = v.density === id;
        return (
          <div key={id} style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  {d.label}
                  {active && <span className="ds-badge ds-badge--accent" style={{ marginLeft: 10 }}>active</span>}
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--ds-text-muted)", marginTop: 4 }}>
                  row-height <span className="ds-mono">{d.rowH}</span> · gap <span className="ds-mono">{d.gap}</span>
                  {" · "}padding <span className="ds-mono">{d.padY} {d.padX}</span>
                </p>
              </div>
              <button className="ds-btn ds-btn--secondary" onClick={() => v.setDensity(id)} disabled={active}>
                Appliquer
              </button>
            </div>
            <DensityList id={id} />
          </div>
        );
      })}
    </div>
  );
}
