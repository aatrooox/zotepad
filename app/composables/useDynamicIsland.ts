import { readonly } from 'vue'

// 消息类型定义
export interface DynamicIslandMessage {
  id: string
  title?: string
  content: string
  icon?: string
  type: 'notification' | 'persistent' | 'loading'
  duration?: number // 秒
  showProgress?: boolean
}

/**
 * 灵动岛 Composable
 * 提供全局的灵动岛消息管理功能
 */
export function useDynamicIsland() {
  // 注意：由于使用全局状态管理，不再需要 setDynamicIslandRef 函数
  // 全局状态 - 使用 useState 确保全局单例
  const globalMessageQueue = useState<DynamicIslandMessage[]>('dynamic-island-queue', () => [])
  const globalIsVisible = useState<boolean>('dynamic-island-visible', () => false)
  const globalCurrentMessage = useState<DynamicIslandMessage | null>('dynamic-island-current', () => null)

  /**
   * 显示通知类型消息
   * @param message 消息内容
   * @param options 可选配置
   */
  function showNotification(
    message: string,
    options: {
      title?: string
      icon?: string
      duration?: number
      showProgress?: boolean
    } = {},
  ) {
    const notificationMessage: DynamicIslandMessage = {
      id: Date.now().toString(),
      title: options.title,
      content: message,
      icon: options.icon || 'lucide:bell',
      type: 'notification',
      duration: options.duration || 2,
      showProgress: options.showProgress ?? true,
    }

    addMessage(notificationMessage)
  }

  /**
   * 显示持续类型消息
   * @param message 消息内容
   * @param options 可选配置
   */
  function showPersistentMessage(
    message: string,
    options: {
      id?: string
      title?: string
      icon?: string
    } = {},
  ) {
    const persistentMessage: DynamicIslandMessage = {
      id: options.id || `persistent_${Date.now()}`,
      title: options.title,
      content: message,
      icon: options.icon || 'lucide:info',
      type: 'persistent',
    }

    addMessage(persistentMessage)
  }

  /**
   * 显示成功消息
   * @param message 消息内容
   * @param duration 显示时长（秒）
   */
  function showSuccess(message: string, duration = 3) {
    showNotification(message, {
      title: '成功',
      icon: 'lucide:check-circle',
      duration,
      showProgress: true,
    })
  }

  /**
   * 显示错误消息
   * @param message 消息内容
   * @param duration 显示时长（秒）
   */
  function showError(message: string, duration = 3) {
    showNotification(message, {
      title: '错误',
      icon: 'lucide:x-circle',
      duration,
      showProgress: true,
    })
  }

  /**
   * 显示警告消息
   * @param message 消息内容
   * @param duration 显示时长（秒）
   */
  function showWarning(message: string, duration = 3) {
    showNotification(message, {
      title: '警告',
      icon: 'lucide:alert-triangle',
      duration,
      showProgress: true,
    })
  }

  /**
   * 显示信息消息
   * @param message 消息内容
   * @param duration 显示时长（秒）
   */
  function showInfo(message: string, duration = 3) {
    showNotification(message, {
      title: '信息',
      icon: 'lucide:info',
      duration,
      showProgress: true,
    })
  }

  /**
   * 显示加载消息
   * @param message 消息内容
   * @param duration 显示时长（秒），默认为 0，表示不自动消失
   */
  function showLoading(message: string, duration = 0) {
    showNotification(message, {
      title: '加载中',
      icon: 'lucide:loader-2',
      duration,
      showProgress: duration > 0,
    })
  }

  /**
   * 更新持续消息
   * @param messageId 消息ID
   * @param updates 更新内容
   */
  function updatePersistentMessage(messageId: string, updates: Partial<DynamicIslandMessage>) {
    const messageIndex = globalMessageQueue.value.findIndex(msg => msg.id === messageId)
    if (messageIndex !== -1) {
      const currentMsg = globalMessageQueue.value[messageIndex]
      if (currentMsg) {
        Object.assign(currentMsg, updates)
      }
    }

    // 如果是当前显示的消息，也更新当前消息
    if (globalCurrentMessage.value?.id === messageId && globalCurrentMessage.value) {
      Object.assign(globalCurrentMessage.value, updates)
    }
  }

  /**
   * 移除持续消息
   * @param messageId 消息ID
   */
  function removePersistentMessage(messageId: string) {
    globalMessageQueue.value = globalMessageQueue.value.filter(msg => msg.id !== messageId)
  }

  /**
   * 清空所有消息
   */
  function clearQueue() {
    globalMessageQueue.value = []
    globalCurrentMessage.value = null
  }

  /**
   * 添加消息到队列
   * @param message 消息对象
   */
  function addMessage(message: DynamicIslandMessage) {
    console.log('useDynamicIsland addMessage 被调用:', message)
    console.log('添加前队列长度:', globalMessageQueue.value.length)
    // 使用 unshift 将新消息添加到队列开头，确保优先显示
    globalMessageQueue.value.unshift(message)
    console.log('添加后队列长度:', globalMessageQueue.value.length)
    console.log('当前队列内容:', globalMessageQueue.value)
  }

  /**
   * 获取当前消息队列
   */
  function getMessageQueue() {
    return readonly(globalMessageQueue)
  }

  /**
   * 获取灵动岛可见状态
   */
  function getVisibility() {
    return readonly(globalIsVisible)
  }

  /**
   * 获取当前消息
   */
  function getCurrentMessage() {
    return readonly(globalCurrentMessage)
  }

  return {
    // 核心方法
    showNotification,
    showPersistentMessage,

    // 便捷方法
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,

    // 管理方法
    updatePersistentMessage,
    removePersistentMessage,
    clearQueue,

    // 状态获取
    getMessageQueue,
    getVisibility,
    getCurrentMessage,

    // 全局状态访问器（用于组件内部）
    globalMessageQueue,
    globalIsVisible,
    globalCurrentMessage,
  }
}
