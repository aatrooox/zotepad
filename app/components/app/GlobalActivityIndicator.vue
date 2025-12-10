<script setup lang="ts">
import { Icon } from '#components'
import { useActivityStatus } from '~/composables/useActivityStatus'
import { useEnvironment } from '~/composables/useEnvironment'

const { syncState, workflowList } = useActivityStatus()
const { isMobile } = useEnvironment()

// Auto-hide sync status after 3 seconds of inactivity
const showSync = ref(false)
let hideTimer: NodeJS.Timeout | null = null

watch(() => syncState.value.lastUpdated, () => {
  showSync.value = true
  if (hideTimer)
    clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    // Only hide if counts are zero, or keep showing if syncing?
    // Actually user wants to see "Push 1", "Pull 1".
    // If it's done, it should probably disappear after a while.
    if (!syncState.value.isSyncing) {
      showSync.value = false
    }
  }, 3000)
})

// Also watch isSyncing to keep it visible while syncing
watch(() => syncState.value.isSyncing, (newVal) => {
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
</script>

<template>
  <div
    class="fixed z-50 flex gap-2 pointer-events-none select-none transition-all duration-300 items-start"
    :class="[
      isMobile
        ? 'flex-col top-[calc(env(safe-area-inset-top)+0.1rem)] left-4'
        : 'flex-col-reverse bottom-6 left-2',
    ]"
  >
    <!-- Sync Status -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="showSync && (syncState.pushing > 0 || syncState.pulling > 0 || syncState.isSyncing)"
        class="flex items-center px-3 py-1.5 bg-background/80 backdrop-blur-md border rounded-full shadow-sm text-xs font-medium text-muted-foreground"
      >
        <!-- Syncing Spinner -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 w-0 scale-0 !mr-0"
          enter-to-class="opacity-100 w-3.5 scale-100"
          leave-active-class="transition-all duration-300 ease-in"
          leave-from-class="opacity-100 w-3.5 scale-100"
          leave-to-class="opacity-0 w-0 scale-0 !mr-0"
        >
          <Icon
            v-if="syncState.isSyncing"
            name="lucide:refresh-cw"
            class="w-3.5 h-3.5 animate-spin text-primary shrink-0"
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

        <!-- Divider if both exist -->
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
    </Transition>

    <!-- Workflow Statuses -->
    <TransitionGroup
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 -translate-x-2"
      enter-to-class="opacity-100 translate-x-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-x-0"
      leave-to-class="opacity-0 -translate-x-2"
    >
      <div
        v-for="wf in workflowList"
        :key="wf.id"
        class="flex items-center bg-background/90 backdrop-blur-md border shadow-sm text-xs transition-all duration-300"
        :class="[
          isMobile && compactStates[wf.id]
            ? 'px-3 py-1.5 rounded-full text-muted-foreground'
            : 'gap-2 px-3 py-2 rounded-lg max-w-[200px]',
        ]"
      >
        <!-- Compact Mode Content -->
        <template v-if="isMobile && compactStates[wf.id]">
          <Icon
            :name="wf.status === 'success' ? 'lucide:check' : 'lucide:arrow-up'"
            class="w-3.5 h-3.5 mr-1.5"
            :class="wf.status === 'success' ? 'text-green-500' : 'text-primary'"
          />
          <span class="font-medium">
            <template v-if="wf.status === 'success'">完成</template>
            <template v-else-if="wf.status === 'error'">失败</template>
            <template v-else>
              {{ wf.currentStep + 1 }}/{{ wf.totalSteps }}
            </template>
          </span>
        </template>

        <!-- Full Mode Content -->
        <template v-else>
          <div class="shrink-0">
            <Icon v-if="wf.status === 'running'" name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin text-primary" />
            <Icon v-else-if="wf.status === 'success'" name="lucide:check-circle" class="w-3.5 h-3.5 text-green-500" />
            <Icon v-else-if="wf.status === 'error'" name="lucide:x-circle" class="w-3.5 h-3.5 text-destructive" />
          </div>

          <div class="flex flex-col min-w-0">
            <span class="font-medium truncate">{{ wf.title }}</span>
            <span class="text-[10px] text-muted-foreground truncate">
              {{ wf.status === 'running' ? `Step ${wf.currentStep + 1}/${wf.totalSteps}: ${wf.stepName}` : (wf.status === 'success' ? '完成' : '失败') }}
            </span>
          </div>
        </template>
      </div>
    </TransitionGroup>
  </div>
</template>
