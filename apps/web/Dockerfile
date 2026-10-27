# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates

# Monorepo deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/package.json ./packages/db/package.json

RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app

# Prisma verwendet die musl/OpenSSL-3-Engine auf Alpine.
RUN apk add --no-cache openssl ca-certificates

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma generate im workspace
RUN npm run db:generate
RUN npm run build -w @chrisg/web

FROM node:24-alpine AS runner
WORKDIR /app

# Prisma benötigt OpenSSL auch zur Laufzeit.
RUN apk add --no-cache openssl ca-certificates

ENV NODE_ENV=production

# minimal runtime
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
