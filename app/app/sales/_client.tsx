"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { DEVISE_PAR_DEFAUT } from "@/lib/marche/defauts";
import { centsVersSaisie, formatMontant, parseMontantEnCents } from "@/lib/money";
import { transitionTargetsSalesOrder, type SalesOrderStatus } from "@/lib/sales/order-state";

interface Product {
  id: string;
  title: string;
  description?: string | null;
  price_cents: number;
  currency: string;
  stock: number;
  is_active: boolean;
}

interface OrderItem {
  id: string;
  product_title: string;
  quantity: number;
  unit_price_cents: number;
  currency: string;
}

interface PaymentProof {
  id: string;
  storage_key: string;
  mime_type: string;
  message_id?: string | null;
  review_status: "pending" | "approved" | "rejected";
  amount_cents?: number | null;
  reference?: string | null;
  operator?: string | null;
  review_note?: string | null;
  created_at: string;
}

interface OrderContact {
  id: string;
  name?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
}

interface SalesOrder {
  id: string;
  status: SalesOrderStatus;
  total_cents: number;
  currency: string;
  contact_id: string;
  conversation_id: string;
  fulfillment_note?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
  contacts?: OrderContact | null;
  sales_order_items?: OrderItem[];
  payment_proofs?: PaymentProof[];
}

interface SalesCentralProps {
  canManageCatalog: boolean;
}

type View = "proofs" | "orders" | "catalog";

const CURRENCIES = ["XAF", "XOF", "NGN", "GHS", "EUR", "USD"] as const;

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  en_cours: "En cours",
  en_attente_paiement: "Paiement attendu",
  payée: "Payée",
  a_livrer: "À livrer",
  livree: "Livrée",
  refusee: "Refusée",
  annulee: "Annulée",
};

const STATUS_TONE: Record<SalesOrderStatus, string> = {
  en_cours: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  en_attente_paiement: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  payée: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  a_livrer: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  livree: "bg-muted text-muted-foreground",
  refusee: "bg-destructive/10 text-destructive",
  annulee: "bg-muted text-muted-foreground",
};

/** Libellé du bouton qui mène À cet état (les transitions viennent de order-state). */
const ACTION_LABEL: Partial<Record<SalesOrderStatus, string>> = {
  en_attente_paiement: "Attendre le paiement",
  a_livrer: "Préparer la livraison",
  livree: "Marquer livrée",
  refusee: "Refuser la commande",
  annulee: "Annuler",
};

const ORDER_FILTERS: Array<{ key: "actives" | SalesOrderStatus | "toutes"; label: string }> = [
  { key: "actives", label: "Actives" },
  { key: "en_attente_paiement", label: "Paiement attendu" },
  { key: "a_livrer", label: "À livrer" },
  { key: "livree", label: "Livrées" },
  { key: "toutes", label: "Toutes" },
];

const CLOSED: readonly SalesOrderStatus[] = ["livree", "refusee", "annulee"];

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) return (body as { data: T }).data;
  return body as T;
}

function formatMoney(cents: number, currency: string): string {
  return formatMontant(cents, currency);
}

/**
 * « 15 000 », « 15.000 » ou « 15000 » FCFA → 1 500 000 centimes. L'ancienne
 * lecture (`Number("15.000")`) donnait 15 FCFA : le point de milliers était pris
 * pour une virgule décimale. La règle commune vit dans `lib/money`.
 */
function parseMoney(input: string, currency: string): number | null {
  return parseMontantEnCents(input, currency);
}

