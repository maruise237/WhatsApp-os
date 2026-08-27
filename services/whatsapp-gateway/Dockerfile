FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY server.mjs ./server.mjs

USER node
EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8788/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
