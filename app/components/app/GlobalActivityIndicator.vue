<script setup lang="ts">
import { Icon } from '#components'
import gsap from 'gsap'
import { useActivityStatus } from '~/composables/useActivityStatus'
import { useEnvironment } from '~/composables/useEnvironment'

const { syncState, workflowList } = useActivityStatus()
const { isMobile } = useEnvironment()

// Visual Sync State (with minimum display duration)
const visualIsSyncing = ref(false)
let syncStartTime = 0
let syncMinTimer: NodeJS.Timeout | null = null

watch(() => syncState.value.isSyncing, (isSyncing) => {
  if (isSyncing) {
    visualIsSyncing.value = true
    syncStartTime = Date.now()
    if (syncMinTimer)
      clearTimeout(syncMinTimer)
  }
  else {
    const elapsed = Date.now() - syncStartTime
    const remaining = Math.max(0, 1500 - elapsed)

    syncMinTimer = setTimeout(() => {
      visualIsSyncing.value = false
    }, remaining)
  }
}, { immediate: true })

// Auto-hide sync status after 3 seconds of inactivity
const showSync = ref(false)
let hideTimer: NodeJS.Timeout | null = null

watch(() => syncState.value.lastUpdated, () => {
  showSync.value = true
  if (hideTimer)
    clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    if (!visualIsSyncing.value) {
      showSync.value = false
    }
  }, 3000)
})

// Also watch visualIsSyncing to keep it visible while syncing
watch(visualIsSyncing, (newVal) => {
  if (newVal) {
    showSync.value = true
    if (hideTimer)
      clearTimeout(hideTimer)
  }
  else {
    // Sync finished, wait 3s then hide
    hideTimer = setTimeout(() => {
      showSync.value = false
    }, 3000)
  }
})

// Compact mode logic for mobile workflows
const compactStates = ref<Record<string, boolean>>({})

watch(() => workflowList.value, (list) => {
  list.forEach((wf) => {
    if (compactStates.value[wf.id] === undefined) {
      compactStates.value[wf.id] = false
      if (isMobile.value) {
        setTimeout(() => {
          compactStates.value[wf.id] = true
        }, 3000)
      }
    }
  })
}, { deep: true, immediate: true })

// Combined items for single TransitionGroup
const displayItems = computed(() => {
  const items: Array<{ type: 'sync' | 'workflow', id: string, data?: any }> = []

  // Sync Item
  if (showSync.value && (syncState.value.pushing > 0 || syncState.value.pulling > 0 || visualIsSyncing.value)) {
    items.push({ type: 'sync', id: 'sync-status' })
  }

  // Workflow Items
  workflowList.value.forEach((wf) => {
    items.push({ type: 'workflow', id: wf.id, data: wf })
  })

  return items
})

// GSAP Animations
const onBeforeEnter = (el: Element) => {
  const element = el as HTMLElement
  element.style.opacity = '0'
  // Initial position based on device
  if (isMobile.value) {
    element.style.transform = 'translateX(-20px)'
  }
  else {
    element.style.transform = 'translateY(20px)'
  }
}

const onEnter = (el: Element, done: () => void) => {
  gsap.to(el, {
    opacity: 1,
    x: 0,
    y: 0,
    duration: 0.5,
    ease: 'elastic.out(1, 0.75)',
    onComplete: done,
  })
}

const onLeave = (el: Element, done: () => void) => {
  const element = el as HTMLElement
  // Lock dimensions to prevent layout jump during absolute positioning
  const { width, height } = element.getBoundingClientRect()
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  element.style.position = 'absolute'

  gsap.to(el, {
    opacity: 0,
    scale: 0.8,
    x: isMobile.value ? -20 : 0,
    y: isMobile.value ? 0 : 20,
    duration: 0.3,
    ease: 'power2.in',
    onComplete: done,
  })
}

// Sync Icon Animations
const onSyncIconEnter = (el: Element, done: () => void) => {
  const element = el as HTMLElement
  const targetMargin = (syncState.value.pushing > 0 || syncState.value.pulling > 0) ? 12 : 0

  gsap.fromTo(element, { width: 0, opacity: 0, scale: 0, marginRight: 0 }, {
    width: 14,
    opacity: 1,
    scale: 1,
    marginRight: targetMargin,
    duration: 0.4,
    ease: 'back.out(1.5)',
    onComplete: () => {
      // Clear inline styles so Vue classes/styles take over for reactive updates
      gsap.set(element, { clearProps: 'all' })
      done()
    },
  })
}

const onSyncIconLeave = (el: Element, done: () => void) => {
  gsap.to(el, {
    width: 0,
    opacity: 0,
    scale: 0,
    marginRight: 0,
    duration: 0.3,
    ease: 'power2.in',
    onComplete: done,
  })
}
</script>

