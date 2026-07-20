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
      host: '192.168.1.111',
      port: 53306,
      username: 'hanvon',
      password: 'hanvon123',
      database: 'aitool',
    },
    redis: {
      host: '192.168.1.166',
      port: 56379,
      password: 'digital@Library',
      db: 0,
    },
    ner: {
      apiUrl: 'http://192.168.1.45:54104/predict',
    },
    llm: {
      baseUrl: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: 'sk-0c5773fdc60d46b7afd79caa6cb2ce97',
      model: 'deepseek-v4-flash',
      maxInputTokens: 8000,
    },
    paddleOcr: {
      apiUrl: 'http://192.168.1.45:8000/ocr',
    },
    documentRecommendedQuestions: {
      questionCount: 3,
    },
    documentQuestionAnswer: {
      answerMaxLength: 800,
    },
    logDir: './logs',
  },
})
