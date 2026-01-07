import { onMounted, onUnmounted, ref } from 'vue'

export function useKeyboardInset() {
  const keyboardHeight = ref(0)
  const viewportHeight = ref(0) // 🎯 新增：可见视口高度

  const updateKeyboardInset = () => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      const vvHeight = window.visualViewport.height
      const windowHeight = window.innerHeight

      // 更新可见视口高度（这是最可靠的值）
      viewportHeight.value = vvHeight

      // 键盘高度 = 窗口高度 - 可视视口高度
      // 注意：在 adjustResize 模式下这个值可能为 0
      const diff = windowHeight - vvHeight
      keyboardHeight.value = diff > 50 ? diff : 0
    }
    else if (typeof window !== 'undefined') {
      // 降级方案
      viewportHeight.value = window.innerHeight
    }
  }

  onMounted(() => {
    // 🎯 立即获取初始高度
    if (typeof window !== 'undefined') {
      viewportHeight.value = window.visualViewport?.height || window.innerHeight
    }

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardInset)
      window.visualViewport.addEventListener('scroll', updateKeyboardInset)
      // 初始检查
      updateKeyboardInset()
    }
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', updateKeyboardInset)
      window.visualViewport.removeEventListener('scroll', updateKeyboardInset)
    }
  })

  return {
    keyboardHeight,
    viewportHeight, // 🎯 新增：导出可见视口高度
  }
}
