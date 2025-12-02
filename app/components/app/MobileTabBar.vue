<script setup lang="ts">
const route = useRoute()

const tabs = [
  { name: '笔记', icon: 'lucide:file-text', path: '/' },
  { name: '资源', icon: 'lucide:image', path: '/assets' },
  { name: '动态', icon: 'lucide:camera', path: '/moments' },
  { name: '推送', icon: 'lucide:workflow', path: '/workflows' },
  { name: '设置', icon: 'lucide:settings', path: '/settings' },
]

const isActive = (path: string) => {
  if (path === '/')
    return route.path === '/' || route.path.startsWith('/notes')
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="fixed bottom-0 left-0 right-0 z-50">
    <div class="bg-background/80 backdrop-blur-xl shadow-[0_-1px_3px_rgba(0,0,0,0.1)] flex items-center justify-around p-2 pb-safe-offset-2">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        class="flex flex-col items-center justify-center gap-1 p-2 transition-colors duration-200 flex-1 min-w-0 no-tap-highlight group"
        :class="[
          isActive(tab.path)
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground',
        ]"
      >
        <div class="relative flex items-center justify-center" :class="{ 'animate-breathing': isActive(tab.path) }">
          <Icon
            :name="tab.icon"
            class="w-6 h-6 transition-all duration-300"
            :class="{ 'fill-current': isActive(tab.path) && tab.icon !== 'lucide:workflow' }"
          />
        </div>
        <span class="text-[10px] font-medium truncate w-full text-center transition-all duration-300" :class="{ 'font-bold': isActive(tab.path) }">{{ tab.name }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.pb-safe-offset-2 {
  padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem);
}

.no-tap-highlight {
  -webkit-tap-highlight-color: transparent;
}

@keyframes breathing {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

.animate-breathing {
  animation: breathing 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
</style>
