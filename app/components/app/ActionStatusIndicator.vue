<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  status: 'idle' | 'loading' | 'success' | 'error' | 'saving' | 'saved'
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  status: 'idle',
  class: '',
})

const computedStatus = computed(() => {
  if (props.status === 'saving')
    return 'loading'
  if (props.status === 'saved')
    return 'success'
  return props.status
})
</script>

<template>
  <div :class="cn('absolute bottom-6 right-8 z-20 pointer-events-none', props.class)">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="computedStatus !== 'idle'"
        class="bg-background/80 backdrop-blur-sm border rounded-full p-2 shadow-sm flex items-center justify-center"
      >
        <Icon
          v-if="computedStatus === 'loading'"
          name="lucide:loader-2"
          class="w-4 h-4 animate-spin text-muted-foreground"
        />
        <Icon
          v-else-if="computedStatus === 'success'"
          name="lucide:check"
          class="w-4 h-4 text-green-500"
        />
        <Icon
          v-else-if="computedStatus === 'error'"
          name="lucide:x"
          class="w-4 h-4 text-destructive"
        />
      </div>
    </Transition>
  </div>
</template>
