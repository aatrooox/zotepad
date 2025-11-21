<script setup lang="ts">
import Toaster from '@/components/ui/sonner.vue'
import 'vue-sonner/style.css'
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster class="pointer-events-auto" />
  </div>
</template>
