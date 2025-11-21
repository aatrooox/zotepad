<script setup lang="ts">
const { navBarConfig } = useNavBar()
const router = useRouter()

function handleBackButton() {
  router.back()
}

function handleLeftAction() {
  if (navBarConfig.value.leftAction) {
    navBarConfig.value.leftAction()
  }
}

function handleRightAction() {
  if (navBarConfig.value.rightAction) {
    navBarConfig.value.rightAction()
  }
}
</script>

<template>
  <div
    class="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-4"
    :class="[
      navBarConfig.transparent ? 'bg-transparent' : (navBarConfig.backgroundColor || 'bg-black/20'),
      navBarConfig.textColor || 'text-white',
      navBarConfig.transparent ? '' : 'backdrop-blur-md',
      navBarConfig.hideBorder ? '' : 'border-b border-white/10',
    ]"
    :style="{
      paddingTop: 'env(safe-area-inset-top)',
      height: `calc(4rem + env(safe-area-inset-top))`,
    }"
  >
    <!-- 左侧按钮区域 -->
    <div class="flex items-center w-16">
      <button
        v-if="navBarConfig.showBackButton"
        class="p-2 rounded-full hover:bg-white/10 transition-colors"
        @click="handleBackButton"
      >
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </button>
      <button
        v-else-if="navBarConfig.leftIcon"
        class="p-2 rounded-full hover:bg-white/10 transition-colors"
        @click="handleLeftAction"
      >
        <Icon :name="navBarConfig.leftIcon" class="w-5 h-5" />
      </button>
    </div>

    <!-- 中间标题区域 -->
    <div class="flex-1 text-center">
      <h1
        v-if="navBarConfig.title"
        class="text-lg font-semibold truncate"
      >
        {{ navBarConfig.title }}
      </h1>
    </div>

    <!-- 右侧按钮区域 -->
    <div class="flex items-center w-16 justify-end">
      <button
        v-if="navBarConfig.rightIcon"
        class="p-2 rounded-full hover:bg-white/10 transition-colors"
        @click="handleRightAction"
      >
        <Icon :name="navBarConfig.rightIcon" class="w-5 h-5" />
      </button>
    </div>
  </div>
</template>
