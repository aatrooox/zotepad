<script setup lang="ts">
import type { CanvasLayout, CanvasTemplate, ImageItem } from '~/composables/useLeaferCanvas'
import { openPath } from '@tauri-apps/plugin-opener'
import { toast } from 'vue-sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Input } from '~/components/ui/input'
import { useEnvironment } from '~/composables/useEnvironment'
import { useLeaferCanvas } from '~/composables/useLeaferCanvas'

interface Props {
  initialImages?: string[]
  defaultLayout?: CanvasLayout
  canvasWidth?: number
  canvasHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  initialImages: () => [],
  defaultLayout: () => ({ type: 'grid', columns: 2, gap: 10, padding: 20 }),
  canvasWidth: 800,
  canvasHeight: 600,
})

const emit = defineEmits<{
  'export-success': [data: { data: string | Blob, width: number, height: number }]
  'export-error': [error: any]
  'images-loaded': [images: ImageItem[]]
}>()

const canvasContainer = ref<HTMLElement | null>(null)

const { isDesktop } = useEnvironment()

const {
  images,
  isReady,
  isLoading,
  addImage,
  addImages,
  clear,
  applyLayout,
  exportAsImage,
  activeTemplate,
  applyTemplate,
  fillTemplateWithUrls,
  getTemplateSlotIdAtPoint,
  clientToWorldPoint,
  templateStyle,
  setTemplateStyle,
} = useLeaferCanvas(canvasContainer)

// 当前布局配置
const currentLayout = ref<CanvasLayout>(props.defaultLayout)

// 导出配置
const exportFormat = ref<'png' | 'jpg'>('png')
const exportPixelRatio = ref(2)

// 响应式图片数量（确保模板正确响应）
const imageCount = computed(() => images.value.length)

// 文件输入引用
const fileInput = ref<HTMLInputElement | null>(null)
const slotFileInput = ref<HTMLInputElement | null>(null)
const pendingSlotId = ref<string | null>(null)

const templateBgColor = ref('#fafafa')
const templateGap = ref(20)
const templateRadius = ref(12)

const isApplyingTemplate = ref(false)

watch(
  templateStyle,
  (v) => {
    if (!v)
      return
    templateBgColor.value = v.backgroundColor
    templateGap.value = v.gap
    templateRadius.value = v.radius
  },
  { immediate: true, deep: true },
)

const applyTemplateStyle = async () => {
  await setTemplateStyle({
    backgroundColor: templateBgColor.value,
    gap: Number(templateGap.value) || 0,
    radius: Number(templateRadius.value) || 0,
  })
}

