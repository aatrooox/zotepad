import { readFileSync } from 'node:fs'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineNuxtConfig({

  modules: ['@nuxt/icon', '@nuxt/eslint', 'shadcn-nuxt'],
  ssr: false,
  components: [
    // shadcn 及与其相同配置的 ui库
    {
      path: '~/components/ui',
      prefix: '',
      extensions: ['.vue'],
    },
    {
      path: '~/components/vue-bits',
      pathPrefix: false,
      prefix: 'VB',
    },
    {
      path: '~/components/app',
      pathPrefix: false,
      prefix: 'App',
    },
  ],
  devtools: { enabled: false },
  css: ['~/assets/css/tailwind.css'],
  runtimeConfig: {
    public: {
      version: packageJson.version,
    },
  },
  devServer: { host: process.env.TAURI_DEV_HOST || 'localhost' },
  compatibilityDate: '2025-07-15',
  vite: {
    plugins: [
      tailwindcss(),
    ],
    // 为 Tauri 命令输出提供更好的支持
    clearScreen: false,
    // 启用环境变量
    // 其他环境变量可以在如下网页中获知：
    // https://v2.tauri.app/reference/environment-variables/
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      // Tauri需要一个确定的端口
      strictPort: true,
    },
  },
  eslint: {
    config: {
      stylistic: true, // 使用 eslint 格式化
      standalone: false,
    },
  },
  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: '',
    componentDir: '~/components/ui',
  },
})
