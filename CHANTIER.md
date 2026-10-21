# Chantier : application 100 % Neon, 100 % française, prête pour Dokploy

> Fichier de reprise. Toute session (manuelle ou relancée automatiquement) lit
> ce fichier d'abord, reprend à la première case non cochée, coche ce qui est
> fait, ajoute une ligne au journal, commit et pousse. À supprimer à la fin.

Branche de travail : `claude/relaxed-edison-o4hxpi` → fusion dans `main` par PR
à chaque phase terminée (demande explicite du propriétaire).

## Objectif (mot du propriétaire)

L'app fonctionne parfaitement, **sans trace de Supabase** (Neon seulement),
**sans trace de portugais**, documentation et README neufs (ce n'est plus le
même projet), suppression de ce qui ne sert plus, tous les bugs corrigés,
optimisée pour tourner dans un conteneur **Dokploy** sans consommer trop de
ressources, tout fusionné sur `main`.

## Phases

### A. Stabiliser et fusionner l'existant
- [x] PR branche → main, fusion (#14)

### B. Neon seulement (zéro Supabase)
- [x] Inventaire : runtime déjà sur Neon (SSE, SeaweedFS, Neon Auth) ; restaient noms, types, schéma, tests
- [x] Types `@supabase/*` remplacés par `DbClient` (lib/db/client.ts)
- [ ] Retirer `@supabase/ssr` et `@supabase/supabase-js` du package.json (reste : harnais e2e + seeds scripts/)
- [x] `lib/supabase/*` → `lib/db/*`
- [x] `db/migrations/0001_schema_initial.sql` (schéma complet régénéré) + `scripts/db-migrate.mjs` + `db/local/emulation-neon.sql`
- [ ] Supprimer le dossier `supabase/` (après CI/e2e/kit)
- [ ] Supprimer `supabase/config.toml`, `supabase/templates`, variables d'env `SUPABASE_*`
- [ ] Noms de variables `supabase` → `db` dans le code
- [x] `test:db` sur le schéma Neon : 908/908
- [ ] CI (ci.yml / e2e.yml) sur le schéma Neon

### C. Ménage
- [ ] Supprimer : `evidence/`, `loop/`, `triagem/`, `plan/`, `tasks/`, `.codex/`, `.agents/`, agents/skills `.claude` obsolètes, `vercel.ts`, kit HostGator si remplacé par Dokploy
- [ ] Specs e2e : porter sur la pile locale ou supprimer les obsolètes ; CI e2e verte
- [ ] Dépendances inutilisées (knip / depcheck)

### D. Dokploy léger
- [ ] Compose Dokploy : limites mémoire/CPU, healthchecks, un seul process quand possible
- [ ] Image app `output: standalone`, taille et RAM mesurées
- [ ] Doc de déploiement Dokploy pas à pas

### E. Zéro portugais
- [ ] Interface : textes français en dur, suppression du dictionnaire pt→fr
- [ ] Messages API, e-mails, PDF, prompts IA, logs visibles
- [ ] Commentaires et noms de tests (par lots)
- [ ] Noms de fichiers/identifiants visibles (par lots)

### F. Documentation neuve
- [ ] README.md
- [ ] `docs/` réécrit (court, français), anciens docs supprimés
- [ ] CLAUDE.md / AGENTS.md réécrits pour le nouveau projet

### G. Vérification finale
- [ ] Parcours complet par l'écran sur pile locale (onboarding → vente → preuve → livraison)
- [ ] typecheck, lint, unit, test:db, build, image Docker
- [ ] Fusion finale sur main, suppression de ce fichier et de la tâche planifiée

## Décisions en attente du propriétaire

- **MFA (vérification en deux étapes)** : Neon Auth ne le gère pas pour les
  utilisateurs de l'app ; les écrans MFA ne peuvent pas marcher (et activer la
  politique « MFA obligatoire » bloquerait les admins). Proposition : retirer la
  fonctionnalité. Le classifieur de sécurité refuse de le faire sans accord
  explicite → NE PAS retirer tant que le propriétaire n'a pas dit oui.

## Journal
- 2026-10-21 : plan posé ; tests e2e agent/onboarding réécrits (94e2d52).
- 2026-10-21 : schéma Neon unique et complet (faille grant-all-to-anon et commande inter-boutiques corrigées), test:db 908/908, DbClient typé, typecheck/lint/unit verts (74c1e01).
