import { useTauriStore } from './useTauriStore'

export type SidebarMode = 'navigation' | 'context'
export type ContextType = 'notes' | 'workflows' | 'assets' | null

interface SidebarState {
  mode: SidebarMode
  contextType: ContextType
  contextData: any
  isVisible: boolean
}

const SIDEBAR_STORE_KEY = 'sidebar_state'

export const useSidebar = () => {
  const store = useTauriStore()

  const mode = useState<SidebarMode>('sidebar_mode', () => 'navigation')
  const contextType = useState<ContextType>('sidebar_context_type', () => null)
  const isVisible = useState<boolean>('sidebar_visible', () => true)
  const contextData = useState<any>('sidebar_context_data', () => ({}))
  const isInitialized = useState<boolean>('sidebar_initialized', () => false)

  // 保存当前状态到持久化存储
  const persistState = async () => {
    try {
      const state: SidebarState = {
        mode: mode.value,
        contextType: contextType.value,
        contextData: contextData.value,
        isVisible: isVisible.value,
      }
      await store.setItem(SIDEBAR_STORE_KEY, state)
    }
    catch (error) {
      console.error('Failed to persist sidebar state:', error)
    }
  }

  // 从持久化存储恢复状态
  const restoreState = async () => {
    if (isInitialized.value)
      return

    try {
      const savedState = await store.getItem<SidebarState>(SIDEBAR_STORE_KEY)
      if (savedState) {
        mode.value = savedState.mode || 'navigation'
        contextType.value = savedState.contextType || null
        contextData.value = savedState.contextData || {}
        isVisible.value = savedState.isVisible ?? true
      }
      isInitialized.value = true
    }
    catch (error) {
      console.error('Failed to restore sidebar state:', error)
      isInitialized.value = true
    }
  }

  const setMode = async (newMode: SidebarMode) => {
    mode.value = newMode
    await persistState()
  }

  const setContext = async (type: ContextType, data: any = {}) => {
    contextType.value = type
    contextData.value = data
    if (type) {
      await setMode('context')
    }
    else {
      await setMode('navigation')
    }
  }

  const setNavigation = async () => {
    await setMode('navigation')
    contextType.value = null
    contextData.value = {}
    await persistState()
  }

  const setVisibility = async (visible: boolean) => {
    isVisible.value = visible
    await persistState()
  }

  return {
    mode,
    contextType,
    contextData,
    isVisible,
    isInitialized,
    setMode,
    setContext,
    setNavigation,
    setVisibility,
    restoreState,
  }
}
