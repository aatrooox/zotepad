<script setup lang="ts">
import type { DynamicIslandMessage } from '~/composables/useDynamicIsland'
import { gsap } from 'gsap'

// DOM 引用
const islandRef = ref<HTMLElement>()
const circleRef = ref<HTMLElement>()
const rectangleRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
const progressRef = ref<HTMLElement>()

// 使用全局状态
const {
  globalMessageQueue,
  globalIsVisible,
  globalCurrentMessage,
  updatePersistentMessage,
  removePersistentMessage,
  clearQueue,
} = useDynamicIsland()

// 将 persistentMessages 从 ref 更改为 computed，以确保其始终与全局队列同步
const persistentMessages = computed(() =>
  globalMessageQueue.value.filter(msg => msg.type === 'persistent'),
)

const persistentMessageIndex = ref(0)

const isAnimating = ref(false)
const progress = ref(0)
const isClearing = ref(false) // 新增一个状态锁，防止清理时触发其他操作

let currentTimeline: gsap.core.Timeline | null = null

let hideDelayTimer: NodeJS.Timeout | null = null

async function localClearQueue() {
  if (isClearing.value) {
    return
  }
  isClearing.value = true

  // 1. 停止所有正在进行的活动
  clearTimers()
  if (hideDelayTimer) {
    clearTimeout(hideDelayTimer)
    hideDelayTimer = null
  }
  if (currentTimeline) {
    currentTimeline.kill()
    currentTimeline = null
  }
  isAnimating.value = false

  // 2. 从源头清除所有消息
  // 这是关键：必须同时清除 useDynamicIsland 中的持久消息
  // 通过复制数组并迭代，安全地移除每个持久消息
  const messagesToRemove = [...persistentMessages.value]
  for (const msg of messagesToRemove) {
    removePersistentMessage(msg.id) // 这会从全局队列中移除
  }
  // persistentMessages 是一个计算属性，它会在 globalMessageQueue 更新时自动更新，无需手动清空
  clearQueue() // 清空所有剩余的普通消息

  // 3. 立即隐藏并重置UI
  globalCurrentMessage.value = null
  persistentMessageIndex.value = 0 // 重置持久消息索引
  hideIsland(true)

  // 4. 释放锁
  await nextTick()
  isClearing.value = false
}
let messageTimer: NodeJS.Timeout | null = null
let progressTimer: NodeJS.Timeout | null = null

// 监听消息队列的变化
watch(globalMessageQueue, (newQueue) => {
  const newPersistentMessages = persistentMessages.value

  // 当有新消息或持久化消息时，处理下一条消息
  if ((newQueue.length > 0 || newPersistentMessages.length > 0) && !globalIsVisible.value && !isAnimating.value) {
    processNextMessage()
  }

  // 当消息队列和持久化消息都为空时，才隐藏岛屿
  if (newQueue.length === 0 && newPersistentMessages.length === 0 && globalIsVisible.value && !isAnimating.value) {
    requestHideIsland()
  }
}, { deep: true })

// 处理下一条消息
function processNextMessage() {
  if (isClearing.value) {
    return // 如果正在清理，则不处理新消息
  }

  if (hideDelayTimer) {
    clearTimeout(hideDelayTimer)
    hideDelayTimer = null
  }
  clearTimers()

  if (isAnimating.value) {
    return
  }

  // 优先处理普通队列
  let message: DynamicIslandMessage | undefined
  const normalMessageIndex = globalMessageQueue.value.findIndex(
    msg => msg.type !== 'persistent' && msg.type !== 'loading',
  )

  if (normalMessageIndex > -1) {
    message = globalMessageQueue.value[normalMessageIndex]
    // 立即从队列中移除，防止重复处理
    globalMessageQueue.value.splice(normalMessageIndex, 1)
  }

  // 如果普通队列为空，则从持久化消息中取出一个进行轮播
  if (!message && persistentMessages.value.length > 0) {
    if (persistentMessageIndex.value >= persistentMessages.value.length) {
      persistentMessageIndex.value = 0 // 如果索引越界，则重置
    }
    const len = persistentMessages.value.length
    if (len > 0) {
      message = persistentMessages.value[persistentMessageIndex.value]
      persistentMessageIndex.value = (persistentMessageIndex.value + 1) % len
    }
  }

  if (!message) {
    // 如果没有任何消息，则请求隐藏
    requestHideIsland()
    return
  }

  // 如果是持久或加载类型，确保它在持久列表中
  if ((message.type === 'persistent' || message.type === 'loading') && !persistentMessages.value.some(pm => pm.id === message.id)) {
    persistentMessages.value.push(message)
  }

  // 如果当前显示的就是这个消息，则无需任何动画，直接重置计时器即可
  if (globalIsVisible.value && globalCurrentMessage.value?.id === message.id) {
    startMessageTimer(message)
    return
  }

  globalCurrentMessage.value = message

  if (!globalIsVisible.value) {
    showIsland()
  }
  else {
    switchContent()
  }
}

