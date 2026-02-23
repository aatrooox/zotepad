import type { LocationQueryRaw } from 'vue-router'
import { listen } from '@tauri-apps/api/event'
import { isNavigationFailure, NavigationFailureType } from 'vue-router'

type NavigateQueryValue = string | number | boolean | null | undefined

interface AppNavigatePayload {
  path: string
  query?: Record<string, NavigateQueryValue>
  replace?: boolean
  force?: boolean
  delayMs?: number
}

function normalizeQuery(query: AppNavigatePayload['query']): LocationQueryRaw | undefined {
  if (!query)
    return undefined

  const out: LocationQueryRaw = {}
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === 'boolean')
      out[k] = v ? 'true' : 'false'
    else
      out[k] = v
  }
  return out
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export default defineNuxtPlugin(() => {
  if (import.meta.server)
    return

  const router = useRouter()
  const { info, warn, error } = useLog()

  async function handleNavigate(payload: AppNavigatePayload) {
    const path = payload?.path
    if (!path)
      return

    const query = normalizeQuery(payload.query)
    const delayMs = (typeof payload.delayMs === 'number' && Number.isFinite(payload.delayMs))
      ? Math.max(0, payload.delayMs)
      : 300

    try {
      if (payload.force) {
        const intermediatePath = path === '/' ? '/preview' : '/'
        await router.replace({ path: intermediatePath })
        await nextTick()
        await sleep(delayMs)
      }

      if (payload.replace)
        await router.replace({ path, query })
      else
        await router.push({ path, query })

      void info('navigate ok', { tag: 'app-navigate', context: { path, replace: !!payload.replace, force: !!payload.force } })
    }
    catch (e: any) {
      if (isNavigationFailure(e, NavigationFailureType.duplicated)) {
        void warn('navigate duplicated (ignored)', { tag: 'app-navigate', context: { path } })
        return
      }

      void error('navigate failed', e, { tag: 'app-navigate', context: { path } })
      throw e
    }
  }

  const href = typeof window !== 'undefined' ? window.location.href : ''
  void info('plugin init', { tag: 'app-navigate', context: { href } })
  if (import.meta.dev)
    console.log('[app-navigate] plugin init', { href })

  listen<AppNavigatePayload>('app:navigate', (event) => {
    const payload = event.payload
    void info('received app:navigate', { tag: 'app-navigate', context: { path: payload?.path, force: !!payload?.force } })
    if (import.meta.dev)
      console.log('[app-navigate] received app:navigate', { path: payload?.path, force: !!payload?.force })
    return handleNavigate(payload)
  }).catch((e: any) => {
    void warn('listen failed (likely not running under Tauri)', { tag: 'app-navigate', context: { message: e?.message || String(e) } })
    if (import.meta.dev)
      console.log('[app-navigate] listen failed', { message: e?.message || String(e) })
  })

  listen<AppNavigatePayload>('nav:go', (event) => {
    const payload = event.payload
    void info('received nav:go', { tag: 'app-navigate', context: { path: payload?.path, force: !!payload?.force } })
    if (import.meta.dev)
      console.log('[app-navigate] received nav:go', { path: payload?.path, force: !!payload?.force })
    return handleNavigate(payload)
  }).catch((e: any) => {
    void warn('listen failed (likely not running under Tauri)', { tag: 'app-navigate', context: { message: e?.message || String(e) } })
    if (import.meta.dev)
      console.log('[app-navigate] listen failed', { message: e?.message || String(e) })
  })
})
