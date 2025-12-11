<script setup lang="ts">
import gsap from 'gsap'
import { Vue3Lottie } from 'vue3-lottie'
import { useMascotController } from '~/composables/useMascotController'

defineProps<{
  isCompact?: boolean
}>()

const { state, loadAnimation, playAction, recordInteraction } = useMascotController()

const animationSpeed = ref(0.8)
const animationData = ref(null)
const mascotRef = ref<HTMLElement | null>(null)

// 加载当前动作的动画
watch(() => state.value.currentAction, async (action) => {
  const data = await loadAnimation(action)
  if (data) {
    animationData.value = data
  }
}, { immediate: true })

// 点击交互
const handleClick = () => {
  recordInteraction()

  // 缩放弹跳效果
  if (mascotRef.value) {
    gsap.fromTo(
      mascotRef.value,
      { scale: 1 },
      {
        scale: 1.15,
        duration: 0.15,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1,
      },
    )
  }

  // 随机播放特殊动作（如果有的话）
  const specialActions = ['stretch', 'scratch']
  const randomAction = specialActions[Math.floor(Math.random() * specialActions.length)]
  playAction(randomAction as any, {
    duration: 2000,
  })
}

// 监听用户活动（页面级别）
let idleCheckInterval: NodeJS.Timeout | null = null

onMounted(() => {
  // 每分钟检查一次是否需要睡觉
  idleCheckInterval = setInterval(() => {
    const { checkIdleTimeout } = useMascotController()
    checkIdleTimeout(5) // 5 分钟无操作进入睡眠
  }, 60000)
})

onUnmounted(() => {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval)
  }
})
</script>

<template>
  <div
    ref="mascotRef"
    class="flex items-center justify-center transition-all duration-300 cursor-pointer hover:opacity-90 active:opacity-100"
    :class="isCompact ? 'w-10 h-10' : 'w-16 h-16'"
    title="点击我试试"
    @click="handleClick"
  >
    <Vue3Lottie
      v-if="animationData"
      :animation-data="animationData"
      :height="isCompact ? 40 : 64"
      :width="isCompact ? 40 : 64"
      :speed="animationSpeed"
      :loop="true"
      :auto-play="true"
    />
  </div>
</template>
