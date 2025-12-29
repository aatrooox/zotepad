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
  defaultLayout: () => ({ type: 'grid', columns: 2, gap: 10, padding: 10 }),
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
  clearTemplate,
  editingImageId,
  enterEditMode,
  exitEditMode,
  canvasSize, // 导出尺寸信息
} = useLeaferCanvas(canvasContainer)

// 当前布局配置
const currentLayout = ref<CanvasLayout>(props.defaultLayout)

// 导出配置
const exportFormat = ref<'png' | 'jpg'>('png')
const exportPixelRatio = ref(2)

// 导出质量预设
const exportQualityOptions = [
  { label: '标准 (1x)', value: 1, desc: '' },
  { label: '高清 (2x)', value: 2, desc: '' },
  { label: '超清 (3x)', value: 3, desc: '' },
  { label: '极清 (4x)', value: 4, desc: '' },
]

// 响应式图片数量（确保模板正确响应）
const imageCount = computed(() => images.value.length)

// 文件输入引用
const fileInput = ref<HTMLInputElement | null>(null)
const slotFileInput = ref<HTMLInputElement | null>(null)
const pendingSlotId = ref<string | null>(null)

const templateBgColor = ref('#fafafa')
const templateGap = ref(0)
const templateRadius = ref(0)
const templatePadding = ref(0)
const templateImageRadius = ref(0)

const isApplyingTemplate = ref(false)

// 当前激活的控制项
type ControlType = 'background' | 'gap' | 'padding' | 'radius' | 'imageRadius' | null
const activeControl = ref<ControlType>(null)

// 背景类型：纯色或渐变
type BackgroundType = 'solid' | 'gradient'
const backgroundType = ref<BackgroundType>('solid')

// 预设渐变色方案（适合社交媒体传播）
const gradientPresets = [
  {
    name: '日出橙',
    value: { type: 'linear', from: 'top', stops: [{ offset: 0, color: '#ff6b6b' }, { offset: 1, color: '#ffd93d' }] },
  },
  {
    name: '海洋蓝',
    value: { type: 'linear', from: 'top', stops: [{ offset: 0, color: '#667eea' }, { offset: 1, color: '#764ba2' }] },
  },
  {
    name: '森林绿',
    value: { type: 'linear', from: 'top', stops: [{ offset: 0, color: '#56ab2f' }, { offset: 1, color: '#a8e063' }] },
  },
  {
    name: '紫粉梦',
    value: { type: 'linear', from: 'left', stops: [{ offset: 0, color: '#ee9ca7' }, { offset: 1, color: '#ffdde1' }] },
  },
  {
    name: '炫彩虹',
    value: { type: 'linear', from: 'bottom-left', stops: [{ offset: 0, color: '#ff6b6b' }, { offset: 0.5, color: '#4ecdc4' }, { offset: 1, color: '#ffd93d' }] },
  },
  {
    name: '暮光紫',
    value: { type: 'linear', from: 'top', stops: [{ offset: 0, color: '#834d9b' }, { offset: 1, color: '#d04ed6' }] },
  },
  {
    name: '极光绿',
    value: { type: 'linear', from: 'left', stops: [{ offset: 0, color: '#00d2ff' }, { offset: 1, color: '#3a7bd5' }] },
  },
  {
    name: '樱花粉',
    value: { type: 'linear', from: 'top', stops: [{ offset: 0, color: '#fbc2eb' }, { offset: 1, color: '#a6c1ee' }] },
  },
]

const selectedGradient = ref(gradientPresets[0])

// 切换控制项
const toggleControl = (type: ControlType) => {
  if (activeControl.value === type) {
    activeControl.value = null
  }
  else {
    activeControl.value = type
  }
}

// 应用渐变色
const applyGradient = (gradient: typeof gradientPresets[0]) => {
  selectedGradient.value = gradient
  backgroundType.value = 'gradient'
  setTemplateStyle({
    backgroundColor: gradient.value as any,
    gap: templateGap.value,
    radius: templateRadius.value,
    padding: templatePadding.value,
    imageRadius: templateImageRadius.value,
  })
}

watch(
  templateStyle,
  (v) => {
    if (!v)
      return
    templateBgColor.value = v.backgroundColor
    templateGap.value = v.gap
    templateRadius.value = v.radius
    templatePadding.value = v.padding
    templateImageRadius.value = v.imageRadius
  },
  { immediate: true, deep: true },
)

