/**
 * 环境检测中间件
 * 在非 Tauri 环境中访问需要客户端支持的页面时显示警告提示
 */

import { useDynamicIsland } from '~/composables/useDynamicIsland'
import { useGlobalEnvironment } from '~/composables/useEnvironment'
import { getRouteConfig } from '~/config/routes'

export default defineNuxtRouteMiddleware((to) => {
  // 只在客户端执行
  if (import.meta.server) {
    return
  }

  // 获取路由配置
  const routeConfig = getRouteConfig(to.path)

  // 如果路由不存在配置，允许访问（可能是动态路由）
  if (!routeConfig) {
    return
  }

  // 静态页面始终允许访问
  if (routeConfig.type === 'static') {
    return
  }

  // 对于需要 Tauri 环境的页面，检查当前环境
  if (routeConfig.type === 'tauri-dependent' || routeConfig.type === 'database-dependent') {
    const { isTauriEnvironment } = useGlobalEnvironment()
    if (!isTauriEnvironment.value) {
      // 使用灵动岛组件显示警告消息，而不是阻止访问
      const { showWarning } = useDynamicIsland()
      showWarning(`此页面[${routeConfig.name}]需要客户端环境才能正常使用`, 3)
    }
  }
})
