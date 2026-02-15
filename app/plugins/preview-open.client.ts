import { listen } from '@tauri-apps/api/event'

/**
 * Global listener: allow Rust side to ask the webview to open a markdown file
 * and jump into /preview flow.
 */
export default defineNuxtPlugin(() => {
  if (import.meta.server)
    return

  const router = useRouter()
  const { logInfo, logWarn, logError } = useLog()

  void logInfo('plugin init', { tag: 'preview-open' })

  // Best-effort: ignore errors if not running under Tauri
  listen<{ path: string }>('preview:open', async (event) => {
    const path = event.payload?.path
    void logInfo('received preview:open', { tag: 'preview-open', context: { path } })

    if (!path)
      return

    try {
      // Navigate to preview page with query param
      // (query is easiest; path can be long but acceptable for local-only automation)
      await router.push({ path: '/preview', query: { path } })
      void logInfo('router.push ok', { tag: 'preview-open' })
    }
    catch (e: any) {
      void logError('router.push failed', { tag: 'preview-open', context: { message: e?.message || String(e) } })
      throw e
    }
  }).catch((e: any) => {
    void logWarn('listen failed (likely not running under Tauri)', { tag: 'preview-open', context: { message: e?.message || String(e) } })
  })
})