function contactLabel(order: SalesOrder): string {
  return rotuloDoContato(order.contacts);
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export function SalesCentral({ canManageCatalog }: SalesCentralProps) {
  const [view, setView] = useState<View | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<(typeof ORDER_FILTERS)[number]["key"]>("actives");
  const [showArchived, setShowArchived] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [productsResponse, ordersResponse] = await Promise.all([
        fetch(`/api/v1/products${showArchived ? "?include_archived=1" : ""}`, { cache: "no-store" }),
        fetch("/api/v1/orders", { cache: "no-store" }),
      ]);
      if (!productsResponse.ok) throw new Error(await readError(productsResponse, "Catalogue indisponible."));
      if (!ordersResponse.ok) throw new Error(await readError(ordersResponse, "Commandes indisponibles."));
      setProducts(unwrap<Product[]>(await productsResponse.json()) ?? []);
      setOrders(unwrap<SalesOrder[]>(await ordersResponse.json()) ?? []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger le Central vendeur.");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendingProofs = useMemo(
    () =>
      orders.flatMap((order) =>
        (order.payment_proofs ?? [])
          .filter((proof) => proof.review_status === "pending")
          .map((proof) => ({ order, proof })),
      ),
    [orders],
  );

  const kpis = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const paidThisMonth = orders.filter(
      (o) => o.paid_at && new Date(o.paid_at) >= monthStart && !["refusee", "annulee"].includes(o.status),
    );
    const byCurrency = new Map<string, number>();
    for (const o of paidThisMonth) byCurrency.set(o.currency, (byCurrency.get(o.currency) ?? 0) + o.total_cents);
    return {
      toDeliver: orders.filter((o) => o.status === "payée" || o.status === "a_livrer").length,
      awaitingPayment: orders.filter((o) => o.status === "en_attente_paiement").length,
      revenue: [...byCurrency].map(([currency, cents]) => formatMoney(cents, currency)).join(" · ") || formatMoney(0, "XAF"),
    };
  }, [orders]);

  // Onglet par défaut : là où il y a quelque chose à faire.
  const activeView: View = view ?? (pendingProofs.length > 0 ? "proofs" : "orders");

  const filteredOrders = useMemo(() => {
    if (orderFilter === "toutes") return orders;
    if (orderFilter === "actives") return orders.filter((o) => !CLOSED.includes(o.status));
    if (orderFilter === "a_livrer") return orders.filter((o) => o.status === "a_livrer" || o.status === "payée");
    return orders.filter((o) => o.status === orderFilter);
  }, [orders, orderFilter]);

  async function run(key: string, action: () => Promise<Response>, fallback: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await action();
      if (!response.ok) throw new Error(await readError(response, fallback));
      await reload();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function transition(order: SalesOrder, status: SalesOrderStatus) {
    let note: string | null = null;
    if (status === "a_livrer") {
      note = window.prompt("Informations de livraison (adresse, livreur, créneau) — facultatif", order.fulfillment_note ?? "");
      if (note === null) return;
    } else if (status === "annulee" || status === "refusee") {
      if (!window.confirm(`${ACTION_LABEL[status]} la commande de ${contactLabel(order)} ? Le stock n'est pas remis automatiquement.`)) return;
    }
    void run(
      `order:${order.id}`,
      () =>
        fetch(`/api/v1/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, ...(note !== null ? { fulfillment_note: note.trim() || null } : {}) }),
        }),
      "Statut non modifié.",
    );
  }

  function reviewPayment(order: SalesOrder, proof: PaymentProof, action: "approve" | "reject") {
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt("Motif du refus (le client devra renvoyer une preuve)");
      if (note === null) return;
    } else if (!window.confirm(`Confirmer le paiement de ${formatMoney(order.total_cents, order.currency)} par ${contactLabel(order)} ?`)) {
      return;
    }
    void run(
      `proof:${proof.id}`,
      () =>
        fetch(`/api/v1/orders/${order.id}/payment-proofs/${proof.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note }),
        }),
      "Décision non enregistrée.",
    );
  }

  function uploadProof(order: SalesOrder, file: File) {
    const form = new FormData();
    form.set("file", file);
    void run(
      `order:${order.id}`,
      () => fetch(`/api/v1/orders/${order.id}/payment-proofs/upload`, { method: "POST", body: form }),
      "Preuve non envoyée.",
    );
  }

  const tabs: Array<[View, string, number | null]> = [
    ["proofs", "Preuves", pendingProofs.length],
    ["orders", "Commandes", orders.filter((o) => !CLOSED.includes(o.status)).length],
    ["catalog", "Catalogue", products.filter((p) => p.is_active).length],
  ];

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="flex items-start justify-between gap-3 sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Central vendeur</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            L’assistant conduit la vente jusqu’à la preuve de paiement. Vous seul confirmez le paiement et organisez la livraison.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void reload();
          }}
          className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Actualiser
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Preuves à vérifier", String(pendingProofs.length), pendingProofs.length > 0],
          ["Paiements attendus", String(kpis.awaitingPayment), false],
          ["À livrer", String(kpis.toDeliver), kpis.toDeliver > 0],
          ["Encaissé ce mois", kpis.revenue, false],
        ].map(([label, value, hot]) => (
          <div key={label as string} className={`rounded-xl border bg-card px-3 py-2 sm:p-3 ${hot ? "border-primary/40" : ""}`}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate text-base font-semibold tabular-nums sm:mt-1 sm:text-lg">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-3 rounded-lg border bg-card p-1 text-sm" role="tablist" aria-label="Central vendeur">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeView === key}
            onClick={() => setView(key)}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-1 py-2 transition sm:gap-1.5 sm:px-2 ${
              activeView === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <span className="truncate text-[13px] sm:text-sm">{label}</span>
            {count !== null && count > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${activeView === key ? "bg-primary-foreground/20" : "bg-muted"}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Chargement du Central vendeur…</div>
      ) : activeView === "proofs" ? (
        <ProofsView pendingProofs={pendingProofs} busy={busy} onReview={reviewPayment} />
      ) : activeView === "orders" ? (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrer les commandes">
            {ORDER_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                aria-pressed={orderFilter === filter.key}
                onClick={() => setOrderFilter(filter.key)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                  orderFilter === filter.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {filteredOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucune commande ici. Les commandes sont créées par l’assistant pendant la conversation avec le client.
            </div>
          ) : (
            filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                busy={busy === `order:${order.id}`}
                onTransition={(status) => transition(order, status)}
                onUpload={(file) => uploadProof(order, file)}
              />
            ))
          )}
        </div>
      ) : (
        <CatalogView
          products={products}
          canManage={canManageCatalog}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
          busy={busy}
          onSave={(id, payload) =>
            run(
              id ? `product:${id}` : "product:new",
              () =>
                fetch(id ? `/api/v1/products/${id}` : "/api/v1/products", {
                  method: id ? "PATCH" : "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                }),
              "Produit non enregistré.",
            )
          }
          onArchive={(product) => {
            if (!window.confirm(`Retirer « ${product.title} » du catalogue ? L’assistant ne le proposera plus.`)) return;
            void run(`product:${product.id}`, () => fetch(`/api/v1/products/${product.id}`, { method: "DELETE" }), "Produit non archivé.");
          }}
        />
      )}
    </section>
  );
}

