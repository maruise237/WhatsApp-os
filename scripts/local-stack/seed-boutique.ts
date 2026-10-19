/**
 * Données de démonstration pour la pile locale : une boutique de wax à Douala.
 *
 * Catalogue en FCFA, quatre clientes avec leurs conversations WhatsApp, et des
 * ventes à toutes les étapes. Les commandes et la preuve de paiement passent par
 * les VRAIS outils de l'agent (`lib/agent-engine/agent/sales-tools.ts`), comme si
 * l'IA avait conduit la vente : c'est ce chemin-là que l'écran doit montrer.
 *
 *   pnpm tsx scripts/local-stack/seed-boutique.ts <org_id>
 * (env de .superpowers/local-stack.env chargé par l'appelant)
 */
import { readFileSync } from "node:fs";

import { CreateBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";

import {
  applyCreateOrderDraft,
  applyRegisterPaymentProof,
  applyRequestPaymentProof,
  applySearchCatalog,
} from "@/lib/agent-engine/agent/sales-tools";

const ORG = process.argv[2];
if (!ORG) throw new Error("usage: seed-boutique.ts <org_id>");
const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL });
const s3 = new S3Client({
  endpoint: process.env.SEAWEEDFS_S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.SEAWEEDFS_S3_ACCESS_KEY!, secretAccessKey: process.env.SEAWEEDFS_S3_SECRET_KEY! },
});

const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);

