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
const { isDesktop } = useEnvironment()
const activity = useActivityStatus()

onMounted(async () => {
  try {
    await loadSyncConfig()
    console.log('[App] 全局配置加载完成')

    // 桌面端:监听远程推送事件(全局只注册一次)
    if (isDesktop.value) {
      const { listen } = await import('@tauri-apps/api/event')
      await listen<number>('sync:incoming', (event) => {
        console.log('[App] 收到远程推送通知,拉取数量:', event.payload)
        // 显示"拉取"状态
        activity.setSyncCounts(0, event.payload)
        // 3.5秒后清除状态
        setTimeout(() => {
          activity.setSyncCounts(0, 0)
        }, 3500)
      })
      console.log('[App] 已注册 sync:incoming 全局监听器')
    }
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