// 显示灵动岛
function showIsland() {
  if (isAnimating.value || !islandRef.value || !circleRef.value || !rectangleRef.value) {
    return
  }

  if (hideDelayTimer) {
    clearTimeout(hideDelayTimer)
    hideDelayTimer = null
  }

  isAnimating.value = true
  globalIsVisible.value = true

  if (currentTimeline) {
    currentTimeline.kill()
  }

  currentTimeline = gsap.timeline({
    onComplete: () => {
      isAnimating.value = false
      startMessageTimer()
    },
  })

  currentTimeline
    .set(islandRef.value, { opacity: 1, scale: 1 })
    .set(circleRef.value, { opacity: 1, scale: 0 })
    .set(rectangleRef.value, { opacity: 0, scale: 0 })
    .to(circleRef.value, { scale: 1, duration: 0.3, ease: 'back.out(1.7)' })
    .to(circleRef.value, { opacity: 0, duration: 0.2 }, '-=0.1')
    .to(rectangleRef.value, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.2)' }, '-=0.1')
}

// 隐藏灵动岛
function hideIsland(immediate = false) {
  if ((isAnimating.value && !immediate) || !globalIsVisible.value || !islandRef.value || !circleRef.value || !rectangleRef.value) {
    return
  }

  isAnimating.value = true
  clearTimers()

  if (currentTimeline) {
    currentTimeline.kill()
  }

  if (immediate) {
    gsap.set(islandRef.value, { opacity: 0, scale: 0 })
    globalIsVisible.value = false
    isAnimating.value = false
    globalCurrentMessage.value = null
    progress.value = 0
    return
  }

  currentTimeline = gsap.timeline({
    onComplete: () => {
      globalIsVisible.value = false
      isAnimating.value = false
      globalCurrentMessage.value = null
      progress.value = 0
      // 隐藏是最终状态，由 watch 重新触发新的显示流程
    },
  })

  currentTimeline
    .to(rectangleRef.value, { opacity: 0, scale: 0, duration: 0.3, ease: 'back.in(1.2)' })
    .to(circleRef.value, { opacity: 1, scale: 1, duration: 0.2 }, '-=0.1')
    .to(circleRef.value, { scale: 0, duration: 0.3, ease: 'back.in(1.7)' })
    .to(islandRef.value, { opacity: 0, scale: 0, duration: 0.1 }, '-=0.1')
}

// 切换内容（滚动效果）
function switchContent() {
  if (!contentRef.value || isAnimating.value) {
    return
  }
  isAnimating.value = true

  if (currentTimeline) {
    currentTimeline.kill()
  }

  currentTimeline = gsap.timeline({
    onComplete: () => {
      isAnimating.value = false
      startMessageTimer()
    },
  })

  currentTimeline
    .to(contentRef.value, { y: -24, opacity: 0, duration: 0.25, ease: 'sine.in' })
    .add(() => {
      // Vue's reactivity will update the content here while it's invisible
    })
    .set(contentRef.value, { y: 24 })
    .to(contentRef.value, { y: 0, opacity: 1, duration: 0.25, ease: 'sine.out' })
}