async function main() {
  for (const bucket of ["whatsapp-media", process.env.SEAWEEDFS_MEDIA_BUCKET ?? "media-bucket"]) {
    await s3.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => undefined);
  }

  const { rows: sess } = await q(
    `insert into channel_sessions (organization_id, provider, waha_session_name, evolution_instance_name, status, webhook_secret_encrypted)
     values ($1, 'evolution_go', 'boutique-awa', 'boutique-awa', 'WORKING', '\\x00'::bytea) returning id`,
    [ORG],
  );
  const session = sess[0].id as string;

  const produits = [
    ["Robe wax « Douala »", "Robe longue en wax 100 % coton, tailles S à XXL, coupe évasée.", 1500000, 6],
    ["Ensemble pagne homme", "Chemise + pantalon en pagne, tailles M à XXL.", 2200000, 4],
    ["Sac à main en raphia", "Sac tressé main, anses en cuir, 35 × 25 cm.", 950000, 10],
    ["Foulard de tête assorti", "Foulard wax 180 × 50 cm, assorti aux robes.", 350000, 25],
    ["Boucles d’oreilles perles", "Perles de verre colorées, fermoir doré.", 250000, 0],
  ] as const;
  for (const [title, description, price, stock] of produits) {
    await q(
      `insert into products (organization_id, title, description, price_cents, currency, stock) values ($1,$2,$3,$4,'XAF',$5)`,
      [ORG, title, description, price, stock],
    );
  }

  const clientes = [
    ["Mireille Ngo", "+237690112233"],
    ["Jean-Paul Essomba", "+237677445566"],
    ["Fatou Diallo", "+221771234567"],
    ["Brice Kamga", "+237655998877"],
  ] as const;
  const conv: Record<string, { contact: string; conversation: string }> = {};
  for (const [name, phone] of clientes) {
    const { rows: c } = await q(
      `insert into contacts (organization_id, name, display_name, phone_number) values ($1,$2,$2,$3) returning id`,
      [ORG, name, phone],
    );
    const { rows: v } = await q(
      `insert into conversations (organization_id, contact_id, channel_session_id, status, is_group)
       values ($1,$2,$3,'open',false) returning id`,
      [ORG, c[0].id, session],
    );
    conv[name] = { contact: c[0].id, conversation: v[0].id };
  }

  let minute = 0;
  async function message(name: string, direction: "inbound" | "outbound", body: string | null, media?: { path: string; mime: string }) {
    const { contact, conversation } = conv[name]!;
    minute += 2;
    await q(
      `insert into messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, body,
                             sent_via, sent_at, created_at, media_storage_path, media_mime)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - make_interval(mins => 120 - $10), now() - make_interval(mins => 120 - $10), $11, $12)`,
      [
        ORG, conversation, session, contact, media ? "image" : "text", direction,
        direction === "inbound" ? "received" : "delivered", body,
        direction === "inbound" ? "external_device" : "ai", minute, media?.path ?? null, media?.mime ?? null,
      ],
    );
  }

  // Mireille : vente complète conduite par l'agent, preuve envoyée → à vérifier.
  await message("Mireille Ngo", "inbound", "Bonjour, vous avez encore la robe wax en taille L ?");
  const scopeMireille = { tenantId: ORG, conversationId: conv["Mireille Ngo"]!.conversation, jobId: "demo-mireille" };
  const catalogue = await applySearchCatalog(pool, scopeMireille, { query: "robe" });
  const robe = (catalogue as { products: Array<{ product_id: string }> }).products[0]!.product_id;
  await message("Mireille Ngo", "outbound", "Bonjour Mireille ! Je suis l’assistant de Boutique Awa. Oui, la robe wax « Douala » est disponible en L, à 15 000 FCFA.");
  await message("Mireille Ngo", "inbound", "Je prends 2, une pour ma sœur.");
  await applyCreateOrderDraft(pool, scopeMireille, { items: [{ product_id: robe, quantity: 2 }] });
  await message("Mireille Ngo", "outbound", "Parfait : 2 robes wax « Douala », total 30 000 FCFA. Vous confirmez ?");
  await message("Mireille Ngo", "inbound", "Oui je confirme");
  await applyRequestPaymentProof(pool, scopeMireille, {});
  await message("Mireille Ngo", "outbound", "Merci ! Vous pouvez payer par Mobile Money au 6 77 12 34 56 (Boutique Awa), puis m’envoyer la capture du paiement.");
  const recu = `${ORG}/conversations/recu-mireille.png`;
  await s3.send(new PutObjectCommand({
    Bucket: "whatsapp-media", Key: recu, Body: readFileSync(".superpowers/local-stack/fixtures/recu-mobile-money.png"), ContentType: "image/png",
  }));
  await message("Mireille Ngo", "inbound", null, { path: recu, mime: "image/png" });
  await applyRegisterPaymentProof(pool, scopeMireille, { amount_cents: 3000000, operator: "Mobile Money", reference: "MP261019.1412.C48213" });
  await message("Mireille Ngo", "outbound", "Capture bien reçue 🙏 Le vendeur vérifie le paiement et revient vers vous très vite.");

  // Jean-Paul : commande en attente de paiement (pas encore de capture).
  const scopeJP = { tenantId: ORG, conversationId: conv["Jean-Paul Essomba"]!.conversation, jobId: "demo-jp" };
  await message("Jean-Paul Essomba", "inbound", "Bonsoir, l’ensemble pagne homme existe en XL ?");
  const ens = (await applySearchCatalog(pool, scopeJP, { query: "ensemble" })) as { products: Array<{ product_id: string }> };
  await applyCreateOrderDraft(pool, scopeJP, { items: [{ product_id: ens.products[0]!.product_id, quantity: 1 }] });
  await applyRequestPaymentProof(pool, scopeJP, {});
  await message("Jean-Paul Essomba", "outbound", "Oui, en XL. Total 22 000 FCFA, paiement par Mobile Money au 6 77 12 34 56.");

  // Fatou : commande déjà payée (validée par la vendeuse hier) → à préparer.
  const scopeFatou = { tenantId: ORG, conversationId: conv["Fatou Diallo"]!.conversation, jobId: "demo-fatou" };
  await message("Fatou Diallo", "inbound", "Je voudrais le sac en raphia et 2 foulards.");
  const sac = (await applySearchCatalog(pool, scopeFatou, { query: "raphia" })) as { products: Array<{ product_id: string }> };
  const foulard = (await applySearchCatalog(pool, scopeFatou, { query: "foulard" })) as { products: Array<{ product_id: string }> };
  const cmdFatou = (await applyCreateOrderDraft(pool, scopeFatou, {
    items: [{ product_id: sac.products[0]!.product_id, quantity: 1 }, { product_id: foulard.products[0]!.product_id, quantity: 2 }],
  })) as { order_id: string };
  const { rows: owner } = await q(`select user_id from user_organizations where organization_id = $1 limit 1`, [ORG]);
  await q(
    `update sales_orders set status = 'payée', paid_at = now() - interval '1 day', paid_by_user_id = $2 where id = $1`,
    [cmdFatou.order_id, owner[0].user_id],
  );

  // Brice : commande livrée la semaine dernière.
  const scopeBrice = { tenantId: ORG, conversationId: conv["Brice Kamga"]!.conversation, jobId: "demo-brice" };
  await message("Brice Kamga", "inbound", "Merci, j’ai bien reçu la robe pour ma femme, elle adore !");
  const cmdBrice = (await applyCreateOrderDraft(pool, scopeBrice, { items: [{ product_id: robe, quantity: 1 }] })) as { order_id: string };
  await q(
    `update sales_orders set status = 'payée', paid_at = now() - interval '6 days', paid_by_user_id = $2 where id = $1`,
    [cmdBrice.order_id, owner[0].user_id],
  );
  await q(`update sales_orders set status = 'a_livrer', fulfillment_note = 'Livraison Bonamoussadi, moto-taxi' where id = $1`, [cmdBrice.order_id]);
  await q(`update sales_orders set status = 'livree' where id = $1`, [cmdBrice.order_id]);

  const { rows } = await q(`select status, count(*)::int from sales_orders where organization_id = $1 group by 1 order by 1`, [ORG]);
  process.stdout.write(`commandes : ${JSON.stringify(rows)}\n`);
  await pool.end();
}

void main();
