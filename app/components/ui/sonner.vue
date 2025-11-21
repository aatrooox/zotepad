<script setup lang="ts">
import { Toaster as Sonner } from 'vue-sonner'

interface Props {
  theme?: 'light' | 'dark' | 'system'
  class?: string
  toastOptions?: {
    style?: Record<string, string>
    className?: string
    descriptionClassName?: string
    actionButtonStyle?: Record<string, string>
    cancelButtonStyle?: Record<string, string>
  }
}

const props = withDefaults(defineProps<Props>(), {
  theme: 'dark',
  class: '',
})
</script>

<template>
  <Sonner
    :theme="props.theme"
    :class="props.class"
    :toast-options="props.toastOptions"
    position="top-center"
  />
</template>