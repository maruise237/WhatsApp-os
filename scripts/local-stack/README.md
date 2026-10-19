# Pile locale — tester l'app comme sur une VPS fraîche, par l'écran

L'app dépend de deux services hébergés par Neon (authentification et Data API). Cette
pile les recrée en local pour pouvoir dérouler les parcours dans un vrai navigateur :

| Service hébergé | Remplaçant local | Port |
|---|---|---|
| Postgres Neon | `pgvector/pgvector:pg17` + `supabase/baseline.sql` (même prélude que `scripts/test-db.sh`) | 54340 |
| Neon Auth | `auth-server.mjs` — Better Auth (la brique de Neon Auth) avec cookies `__Secure-neon-auth.*` et JWT RS256 dans `set-auth-jwt` | 3100 |
| Neon Data API | PostgREST v12, JWT vérifié contre le `/jwks` du serveur d'auth | 3001 |
| Stockage médias | SeaweedFS S3 | 8333 |

## Démarrer

```bash
bash scripts/local-stack/up.sh          # base fraîche + services, écrit .superpowers/local-stack.env
pnpm build
set -a; . .superpowers/local-stack.env; set +a; pnpm next start -p 3000
```

Créer la vendeuse et sa boutique (le compte passe par le vrai Better Auth) :

```bash
curl -s -H "Origin: http://localhost:3000" -H "Content-Type: application/json" \
  http://127.0.0.1:3100/api/auth/sign-up/email \
  -d '{"email":"awa@boutique.cm","password":"Vente2026!secure","name":"Awa Mbarga"}'
docker exec -i wos-local-db psql -U postgres -c "
  insert into organizations (id, slug, legal_name, display_name)
    values ('0b0b0b0b-0000-4000-8000-000000000001','boutique-awa','Boutique Awa SARL','Boutique Awa');
  insert into user_organizations (user_id, organization_id, role, accepted_at)
    select id, '0b0b0b0b-0000-4000-8000-000000000001', 'admin', now()
      from neon_auth.\"user\" where email = 'awa@boutique.cm';"
```

Se connecter sur http://localhost:3000, faire l'onboarding, puis remplir la boutique :

```bash
set -a; . .superpowers/local-stack.env; set +a
pnpm tsx scripts/local-stack/seed-boutique.ts 0b0b0b0b-0000-4000-8000-000000000001
```

Les commandes et la preuve de paiement passent par les **vrais outils de l'agent**
(`lib/agent-engine/agent/sales-tools.ts`), comme si l'IA avait conduit la vente.

## Vérifier par l'écran (mobile 390 px)

```bash
node scripts/local-stack/parcours-ventes.mjs .superpowers/evidence/parcours   # parcours de vente, une capture par étape
node scripts/local-stack/audit-ecrans.mjs .superpowers/evidence/audit /app/sales /app/inbox …   # débordement, portugais, erreurs JS
```

## Arrêter

```bash
bash scripts/local-stack/down.sh   # données jetées : chaque up.sh repart d'une base vierge
```

## Ce que la pile ne couvre pas

Pas de WhatsApp réel (ni Evolution Go, ni gateway), pas de clé d'IA : l'assistant ne
répond pas tout seul. Les conversations de démonstration sont écrites en base, et les
ventes passent par les outils de l'agent appelés directement.
