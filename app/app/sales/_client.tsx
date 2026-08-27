"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  review_status: "pending" | "approved" | "rejected";
  amount_cents?: number | null;
  reference?: string | null;
  created_at: string;
}

interface SalesOrder {
  id: string;
  status: string;
  total_cents: number;
  currency: string;
  contact_id: string;
  created_at: string;
  sales_order_items?: OrderItem[];
  payment_proofs?: PaymentProof[];
}

interface SalesCentralProps {
  canManageCatalog: boolean;
}

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) return (body as { data: T }).data;
  return body as T;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

const statusLabel: Record<string, string> = {
  en_cours: "En cours",
  en_attente_paiement: "Paiement à vérifier",
  payée: "Payée",
  a_livrer: "À livrer",
  livree: "Livrée",
  refusee: "Refusée",
  annulee: "Annulée",
};

export function SalesCentral({ canManageCatalog }: SalesCentralProps) {
  const [view, setView] = useState<"catalog" | "orders" | "proofs">("catalog");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", price: "", stock: "", currency: "BRL" });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsResponse, ordersResponse] = await Promise.all([
        fetch("/api/v1/products", { cache: "no-store" }),
        fetch("/api/v1/orders", { cache: "no-store" }),
      ]);
      const productsBody = await productsResponse.json();
      const ordersBody = await ordersResponse.json();
      if (!productsResponse.ok) throw new Error(productsBody?.error?.message ?? "Catalogue indisponible");
      if (!ordersResponse.ok) throw new Error(ordersBody?.error?.message ?? "Commandes indisponibles");
      setProducts(unwrap<Product[]>(productsBody) ?? []);
      setOrders(unwrap<SalesOrder[]>(ordersBody) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger le Central vendeur.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendingProofs = useMemo(
    () => orders.flatMap((order) => (order.payment_proofs ?? []).filter((proof) => proof.review_status === "pending").map((proof) => ({ order, proof }))),
    [orders],
  );

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          price_cents: Math.round(Number(form.price.replace(",", ".")) * 100),
          stock: Number(form.stock),
          currency: form.currency,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Produit non créé");
      setForm({ title: "", price: "", stock: "", currency: "BRL" });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Produit non créé.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct(id: string) {
    if (!window.confirm("Archiver ce produit du catalogue ?")) return;
    const response = await fetch(`/api/v1/products/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Produit non archivé.");
      return;
    }
    await reload();
  }

  async function reviewPayment(orderId: string, proofId: string, action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt("Motif du refus (facultatif)") : null;
    const response = await fetch(`/api/v1/orders/${orderId}/payment-proofs/${proofId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Décision non enregistrée.");
      return;
    }
    await reload();
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Sales OS</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Central vendeur</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Le catalogue, les commandes et les preuves de paiement dans un seul espace. Une preuve reste humaine jusqu’à la décision.
          </p>
        </div>
        <button type="button" onClick={() => void reload()} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          Actualiser
        </button>
      </header>

      <div className="grid grid-cols-3 rounded-lg border bg-card p-1 text-sm" role="tablist" aria-label="Central vendeur">
        {([
          ["catalog", "Catalogue"],
          ["orders", `Commandes (${orders.length})`],
          ["proofs", `À vérifier (${pendingProofs.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`rounded-md px-2 py-2 transition ${view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {loading ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Chargement du Central vendeur…</div>
      ) : view === "catalog" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid gap-3 sm:grid-cols-2">
            {products.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground sm:col-span-2">Aucun produit actif dans le catalogue.</div>
            ) : products.map((product) => (
              <article key={product.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium">{product.title}</h2>
                  <span className={`rounded-full px-2 py-1 text-xs ${product.stock > 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>
                    Stock {product.stock}
                  </span>
                </div>
                <p className="mt-4 text-xl font-semibold">{formatMoney(product.price_cents, product.currency)}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{product.currency}</span>
                  {canManageCatalog && <button type="button" onClick={() => void archiveProduct(product.id)} className="text-destructive hover:underline">Archiver</button>}
                </div>
              </article>
            ))}
          </div>
          {canManageCatalog && (
            <form onSubmit={createProduct} className="h-fit rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="font-semibold">Ajouter un produit</h2>
              <p className="mt-1 text-xs text-muted-foreground">Le prix est stocké en centimes et recalculé côté serveur dans la commande.</p>
              <div className="mt-4 space-y-3">
                <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Nom du produit" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input required inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="Prix" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                  <input required inputMode="numeric" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} placeholder="Stock" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </div>
                <input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} maxLength={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm uppercase" />
                <button disabled={saving} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Enregistrement…" : "Ajouter au catalogue"}</button>
              </div>
            </form>
          )}
        </div>
      ) : view === "orders" ? (
        <div className="space-y-3">
          {orders.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">Aucune commande.</div> : orders.map((order) => (
            <article key={order.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-medium">Commande #{order.id.slice(0, 8)}</p><p className="text-xs text-muted-foreground">Contact {order.contact_id.slice(0, 8)} · {new Date(order.created_at).toLocaleString("fr-FR")}</p></div>
                <div className="text-right"><p className="font-semibold">{formatMoney(order.total_cents, order.currency)}</p><span className="text-xs text-muted-foreground">{statusLabel[order.status] ?? order.status}</span></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{(order.sales_order_items ?? []).map((item) => <span key={item.id} className="rounded-full bg-muted px-2 py-1">{item.quantity}× {item.product_title}</span>)}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {pendingProofs.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">Aucune preuve à vérifier. Les commandes restent protégées par la validation humaine.</div> : pendingProofs.map(({ order, proof }) => (
            <article key={proof.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-medium">Preuve pour #{order.id.slice(0, 8)}</p><p className="text-xs text-muted-foreground">{proof.mime_type} · reçue le {new Date(proof.created_at).toLocaleString("fr-FR")}</p><p className="mt-2 text-sm">{proof.reference || "Aucune référence déclarée"}</p></div>
                <div className="flex gap-2"><button type="button" onClick={() => void reviewPayment(order.id, proof.id, "reject")} className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/5">Refuser</button><button type="button" onClick={() => void reviewPayment(order.id, proof.id, "approve")} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Approuver</button></div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
