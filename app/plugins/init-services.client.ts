import { defineNuxtPlugin } from '#app'
import { useTauriServices } from '~/composables/useTauriServices'

export default defineNuxtPlugin(async () => {
  const { initializeServices } = useTauriServices()

  try {
    console.log('[Init] Starting Tauri services initialization...')
    await initializeServices()
    console.log('[Init] Tauri services initialized successfully')
  }
  catch (error) {
    console.error('[Init] Failed to initialize Tauri services:', error)
  }
})
