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

# LLM
ENV LLM_BASE_URL=https://aiping.cn/api/v1
ENV LLM_API_KEY=QC-bf1abcef0d24bbcfd549b61bc6d335ba-2f1e7634b1e33338a58c48e09a929c44
ENV LLM_MODEL=Qwen3.5-Flash

# MySQL
ENV DB_HOST=192.168.1.111
ENV DB_PORT=53306
ENV DB_USERNAME=hanvon
ENV DB_PASSWORD=hanvon123
ENV DB_DATABASE=aitool

# Redis
ENV REDIS_HOST=192.168.1.166
ENV REDIS_PORT=56379
ENV REDIS_PASSWORD=digital@Library
ENV REDIS_DB=0

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