function ProofsView({
  pendingProofs,
  busy,
  onReview,
}: {
  pendingProofs: Array<{ order: SalesOrder; proof: PaymentProof }>;
  busy: string | null;
  onReview: (order: SalesOrder, proof: PaymentProof, action: "approve" | "reject") => void;
}) {
  if (pendingProofs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Aucune preuve à vérifier. Quand un client envoie une capture de paiement, elle apparaît ici.
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {pendingProofs.map(({ order, proof }) => {
        const src = `/api/v1/orders/${order.id}/payment-proofs/${proof.id}/media`;
        const mismatch = proof.amount_cents != null && proof.amount_cents !== order.total_cents;
        return (
          <article key={proof.id} className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
            <a href={src} target="_blank" rel="noreferrer" className="block bg-muted" title="Ouvrir la preuve en grand">
              {proof.mime_type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL signée de courte durée, hors next/image
                <img src={src} alt={`Preuve de paiement de ${contactLabel(order)}`} className="h-56 w-full object-contain" loading="lazy" />
              ) : (
                <span className="flex h-24 items-center justify-center text-sm text-primary underline">Ouvrir le document</span>
              )}
            </a>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{contactLabel(order)}</p>
                  <p className="text-xs text-muted-foreground">
                    {proof.message_id ? "Reçue sur WhatsApp" : "Déposée par l’équipe"} · {new Date(proof.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <p className="shrink-0 text-right font-semibold tabular-nums">{formatMoney(order.total_cents, order.currency)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Montant lu</dt>
                <dd className={mismatch ? "font-medium text-amber-700 dark:text-amber-300" : ""}>
                  {proof.amount_cents != null ? formatMoney(proof.amount_cents, order.currency) : "—"}
                  {mismatch && " (différent du total)"}
                </dd>
                <dt className="text-muted-foreground">Opérateur</dt>
                <dd>{proof.operator || "—"}</dd>
                <dt className="text-muted-foreground">Référence</dt>
                <dd className="break-all">{proof.reference || "—"}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                Vérifiez la transaction sur votre compte avant d’approuver : une capture peut être modifiée.
              </p>
              <div className="mt-auto grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy === `proof:${proof.id}`}
                  onClick={() => onReview(order, proof, "reject")}
                  className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
                >
                  Refuser
                </button>
                <button
                  type="button"
                  disabled={busy === `proof:${proof.id}`}
                  onClick={() => onReview(order, proof, "approve")}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  Paiement reçu
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function OrderCard({
  order,
  busy,
  onTransition,
  onUpload,
}: {
  order: SalesOrder;
  busy: boolean;
  onTransition: (status: SalesOrderStatus) => void;
  onUpload: (file: File) => void;
}) {
  const targets = transitionTargetsSalesOrder(order.status).filter((s) => ACTION_LABEL[s]);
  const proofs = order.payment_proofs ?? [];
  const lastRejected = proofs.find((p) => p.review_status === "rejected" && p.review_note);
  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{contactLabel(order)}</p>
          <p className="text-xs text-muted-foreground">
            #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString("fr-FR")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">{formatMoney(order.total_cents, order.currency)}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[order.status]}`}>
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {(order.sales_order_items ?? []).map((item) => (
          <li key={item.id} className="rounded-full bg-muted px-2 py-1">
            {item.quantity}× {item.product_title}
          </li>
        ))}
      </ul>

      {order.fulfillment_note && <p className="mt-3 rounded-md bg-muted/50 p-2 text-xs">Livraison : {order.fulfillment_note}</p>}
      {order.status === "en_attente_paiement" && lastRejected && (
        <p className="mt-3 text-xs text-destructive">Dernière preuve refusée : {lastRejected.review_note}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/app/inbox?id=${order.conversation_id}`}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
        >
          Ouvrir la conversation
        </Link>
        {order.status === "en_attente_paiement" && (
          <label className="cursor-pointer rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Joindre une preuve
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onUpload(file);
              }}
            />
          </label>
        )}
        <span className="flex-1" />
        {targets.map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy}
            onClick={() => onTransition(status)}
            className={`rounded-md px-3 py-1.5 text-xs disabled:opacity-50 ${
              status === "annulee" || status === "refusee"
                ? "border border-destructive/40 text-destructive hover:bg-destructive/5"
                : "bg-primary font-medium text-primary-foreground"
            }`}
          >
            {ACTION_LABEL[status]}
          </button>
        ))}
      </div>
    </article>
  );
}

interface ProductDraft {
  title: string;
  description: string;
  price: string;
  stock: string;
  currency: string;
}

const EMPTY_DRAFT: ProductDraft = { title: "", description: "", price: "", stock: "", currency: DEVISE_PAR_DEFAUT };

function draftOf(product: Product): ProductDraft {
  return {
    title: product.title,
    description: product.description ?? "",
    price: centsVersSaisie(product.price_cents, product.currency),
    stock: String(product.stock),
    currency: product.currency,
  };
}

function CatalogView({
  products,
  canManage,
  showArchived,
  onToggleArchived,
  busy,
  onSave,
  onArchive,
}: {
  products: Product[];
  canManage: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
  busy: string | null;
  onSave: (id: string | null, payload: Record<string, unknown>) => Promise<boolean>;
  onArchive: (product: Product) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>, id: string | null) {
    event.preventDefault();
    const priceCents = parseMoney(draft.price, draft.currency);
    const stock = Number(draft.stock);
    if (priceCents === null) return setFormError("Prix invalide.");
    if (!Number.isInteger(stock) || stock < 0) return setFormError("Le stock doit être un nombre entier positif.");
    setFormError(null);
    const saved = await onSave(id, {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      price_cents: priceCents,
      stock,
      currency: draft.currency,
    });
    if (saved) {
      setEditing(null);
      setDraft(EMPTY_DRAFT);
    }
  }

  const form = (id: string | null) => (
    <form onSubmit={(event) => void submit(event, id)} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Nom du produit</span>
        <input
          required
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          placeholder="ex. Robe wax « Douala »"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Description</span>
        <textarea
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          placeholder="Description (taille, couleur, détails que l’assistant peut citer)"
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Prix</span>
          <input
            required
            inputMode="decimal"
            value={draft.price}
            onChange={(event) => setDraft({ ...draft, price: event.target.value })}
            placeholder="ex. 15000"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Stock</span>
          <input
            required
            inputMode="numeric"
            value={draft.stock}
            onChange={(event) => setDraft({ ...draft, stock: event.target.value })}
            placeholder="ex. 10"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Devise</span>
          <select
            value={draft.currency}
            onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
            className="w-full rounded-md border bg-background px-2 py-2 text-sm"
          >
            {[...new Set([draft.currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {formError && <p className="text-xs text-destructive">{formError}</p>}
      <div className="flex gap-2">
        {id && (
          <button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            Annuler
          </button>
        )}
        <button
          disabled={busy === (id ? `product:${id}` : "product:new")}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {id ? "Enregistrer" : "Ajouter au catalogue"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={onToggleArchived} />
          Afficher les produits retirés
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {products.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground sm:col-span-2">
              Catalogue vide. L’assistant ne peut proposer que les produits ajoutés ici.
            </div>
          ) : (
            products.map((product) => (
              <article key={product.id} className={`rounded-xl border bg-card p-4 shadow-sm ${product.is_active ? "" : "opacity-60"}`}>
                {editing === product.id ? (
                  form(product.id)
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 break-words font-medium">{product.title}</h2>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-xs ${
                          !product.is_active
                            ? "bg-muted text-muted-foreground"
                            : product.stock > 0
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {!product.is_active ? "Retiré" : product.stock > 0 ? `Stock ${product.stock}` : "Rupture"}
                      </span>
                    </div>
                    {product.description && <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{product.description}</p>}
                    <p className="mt-3 text-xl font-semibold tabular-nums">{formatMoney(product.price_cents, product.currency)}</p>
                    {canManage && (
                      <div className="mt-3 flex justify-end gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(draftOf(product));
                            setFormError(null);
                            setEditing(product.id);
                          }}
                          className="text-primary hover:underline"
                        >
                          Modifier
                        </button>
                        {product.is_active ? (
                          <button type="button" onClick={() => onArchive(product)} className="text-destructive hover:underline">
                            Retirer
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onSave(product.id, { is_active: true })}
                            className="text-primary hover:underline"
                          >
                            Remettre en vente
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </article>
            ))
          )}
        </div>
      </div>
      {canManage && editing === null && (
        <div className="h-fit rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="font-semibold">Ajouter un produit</h2>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            L’assistant cite ce prix et ce stock tels quels ; le total d’une commande est toujours recalculé par le système.
          </p>
          {form(null)}
        </div>
      )}
    </div>
  );
}
