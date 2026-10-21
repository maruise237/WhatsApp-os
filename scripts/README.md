# scripts/

Utilitaires en ligne de commande pour l'exploitation locale et de production.

## Liste

- `seed-tenant.ts` — Crée une organisation manuellement (mode BPO). Placeholder ; implémentation dans la Spec 01.

## Conventions

- Tous en TypeScript (exécuter via `npx tsx scripts/<nom>.ts`)
- Toujours valider les entrées avec Zod
- Journaliser via `console.error` (stderr) pour les messages opérationnels ; `console.log` (stdout) seulement pour une sortie structurée consommable par un pipe
- Les opérations destructives exigent l'option `--confirm` ou une invite interactive
- Toute mutation pertinente génère une entrée dans `api_audit_log` avec `actor=script:<nom>`
