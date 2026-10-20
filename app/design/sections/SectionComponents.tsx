"use client";

import { useState } from "react";

function Stack({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="ds-key" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>{label}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

export function SectionComponents() {
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [tab, setTab] = useState("inbox");
  const [loading, setLoading] = useState(false);

  return (
    <div className="ds-section">
      <h2 className="ds-display">Composants</h2>
      <p className="ds-lede">
        États complets : default, hover, focus, active, disabled, loading, error. Les composants réagissent à l’exécution à la palette, à la typographie et à la densité sélectionnées.
      </p>

      {/* Buttons */}
      <h3>Buttons</h3>
      <div className="ds-card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <Stack label="Variants">
          <button className="ds-btn ds-btn--primary">Confirmer l’envoi</button>
          <button className="ds-btn ds-btn--secondary">Annuler</button>
          <button className="ds-btn ds-btn--ghost">Reporter</button>
          <button className="ds-btn ds-btn--destructive">Supprimer la conversation</button>
          <button className="ds-btn ds-btn--link">voir les détails</button>
        </Stack>
        <Stack label="États">
          <button className="ds-btn ds-btn--primary">Default</button>
          <button className="ds-btn ds-btn--primary" disabled>Disabled</button>
          <button
            className="ds-btn ds-btn--primary"
            onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1400); }}
            disabled={loading}
          >
            {loading ? <span className="ds-spinner" /> : null}
            {loading ? "Enviando…" : "Loading test"}
          </button>
        </Stack>
      </div>

      {/* Inputs */}
      <h3>Inputs</h3>
      <div className="ds-card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <label className="ds-label">E-mail du client</label>
          <input className="ds-input" placeholder="marie@entreprise.cm" />
        </div>
        <div>
          <label className="ds-label">Nom</label>
          <input className="ds-input" defaultValue="Maria Silva" />
        </div>
        <div>
          <label className="ds-label">Rechercher une conversation</label>
          <div style={{ position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ds-text-muted)" }}>
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input className="ds-input" placeholder="commande, client, téléphone…" style={{ paddingLeft: 32 }} />
          </div>
        </div>
        <div>
          <label className="ds-label">CPF (avec erreur)</label>
          <input className="ds-input" defaultValue="000.000.000-00" aria-invalid="true" />
          <span style={{ color: "var(--ds-error)", fontSize: 11.5, marginTop: 4, display: "block" }}>CPF invalide — vérifiez les chiffres.</span>
        </div>
        <div>
          <label className="ds-label">Disabled</label>
          <input className="ds-input" defaultValue="bloqué" disabled />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="ds-label">Réponse</label>
          <textarea className="ds-input" rows={4} placeholder="Saisissez votre réponse…" style={{ height: "auto", padding: 12, resize: "vertical" }} />
        </div>
      </div>

      {/* Badges */}
      <h3>Badges (status pill)</h3>
      <div className="ds-card ds-row">
        <span className="ds-badge ds-badge--neutral"><span className="dot" style={{ background: "var(--ds-text-muted)" }} />open</span>
        <span className="ds-badge ds-badge--info"><span className="dot" style={{ background: "var(--ds-info)" }} />pending</span>
        <span className="ds-badge ds-badge--success"><span className="dot" style={{ background: "var(--ds-success)" }} />resolved</span>
        <span className="ds-badge ds-badge--accent"><span className="dot" style={{ background: "var(--ds-accent)" }} />won</span>
        <span className="ds-badge ds-badge--error"><span className="dot" style={{ background: "var(--ds-error)" }} />lost</span>
        <span className="ds-badge ds-badge--warning"><span className="dot" style={{ background: "var(--ds-warning)" }} />SLA</span>
      </div>

      {/* Avatars */}
      <h3>Avatar</h3>
      <div className="ds-card ds-row">
        <span className="ds-avatar ds-avatar--sm">RM</span>
        <span className="ds-avatar">MS<span className="ds-avatar-status" /></span>
        <span className="ds-avatar ds-avatar--lg">JP</span>
        <div className="ds-avatar-group">
          <span className="ds-avatar">MS</span>
          <span className="ds-avatar" style={{ background: "color-mix(in srgb, var(--ds-info) 18%, transparent)", color: "var(--ds-info)" }}>JP</span>
          <span className="ds-avatar" style={{ background: "color-mix(in srgb, var(--ds-warning) 18%, transparent)", color: "var(--ds-warning)" }}>+3</span>
        </div>
      </div>

      {/* Cards */}
      <h3>Cards</h3>
      <div className="ds-grid-3">
        <div className="ds-card">
          <div className="ds-key">Chiffre d’affaires du jour</div>
          <div className="ds-display" style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>12 443 FCFA</div>
          <div style={{ fontSize: 12, color: "var(--ds-success)", marginTop: 4 }}>+8,4 % vs hier</div>
        </div>
        <div className="ds-card ds-card--interactive">
          <div className="ds-key">Conversations ouvertes</div>
          <div className="ds-display" style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>27</div>
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)", marginTop: 4 }}>survoler pour ouvrir →</div>
        </div>
        <div className="ds-card">
          <div className="ds-key">SLA</div>
          <div className="ds-display" style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>97.2%</div>
          <div style={{ fontSize: 12, color: "var(--ds-warning)", marginTop: 4 }}>3 conversations proches de la limite</div>
        </div>
      </div>

      {/* ConversationItem + KanbanCard */}
      <h3>ConversationItem · KanbanCard · MessageBubble</h3>
      <div className="ds-grid-2">
        <div>
          <div className="ds-key" style={{ marginBottom: 8 }}>ConversationItem</div>
          <div className="ds-list">
            <div className="ds-list-item">
              <div className="ds-avatar">MS<span className="ds-avatar-status" /></div>
              <div className="body">
                <div className="title">Maria Silva</div>
                <div className="preview">Confirmation de l’adresse de livraison…</div>
              </div>
              <div className="meta">
                <span className="ts">14h32</span>
                <span className="ds-badge ds-badge--accent">nouveau</span>
              </div>
            </div>
            <div className="ds-list-item">
              <div className="ds-avatar">JP</div>
              <div className="body">
                <div className="title">Jean Mbarga</div>
                <div className="preview">J’ai déjà payé par Mobile Money, voici le reçu…</div>
              </div>
              <div className="meta">
                <span className="ts">14h28</span>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="ds-key" style={{ marginBottom: 8 }}>KanbanCard</div>
          <div className="ds-kanban-card" style={{ background: "var(--ds-surface)" }}>
            <div className="row">
              <span className="title">Commande n° 12 443</span>
              <span className="value">1 234 FCFA</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Marie Ngo · cliente fidèle</div>
            <div className="row">
              <div className="tags">
                <span className="ds-badge ds-badge--info">mobile money</span>
                <span className="ds-badge ds-badge--warning">sla&lt;1h</span>
              </div>
              <span className="ds-avatar ds-avatar--sm">RM</span>
            </div>
          </div>
        </div>
      </div>

      <div className="ds-card" style={{ marginTop: 16 }}>
        <div className="ds-key" style={{ marginBottom: 12 }}>MessageBubble</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
          <div className="ds-bubble in">Bonjour ! Vous me confirmez l’adresse de livraison ? Je veux vérifier qu’elle est correcte.</div>
          <div className="ds-bubble out">
            Bien sûr Marie, c’est 144 rue des Acacias, appt 23 — Bonapriso. Vous confirmez ?
            <div className="meta">14h32 · ✓✓</div>
          </div>
          <div className="ds-bubble in">Parfait ! Vous pouvez envoyer.</div>
        </div>
      </div>

      {/* Tabs */}
      <h3>Tabs</h3>
      <div className="ds-card">
        <div className="ds-tabs">
          {([["inbox", "Inbox"], ["pedidos", "Commandes"], ["clientes", "Clients"], ["relatorios", "Rapports"]] as const).map(([id, label]) => (
            <button key={id} className="ds-tab" data-active={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ padding: "20px 4px", fontSize: 13.5, color: "var(--ds-text-muted)" }}>
          Contenu de l’onglet <span className="ds-mono" style={{ color: "var(--ds-accent)" }}>/{tab}</span>.
        </div>
      </div>

      {/* Tooltip + Modal + Toast triggers */}
      <h3>Tooltip · Modal · Toast</h3>
      <div className="ds-card ds-row">
        <span className="ds-tooltip-host">
          <button className="ds-btn ds-btn--secondary">Survoler pour l’info-bulle</button>
          <span className="ds-tooltip">Atalho: ⌘K</span>
        </span>
        <button className="ds-btn ds-btn--primary" onClick={() => setShowModal(true)}>Ouvrir la fenêtre</button>
        <button className="ds-btn ds-btn--secondary" onClick={() => { setShowToast(true); setTimeout(() => setShowToast(false), 2600); }}>
          Disparar toast
        </button>
      </div>

      {/* Skeleton */}
      <h3>Skeleton</h3>
      <div className="ds-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="ds-skel" style={{ width: "60%", height: 16 }} />
        <div className="ds-skel" style={{ width: "85%", height: 12 }} />
        <div className="ds-skel" style={{ width: "40%", height: 12 }} />
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <div className="ds-skel" style={{ width: 32, height: 32, borderRadius: "50%" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="ds-skel" style={{ width: "30%", height: 14 }} />
            <div className="ds-skel" style={{ width: "70%", height: 12 }} />
          </div>
        </div>
      </div>

      {/* Empty */}
      <h3>Empty state</h3>
      <div className="ds-empty">
        <div className="marker">∅ · aucune conversation</div>
        <div className="ds-display" style={{ fontSize: 18, fontWeight: 600 }}>Tout est à jour.</div>
        <div style={{ fontSize: 13, color: "var(--ds-text-muted)", maxWidth: 360 }}>
          Votre boîte de réception est vide. Profitez du calme — en e-commerce, il dure rarement.
        </div>
        <button className="ds-btn ds-btn--ghost" style={{ marginTop: 6 }}>Voir les commandes en attente</button>
      </div>

      {/* Floating modal */}
      {showModal && (
        <div className="ds-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="ds-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
              Archiver la conversation ?
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ds-text-muted)", marginBottom: 18 }}>
              La conversation avec Marie Ngo sera déplacée dans l’historique. Vous pouvez la restaurer à tout moment.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="ds-btn ds-btn--ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="ds-btn ds-btn--primary" onClick={() => setShowModal(false)}>Archiver</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {showToast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50 }}>
          <div className="ds-toast">
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ds-success)", marginTop: 6 }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 13.5 }}>Message envoyé</div>
              <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>Maria Silva · WhatsApp</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
