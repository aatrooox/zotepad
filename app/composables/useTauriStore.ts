// Tauri Store 键值存储 Composable
import { Store } from '@tauri-apps/plugin-store'
import { useAsyncState } from '~/utils/async'

export class StoreService {
  private store: Store | null = null

  constructor(private fileName = 'app_settings.bin') {
    // Store 需要异步初始化
  }

  async init(): Promise<void> {
    if (!this.store) {
      this.store = await Store.load(this.fileName)
    }
  }

  private ensureStore(): Store {
    if (!this.store) {
      throw new Error('Store 未初始化，请先调用 init() 方法')
    }
    return this.store
  }

  async set(key: string, value: any) {
    try {
      const store = this.ensureStore()
      await store.set(key, value)
      console.log(`设置 ${key} 成功`)
    }
    catch (error) {
      console.error(`设置 ${key} 失败:`, error)
      throw error
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const store = this.ensureStore()
      const value = await store.get<T>(key)
      return value ?? null
    }
    catch (error) {
      console.error(`获取 ${key} 失败:`, error)
      throw error
    }
  }

  async delete(key: string) {
    try {
      const store = this.ensureStore()
      await store.delete(key)
      console.log(`删除 ${key} 成功`)
    }
    catch (error) {
      console.error(`删除 ${key} 失败:`, error)
      throw error
    }
  }

  async clear() {
    try {
      const store = this.ensureStore()
      await store.clear()
      console.log('清空存储成功')
    }
    catch (error) {
      console.error('清空存储失败:', error)
      throw error
    }
  }

  async save() {
    try {
      const store = this.ensureStore()
      await store.save()
      console.log('保存存储成功')
    }
    catch (error) {
      console.error('保存存储失败:', error)
      throw error
    }
  }

  async keys() {
    try {
      const store = this.ensureStore()
      const keys = await store.keys()
      return keys
    }
    catch (error) {
      console.error('获取键列表失败:', error)
      throw error
    }
  }

  async values() {
    try {
      const store = this.ensureStore()
      const values = await store.values()
      return values
    }
    catch (error) {
      console.error('获取值列表失败:', error)
      throw error
    }
  }

  async entries() {
    try {
      const store = this.ensureStore()
      const entries = await store.entries()
      return entries
    }
    catch (error) {
      console.error('获取条目列表失败:', error)
      throw error
    }
  }

  async length() {
    try {
      const store = this.ensureStore()
      const length = await store.length()
      return length
    }
    catch (error) {
      console.error('获取存储长度失败:', error)
      throw error
    }
  }

  async has(key: string) {
    try {
      const store = this.ensureStore()
      const exists = await store.has(key)
      return exists
    }
    catch (error) {
      console.error(`检查 ${key} 是否存在失败:`, error)
      throw error
    }
  }
}

// 创建单例实例
const storeService = new StoreService()

/**
 * Tauri Store Composable
 * 提供键值存储的响应式接口
 */
export function useTauriStore(fileName?: string) {
  const service = fileName ? new StoreService(fileName) : storeService
  const isInitialized = ref(false)
  const { isLoading, error, runAsync } = useAsyncState()

  const initStore = async () => {
    if (isInitialized.value)
      return

    await runAsync(async () => {
      await service.init()
      isInitialized.value = true
    }, 'Store 初始化失败')
  }

  const setItem = (key: string, value: any) =>
    runAsync(() => service.set(key, value), '设置值失败')

  const getItem = <T>(key: string) =>
    runAsync(() => service.get<T>(key), '获取值失败')

  const deleteItem = (key: string) =>
    runAsync(() => service.delete(key), '删除值失败')

  const clearStore = () =>
    runAsync(() => service.clear(), '清空存储失败')

  const saveStore = () =>
    runAsync(() => service.save(), '保存存储失败')

  const getKeys = () =>
    runAsync(() => service.keys(), '获取键列表失败')

  const getValues = () =>
    runAsync(() => service.values(), '获取值列表失败')

  const getEntries = () =>
    runAsync(() => service.entries(), '获取条目列表失败')

  const getLength = () =>
    runAsync(() => service.length(), '获取存储长度失败')

  const hasKey = (key: string) =>
    runAsync(() => service.has(key), '检查键是否存在失败')

  return {
    // 状态
    isInitialized: readonly(isInitialized),
    isLoading,
    error,

    // 方法
    initStore,
    setItem,
    getItem,
    deleteItem,
    clearStore,
    saveStore,
    getKeys,
    getValues,
    getEntries,
    getLength,
    hasKey,
  }
}
