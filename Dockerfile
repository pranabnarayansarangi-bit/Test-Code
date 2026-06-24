# Narayan — WhatsApp executive assistant
# Multi-stage: build TypeScript, then run a slim runtime image.
FROM node:22-slim AS build
WORKDIR /app

# Build toolchain for better-sqlite3 (native module) + git for the Baileys libsignal dep.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Reinstall production deps in the runtime image so the native better-sqlite3 binary
# matches this image's libc/node ABI.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
  && apt-get purge -y make g++ && apt-get autoremove -y || true

COPY --from=build /app/dist ./dist

# auth_state/ and data/ are bind/volume mounted at runtime (see docker-compose.yml).
CMD ["node", "dist/index.js"]
