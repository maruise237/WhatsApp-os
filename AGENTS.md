# AGENTS.md

Instructions pour les agents de code (Codex, Cursor, Copilot…).
La référence unique est [CLAUDE.md](CLAUDE.md) : pile, règles non négociables,
commandes et définition de « terminé ». Lisez-le avant toute modification.

Résumé :

- Neon (Postgres + Neon Auth + Data API), Next.js 16, TypeScript strict.
- Toute table métier est isolée par `organization_id` + RLS ; le client admin
  filtre l'organisation lui-même.
- Schéma : `db/migrations/` (idempotent, MANIFEST), appliqué par `scripts/db-migrate.mjs`.
- Tout texte visible en français.
- Avant de proposer un changement : `pnpm typecheck && pnpm lint && pnpm test:unit`
  (+ `pnpm test:db` si le schéma change).
