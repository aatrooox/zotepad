// Tauri 服务统一初始化 Composable

/**
 * 统一初始化所有 Tauri 服务
 * 提供应用级别的服务管理
 */
export function useTauriServices() {
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const initProgress = ref(0)

  const { initStore, setItem } = useTauriStore()
  const { sendSuccessNotification, sendErrorNotification } = useTauriNotification()
  const { initDatabase } = useTauriSQL()

  const initializeServices = async () => {
    if (isInitialized.value)
      return

    isLoading.value = true
    error.value = null
    initProgress.value = 0

    try {
      // 初始化存储
      await initStore()
      initProgress.value = 20

      // 初始化数据库
      await initDatabase()
      initProgress.value = 50

      // 成就系统表由 Tauri Migration (version 8) 自动创建
      // 无需手动初始化
      initProgress.value = 75

      // 初始化当前用户
      try {
        const { useCurrentUser } = await import('./useCurrentUser')
        const { initCurrentUser } = useCurrentUser()
        await initCurrentUser()
      }
      catch (err) {
        console.warn('初始化当前用户失败（不影响主功能）:', err)
      }

      // 设置一些默认配置
      await setItem('app_version', '1.0.0')
      await setItem('user_preferences', {
        theme: 'light',
        language: 'zh-CN',
        notifications: true,
      })
      initProgress.value = 100

      // 发送初始化完成通知
      await sendSuccessNotification('应用初始化完成')

      isInitialized.value = true
      console.log('所有服务初始化完成')
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '服务初始化失败'
      console.error('服务初始化失败:', err)
      await sendErrorNotification('应用初始化失败')
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  // 自动初始化（可选）
  const autoInit = async () => {
    if (import.meta.client) {
      await initializeServices()
    }
  }

  return {
    // 状态
    isInitialized: readonly(isInitialized),
    isLoading: readonly(isLoading),
    error: readonly(error),
    initProgress: readonly(initProgress),

    // 方法
    initializeServices,
    autoInit,
  }
}