// 等待画布就绪
const waitForReady = async () => {
  if (isReady.value)
    return true

  const maxWaitTime = 5000 // 最多等待5秒
  const startTime = Date.now()
  while (!isReady.value && Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return isReady.value
}

// 加载初始图片
const loadInitialImages = async () => {
  const loadedImages = await addImages(props.initialImages)
  if (loadedImages.length > 0) {
    applyLayout(currentLayout.value)
    emit('images-loaded', loadedImages)
  }
}

// 在组件挂载时加载初始图片
onMounted(async () => {
  // 等待画布初始化
  await nextTick()

  const ready = await waitForReady()
  if (!ready) {
    console.error('画布初始化超时')
    toast.error('画布初始化失败')
    return
  }

  if (props.initialImages.length > 0) {
    await loadInitialImages()
  }

  // 右键：若启用模板布局，命中格子则替换该格子图片
  const el = canvasContainer.value
  if (el) {
    const onContextMenu = async (e: MouseEvent) => {
      if (!activeTemplate.value)
        return

      e.preventDefault()
      const world = clientToWorldPoint(e.clientX, e.clientY)
      if (!world)
        return

      const slotId = getTemplateSlotIdAtPoint(world.x, world.y)
      if (!slotId)
        return

      const ready = await waitForReady()
      if (!ready) {
        toast.error('画布未就绪，请稍后再试')
        return
      }

      pendingSlotId.value = slotId
      slotFileInput.value?.click()
    }

    el.addEventListener('contextmenu', onContextMenu)

    onUnmounted(() => {
      el.removeEventListener('contextmenu', onContextMenu)
    })
  }
})

// 触发文件选择
const triggerFileInput = async () => {
  const ready = await waitForReady()
  if (!ready) {
    toast.error('画布未就绪，请稍后再试')
    return
  }
  fileInput.value?.click()
}

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files?.length)
    return

  const files = Array.from(input.files)
  input.value = '' // 重置以便重复选择同一文件

  const toastId = toast.loading(`正在加载 ${files.length} 张图片...`)

  try {
    const urls = await Promise.all(
      files.map(file => new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target?.result as string)
        reader.readAsDataURL(file)
      })),
    )

    // 若启用模板布局：按顺序填充格子
    if (activeTemplate.value) {
      const loadedImages = await fillTemplateWithUrls(urls)
      if (loadedImages.length === 0) {
        toast.error('所有图片加载失败', { id: toastId })
        return
      }
      toast.success(`成功填充 ${loadedImages.length} 张图片`, { id: toastId })
      emit('images-loaded', images.value)
      return
    }

    const loadedImages = await addImages(urls)

    if (loadedImages.length === 0) {
      toast.error('所有图片加载失败', { id: toastId })
      return
    }

    applyLayout(currentLayout.value)

    toast.success(`成功加载 ${loadedImages.length} 张图片`, { id: toastId })

    emit('images-loaded', images.value)
  }
  catch (error) {
    console.error('加载图片失败', error)
    toast.error('加载图片失败', { id: toastId })
  }
}

// 模板布局选择：先渲染格子，再允许按顺序填充/右键替换
const handleSelectTemplate = async (template: CanvasTemplate) => {
  if (isApplyingTemplate.value)
    return
  const ready = await waitForReady()
  if (!ready) {
    toast.error('画布未就绪，请稍后再试')
    return
  }

  isApplyingTemplate.value = true
  try {
    await applyTemplate(template, { reflowExisting: true, removeOverflow: true })
    toast.success('已应用模板布局')
  }
  finally {
    isApplyingTemplate.value = false
  }
}

// 右键格子导入（单张替换）
const handleSlotFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  const slotId = pendingSlotId.value
  pendingSlotId.value = null
  input.value = ''

  if (!slotId)
    return

  const toastId = toast.loading('正在替换图片...')

  try {
    const url = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target?.result as string)
      reader.readAsDataURL(file!)
    })

    const loaded = await fillTemplateWithUrls([url], { targetSlotId: slotId })
    if (!loaded.length) {
      toast.error('图片加载失败', { id: toastId })
      return
    }
    toast.success('图片已替换', { id: toastId })
    emit('images-loaded', images.value)
  }
  catch {
    toast.error('替换失败', { id: toastId })
  }
}

// 导出图片
const handleExport = async () => {
  const toastId = toast.loading('正在导出图片...')

  try {
    const result = await exportAsImage({
      filename: `zotepad_img_${Date.now()}.${exportFormat.value}`,
      format: exportFormat.value,
      pixelRatio: exportPixelRatio.value,
    })

    if (result) {
      const savedPath = typeof result.data === 'string' ? result.data : null

      // 仅桌面端：提供打开文件所在位置
      if (savedPath && isDesktop.value) {
        toast.success('图片已导出', {
          id: toastId,
          action: {
            label: '打开所在位置',
            onClick: async () => {
              try {
                const { dirname } = await import('@tauri-apps/api/path')
                const dir = await dirname(savedPath)
                await openPath(dir)
              }
              catch (e) {
                console.error('打开文件所在位置失败', e)
                toast.error('打开文件所在位置失败')
              }
            },
          },
        })
      }
      else {
        toast.success('图片已导出', { id: toastId })
      }

      emit('export-success', result)
    }
    else {
      throw new Error('导出失败')
    }
  }
  catch (error) {
    console.error('导出失败', error)
    toast.error('导出失败', { id: toastId })
    emit('export-error', error)
  }
}