// 防抖计时器
let applyStyleTimer: ReturnType<typeof setTimeout> | null = null

const applyTemplateStyle = async () => {
  // 使用 ?? 而不是 ||，以支持 0 值
  const gap = Number(templateGap.value) ?? 0
  const outerRadius = Number(templateRadius.value) ?? 0
  const padding = Number(templatePadding.value) ?? 0
  const imageRadius = Number(templateImageRadius.value) ?? 0

  // 检查是否是间距变化（gap 或 padding）
  const oldGap = templateStyle.value?.gap ?? 0
  const oldPadding = templateStyle.value?.padding ?? 0
  const isSpacingChanged = gap !== oldGap || padding !== oldPadding

  await setTemplateStyle({
    backgroundColor: templateBgColor.value,
    gap,
    radius: outerRadius,
    padding,
    imageRadius,
  })

  // 仅在间距变化时重新应用布局，背景色和圆角不影响图片位置
  if (isSpacingChanged && !activeTemplate.value && images.value.length > 0) {
    currentLayout.value = {
      ...currentLayout.value,
      gap,
      padding,
    }
    applyLayout(currentLayout.value)
  }
}

// 带防抖的应用样式（用于滑块实时输入）
const applyTemplateStyleDebounced = () => {
  if (applyStyleTimer) {
    clearTimeout(applyStyleTimer)
  }
  applyStyleTimer = setTimeout(() => {
    applyTemplateStyle()
  }, 100) // 100ms 防抖
}

