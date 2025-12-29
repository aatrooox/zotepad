<script setup lang="ts">
import type { ImageItem } from '~/composables/useLeaferCanvas'

useHead({ title: '图片工具' })

// const router = useRouter()
const route = useRoute()

// 从路由获取初始图片（支持通过 URL 传递图片）
const initialImages = computed(() => {
  const urls = route.query.images
  if (typeof urls === 'string') {
    try {
      return JSON.parse(decodeURIComponent(urls))
    }
    catch {
      return []
    }
  }
  return []
})

// Canvas 编辑器引用
const canvasEditorRef = ref<any>(null)

// 处理导出成功
const handleExportSuccess = (data: { data: string | Blob, width: number, height: number }) => {
  console.log('导出成功', data)
}

// 处理导出错误
const handleExportError = (error: any) => {
  console.error('导出失败', error)
}

// 处理图片加载完成
const handleImagesLoaded = (images: ImageItem[]) => {
  console.log('图片已加载', images)
}

// 禁用页面缩放和滚动
onMounted(() => {
  // 阻止双指缩放和默认触摸行为
  const preventZoom = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      e.preventDefault()
    }
  }

  const preventDefaultTouch = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      e.preventDefault()
    }
  }

  document.addEventListener('touchstart', preventZoom, { passive: false })
  document.addEventListener('touchmove', preventDefaultTouch, { passive: false })
  document.addEventListener('gesturestart', e => e.preventDefault())
  document.addEventListener('gesturechange', e => e.preventDefault())
  document.addEventListener('gestureend', e => e.preventDefault())

  onUnmounted(() => {
    document.removeEventListener('touchstart', preventZoom)
    document.removeEventListener('touchmove', preventDefaultTouch)
  })
})
</script>

<template>
  <div class="h-full flex flex-col bg-background" style="touch-action: none; -webkit-user-select: none; user-select: none;">
    <!-- 顶部导航栏 -->
    <AppPageHeader title="图片工具" class="bg-background/80 backdrop-blur-md sticky top-0 z-20 border-b" />

    <!-- 编辑器主体 -->
    <div class="flex-1 overflow-hidden p-4 md:p-2" style="touch-action: none;">
      <AppCanvasEditor
        ref="canvasEditorRef"
        :initial-images="initialImages"
        @export-success="handleExportSuccess"
        @export-error="handleExportError"
        @images-loaded="handleImagesLoaded"
      />
    </div>
  </div>
</template>