// 清空画布
const handleClear = () => {
  clear()
  toast.success('画布已清空')
}

// 暴露方法给父组件
defineExpose({
  addImage,
  addImages,
  clear,
  applyLayout,
  exportAsImage,
})
</script>

<template>
  <div class="relative w-full h-full overflow-hidden">
    <!-- 悬浮工具栏 -->
    <div class="absolute top-4 inset-x-0 z-30 flex justify-center">
      <div class="flex items-center gap-2 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-2">
        <Button size="icon" variant="ghost" title="导入图片" @click="triggerFileInput">
          <Icon name="lucide:image-plus" class="w-5 h-5" />
        </Button>
        <div class="w-px h-6 bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="icon" variant="ghost" title="选择布局模板">
              <Icon name="lucide:layout-template" class="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              @select="handleSelectTemplate('wechat-cover-235')"
              @click="handleSelectTemplate('wechat-cover-235')"
            >
              2.35:1 公众号封面（2 张）
            </DropdownMenuItem>
            <DropdownMenuItem
              @select="handleSelectTemplate('nine-grid')"
              @click="handleSelectTemplate('nine-grid')"
            >
              九宫格（9 张）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="icon" variant="ghost" :disabled="imageCount === 0" title="导出图片" @click="handleExport">
          <Icon name="lucide:download" class="w-5 h-5" />
        </Button>
        <div class="w-px h-6 bg-border" />
        <Button size="icon" variant="ghost" :disabled="imageCount === 0" title="清空画布" @click="handleClear">
          <Icon name="lucide:trash-2" class="w-5 h-5 text-destructive" />
        </Button>
        <div v-if="imageCount > 0" class="ml-2 text-xs text-muted-foreground">
          {{ imageCount }} 张
        </div>
      </div>
    </div>

    <!-- 模板操作栏（仅在选择模板后显示） -->
    <div
      v-if="activeTemplate"
      class="absolute bottom-4 inset-x-0 z-30 flex justify-center"
    >
      <div class="flex items-center gap-3 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-3 py-2">
        <div class="text-xs text-muted-foreground">
          模板设置
        </div>

        <div class="flex items-center gap-2">
          <div class="text-xs text-muted-foreground">
            背景
          </div>
          <input
            v-model="templateBgColor"
            type="color"
            class="h-8 w-8 rounded-md border border-border bg-transparent"
            @change="applyTemplateStyle"
          >
        </div>

        <div class="flex items-center gap-2">
          <div class="text-xs text-muted-foreground">
            间距
          </div>
          <Input
            v-model.number="templateGap"
            type="number"
            class="w-20"
            min="0"
            step="1"
            @change="applyTemplateStyle"
          />
        </div>

        <div class="flex items-center gap-2">
          <div class="text-xs text-muted-foreground">
            圆角
          </div>
          <Input
            v-model.number="templateRadius"
            type="number"
            class="w-20"
            min="0"
            step="1"
            @change="applyTemplateStyle"
          />
        </div>
      </div>
    </div>

    <!-- 画布区域（全屏） -->
    <div class="absolute inset-0 w-full h-full">
      <div v-if="isLoading || !isReady" class="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-20">
        <div class="flex flex-col items-center gap-3">
          <Icon name="lucide:loader-2" class="w-10 h-10 animate-spin text-primary" />
          <p class="text-sm text-muted-foreground">
            {{ isLoading ? '初始化画布...' : '等待就绪...' }}
          </p>
        </div>
      </div>

      <div v-if="isReady && imageCount === 0" class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        <div class="flex flex-col items-center gap-4 text-center">
          <Icon name="lucide:image" class="w-20 h-20 text-muted-foreground/30" />
          <p class="text-base font-medium text-muted-foreground">
            点击左上角按钮导入图片
          </p>
        </div>
      </div>

      <div
        ref="canvasContainer"
        class="w-full h-full"
      />
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInput"
      type="file"
      multiple
      accept="image/*"
      class="hidden"
      @change="handleFileSelect"
    >

    <input
      ref="slotFileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleSlotFileSelect"
    >
  </div>
</template>
