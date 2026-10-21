# Migrations

Appliquées dans l'ordre par `scripts/db-migrate.mjs` (suivi dans
`public.schema_migrations`). Chaque fichier est idempotent.

| Version | Fichier | Contenu |
|---|---|---|
| 0001 | `0001_schema_initial` | Schéma complet : tables, RLS, fonctions, droits. Consolide tout l'historique antérieur (dont le vocabulaire des canaux, le carimbo `phone_lookup_at`, la recherche plein texte et les défauts Afrique). |

Nouvelle migration : `NNNN_nom_court.sql`, idempotente, une ligne ici.
