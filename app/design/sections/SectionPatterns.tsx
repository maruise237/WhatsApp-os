"use client";

const inboxList = [
  { name: "Aïcha Ndiaye", preview: "Je confirme l’adresse…", ts: "14h32", initial: "AN", active: true },
  { name: "Jean Mbarga", preview: "Preuve jointe",     ts: "14h28", initial: "JP" },
  { name: "Fatou Diallo", preview: "Changer de taille ?",       ts: "13h51", initial: "FD" },
  { name: "Paul Essomba", preview: "Produit arrivé…",       ts: "12h17", initial: "PE" },
];

export function SectionPatterns() {
  return (
    <div className="ds-section">
      <h2 className="ds-display">Modèles composés</h2>
      <p className="ds-lede">
        Structures qui se répètent dans les écrans opérationnels. Mises en page pures — les données sont fictives.
      </p>

      {/* Inbox 3 colunas */}
      <h3>Inbox · 3 colonnes</h3>
      <div
        className="ds-card"
        style={{
          padding: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "260px 1fr 320px",
          height: 420,
        }}
      >
        <div style={{ borderRight: "1px solid var(--ds-border)", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <input className="ds-input" placeholder="Rechercher…" />
          {inboxList.map((c) => (
            <div
              key={c.name}
              className="ds-list-item"
              style={{
                background: c.active ? "var(--ds-accent-soft)" : undefined,
                borderColor: c.active ? "var(--ds-accent)" : undefined,
              }}
            >
              <div className="ds-avatar ds-avatar--sm">{c.initial}</div>
              <div className="body">
                <div className="title" style={{ fontSize: 12.5 }}>{c.name}</div>
                <div className="preview" style={{ fontSize: 11.5 }}>{c.preview}</div>
              </div>
              <div className="meta"><span className="ts">{c.ts}</span></div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--ds-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Maria Silva</div>
              <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>+237 6 99 43 11 02 · Commande n° 12 443</div>
            </div>
            <span className="ds-badge ds-badge--success">resolvendo</span>
          </div>
          <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 8, overflow: "auto" }}>
            <div className="ds-bubble in">Bonjour ! Vous me confirmez l’adresse ?</div>
            <div className="ds-bubble out">144 rue des Acacias · 14h32 · ✓✓</div>
            <div className="ds-bubble in">Perfeito.</div>
          </div>
          <div style={{ padding: 12, borderTop: "1px solid var(--ds-border)", display: "flex", gap: 8 }}>
            <input className="ds-input" placeholder="Saisissez…" style={{ flex: 1 }} />
            <button className="ds-btn ds-btn--primary">Envoyer</button>
          </div>
        </div>

        <div style={{ borderLeft: "1px solid var(--ds-border)", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div className="ds-avatar ds-avatar--lg">MS<span className="ds-avatar-status" /></div>
            <div style={{ fontWeight: 600 }}>Maria Silva</div>
            <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Cliente depuis mars 2024</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="ds-key">LTV</span><span className="ds-display" style={{ fontSize: 22, fontWeight: 600 }}>R$ 4.882,40</span>
            <span className="ds-key">Commandes</span><span style={{ fontSize: 14 }}>12 (3 sur les 90 derniers jours)</span>
          </div>
        </div>
      </div>

      {/* Kanban */}
      <h3>Kanban · pipeline des commandes</h3>
      <div className="ds-kanban">
        {[
          { title: "En attente de paiement", n: 3 },
          { title: "Pago", n: 4 },
          { title: "En préparation", n: 2 },
          { title: "Envoyé", n: 5 },
        ].map((col) => (
          <div className="ds-kanban-col" key={col.title}>
            <header><span>{col.title}</span><span>{col.n}</span></header>
            {Array.from({ length: 2 }).map((_, i) => (
              <div className="ds-kanban-card" key={i}>
                <div className="row">
                  <span className="title">Commande n°{(12440 + i + col.n).toString()}</span>
                  <span className="value">R$ {(150 + i * 88).toFixed(2).replace(".", ",")}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Client {i + 1} · pix</div>
                <div className="row">
                  <span className="ds-badge ds-badge--neutral">2 itens</span>
                  <span className="ds-avatar ds-avatar--sm">RM</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Settings page */}
      <h3>Settings · layout sidebar + form</h3>
      <div className="ds-card" style={{ padding: 0, display: "grid", gridTemplateColumns: "200px 1fr" }}>
        <nav style={{ borderRight: "1px solid var(--ds-border)", padding: 16, display: "flex", flexDirection: "column", gap: 2 }}>
          {["Compte", "Équipe", "Canaux", "WhatsApp", "Facturation", "API et webhooks"].map((n, i) => (
            <button key={n} className="ds-nav-link" data-active={i === 2}>{n}</button>
          ))}
        </nav>
        <div style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0 }}>Canaux connectés</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14, border: "1px solid var(--ds-border)", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 500 }}>WhatsApp Business · Boutique Maud</div>
                <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Connecté depuis 4 mois · 2 143 messages</div>
              </div>
              <span className="ds-badge ds-badge--success">actif</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14, border: "1px solid var(--ds-border)", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 500 }}>Instagram Direct</div>
                <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Token expirou — reconecte</div>
              </div>
              <button className="ds-btn ds-btn--secondary">Reconectar</button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading + Error states */}
      <h3>Loading · Error</h3>
      <div className="ds-grid-2">
        <div className="ds-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="ds-skel" style={{ width: "50%", height: 16 }} />
          <div className="ds-skel" style={{ width: "90%", height: 12 }} />
          <div className="ds-skel" style={{ width: "75%", height: 12 }} />
          <div className="ds-skel" style={{ width: "40%", height: 12 }} />
        </div>
        <div className="ds-card" style={{ borderColor: "var(--ds-error)" }}>
          <div className="ds-key" style={{ color: "var(--ds-error)" }}>Erreur · 503</div>
          <div className="ds-display" style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>WhatsApp indisponible</div>
          <p style={{ fontSize: 13, color: "var(--ds-text-muted)", marginTop: 8, lineHeight: 1.5 }}>
            Impossible de se connecter à WAHA pour le moment. Nouvelle tentative dans 30 s.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="ds-btn ds-btn--secondary">Réessayer maintenant</button>
            <button className="ds-btn ds-btn--ghost">Voir le statut</button>
          </div>
        </div>
      </div>
    </div>
  );
}
