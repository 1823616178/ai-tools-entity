# ---- Builder Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# ---- Production Stage ----
FROM node:22-alpine AS runner

WORKDIR /app

# ---- Environment Variables ----
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# ---- Setup ----
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nuxt -u 1001

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

COPY --from=builder --chown=nuxt:nodejs /app/.output ./.output

RUN mkdir -p logs && chown nuxt:nodejs logs

USER nuxt

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", ".output/server/index.mjs"]
