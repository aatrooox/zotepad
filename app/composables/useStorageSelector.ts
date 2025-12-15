import { ref } from 'vue'

const isOpen = ref(false)
const availableProviders = ref<string[]>([])
let resolvePromise: ((value: string | null) => void) | null = null

export function useStorageSelector() {
  /**
   * 打开选择器，返回用户选择的 provider key，如果取消则返回 null
   */
  const openSelector = (providers: string[]): Promise<string | null> => {
    availableProviders.value = providers
    isOpen.value = true
    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  const select = (provider: string) => {
    if (resolvePromise) {
      resolvePromise(provider)
      resolvePromise = null
    }
    isOpen.value = false
  }

  const cancel = () => {
    if (resolvePromise) {
      resolvePromise(null)
      resolvePromise = null
    }
    isOpen.value = false
  }

  return {
    isOpen,
    availableProviders,
    openSelector,
    select,
    cancel,
  }
}
