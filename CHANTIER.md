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
- [ ] PR branche → main, fusion

### B. Neon seulement (zéro Supabase)
- [ ] Inventaire : ce que fait encore Supabase au runtime (realtime, storage, auth, types)
- [ ] Remplacer les types `@supabase/*` par des types maison, retirer les dépendances
- [ ] `lib/supabase/*` → `lib/db/*` (codemod des imports), suppression
- [ ] Dossier `supabase/` → `db/` (baseline, migrations, MANIFEST), chemins des scripts/CI/Docker
- [ ] Supprimer `supabase/config.toml`, `supabase/templates`, variables d'env `SUPABASE_*`
- [ ] Noms de variables `supabase` → `db` dans le code
- [ ] `test:db` et CI sur la pile locale Neon (Postgres + PostgREST + auth locale)

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

## Journal
- 2026-10-21 : plan posé ; tests e2e agent/onboarding réécrits (94e2d52).