// 开始消息计时器
function startMessageTimer(message?: DynamicIslandMessage) {
  clearTimers()
  const msg = message || globalCurrentMessage.value
  if (!msg) {
    return
  }

  let duration = (msg.duration || 3) * 1000

  // 持久消息的轮播逻辑
  if (msg.type === 'persistent' || msg.type === 'loading') {
    // 只要是持久消息，就设置一个5秒的轮换周期
    // 这可以确保即使只有一个持久消息，它也会定期重新处理，从而可以检测到新加入的普通消息
    duration = 5000
  }

  if (msg.showProgress && msg.type !== 'persistent' && msg.type !== 'loading') {
    startProgressAnimation(duration)
  }

  messageTimer = setTimeout(() => {
    processNextMessage()
  }, duration)
}

function requestHideIsland() {
  if (hideDelayTimer) {
    clearTimeout(hideDelayTimer)
  }
  hideDelayTimer = setTimeout(() => {
    if (globalMessageQueue.value.length === 0 && persistentMessages.value.length === 0) {
      hideIsland()
    }
  }, 100) // 100ms 延迟，防止快速切换时闪烁
}

// 开始进度条动画
function startProgressAnimation(duration: number) {
  progress.value = 0
  if (progressTimer) {
    clearInterval(progressTimer)
  }

  const interval = 100 // ms
  const steps = duration / interval
  const increment = 100 / steps

  progressTimer = setInterval(() => {
    progress.value += increment
    if (progress.value >= 100) {
      progress.value = 100
      if (progressTimer) {
        clearInterval(progressTimer)
        progressTimer = null
      }
    }
  }, interval)
}

// 清除定时器
function clearTimers() {
  if (messageTimer) {
    clearTimeout(messageTimer)
    messageTimer = null
  }
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

// 组件卸载时清理
onUnmounted(() => {
  clearTimers()
  if (currentTimeline) {
    currentTimeline.kill()
  }
})

// 暴露方法给外部使用
defineExpose({
  updatePersistentMessage,
  removePersistentMessage,
  clearQueue: localClearQueue,
})
</script>

<template>
  <div
    ref="islandRef"
    class="fixed top-5 left-1/2 transform -translate-x-1/2 z-50"
    :class="{
      'pointer-events-none': !globalIsVisible,
      'pointer-events-auto': globalIsVisible,
    }"
    style="opacity: 0; scale: 0;"
  >
    <!-- 圆形初始状态 -->
    <div
      ref="circleRef"
      class="w-8 h-8 bg-black/80 backdrop-blur-md rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
      style="opacity: 0;"
    />

    <!-- 矩形展开状态 -->
    <div
      ref="rectangleRef"
      class="bg-black/80 backdrop-blur-md rounded-2xl border border-white/20 px-6 py-4 min-w-[300px] max-w-[400px]"
      style="opacity: 0; scale: 0;"
    >
      <!-- 信息内容容器 -->
      <div
        ref="contentRef"
        class="flex items-center gap-4 overflow-hidden"
        style="height: 48px;"
      >
        <!-- 左侧图标/图表区域 -->
        <div class="flex-shrink-0 w-8 h-8 flex items-center justify-center">
          <Icon
            :name="globalCurrentMessage?.icon || 'lucide:info'"
            class="w-6 h-6 text-white"
            :class="{ 'animate-spin': globalCurrentMessage?.type === 'loading' }"
          />
        </div>

        <!-- 右侧文字内容 -->
        <div class="flex-1 min-w-0">
          <div class="text-white text-sm font-medium truncate">
            {{ globalCurrentMessage?.title || '' }}
          </div>
          <div class="text-white/70 text-xs truncate">
            {{ globalCurrentMessage?.content || '' }}
          </div>
        </div>

        <!-- 进度指示器（可选） -->
        <div
          v-if="globalCurrentMessage?.showProgress"
          class="flex-shrink-0 w-1 h-6 bg-white/20 rounded-full overflow-hidden"
        >
          <div
            ref="progressRef"
            class="w-full bg-cyan-400 rounded-full transition-all duration-300"
            :style="{ height: `${progress}%` }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 确保组件在最顶层 */
.dynamic-island {
  z-index: 9999;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
