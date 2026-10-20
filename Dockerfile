# syntax=docker/dockerfile:1
# WhatsApp OS — image de production auto-hébergée (Next.js standalone).
# Build: docker build --build-arg NEXT_PUBLIC_NEON_DATA_API_URL=... -t whatsapp-os .

# ---- deps : installe les dépendances (couche mise en cache) ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build : génère .next/standalone ----
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# IMAGE GÉNÉRIQUE : les NEXT_PUBLIC_* reçoivent des placeholders au build. Les valeurs
# RÉELLES de l'utilisateur sont injectées à l'EXÉCUTION — dans le navigateur via <PublicEnvScript/>
# (window.__PUBLIC_ENV__) et dans le serveur via lib/env.ts (qui analyse process.env à
# l'exécution). Ainsi UNE image sert n'importe quel projet Neon, sans rebuild.
# (Les secrets d'exécution N'entrent JAMAIS dans le build — garde de phase dans lib/env.ts.)
ARG NEXT_PUBLIC_NEON_AUTH_BASE_URL=https://placeholder.invalid
ARG NEXT_PUBLIC_NEON_DATA_API_URL=https://placeholder.invalid
ARG NEXT_PUBLIC_APP_URL=https://placeholder.invalid
ARG NEXT_PUBLIC_ADMIN_URL=https://placeholder.invalid
# Le build de Next est gourmand : le heap par défaut de Node (~2 Go) déborde. NODE_OPTIONS
# le monte à 4 Go. C'est un coût pour QUI CONSTRUIT — la CI —, pas pour qui installe : le
# chemin normal de l'auto-hébergeur est `docker compose pull`, et install.sh ne
# construit pas l'app. Construire sur le VPS est l'override optionnel de docker-compose.build.yml,
# et c'est là que s'applique l'exigence de RAM du build (docs/runbooks/deploy.md §4).
ENV NEXT_PUBLIC_NEON_AUTH_BASE_URL=$NEXT_PUBLIC_NEON_AUTH_BASE_URL \
    NEXT_PUBLIC_NEON_DATA_API_URL=$NEXT_PUBLIC_NEON_DATA_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=4096

# Turbopack (`pnpm build`) : ~4 min contre ~34 min pour webpack sur un VPS. Le bloc `webpack:`
# de Sentry (tree-shake + upload des sourcemaps au build) est ignoré, mais le
# Sentry à l'EXÉCUTION reste actif (DSN codé en dur dans les configs). L'upload des sourcemaps
# ne concerne que Vercel ; ici, le gain de temps de build est ce qui compte pour le non-initié.
RUN pnpm build

# ---- runner : image de production allégée ----
FROM node:22-alpine AS runner
WORKDIR /app

# Provenance (doctrine de packaging, invariant 2). La CI injecte déjà les labels
# OCI via docker/metadata-action ; ceux-ci sont une défense en profondeur — ils valent
# pour tout build, y compris le build local de docker-compose.build.yml, qui ne
# passe pas par metadata-action et sans cela sortirait sans aucune origine.
LABEL org.opencontainers.image.source="https://github.com/maruise237/WhatsApp-os" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="WhatsApp OS"

# La version que rapporte /api/v1/health (invariant 7). Elle doit venir par ARG : l'
# alternative précédente était `process.env.npm_package_version`, qui vaut `undefined`
# sous `CMD ["node","server.js"]` — elle n'existe que quand le processus naît d'un
# `npm`/`pnpm run`. Toutes les installations du monde rapportaient la valeur de repli « 0.1.0 ».
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=$APP_VERSION
# ffmpeg : la dérivation vidéo (Vague 3.1) tourne dans le processus de l'app — le cron
# event-log-drain exécute le handler media_derive, qui appelle `ffmpeg` via spawn
# pour extraire audio+images. Sans le binaire, toute vidéo reçue échoue à la dérivation.
RUN apk add --no-cache ffmpeg
# non-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# La sortie standalone N'inclut PAS public/ ni .next/static — à copier explicitement,
# sinon CSS/JS/assets renvoient 404 (app « sans style »).
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
# server.js est le point d'entrée généré par la sortie standalone.
CMD ["node", "server.js"]