// 应用纯色
const applySolidColor = () => {
  backgroundType.value = 'solid'
  applyTemplateStyle()
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

// 基础布局选择：网格 / 横向 / 纵向
const handleSelectLayout = async (type: CanvasLayout['type']) => {
  const ready = await waitForReady()
  if (!ready) {
    toast.error('画布未就绪，请稍后再试')
    return
  }

  currentLayout.value = {
    ...currentLayout.value,
    type,
  }

  // 切换到基础布局时，清除模板占位与映射
  clearTemplate()

  if (images.value.length > 0)
    applyLayout(currentLayout.value)
}

// 模板布局选择：先渲染格子，再允许按顺序填充/右键替换
const handleSelectTemplate = async (template: CanvasTemplate) => {
  if (isApplyingTemplate.value)
    return
  const ready = await waitForReady()
  if (!ready) {
    // toast.error('画布未就绪，请稍后再试')
    return
  }

  isApplyingTemplate.value = true
  try {
    await applyTemplate(template, { reflowExisting: true, removeOverflow: true })
    // toast.success('已应用模板布局')
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

  // const toastId = toast.loading('正在替换图片...')

  try {
    const url = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target?.result as string)
      reader.readAsDataURL(file!)
    })

    const loaded = await fillTemplateWithUrls([url], { targetSlotId: slotId })
    if (!loaded.length) {
      // toast.error('图片加载失败', { id: toastId })
      return
    }
    // toast.success('图片已替换', { id: toastId })
    emit('images-loaded', images.value)
  }
  catch {
    // toast.error('替换失败', { id: toastId })
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
    <div
      class="absolute inset-x-0 z-30 flex justify-center px-1.5 md:px-4"
      :style="{
        top: 'calc(0.25rem + env(safe-area-inset-top))',
      }"
    >
      <div class="flex flex-wrap items-center gap-1 md:gap-2 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-1.5 py-1 md:px-3 md:py-2 w-full max-w-[min(640px,100%)]">
        <Button size="icon" variant="ghost" title="导入图片" class="h-8 w-8 md:h-10 md:w-10" @click="triggerFileInput">
          <Icon name="lucide:image-plus" class="w-4 h-4 md:w-5 md:h-5" />
        </Button>
        <div class="w-px h-5 md:h-6 bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="icon" variant="ghost" title="选择布局" class="h-8 w-8 md:h-10 md:w-10">
              <Icon name="lucide:layout-grid" class="w-4 h-4 md:w-5 md:h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              @select="handleSelectLayout('horizontal')"
              @click="handleSelectLayout('horizontal')"
            >
              横向拼图
            </DropdownMenuItem>
            <DropdownMenuItem
              @select="handleSelectLayout('vertical')"
              @click="handleSelectLayout('vertical')"
            >
              纵向拼图
            </DropdownMenuItem>
            <DropdownMenuItem
              @select="handleSelectTemplate('nine-grid')"
              @click="handleSelectTemplate('nine-grid')"
            >
              九宫格（9 张）
            </DropdownMenuItem>
            <DropdownMenuItem
              @select="handleSelectTemplate('wechat-cover-235')"
              @click="handleSelectTemplate('wechat-cover-235')"
            >
              2.35:1 公众号封面（2 张）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="icon" variant="ghost" :disabled="imageCount === 0" title="导出图片" class="h-8 w-8 md:h-10 md:w-10">
              <Icon name="lucide:download" class="w-4 h-4 md:w-5 md:h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              导出质量
            </div>
            <DropdownMenuItem
              v-for="option in exportQualityOptions"
              :key="option.value"
              @select="() => { exportPixelRatio = option.value; handleExport() }"
            >
              <div class="flex items-center justify-between w-full">
                <div class="flex flex-col">
                  <span class="font-medium">{{ option.label }}</span>
                  <span class="text-[10px] text-muted-foreground">{{ option.desc }}</span>
                </div>
                <Icon v-if="exportPixelRatio === option.value" name="lucide:check" class="w-4 h-4 text-primary ml-2" />
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div class="w-px h-5 md:h-6 bg-border" />
        <Button
          size="icon"
          variant="ghost"
          :disabled="imageCount === 0"
          :title="editingImageId ? '退出编辑' : '编辑图片'"
          class="h-8 w-8 md:h-10 md:w-10"
          @click="editingImageId ? exitEditMode() : enterEditMode()"
        >
          <Icon :name="editingImageId ? 'lucide:check' : 'lucide:edit'" class="w-4 h-4 md:w-5 md:h-5" :class="editingImageId ? 'text-green-500' : ''" />
        </Button>
        <div class="w-px h-5 md:h-6 bg-border" />
        <Button size="icon" variant="ghost" :disabled="imageCount === 0" title="清空画布" class="h-8 w-8 md:h-10 md:w-10" @click="handleClear">
          <Icon name="lucide:trash-2" class="w-4 h-4 md:w-5 md:h-5 text-destructive" />
        </Button>
        <div v-if="imageCount > 0" class="ml-1 md:ml-2 text-[10px] md:text-xs text-muted-foreground">
          {{ imageCount }}
        </div>

        <!-- 尺寸信息显示 -->
        <div v-if="canvasSize.width > 0 && canvasSize.height > 0" class="ml-auto flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground font-mono">
          <Icon name="lucide:maximize-2" class="w-3 h-3 md:w-4 md:h-4" />
          <span>{{ canvasSize.width }} × {{ canvasSize.height }}</span>
        </div>
      </div>
    </div>

    <!-- 模板操作栏（基础布局 & 模板布局通用） -->
    <div
      v-if="imageCount > 0"
      class="absolute bottom-1.5 md:bottom-2 inset-x-0 z-30 flex flex-col items-center px-1.5 md:px-4 gap-1.5 md:gap-2"
    >
      <!-- 上方操作面板（根据激活项显示） -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div
          v-if="activeControl"
          class="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-3 py-2 md:px-4 md:py-3 w-full max-w-[min(400px,100%)]"
        >
          <!-- 背景颜色 -->
          <div v-if="activeControl === 'background'" class="space-y-2">
            <!-- 类型切换 -->
            <div class="flex items-center gap-2">
              <button
                class="flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                :class="backgroundType === 'solid' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'"
                @click="backgroundType = 'solid'"
              >
                纯色
              </button>
              <button
                class="flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                :class="backgroundType === 'gradient' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'"
                @click="backgroundType = 'gradient'"
              >
                渐变
              </button>
            </div>

            <!-- 纯色选择器 -->
            <div v-if="backgroundType === 'solid'" class="flex items-center justify-between">
              <span class="text-xs md:text-sm font-medium">选择颜色</span>
              <input
                v-model="templateBgColor"
                type="color"
                class="h-8 w-16 md:h-10 md:w-20 rounded-md border border-border bg-transparent cursor-pointer"
                @change="applySolidColor"
              >
            </div>

            <!-- 渐变色预设 -->
            <div v-if="backgroundType === 'gradient'" class="space-y-2">
              <span class="text-xs md:text-sm font-medium">选择渐变</span>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="preset in gradientPresets"
                  :key="preset.name"
                  class="relative h-12 rounded-md border-2 transition-all overflow-hidden"
                  :class="selectedGradient?.name === preset.name ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'"
                  :style="{
                    background: `linear-gradient(to bottom, ${preset.value.stops.map(s => s.color).join(', ')})`,
                  }"
                  @click="applyGradient(preset)"
                >
                  <span class="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white drop-shadow-md">
                    {{ preset.name }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- 图片间距 -->
          <div v-if="activeControl === 'gap'" class="space-y-1.5 md:space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs md:text-sm font-medium">图片间距</span>
              <span class="text-xs md:text-sm text-muted-foreground font-mono">{{ templateGap }}px</span>
            </div>
            <input
              v-model.number="templateGap"
              type="range"
              min="0"
              max="80"
              step="1"
              class="w-full"
              @input="applyTemplateStyleDebounced"
            >
          </div>

          <!-- 内间距 -->
          <div v-if="activeControl === 'padding'" class="space-y-1.5 md:space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs md:text-sm font-medium">内间距</span>
              <span class="text-xs md:text-sm text-muted-foreground font-mono">{{ templatePadding }}px</span>
            </div>
            <input
              v-model.number="templatePadding"
              type="range"
              min="0"
              max="80"
              step="1"
              class="w-full"
              @input="applyTemplateStyleDebounced"
            >
          </div>

          <!-- 外部圆角 -->
          <div v-if="activeControl === 'radius'" class="space-y-1.5 md:space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs md:text-sm font-medium">外部圆角</span>
              <span class="text-xs md:text-sm text-muted-foreground font-mono">{{ templateRadius }}px</span>
            </div>
            <input
              v-model.number="templateRadius"
              type="range"
              min="0"
              max="64"
              step="1"
              class="w-full"
              @input="applyTemplateStyleDebounced"
            >
          </div>

          <!-- 图片圆角 -->
          <div v-if="activeControl === 'imageRadius'" class="space-y-1.5 md:space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs md:text-sm font-medium">图片圆角</span>
              <span class="text-xs md:text-sm text-muted-foreground font-mono">{{ templateImageRadius }}px</span>
            </div>
            <input
              v-model.number="templateImageRadius"
              type="range"
              min="0"
              max="64"
              step="1"
              class="w-full"
              @input="applyTemplateStyleDebounced"
            >
          </div>
        </div>
      </Transition>

      <!-- 下方图标按钮栏 -->
      <div class="flex items-center gap-1 md:gap-2 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-2 py-1.5 md:px-3 md:py-2">
        <Button
          size="icon"
          :variant="activeControl === 'background' ? 'default' : 'ghost'"
          title="背景颜色"
          class="h-8 w-8 md:h-10 md:w-10"
          @click="toggleControl('background')"
        >
          <Icon name="lucide:palette" class="w-4 h-4 md:w-5 md:h-5" />
        </Button>

        <div class="w-px h-5 md:h-6 bg-border" />

        <Button
          size="icon"
          :variant="activeControl === 'gap' ? 'default' : 'ghost'"
          title="图片间距"
          class="h-8 w-8 md:h-10 md:w-10"
          @click="toggleControl('gap')"
        >
          <Icon name="lucide:between-horizontal-start" class="w-4 h-4 md:w-5 md:h-5" />
        </Button>

        <Button
          size="icon"
          :variant="activeControl === 'padding' ? 'default' : 'ghost'"
          title="内间距"
          class="h-8 w-8 md:h-10 md:w-10"
          @click="toggleControl('padding')"
        >
          <Icon name="lucide:box-select" class="w-4 h-4 md:w-5 md:h-5" />
        </Button>

        <div class="w-px h-5 md:h-6 bg-border" />

        <Button
          size="icon"
          :variant="activeControl === 'radius' ? 'default' : 'ghost'"
          title="外部圆角"
          class="h-8 w-8 md:h-10 md:w-10"
          @click="toggleControl('radius')"
        >
          <Icon name="lucide:square-dashed-bottom" class="w-4 h-4 md:w-5 md:h-5" />
        </Button>

        <Button
          size="icon"
          :variant="activeControl === 'imageRadius' ? 'default' : 'ghost'"
          title="图片圆角"
          class="h-8 w-8 md:h-10 md:w-10"
          @click="toggleControl('imageRadius')"
        >
          <Icon name="lucide:image" class="w-4 h-4 md:w-5 md:h-5" />
        </Button>
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
