# ---- build stage: install + compile with bun ----
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID

RUN bun run build

# ---- prod deps stage: production-only node_modules for the runtime ----
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# ---- runtime stage: plain Node, no build tooling ----
FROM node:24-slim AS runtime

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOST=0.0.0.0

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist/server.cjs"]
