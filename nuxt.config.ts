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
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'aitool',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    llm: {
      baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.LLM_API_KEY || '',
      model: process.env.LLM_MODEL || 'gpt-4o',
    },
  },
})
