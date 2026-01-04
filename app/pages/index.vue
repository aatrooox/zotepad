<script setup lang="ts">
const router = useRouter()

// 重定向到 /notes
onMounted(() => {
  router.replace('/notes')
})
</script>

<template>
  <div class="h-full flex items-center justify-center">
    <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-muted-foreground" />
  </div>
</template>
