<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import AppSidebar from '~/components/app/sidebar/AppSidebar.vue'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'

useHead({ titleTemplate: '%s - ZotePad' })

const { width } = useWindowSize()
const isMobile = computed(() => width.value < 768)
const router = useRouter()
const route = useRoute()
const { getSetting, setSetting } = useSettingRepository()

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
  return isMobile.value && !route.path.match(/^\/notes\/(new|\d+)$/)
})
</script>

<template>
  <div class="h-full bg-background text-foreground flex font-sans antialiased selection:bg-primary/20 overflow-auto md:overflow-hidden">
    <!-- Desktop Sidebar -->
    <AppSidebar v-if="!isMobile" />

    <!-- Main Content -->
    <main class="flex-1 flex flex-col min-w-0 h-full overflow-auto md:overflow-hidden bg-background/50 relative">
      <div class="flex-1 flex flex-col overflow-auto md:overflow-hidden relative" :class="{ 'pb-18': showTabBar }">
        <slot />
      </div>
    </main>

    <!-- Mobile Bottom Tab Bar -->
    <AppMobileTabBar v-if="showTabBar" />
  </div>
</template>
