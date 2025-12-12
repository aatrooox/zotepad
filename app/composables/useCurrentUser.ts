/**
 * 当前用户管理 Composable
 * 提供全局的当前用户状态
 *
 * Phase 1: 简化实现，直接使用固定 userId = 1
 * 未来扩展: 实现多用户登录和切换
 */

import { useTauriStore } from './useTauriStore'

const CURRENT_USER_KEY = 'current_user_id'
const DEFAULT_USER_ID = 1

export function useCurrentUser() {
  const store = useTauriStore()

  // 全局状态：当前用户 ID
  const currentUserId = useState<number>('current_user_id', () => DEFAULT_USER_ID)
  const isLoading = ref(false)

  /**
   * 初始化当前用户
   * Phase 1: 直接使用默认 ID 1，不查询 users 表
   */
  const initCurrentUser = async () => {
    if (currentUserId.value !== DEFAULT_USER_ID)
      return

    isLoading.value = true
    try {
      // 从存储读取（如果未来支持切换用户）
      const savedUserId = await store.getItem<number>(CURRENT_USER_KEY)
      if (savedUserId && savedUserId > 0) {
        currentUserId.value = savedUserId
      }
      else {
        // 使用默认 ID 并保存
        currentUserId.value = DEFAULT_USER_ID
        await store.setItem(CURRENT_USER_KEY, DEFAULT_USER_ID)
      }
    }
    catch (error) {
      console.error('初始化当前用户失败:', error)
      currentUserId.value = DEFAULT_USER_ID
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 切换当前用户（预留接口，未来实现）
   */
  const switchUser = async (userId: number) => {
    try {
      currentUserId.value = userId
      await store.setItem(CURRENT_USER_KEY, userId)
      return true
    }
    catch (error) {
      console.error('切换用户失败:', error)
      return false
    }
  }

  /**
   * 获取当前用户 ID
   * 直接返回当前值，默认为 1
   */
  const getCurrentUserId = (): number => {
    return currentUserId.value
  }

  return {
    currentUserId: readonly(currentUserId),
    isLoading: readonly(isLoading),
    initCurrentUser,
    switchUser,
    getCurrentUserId,
  }
}