<template>
  <div
    class="fixed z-50 flex gap-2 pointer-events-none select-none items-start"
    :class="[
      isMobile
        ? 'flex-col top-[calc(env(safe-area-inset-top)+0.1rem)] left-4'
        : 'flex-col-reverse bottom-6 left-2',
    ]"
  >
    <TransitionGroup
      tag="div"
      class="contents"
      :css="false"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @leave="onLeave"
    >
      <div
        v-for="item in displayItems"
        :key="item.id"
        class="transition-all duration-500 ease-in-out"
      >
        <!-- Sync Status Content -->
        <div
          v-if="item.type === 'sync'"
          class="flex items-center px-3 py-1.5 bg-background/80 backdrop-blur-md border rounded-full shadow-sm text-xs font-medium text-muted-foreground"
        >
          <!-- Syncing Spinner -->
          <Transition
            :css="false"
            @enter="onSyncIconEnter"
            @leave="onSyncIconLeave"
          >
            <Icon
              v-if="visualIsSyncing"
              name="lucide:refresh-cw"
              class="w-3.5 h-3.5 animate-spin text-primary shrink-0 transition-[margin] duration-300"
              :class="{ 'mr-3': syncState.pushing > 0 || syncState.pulling > 0 }"
            />
          </Transition>

          <!-- Push Count -->
          <Transition
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 max-w-0"
            enter-to-class="opacity-100 max-w-[100px]"
            leave-active-class="transition-all duration-300 ease-in"
            leave-from-class="opacity-100 max-w-[100px]"
            leave-to-class="opacity-0 max-w-0"
          >
            <div
              v-if="syncState.pushing > 0"
              class="flex items-center gap-1 text-green-600 dark:text-green-500 whitespace-nowrap overflow-hidden"
            >
              <Icon name="lucide:arrow-up" class="w-3.5 h-3.5" />
              <span>{{ syncState.pushing }}</span>
            </div>
          </Transition>

          <!-- Divider -->
          <Transition
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 w-0 !mx-0"
            enter-to-class="opacity-100 w-px mx-3"
            leave-active-class="transition-all duration-300 ease-in"
            leave-from-class="opacity-100 w-px mx-3"
            leave-to-class="opacity-0 w-0 !mx-0"
          >
            <div v-if="syncState.pushing > 0 && syncState.pulling > 0" class="h-3 bg-border shrink-0 mx-3" />
          </Transition>

          <!-- Pull Count -->
          <Transition
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 max-w-0"
            enter-to-class="opacity-100 max-w-[100px]"
            leave-active-class="transition-all duration-300 ease-in"
            leave-from-class="opacity-100 max-w-[100px]"
            leave-to-class="opacity-0 max-w-0"
          >
            <div
              v-if="syncState.pulling > 0"
              class="flex items-center gap-1 text-green-600 dark:text-green-500 whitespace-nowrap overflow-hidden"
            >
              <Icon name="lucide:arrow-down" class="w-3.5 h-3.5" />
              <span>{{ syncState.pulling }}</span>
            </div>
          </Transition>
        </div>

        <!-- Workflow Content -->
        <div
          v-else
          class="flex items-center bg-background/90 backdrop-blur-md border shadow-sm text-xs transition-all duration-500 ease-spring"
          :class="[
            isMobile && compactStates[item.id]
              ? 'px-3 py-1.5 rounded-full text-muted-foreground'
              : 'gap-2 px-3 py-2 rounded-lg max-w-[200px]',
          ]"
        >
          <!-- Content Switcher -->
          <div class="relative flex items-center">
            <!-- Compact Mode -->
            <Transition
              enter-active-class="transition-all duration-300 ease-out delay-150"
              enter-from-class="opacity-0 scale-90 absolute"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition-all duration-150 ease-in absolute"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-90"
            >
              <div v-if="isMobile && compactStates[item.id]" class="flex items-center">
                <Icon
                  :name="item.data.status === 'success' ? 'lucide:check' : 'lucide:arrow-up'"
                  class="w-3.5 h-3.5 mr-1.5"
                  :class="item.data.status === 'success' ? 'text-green-500' : 'text-primary'"
                />
                <span class="font-medium whitespace-nowrap">
                  <template v-if="item.data.status === 'success'">完成</template>
                  <template v-else-if="item.data.status === 'error'">失败</template>
                  <template v-else>
                    {{ item.data.currentStep + 1 }}/{{ item.data.totalSteps }}
                  </template>
                </span>
              </div>
            </Transition>

            <!-- Full Mode -->
            <Transition
              enter-active-class="transition-all duration-300 ease-out delay-150"
              enter-from-class="opacity-0 scale-90 absolute"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition-all duration-150 ease-in absolute"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-90"
            >
              <div v-if="!isMobile || !compactStates[item.id]" class="flex items-center gap-2 min-w-0">
                <div class="shrink-0">
                  <Icon v-if="item.data.status === 'running'" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin text-primary" />
                  <Icon v-else-if="item.data.status === 'success'" name="lucide:check-circle" class="w-3.5 h-3.5 text-green-500" />
                  <Icon v-else-if="item.data.status === 'error'" name="lucide:x-circle" class="w-3.5 h-3.5 text-destructive" />
                </div>

                <div class="flex flex-col min-w-0">
                  <span class="font-medium truncate">{{ item.data.title }}</span>
                  <span class="text-[10px] text-muted-foreground truncate">
                    {{ item.data.status === 'running' ? `Step ${item.data.currentStep + 1}/${item.data.totalSteps}: ${item.data.stepName}` : (item.data.status === 'success' ? '完成' : '失败') }}
                  </span>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* Ensure smooth layout transitions */
.v-move {
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Custom ease for width/padding transitions */
.ease-spring {
  transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>
