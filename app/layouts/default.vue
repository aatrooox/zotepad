<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import gsap from 'gsap'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'

useHead({ titleTemplate: '%s - ZotePad' })

const { width } = useWindowSize()
const isMobile = computed(() => width.value < 768)
const router = useRouter()
const route = useRoute()

// Sidebar state
const isSidebarOpen = ref(true)
const { getSetting, setSetting } = useSettingRepository()

const toggleSidebar = async () => {
  isSidebarOpen.value = !isSidebarOpen.value
  await setSetting('sidebar_open', String(isSidebarOpen.value))
}

// Animation for sidebar
const sidebarRef = ref(null)
onMounted(async () => {
  const savedState = await getSetting('sidebar_open')
  if (savedState !== null) {
    isSidebarOpen.value = savedState === 'true'
  }

  // Restore last active menu
  if (route.path === '/') {
    const lastMenu = await getSetting('last_active_menu')
    if (lastMenu && lastMenu !== '/') {
      router.replace(lastMenu)
    }
  }

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

// Save last active menu
watch(() => route.path, async (newPath) => {
  let menuToSave = '/'
  if (newPath.startsWith('/assets'))
    menuToSave = '/assets'
  else if (newPath.startsWith('/workflows'))
    menuToSave = '/workflows'
  else if (newPath === '/settings')
    menuToSave = '/settings'

  await setSetting('last_active_menu', menuToSave)
})

const showTabBar = computed(() => {
  return isMobile.value && !route.path.match(/^\/notes\/(new|\d+)$/)
})
</script>

<template>
  <div class="h-full bg-background text-foreground flex font-sans antialiased selection:bg-primary/20 overflow-hidden">
    <!-- Desktop Sidebar -->
    <aside
      v-if="!isMobile"
      ref="sidebarRef"
      class="border-r bg-card/50 backdrop-blur-xl flex flex-col h-screen z-20 shadow-sm relative group/sidebar transition-all duration-300 ease-in-out overflow-hidden"
      :class="isSidebarOpen ? 'w-64' : 'w-16'"
    >
      <div class="h-full flex flex-col transition-all duration-300" :class="isSidebarOpen ? 'w-64' : 'w-16'">
        <!-- Toggle Button -->
        <div class="flex items-center justify-center h-16 shrink-0 relative">
          <div v-if="isSidebarOpen" class="absolute top-3 right-3 opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
            <Button variant="ghost" size="icon" class="h-8 w-8" @click="toggleSidebar">
              <Icon name="lucide:panel-left-close" class="w-4 h-4" />
            </Button>
          </div>
          <div v-else class="flex items-center justify-center w-full h-full">
            <Button variant="ghost" size="icon" class="h-8 w-8" @click="toggleSidebar">
              <Icon name="lucide:panel-left-open" class="w-4 h-4" />
            </Button>
          </div>

          <!-- Logo & Title (Only visible when open) -->
          <div v-if="isSidebarOpen" class="flex items-center gap-3 px-6 w-full">
            <div class="w-10 h-10 bg-primary rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center text-primary-foreground font-bold text-xl shrink-0">
              Z
            </div>
            <span class="font-bold text-xl tracking-tight whitespace-nowrap overflow-hidden">ZotePad</span>
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
            to="/assets"
            class="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group overflow-hidden whitespace-nowrap"
            active-class="bg-primary text-primary-foreground shadow-md shadow-primary/20"
            :class="[
              $route.path.startsWith('/assets') ? '' : 'hover:bg-accent hover:text-accent-foreground',
              isSidebarOpen ? 'justify-start' : 'justify-center px-0',
            ]"
          >
            <Icon name="lucide:image" class="w-5 h-5 shrink-0" />
            <span class="font-medium transition-opacity duration-200" :class="isSidebarOpen ? 'opacity-100' : 'opacity-0 w-0 hidden'">资源</span>
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
    </aside>

    <!-- Mobile Drawer (Removed, replaced by Bottom Tab Bar) -->
    <!-- <Drawer v-model:open="isDrawerOpen"> ... </Drawer> -->

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background/50 relative">
      <!-- Mobile Header (Removed, pages handle their own headers) -->
      <!-- <header v-if="isMobile" ...> ... </header> -->

      <div class="flex-1 flex flex-col overflow-hidden relative" :class="{ 'pb-18': showTabBar }">
        <slot />
      </div>
    </main>

    <!-- Mobile Bottom Tab Bar -->
    <AppMobileTabBar v-if="showTabBar" />
  </div>
</template>
