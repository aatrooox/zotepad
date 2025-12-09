/**
 * 环境检测 Composable
 * 用于检测当前运行环境和 Tauri 可用性
 */

// 扩展 Window 接口以支持 Tauri
declare global {
  interface Window {
    __TAURI__?: any
  }
}

/**
 * 检测当前是否在 Tauri 环境中运行
 */
export function useEnvironment() {
  const isTauriEnvironment = ref(false)
  const isDesktop = ref(false)
  const isMobile = ref(false)
  const isLoading = ref(true)
  const error = ref<string | null>(null)

  /**
   * 检测 Tauri 环境
   * 使用 Tauri 2.0 推荐的检测方式
   */
  async function detectTauriEnvironment(): Promise<boolean> {
    try {
      // 检查是否在浏览器环境中
      if (typeof window === 'undefined') {
        return false
      }

      // Tauri 2.0 推荐的检测方式：检查 __TAURI__ 属性是否存在
      // 参考：https://github.com/tauri-apps/tauri/discussions/6119
      if ('__TAURI__' in window) {
        return true
      }

      // 备用检测方式：检查 isTauri 属性（Tauri 2.0.0-beta.9+ 支持）
      if ('isTauri' in window && !!(window as any).isTauri) {
        return true
      }

      return false
    }
    catch {
      return false
    }
  }

  /**
   * 检测平台类型(桌面端 vs 移动端)
   */
  async function detectPlatform() {
    if (!isTauriEnvironment.value) {
      isDesktop.value = false
      isMobile.value = false
      return
    }

    try {
      // 通过 user agent 判断平台
      const ua = navigator.userAgent.toLowerCase()
      const isAndroid = /android/.test(ua)
      const isIOS = /iphone|ipad|ipod/.test(ua)

      isMobile.value = isAndroid || isIOS
      isDesktop.value = !isMobile.value
    }
    catch (e) {
      console.error('检测平台类型失败:', e)
      // 默认为桌面端
      isDesktop.value = true
      isMobile.value = false
    }
  } /**
     * 初始化环境检测
     */
  async function initEnvironmentDetection() {
    isLoading.value = true
    error.value = null

    try {
      const result = await detectTauriEnvironment()
      isTauriEnvironment.value = result

      // 检测平台类型
      if (result) {
        await detectPlatform()
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '环境检测失败'
      isTauriEnvironment.value = false
      isDesktop.value = false
      isMobile.value = false
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 检查特定 Tauri 插件是否可用
   * 简化版本，仅检查基础环境
   */
  async function checkTauriPlugin(_pluginName: string): Promise<boolean> {
    return isTauriEnvironment.value
  }

  /**
   * 获取环境信息
   */
  function getEnvironmentInfo() {
    return {
      isTauri: isTauriEnvironment.value,
      isDesktop: isDesktop.value,
      isMobile: isMobile.value,
      isBrowser: typeof window !== 'undefined' && !isTauriEnvironment.value,
      isSSR: typeof window === 'undefined',
    }
  }

  /**
   * 检查是否支持特定功能
   */
  function supportsFeature(feature: string): boolean {
    const env = getEnvironmentInfo()

    switch (feature) {
      case 'database':
      case 'local-storage':
      case 'notifications':
      case 'file-system':
        return env.isTauri
      case 'desktop-server':
        return env.isDesktop
      case 'web-apis':
      case 'dom':
        return env.isBrowser || env.isTauri
      default:
        return false
    }
  }

  // 在客户端初始化时自动检测环境
  if (typeof window !== 'undefined') {
    initEnvironmentDetection()
  }

  return {
    isTauriEnvironment: readonly(isTauriEnvironment),
    isDesktop: readonly(isDesktop),
    isMobile: readonly(isMobile),
    isLoading: readonly(isLoading),
    error: readonly(error),
    detectTauriEnvironment,
    initEnvironmentDetection,
    checkTauriPlugin,
    getEnvironmentInfo,
    supportsFeature,
  }
}

/**
 * 全局环境状态（单例模式）
 */
const globalEnvironment = useEnvironment()

/**
 * 获取全局环境状态
 */
export function useGlobalEnvironment() {
  return globalEnvironment
}
