<script setup lang="ts">
// 悬浮底部操作栏，用于移动端
</script>

<template>
  <div class="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-background/80 backdrop-blur-md border-t border-border/40 z-50 md:relative md:p-0 md:pb-0 md:bg-transparent md:backdrop-blur-none md:border-0">
    <slot />
  </div>
</template>
