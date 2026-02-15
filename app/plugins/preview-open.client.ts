import { listen } from '@tauri-apps/api/event'

/**
 * Global listener: allow Rust side to ask the webview to open a markdown file
 * and jump into /preview flow.
 */
export default defineNuxtPlugin(() => {
  if (import.meta.server)
    return

  const router = useRouter()

  // Best-effort: ignore errors if not running under Tauri
  listen<{ path: string }>('preview:open', async (event) => {
    const path = event.payload?.path
    console.log('[preview-open] received preview:open', { path })

    if (!path)
      return

    try {
      // Navigate to preview page with query param
      // (query is easiest; path can be long but acceptable for local-only automation)
      await router.push({ path: '/preview', query: { path } })
      console.log('[preview-open] router.push ok')
    }
    catch (e) {
      console.error('[preview-open] router.push failed', e)
      throw e
    }
  }).catch((e) => {
    console.warn('[preview-open] listen failed (likely not running under Tauri)', e)
  })
})
