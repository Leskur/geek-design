# syntax=docker/dockerfile:1
ARG NODE_VERSION=24.16.0
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    SKETCHPEEK_HOST=0.0.0.0 \
    SKETCHPEEK_PORT=5174 \
    SKETCHPEEK_DATA_DIR=/app/data
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data && chown node:node /app/data
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/.server-build ./.server-build
COPY --chown=node:node package.json LICENSE ./
USER node
EXPOSE 5174
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:5174/api/status',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".server-build/index.mjs"]
