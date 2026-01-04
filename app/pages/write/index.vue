<script setup lang="ts">
useHead({ title: '写 - ZotePad' })
</script>

<template>
  <div class="h-full flex flex-col bg-background/50 overflow-hidden">
    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto">
      <NuxtPage />
    </div>
  </div>
</template>
