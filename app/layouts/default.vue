<script setup lang="ts">
import Sonner from '@/components/ui/sonner.vue'

useHead({ titleTemplate: '%s - App' })
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <Sonner />
    <slot />
  </div>
</template>
