/**
 * 路由配置文件
 * 用于标识页面类型和依赖关系
 */

export interface RouteConfig {
  path: string
  name: string
  type: 'static' | 'tauri-dependent' | 'database-dependent'
}

/**
 * 页面类型定义
 */
export const PAGE_TYPES = {
  STATIC: 'static' as const,
  TAURI_DEPENDENT: 'tauri-dependent' as const,
  DATABASE_DEPENDENT: 'database-dependent' as const,
} as const

/**
 * 路由配置数组
 * 维护所有页面的类型和依赖信息
 */
export const ROUTE_CONFIGS: RouteConfig[] = [
  {
    path: '/',
    name: '首页',
    type: PAGE_TYPES.STATIC,
  },
  {
    path: '/tauri-demo',
    name: 'tauri-demo',
    type: PAGE_TYPES.TAURI_DEPENDENT,
  },
  {
    path: '/canvas-editor',
    name: 'Canvas 编辑器',
    type: PAGE_TYPES.STATIC,
  },
]

/**
 * 统一的回退消息
 */
export const FALLBACK_MESSAGE = '此页面需要客户端环境'

/**
 * 根据路径获取路由配置
 */
export function getRouteConfig(path: string): RouteConfig | undefined {
  return ROUTE_CONFIGS.find(config => config.path === path)
}

/**
 * 检查路径是否为纯静态页面（白名单机制）
 */
export function isStaticRoute(path: string): boolean {
  const config = getRouteConfig(path)
  return config?.type === PAGE_TYPES.STATIC
}

/**
 * 检查路由是否在白名单中
 */
export function isRouteAllowed(path: string): boolean {
  return isStaticRoute(path)
}
