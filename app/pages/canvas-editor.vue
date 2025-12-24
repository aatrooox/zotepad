<script setup lang="ts">
import type { ImageItem } from '~/composables/useLeaferCanvas'
import { toast } from 'vue-sonner'

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

// 快速添加测试图片
const addTestImages = async () => {
  if (!canvasEditorRef.value)
    return

  const testUrls = [
    'https://picsum.photos/200/300',
    'https://picsum.photos/300/200',
    'https://picsum.photos/250/250',
  ]

  const toastId = toast.loading('正在加载测试图片...')

  try {
    await canvasEditorRef.value.addImages(testUrls)
    toast.success('测试图片已加载', { id: toastId })
  }
  catch {
    toast.error('加载失败', { id: toastId })
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- 顶部导航栏 -->
    <div class="border-b border-border px-4 md:px-6 py-3 md:py-4 bg-background/80 backdrop-blur-md shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="icon" @click="router.back()">
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
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
          <Button variant="outline" size="sm" @click="addTestImages">
            <Icon name="lucide:sparkles" class="w-4 h-4 mr-2" />
            加载测试图片
          </Button>
        </div>
      </div>
    </div>

    <!-- 编辑器主体 -->
    <div class="flex-1 overflow-hidden p-4 md:p-6">
      <AppCanvasEditor
        ref="canvasEditorRef"
        :initial-images="initialImages"
        @export-success="handleExportSuccess"
        @export-error="handleExportError"
        @images-loaded="handleImagesLoaded"
      />
    </div>

    <!-- 移动端快速操作（悬浮按钮） -->
    <div class="md:hidden fixed bottom-20 right-4 z-10">
      <Button size="icon" class="w-12 h-12 rounded-full shadow-lg" @click="addTestImages">
        <Icon name="lucide:sparkles" class="w-5 h-5" />
      </Button>
    </div>
  </div>
</template>
