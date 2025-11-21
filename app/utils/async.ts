import { readonly, ref } from 'vue'

export function useAsyncState() {
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function runAsync<T>(fn: () => Promise<T>, errorMessage = 'Operation failed'): Promise<T> {
    isLoading.value = true
    error.value = null
    try {
      return await fn()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : errorMessage
      // console.error(errorMessage, err) // Optional: let the caller handle logging or keep it here
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    isLoading: readonly(isLoading),
    error: readonly(error),
    runAsync,
  }
}
