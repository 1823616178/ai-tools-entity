// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  hooks: {
    'nitro:config': (nitroConfig) => {
      // 确保TypeORM实体文件被正确处理
      nitroConfig.externals = nitroConfig.externals || {}
      nitroConfig.externals.inline = nitroConfig.externals.inline || []
      if (Array.isArray(nitroConfig.externals.inline)) {
        nitroConfig.externals.inline.push('typeorm')
      }
    },
  },
})
