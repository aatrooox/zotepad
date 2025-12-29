<script setup lang="ts">
import type { ImageItem } from '~/composables/useLeaferCanvas'

useHead({ title: 'Canvas 编辑器' })

const router = useRouter()
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
    <div class="border-b border-border px-2 md:px-1 py-1 md:py-1 bg-background/80 backdrop-blur-md shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="icon" @click="router.back()">
            <Icon name="lucide:arrow-left" class="w-3 h-3" />
          </Button>
          <div>
            <h1 class="text-lg md:text-xl font-bold">
              Canvas 编辑器
            </h1>
            <p class="text-xs text-muted-foreground hidden md:block">
              图片导入、布局编辑与导出
            </p>
          </div>
        </div>

        <!-- 快速操作按钮（桌面端） -->
        <div class="hidden md:flex items-center gap-2">
          <!-- 预留：后续可以在这里加更多编辑快捷操作 -->
        </div>
      </div>
    </div>

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
