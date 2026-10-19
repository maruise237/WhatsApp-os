FROM node:22-alpine

# Procédence (doctrine de packaging, invariant 2) : image publiée par le CI
# (.github/workflows/publish-image.yml), jamais construite sur la VPS.
LABEL org.opencontainers.image.source="https://github.com/maruise237/WhatsApp-os" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="WhatsApp OS gateway"

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

ENV NODE_ENV=production
WORKDIR /app

COPY server.mjs ./server.mjs

USER node
EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8788/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
