FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV LLM_BASE_URL=https://aiping.cn/api/v1
ENV LLM_API_KEY=QC-bf1abcef0d24bbcfd549b61bc6d335ba-2f1e7634b1e33338a58c48e09a929c44
ENV LLM_MODEL=Qwen3.5-Flash

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV LLM_BASE_URL=https://aiping.cn/api/v1
ENV LLM_API_KEY=QC-bf1abcef0d24bbcfd549b61bc6d335ba-2f1e7634b1e33338a58c48e09a929c44
ENV LLM_MODEL=Qwen3.5-Flash

COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
