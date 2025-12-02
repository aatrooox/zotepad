<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import gsap from 'gsap'

useHead({ titleTemplate: '%s - ZotePad' })

const { width } = useWindowSize()
const isMobile = computed(() => width.value < 768)
const isDrawerOpen = ref(false)

const route = useRoute()

// 根据路由获取页面标题
const pageTitle = computed(() => {
  const path = route.path
  if (path === '/' || path.startsWith('/notes'))
    return '笔记'
  if (path.startsWith('/moments'))
    return '动态'
  if (path.startsWith('/assets'))
    return '资源'
  if (path.startsWith('/workflows'))
    return '推送'
  if (path === '/settings')
    return '设置'
  return 'ZotePad'
})

const toggleDrawer = () => {
  isDrawerOpen.value = !isDrawerOpen.value
}

const closeDrawer = () => {
  isDrawerOpen.value = false
}

// Animation for sidebar
const sidebarRef = ref(null)
onMounted(() => {
  if (sidebarRef.value) {
    gsap.from(sidebarRef.value, {
      x: -50,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.out',
    })
  }
})

const config = useRuntimeConfig()
const version = config.public.version
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex font-sans antialiased selection:bg-primary/20">
    <!-- Desktop Sidebar -->
    <aside
      v-if="!isMobile"
      ref="sidebarRef"
      class="w-64 border-r bg-card/50 backdrop-blur-xl flex flex-col h-screen sticky top-0 z-20 shadow-sm"
    >
      <div class="p-6 flex items-center gap-3">
        <div class="w-10 h-10 bg-primary rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center text-primary-foreground font-bold text-xl">
          Z
        </div>
        <span class="font-bold text-xl tracking-tight">ZotePad</span>
      </div>

      <nav class="flex-1 px-4 space-y-2 mt-4">
        <NuxtLink
          to="/"
          class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group"
          active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
          :class="[
            $route.path === '/' ? '' : 'hover:bg-accent hover:text-accent-foreground',
          ]"
        >
          <Icon name="lucide:file-text" class="w-5 h-5" />
          <span class="font-medium">笔记</span>
        </NuxtLink>
        <NuxtLink
          to="/moments"
          class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group"
          active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
          :class="[
            $route.path.startsWith('/moments') ? '' : 'hover:bg-accent hover:text-accent-foreground',
          ]"
        >
          <Icon name="lucide:camera" class="w-5 h-5" />
          <span class="font-medium">动态</span>
        </NuxtLink>
        <NuxtLink
          to="/assets"
          class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group"
          active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
          :class="[
            $route.path.startsWith('/assets') ? '' : 'hover:bg-accent hover:text-accent-foreground',
          ]"
        >
          <Icon name="lucide:image" class="w-5 h-5" />
          <span class="font-medium">资源</span>
        </NuxtLink>
        <NuxtLink
          to="/workflows"
          class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group"
          active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
          :class="[
            $route.path.startsWith('/workflows') ? '' : 'hover:bg-accent hover:text-accent-foreground',
          ]"
        >
          <Icon name="lucide:workflow" class="w-5 h-5" />
          <span class="font-medium">推送</span>
        </NuxtLink>
        <NuxtLink
          to="/settings"
          class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group"
          active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
          :class="[
            $route.path === '/settings' ? '' : 'hover:bg-accent hover:text-accent-foreground',
          ]"
        >
          <Icon name="lucide:settings" class="w-5 h-5" />
          <span class="font-medium">设置</span>
        </NuxtLink>
      </nav>

      <div class="p-6 border-t bg-card/30">
        <div class="text-xs text-muted-foreground text-center font-medium">
          v{{ version }}
        </div>
      </div>
    </aside>

    <!-- Mobile Drawer -->
    <Drawer v-model:open="isDrawerOpen">
      <DrawerContent>
        <div class="p-6 space-y-6">
          <div class="flex items-center gap-3 mb-8">
            <div class="w-10 h-10 bg-primary rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center text-primary-foreground font-bold text-xl">
              Z
            </div>
            <span class="font-bold text-xl tracking-tight">ZotePad <em class="text-xs">v{{ version }}</em></span>
          </div>

          <nav class="space-y-2">
            <NuxtLink
              to="/"
              class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
              active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
              @click="closeDrawer"
            >
              <Icon name="lucide:file-text" class="w-5 h-5" />
              <span class="font-medium">笔记</span>
            </NuxtLink>
            <NuxtLink
              to="/moments"
              class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
              active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
              @click="closeDrawer"
            >
              <Icon name="lucide:camera" class="w-5 h-5" />
              <span class="font-medium">动态</span>
            </NuxtLink>
            <NuxtLink
              to="/assets"
              class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
              active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
              @click="closeDrawer"
            >
              <Icon name="lucide:image" class="w-5 h-5" />
              <span class="font-medium">资源</span>
            </NuxtLink>
            <NuxtLink
              to="/workflows"
              class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
              active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
              @click="closeDrawer"
            >
              <Icon name="lucide:workflow" class="w-5 h-5" />
              <span class="font-medium">推送</span>
            </NuxtLink>
            <NuxtLink
              to="/settings"
              class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
              active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
              @click="closeDrawer"
            >
              <Icon name="lucide:settings" class="w-5 h-5" />
              <span class="font-medium">设置</span>
            </NuxtLink>
          </nav>
        </div>
      </DrawerContent>
    </Drawer>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-background/50">
      <!-- Mobile Header -->
      <header v-if="isMobile" class="h-14 border-b flex items-center px-4 bg-background/80 backdrop-blur-md sticky top-0 z-10 justify-between pt-safe">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="icon" class="rounded-xl -ml-2" @click="toggleDrawer">
            <Icon name="lucide:menu" class="w-5 h-5" />
          </Button>
          <span class="font-bold text-lg tracking-tight">{{ pageTitle }}</span>
        </div>
      </header>

      <div class="flex-1 flex flex-col overflow-hidden relative">
        <slot />
      </div>
    </main>
  </div>
</template>
