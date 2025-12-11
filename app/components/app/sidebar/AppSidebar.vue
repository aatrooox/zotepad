<script setup lang="ts">
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useSidebar } from '~/composables/useSidebar'
import NoteList from './context/NoteList.vue'
import SidebarNavigation from './SidebarNavigation.vue'

const { mode, contextType, isVisible, restoreState } = useSidebar()
const { getSetting, setSetting } = useSettingRepository()

const isSidebarOpen = ref(true)

// Restore sidebar state
onMounted(async () => {
  // Restore sidebar state from persistent storage
  await restoreState()

  const savedState = await getSetting('sidebar_open')
  if (savedState !== null) {
    isSidebarOpen.value = savedState === 'true'
  }
})

const toggleSidebar = async () => {
  isSidebarOpen.value = !isSidebarOpen.value
  await setSetting('sidebar_open', String(isSidebarOpen.value))
}

// Dynamic width based on mode
const sidebarWidth = computed(() => {
  if (mode.value === 'context')
    return 'w-64'
  return isSidebarOpen.value ? 'w-48' : 'w-16'
})
</script>

<template>
  <aside
    v-if="isVisible"
    class="border-r bg-card/50 backdrop-blur-xl flex flex-col h-screen z-20 shadow-sm relative group/sidebar transition-all duration-300 ease-in-out overflow-hidden"
    :class="sidebarWidth"
  >
    <div class="h-full w-full relative">
      <Transition name="fade" mode="out-in">
        <SidebarNavigation
          v-if="mode === 'navigation'"
          :is-sidebar-open="isSidebarOpen"
          @toggle="toggleSidebar"
        />
        <NoteList
          v-else-if="mode === 'context' && contextType === 'notes'"
        />
        <!-- Add other context components here -->
        <div v-else class="flex items-center justify-center h-full text-muted-foreground">
          Unknown Context
        </div>
      </Transition>
    </div>
  </aside>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
