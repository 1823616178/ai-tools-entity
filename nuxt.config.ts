// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  nitro: {
    externals: {
      inline: [],
    },
  },
  runtimeConfig: {
    db: {
      host: process.env.DB_HOST || '192.168.1.111',
      port: parseInt(process.env.DB_PORT || '53306', 10),
      username: process.env.DB_USERNAME || 'hanvon',
      password: process.env.DB_PASSWORD || 'hanvon123',
      database: process.env.DB_DATABASE || 'aitool',
    },
    redis: {
      host: process.env.REDIS_HOST || '192.168.1.166',
      port: parseInt(process.env.REDIS_PORT || '56379', 10),
      password: process.env.REDIS_PASSWORD || 'digital@Library',
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    ner: {
      apiUrl: process.env.NER_API_URL || 'http://192.168.1.45:54104/predict',
    },
    llm: {
      baseUrl: process.env.LLM_BASE_URL || 'https://aiping.cn/api/v1',
      apiKey: process.env.LLM_API_KEY || 'QC-bf1abcef0d24bbcfd549b61bc6d335ba-2f1e7634b1e33338a58c48e09a929c44',
      model: process.env.LLM_MODEL || 'Qwen3.5-Flash',
    },
  },
})
