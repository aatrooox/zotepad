<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import AppSidebar from '~/components/app/sidebar/AppSidebar.vue'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useKeyboardInset } from '~/composables/useKeyboardInset'

useHead({ titleTemplate: '%s - ZotePad' })

const { width } = useWindowSize()
const isMobile = computed(() => width.value < 768)
const router = useRouter()
const route = useRoute()
const { getSetting, setSetting } = useSettingRepository()
// const { keyboardHeight } = useKeyboardInset()

onMounted(async () => {
  // Restore last active menu
  if (route.path === '/') {
    const lastMenu = await getSetting('last_active_menu')
    if (lastMenu && lastMenu !== '/') {
      router.replace(lastMenu)
    }
  }
})

// Save last active menu
watch(() => route.path, async (newPath) => {
  let menuToSave = '/'
  if (newPath.startsWith('/assets'))
    menuToSave = '/assets'
  else if (newPath.startsWith('/workflows'))
    menuToSave = '/workflows'
  else if (newPath === '/achievements')
    menuToSave = '/achievements'
  else if (newPath === '/settings')
    menuToSave = '/settings'

  await setSetting('last_active_menu', menuToSave)
})

const showTabBar = computed(() => {
  if (!isMobile.value)
    return false
  // Hide on write pages
  if (route.path.startsWith('/write/'))
    return false
  // For notes routes, only show on the main list tabs
  if (route.path.startsWith('/notes/')) {
    const listPaths = ['/notes', '/notes/articles', '/notes/moments', '/notes/assets']
    const normalizedPath = route.path.replace(/\/$/, '')
    return listPaths.includes(normalizedPath)
  }
  return true
})

const isNotePage = computed(() => {
  return route.path.match(/^\/(notes|write)\//)
})
</script>

<template>
  <div
    class="fixed inset-0 text-foreground flex font-sans antialiased selection:bg-primary/20 overflow-hidden overscroll-none"
    :class="isMobile ? 'bg-gradient-immersive-top' : 'bg-background'"
  >
    <!-- Desktop Sidebar -->
    <AppSidebar v-if="!isMobile" />

    <!-- Main Content -->
    <main
      class="flex-1 flex flex-col min-w-0 bg-background/50 relative"
      :class="[isNotePage ? 'overflow-hidden' : 'overflow-auto md:overflow-hidden']"
    >
      <div
        class="flex-1 flex flex-col relative"
        :class="[
          { 'pb-18': showTabBar },
          isNotePage ? 'overflow-hidden' : 'overflow-auto md:overflow-hidden',
        ]"
      >
        <slot />
      </div>
    </main>

    <!-- Mobile Bottom Tab Bar -->
    <AppMobileTabBar v-if="showTabBar" />
  </div>
</template>
