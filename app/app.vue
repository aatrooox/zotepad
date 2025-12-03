<script setup lang="ts">
import Toaster from '@/components/ui/sonner.vue'
import 'vue-sonner/style.css'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content' },
  ],
})
</script>

<template>
  <div class="h-full">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster class="pointer-events-auto" rich-colors theme="light" :duration="2500" />
  </div>
</template>
