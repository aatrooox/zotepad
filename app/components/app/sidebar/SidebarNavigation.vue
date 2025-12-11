<script setup lang="ts">
import SidebarMascot from './mascot/SidebarMascot.vue'

defineProps<{
  isSidebarOpen: boolean
}>()

defineEmits<{
  (e: 'toggle'): void
}>()

const config = useRuntimeConfig()
const version = config.public.version
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Toggle Button -->
    <div class="flex items-center justify-center h-16 shrink-0 relative">
      <!-- 展开状态：关闭按钮在右上角，吉祥物居中 -->
      <template v-if="isSidebarOpen">
        <div class="absolute top-3 right-1 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
          <Button variant="ghost" size="icon" class="h-8 w-8" @click="$emit('toggle')">
            <Icon name="lucide:panel-left-close" class="w-4 h-4" />
          </Button>
        </div>
        <div class="flex items-center justify-center gap-3 px-6 w-full">
          <SidebarMascot :is-compact="false" />
        </div>
      </template>

      <!-- 收起状态：吉祥物在上，展开按钮在下 -->
      <div v-else class="flex flex-col items-center justify-center gap-1 w-full h-full">
        <SidebarMascot :is-compact="true" />
        <Button variant="ghost" size="icon" class="h-6 w-6" @click="$emit('toggle')">
          <Icon name="lucide:panel-left-open" class="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>

    <nav class="flex-1 px-2 space-y-2 mt-4 overflow-hidden">
      <NuxtLink
        to="/"
        class="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group overflow-hidden whitespace-nowrap"
        active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
        :class="[
          $route.path === '/' ? '' : 'hover:bg-accent hover:text-accent-foreground',
          isSidebarOpen ? 'justify-start' : 'justify-center px-0',
        ]"
      >
        <Icon name="lucide:file-text" class="w-5 h-5 shrink-0" />
        <span class="font-medium transition-opacity duration-200" :class="isSidebarOpen ? 'opacity-100' : 'opacity-0 w-0 hidden'">记录</span>
      </NuxtLink>
      <NuxtLink
        to="/workflows"
        class="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group overflow-hidden whitespace-nowrap"
        active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
        :class="[
          $route.path.startsWith('/workflows') ? '' : 'hover:bg-accent hover:text-accent-foreground',
          isSidebarOpen ? 'justify-start' : 'justify-center px-0',
        ]"
      >
        <Icon name="lucide:workflow" class="w-5 h-5 shrink-0" />
        <span class="font-medium transition-opacity duration-200" :class="isSidebarOpen ? 'opacity-100' : 'opacity-0 w-0 hidden'">流</span>
      </NuxtLink>
      <NuxtLink
        to="/settings"
        class="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group overflow-hidden whitespace-nowrap"
        active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
        :class="[
          $route.path === '/settings' ? '' : 'hover:bg-accent hover:text-accent-foreground',
          isSidebarOpen ? 'justify-start' : 'justify-center px-0',
        ]"
      >
        <Icon name="lucide:settings" class="w-5 h-5 shrink-0" />
        <span class="font-medium transition-opacity duration-200" :class="isSidebarOpen ? 'opacity-100' : 'opacity-0 w-0 hidden'">设置</span>
      </NuxtLink>
    </nav>

    <div v-if="isSidebarOpen" class="p-6 border-t bg-card/30">
      <div class="text-xs text-muted-foreground text-center font-medium">
        v{{ version }}
      </div>
    </div>
  </div>
</template>
