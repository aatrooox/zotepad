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
    if (!path)
      return

    // Navigate to preview page with query param
    // (query is easiest; path can be long but acceptable for local-only automation)
    await router.push({ path: '/preview', query: { path } })
  }).catch(() => {})
})
