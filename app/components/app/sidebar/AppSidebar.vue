<script setup lang="ts">
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useSidebar } from '~/composables/useSidebar'
import NoteList from './context/NoteList.vue'
import SidebarNavigation from './SidebarNavigation.vue'

const { mode, contextType, isVisible, isCollapsed, restoreState } = useSidebar()
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

// Sync isSidebarOpen with isCollapsed from composable
watch(isCollapsed, (val) => {
  isSidebarOpen.value = !val
})

// Sync isSidebarOpen changes back (if manual toggle happens inside navigation)
watch(isSidebarOpen, (val) => {
  if (isCollapsed.value === val) { // only if different
    isCollapsed.value = !val
  }
})

const toggleSidebar = async () => {
  isSidebarOpen.value = !isSidebarOpen.value
  await setSetting('sidebar_open', String(isSidebarOpen.value))
}

// Dynamic width based on mode
const sidebarWidth = computed(() => {
  if (mode.value === 'context' && contextType.value === 'notes')
    return 'w-64'
  return isSidebarOpen.value ? 'w-48' : 'w-16'
})
</script>

<template>
  <aside
    v-if="isVisible"
    class="border-r bg-card/50 backdrop-blur-xl flex flex-col h-screen z-20 shadow-sm relative group/sidebar transition-all duration-300 ease-in-out overflow-hidden bg-gradient-sidebar-top"
    :class="sidebarWidth"
  >
    <div class="h-full w-full relative z-10">
      <Transition name="fade" mode="out-in">
        <NoteList
          v-if="mode === 'context' && contextType === 'notes'"
        />
        <!-- Add other context components here -->
        <SidebarNavigation
          v-else
          :is-sidebar-open="isSidebarOpen"
          @toggle="toggleSidebar"
        />
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
