import { onMounted, onUnmounted, ref } from 'vue'

export function useKeyboardInset() {
  const keyboardHeight = ref(0)

  const updateKeyboardInset = () => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      // 在某些 Android 设备/浏览器上，visualViewport.height 会随着键盘弹出而变小
      // 而 window.innerHeight 可能保持不变 (如果不是 adjustResize)
      // 或者 window.innerHeight 也变小 (如果是 adjustResize)

      // 我们主要关心的是底部被遮挡的高度。
      // 如果是 adjustResize，window.innerHeight 会变小，此时不需要额外的 padding，
      // 除非布局是 100vh 且没有响应 resize。

      // 但是用户反馈 "被挡住了"，说明内容延伸到了键盘下面。
      // 这通常意味着视口没有 resize，或者 resize 了但我们布局是定死的。

      // 尝试计算：屏幕高度 - 可视视口高度 - 顶部偏移
      // 注意：这个计算在不同设备上可能需要微调

      const viewportHeight = window.visualViewport.height
      const windowHeight = window.innerHeight

      // 如果两者接近，说明键盘没出来，或者 adjustResize 完美生效且我们不需要 padding
      // 但如果用户强制要求 padding，可能是 edge-to-edge 导致 adjustResize 失效
      // 或者他们想要一种通用的处理方式

      // 另一种策略：直接测量 visualViewport.height，并将 app 容器高度设为这个值？
      // 用户要求的是 "padding"，所以我们计算差值。

      // 假设 window.innerHeight 是包含键盘区域的（在某些模式下）
      // 实际上，最稳妥的方式可能是：
      // 键盘高度 = window.innerHeight - window.visualViewport.height
      // 但如果 window.innerHeight 也缩放了，这个值就是 0。

      // 如果用户说 "被挡住"，那 window.innerHeight 很可能没变 (adjustNothing / edge-to-edge overlay)
      // 此时 diff > 0

      const diff = windowHeight - viewportHeight

      // 只有当 diff 显著大时才认为是键盘
      keyboardHeight.value = diff > 100 ? diff : 0
    }
  }

  onMounted(() => {
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
  }
}
