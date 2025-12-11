<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  interactive?: boolean
}>()
</script>

<template>
  <div
    data-slot="card"
    :class="
      cn(
        'bg-card text-card-foreground flex flex-col gap-4 rounded-2xl border border-border/40 py-6 shadow-sm transition-all duration-300',
        props.interactive && 'hover:shadow-elevation-2 hover:border-primary/20 hover:-translate-y-1 cursor-pointer group',
        props.class,
      )
    "
  >
    <div v-if="props.interactive" class="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    <slot />
  </div>
</template>
