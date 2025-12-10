<script setup lang="ts">
import GlobalActivityIndicator from '@/components/app/GlobalActivityIndicator.vue'
import Toaster from '@/components/ui/sonner.vue'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import 'vue-sonner/style.css'

useHead({
  meta: [
    // Simplify viewport to avoid IME/resize quirks on some Android WebViews
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
  ],
})

// 全局初始化:加载同步配置等
const { loadSyncConfig } = useSyncManager()

onMounted(async () => {
  try {
    await loadSyncConfig()
    console.log('[App] 全局配置加载完成')
  }
  catch (e) {
    console.error('[App] 全局配置加载失败:', e)
  }
})
</script>

<template>
  <div class="h-full">
    <NuxtRouteAnnouncer />
    <GlobalActivityIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster class="pointer-events-auto" rich-colors theme="light" :duration="2500" />
  </div>
</template>
