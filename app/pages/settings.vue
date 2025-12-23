<script setup lang="ts">
import { save } from '@tauri-apps/plugin-dialog'
import { create, writeFile } from '@tauri-apps/plugin-fs'
import { info, warn } from '@tauri-apps/plugin-log'
import { useColorMode } from '@vueuse/core'
import { onMounted, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useCOSManager } from '~/composables/settings/useCOSManager'
import { useDesktopServer } from '~/composables/settings/useDesktopServer'
import { useEnvironmentManager } from '~/composables/settings/useEnvironmentManager'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import { useSystemWorkflowManager } from '~/composables/settings/useSystemWorkflowManager'
import { useEnvironment } from '~/composables/useEnvironment'
import { useImageCompressor } from '~/composables/useImageCompressor'
import { useSidebar } from '~/composables/useSidebar'
import { useTauriStore } from '~/composables/useTauriStore'

const config = useRuntimeConfig()
const version = config.public.version
const store = useTauriStore()
const { isDesktop } = useEnvironment()
const { setNavigation } = useSidebar()
const colorMode = useColorMode({
  emitAuto: true,
})
const {
  enableCompression,
  enableFormatConversion,
  compressionQuality,
  conversionFormat,
  loadSettings: loadImageSettings,
  saveSettings: saveImageSettings,
  compressImage,
} = useImageCompressor()

// Manual Compression Tool
const fileInput = ref<HTMLInputElement | null>(null)
const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files?.length)
    return

  const file = input.files[0]
  // Reset input so same file can be selected again
  input.value = ''

  const toastId = toast.loading('正在处理图片...')

  try {
    // Force compression using current settings
    const compressedFile = await compressImage(file!, {
      force: true,
    })

    // Save logic
    let saved = false
    try {
      // Try Tauri Dialog & FS (Works on Desktop and Mobile if supported)
      const ext = compressedFile.name.split('.').pop() || 'png'
      const filePath = await save({
        defaultPath: compressedFile.name,
        filters: [{
          name: 'Image',
          extensions: [ext],
        }],
        title: '保存图片',
      })

      if (filePath) {
        const buffer = await compressedFile.arrayBuffer()
        const uint8Array = new Uint8Array(buffer)

        // Use chunked writing to avoid OOM on Android
        const CHUNK_SIZE = 1024 * 1024 // 1MB chunks
        if (uint8Array.length > CHUNK_SIZE) {
          const fileHandle = await create(filePath)
          try {
            for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
              const chunk = uint8Array.slice(i, i + CHUNK_SIZE)
              await fileHandle.write(chunk)
            }
          }
          finally {
            await fileHandle.close()
          }
        }
        else {
          // Small files can be written directly
          await writeFile(filePath, uint8Array)
        }

        toast.success('图片已保存', { id: toastId })
        saved = true
      }
      else {
        toast.info('已取消保存', { id: toastId })
        return
      }
    }
    catch (err) {
      console.error('Save/Dialog failed:', err)
      if (isDesktop.value) {
        toast.error('保存失败，请重试', { id: toastId })
      }
    }

    if (!saved && !isDesktop.value) {
      // Mobile Fallback: Share or Download
      // Try Web Share API Level 2 (File sharing)
      info('=========== 手机端图片处理完成，准备分享 ===========')
      if (navigator.canShare && navigator.canShare({ files: [compressedFile] })) {
        await navigator.share({
          files: [compressedFile],
          title: '保存图片',
          text: '已压缩图片',
        })
        toast.success('请选择保存位置', { id: toastId })
      }
      else {
        // Fallback to download
        const url = URL.createObjectURL(compressedFile)
        const a = document.createElement('a')
        a.href = url
        a.download = compressedFile.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('图片已下载', { id: toastId })
        warn('======================================= ')
        warn('当前浏览器不支持文件分享，请检查保存位置')
      }
    }
  }
  catch (e) {
    console.error(e)
    toast.error('处理失败', { id: toastId })
  }
}

// Tabs configuration
const tabs = [
  { id: 'editor', label: '编辑器', icon: 'lucide:pencil' },
  { id: 'appearance', label: '外观', icon: 'lucide:palette' },
  { id: 'storage', label: '图床', icon: 'lucide:image' },
  { id: 'workflows', label: '系统流', icon: 'lucide:blocks' },
  { id: 'advanced', label: '高级', icon: 'lucide:settings-2' },
]
const activeTab = ref('editor')

// Env List State
const isEnvListExpanded = ref(false)

// COS 和通用设置
const customCss = ref('')
const isInitializing = ref(false)

// COS Manager
const {
  cosSecretId,
  cosSecretKey,
  cosBucket,
  cosRegion,
  cosPathPrefix,
  cosCustomDomain,
  cosEnabled,
  isExporting: isCOSExporting,
  isImporting: isCOSImporting,
  loadCOSSettings,
  saveCOSSettings,
  handleExportCOS,
  handleImportCOS,
} = useCOSManager()

// 监听 COS 开关变化，自动保存
watch(cosEnabled, async () => {
  if (!isInitializing.value) {
    await saveCOSSettings()
  }
})

// 使用 4 个子 composable
const {
  // SYNC_WORKFLOW_NAME: syncWorkflowName,
  serverUrl,
  syncServerAddress,
  isSavingSyncConfig,
  syncWorkflowId,
  isSyncing,
  // syncStatus,
  syncInfo,
  syncMode, // 新增：同步模式
  syncSummaryText,
  saveSyncConfig,
  saveSyncMode, // 新增：保存同步模式
  // resetSyncState,
  // deleteSyncConfig,
  syncOnce,
  refreshSyncStateCard,
  loadSyncConfig,
} = useSyncManager()

const {
  envs,
  newEnvKey,
  newEnvValue,
  isExporting,
  isImporting,
  handleAddEnv,
  handleDeleteEnv,
  handleExportEnvs,
  handleImportEnvs,
  loadEnvs,
} = useEnvironmentManager()

const {
  systemWorkflowStates: getSystemWorkflowStates,
  extraSystemWorkflows,
  isCreatingSystemWorkflow,
  isDeletingWorkflowId,
  handleCreateSystemWorkflow,
  handleDeleteSystemWorkflow,
  loadSystemWorkflows,
} = useSystemWorkflowManager()

// computed 计算 systemWorkflowStates
const systemWorkflowStates = computed(() => getSystemWorkflowStates.value(envs.value))

const {
  serverUrl: desktopServerUrl,
  isLoadingServerInfo,
  loadServerInfo,
  copyServerUrl,
} = useDesktopServer()

// desktopServerUrl 变化时自动更新 syncServerAddress 和 serverUrl
watch(desktopServerUrl, (newUrl) => {
  if (isDesktop.value && newUrl) {
    syncServerAddress.value = newUrl
    serverUrl.value = newUrl
  }
})

// 保存设置
async function saveSettings() {
  try {
    await store.setItem('customCss', customCss.value)
    await saveImageSettings()
    await store.saveStore()

    // Save COS settings to SQL database
    await saveCOSSettings()

    toast.success('设置已保存')
  }
  catch (error) {
    toast.error('保存失败')
    console.error('保存设置失败:', error)
  }
}

// 初始化
async function initSettingsPage() {
  isInitializing.value = true

  try {
    // 并行初始化 Store
    await store.initStore()

    // 并行加载所有数据(不阻塞 UI)
    await Promise.all([
      loadCOSSettings().catch(e => console.error('加载 COS 配置失败:', e)),
      loadSyncConfig().catch(e => console.error('加载同步配置失败:', e)),
      loadEnvs().catch(e => console.error('加载环境变量失败:', e)),
      loadSystemWorkflows().catch(e => console.error('加载系统流失败:', e)),
      loadImageSettings().catch(e => console.error('加载图片设置失败:', e)),
      isDesktop.value ? loadServerInfo().catch(e => console.error('加载服务器信息失败:', e)) : Promise.resolve(),
    ])

    // 加载其他设置
    customCss.value = (await store.getItem<string>('customCss')) || ''

    // 移动端：静默同步一次(不阻塞,不等待结果)
    // 桌面端：不需要 syncOnce,只需要重新加载数据即可(移动端推送后后端已经写入数据库)
    if (!isDesktop.value) {
      syncOnce(true).catch(e => console.error('初始同步失败:', e))
    }
  }
  catch (error) {
    console.error('初始化设置页面失败:', error)
    toast.error('加载设置失败')
  }
  finally {
    isInitializing.value = false
  }
}

onMounted(async () => {
  setNavigation()
  // 让页面先渲染，避免初始化阻塞 UI
  await nextTick()
  initSettingsPage()
})
</script>

<template>
  <div class="h-full flex flex-col bg-background/50 overflow-hidden">
    <!-- Desktop Header -->
    <div class="hidden md:flex px-8 lg:px-12 py-4 items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 supports-[backdrop-filter]:bg-background/60">
      <div class="flex items-center gap-4">
        <NuxtLink to="/">
          <Button variant="outline" size="icon">
            <Icon name="lucide:arrow-left" class="w-4 h-4" />
          </Button>
        </NuxtLink>
        <h1 class="text-xl font-bold">
          ZotePad <span class="text-sm font-normal text-muted-foreground ml-2">v{{ version }}</span>
        </h1>
      </div>

      <!-- Tab Navigation -->
      <div class="flex items-center gap-1 bg-muted/50 p-1 rounded-full border border-border/20">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="relative px-4 py-1.5 text-sm font-medium transition-all rounded-full"
          :class="activeTab === tab.id
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'"
          @click="activeTab = tab.id"
        >
          <div class="flex items-center gap-2">
            <Icon :name="tab.icon" class="w-4 h-4" />
            {{ tab.label }}
          </div>
        </button>
      </div>

      <div class="w-[100px] flex justify-end">
        <Button :disabled="isInitializing" size="sm" @click="saveSettings">
          <Icon v-if="isInitializing" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          {{ isInitializing ? '加载中…' : '保存' }}
        </Button>
      </div>
    </div>

    <!-- Mobile Header with Sticky Tabs -->
    <div class="md:hidden sticky top-0 z-20 bg-background/90 backdrop-blur-xl border-b border-border/40 supports-[backdrop-filter]:bg-background/80">
      <div class="flex items-center justify-between px-4 pt-safe-offset-4 pb-3 mt-1">
        <!-- Tab Navigation -->
        <div class="flex items-center gap-6">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="relative py-2 text-base font-medium transition-colors"
            :class="activeTab === tab.id
              ? 'text-foreground'
              : 'text-muted-foreground'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
            <!-- Active indicator -->
            <span
              v-if="activeTab === tab.id"
              class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1/2 h-0.5 bg-primary rounded-full transition-all"
            />
          </button>
        </div>
        <!-- Save Button -->
        <Button :disabled="isInitializing" size="sm" class="rounded-full h-8 px-3" @click="saveSettings">
          <Icon v-if="isInitializing" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
          <span v-else>保存</span>
        </Button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto p-4 md:p-8 pb-24">
      <div class="max-w-3xl mx-auto space-y-6">
        <!-- Editor Tab -->
        <div v-if="activeTab === 'editor'" class="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <Card class="border-0 shadow-none bg-transparent">
            <CardHeader class="px-0 pt-0">
              <CardTitle>自定义样式</CardTitle>
              <CardDescription>自定义文章样式 (CSS)。</CardDescription>
            </CardHeader>
            <CardContent class="px-0 pb-2">
              <Textarea v-model="customCss" placeholder="/* 输入 CSS 代码 */" class="font-mono h-64 bg-card/50" />
            </CardContent>
          </Card>
        </div>

        <!-- Appearance Tab -->
        <div v-if="activeTab === 'appearance'" class="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <Card class="border border-border/50 shadow-sm">
            <CardHeader>
              <div class="flex items-center gap-2">
                <Icon name="lucide:sun-moon" class="w-5 h-5 text-primary" />
                <CardTitle>主题模式</CardTitle>
              </div>
              <CardDescription>选择应用的外观主题，支持深色模式。</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid gap-3">
                <Label>显示模式</Label>
                <div class="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    class="flex flex-col items-center gap-2 h-auto py-3 px-2"
                    :class="{ 'border-primary bg-primary/5': colorMode === 'light' }"
                    @click="colorMode = 'light'"
                  >
                    <Icon name="lucide:sun" class="w-5 h-5" />
                    <span class="text-xs">浅色</span>
                  </Button>
                  <Button
                    variant="outline"
                    class="flex flex-col items-center gap-2 h-auto py-3 px-2"
                    :class="{ 'border-primary bg-primary/5': colorMode === 'dark' }"
                    @click="colorMode = 'dark'"
                  >
                    <Icon name="lucide:moon" class="w-5 h-5" />
                    <span class="text-xs">深色</span>
                  </Button>
                  <Button
                    variant="outline"
                    class="flex flex-col items-center gap-2 h-auto py-3 px-2"
                    :class="{ 'border-primary bg-primary/5': colorMode === 'auto' }"
                    @click="colorMode = 'auto'"
                  >
                    <Icon name="lucide:monitor" class="w-5 h-5" />
                    <span class="text-xs">跟随系统</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Storage Tab -->
        <div v-if="activeTab === 'storage'" class="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <Card class="border border-border/50 shadow-sm">
            <CardHeader>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:cloud" class="w-5 h-5 text-primary" />
                  <CardTitle>腾讯云 COS</CardTitle>
                </div>
                <Switch v-model="cosEnabled" />
              </div>
              <CardDescription>配置对象存储以支持图片上传功能。</CardDescription>
            </CardHeader>
            <CardContent v-if="cosEnabled" class="space-y-4">
              <div class="grid gap-2">
                <Label>SecretId</Label>
                <Input v-model="cosSecretId" type="password" placeholder="AKID..." />
              </div>
              <div class="grid gap-2">
                <Label>SecretKey</Label>
                <Input v-model="cosSecretKey" type="password" placeholder="SecretKey..." />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="grid gap-2">
                  <Label>Bucket</Label>
                  <Input v-model="cosBucket" placeholder="example-1250000000" />
                </div>
                <div class="grid gap-2">
                  <Label>Region</Label>
                  <Input v-model="cosRegion" placeholder="ap-guangzhou" />
                </div>
              </div>
              <div class="grid gap-2">
                <Label>路径前缀 (可选)</Label>
                <Input v-model="cosPathPrefix" placeholder="zotepad/images" />
                <p class="text-xs text-muted-foreground">
                  上传文件的存储路径前缀，留空则存放在根目录。
                </p>
              </div>
              <div class="grid gap-2">
                <Label>自定义域名 (可选)</Label>
                <Input v-model="cosCustomDomain" placeholder="https://cdn.example.com" />
                <p class="text-xs text-muted-foreground">
                  配置后将使用此域名生成图片链接，请确保包含协议头 (http/https)。
                </p>
              </div>

              <div class="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1"
                  :disabled="isCOSExporting"
                  @click="handleExportCOS"
                >
                  <Icon
                    :name="isCOSExporting ? 'lucide:loader-2' : 'lucide:copy'"
                    class="w-3.5 h-3.5 mr-1.5"
                    :class="{ 'animate-spin': isCOSExporting }"
                  />
                  {{ isCOSExporting ? '导出中...' : '复制配置' }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1"
                  :disabled="isCOSImporting"
                  @click="handleImportCOS"
                >
                  <Icon
                    :name="isCOSImporting ? 'lucide:loader-2' : 'lucide:clipboard-paste'"
                    class="w-3.5 h-3.5 mr-1.5"
                    :class="{ 'animate-spin': isCOSImporting }"
                  />
                  {{ isCOSImporting ? '导入中...' : '粘贴配置' }}
                </Button>
              </div>
            </CardContent>
          </Card>

          <!-- Image Optimization Card -->
          <Card class="border border-border/50 shadow-sm">
            <CardHeader>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:image-plus" class="w-5 h-5 text-primary" />
                  <CardTitle>图片优化</CardTitle>
                </div>
                <Switch v-model="enableCompression" />
              </div>
              <CardDescription>上传前自动压缩图片以节省带宽和存储空间。</CardDescription>
            </CardHeader>
            <CardContent v-if="enableCompression" class="space-y-4">
              <!-- Compression Quality -->
              <div class="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div class="flex items-center justify-between">
                  <Label class="text-base">压缩质量</Label>
                  <span class="text-sm font-medium text-muted-foreground">{{ compressionQuality }}%</span>
                </div>
                <div class="pt-2">
                  <input
                    v-model.number="compressionQuality"
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    class="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  >
                  <p class="text-xs text-muted-foreground mt-2">
                    数值越小文件越小，但画质越差。推荐 75-85。
                  </p>
                </div>
              </div>

              <!-- Format Conversion -->
              <div class="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <Label class="text-base">格式转换</Label>
                    <p class="text-xs text-muted-foreground">
                      自动将图片转换为指定格式。
                    </p>
                  </div>
                  <Switch v-model="enableFormatConversion" />
                </div>

                <div v-if="enableFormatConversion" class="pt-2 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Label class="text-sm text-muted-foreground whitespace-nowrap">目标格式</Label>
                  <Select v-model="conversionFormat">
                    <SelectTrigger class="w-[140px]">
                      <SelectValue placeholder="选择格式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="webp">
                        WebP (推荐)
                      </SelectItem>
                      <SelectItem value="jpeg">
                        JPEG
                      </SelectItem>
                      <SelectItem value="png">
                        PNG
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <!-- Manual Compression Tool (Beta) -->
              <div v-if="isDesktop" class="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div class="flex items-center justify-between">
                  <div class="space-y-0.5">
                    <div class="flex items-center gap-2">
                      <Label class="text-base">手动压缩工具</Label>
                      <Badge variant="secondary" class="text-[10px] h-5 px-1.5">
                        Beta
                      </Badge>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      选择本地图片应用当前配置进行压缩和转换。
                    </p>
                  </div>
                  <Button variant="outline" size="sm" @click="triggerFileInput">
                    <Icon name="lucide:upload" class="w-4 h-4 mr-2" />
                    选择图片
                  </Button>
                  <input
                    ref="fileInput"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleFileSelect"
                  >
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Workflows Tab -->
        <div v-if="activeTab === 'workflows'" class="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <Card class="border-0 shadow-none bg-transparent">
            <CardHeader class="px-0 pt-0">
              <CardTitle>系统流</CardTitle>
              <CardDescription>管理系统预置的工作流。</CardDescription>
            </CardHeader>
            <CardContent class="space-y-2 px-0 pb-2">
              <div
                v-for="state in systemWorkflowStates"
                :key="state.spec.type"
                class="flex items-center gap-3 border rounded-lg px-3 py-2 bg-card"
              >
                <div class="flex-1 flex items-center gap-2 min-w-0">
                  <span class="font-medium truncate">{{ state.spec.displayName }}</span>
                  <Badge :variant="state.workflow ? 'secondary' : 'outline'" class="text-[11px] shrink-0">
                    {{ state.workflow ? '已创建' : '未创建' }}
                  </Badge>
                  <Badge
                    v-if="state.missingEnvs.length"
                    variant="destructive"
                    class="text-[11px] shrink-0"
                  >
                    缺少环境变量
                  </Badge>
                </div>

                <div class="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9"
                    :disabled="isCreatingSystemWorkflow === state.spec.type || state.missingEnvs.length > 0"
                    @click="handleCreateSystemWorkflow(state.spec, envs)"
                  >
                    <Icon
                      :name="isCreatingSystemWorkflow === state.spec.type ? 'lucide:loader-2' : (state.workflow ? 'lucide:refresh-ccw' : 'lucide:plus')"
                      class="w-4 h-4"
                      :class="{ 'animate-spin': isCreatingSystemWorkflow === state.spec.type }"
                    />
                    <span class="sr-only">{{ state.workflow ? '重新创建' : '创建' }}</span>
                  </Button>
                  <Button
                    v-if="state.workflow"
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 text-destructive"
                    :disabled="isDeletingWorkflowId === state.workflow.id"
                    @click="handleDeleteSystemWorkflow(state.workflow.id)"
                  >
                    <Icon
                      :name="isDeletingWorkflowId === state.workflow.id ? 'lucide:loader-2' : 'lucide:trash-2'"
                      class="w-4 h-4"
                      :class="{ 'animate-spin': isDeletingWorkflowId === state.workflow.id }"
                    />
                    <span class="sr-only">删除</span>
                  </Button>
                </div>
              </div>

              <div v-if="extraSystemWorkflows.length" class="space-y-2 pt-4">
                <div class="text-xs text-muted-foreground">
                  其他 system:* 流
                </div>
                <div
                  v-for="wf in extraSystemWorkflows"
                  :key="wf.id"
                  class="flex items-center gap-3 border rounded-lg px-3 py-2 bg-card"
                >
                  <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">
                      {{ wf.name }}
                    </div>
                    <p class="text-[11px] text-muted-foreground truncate">
                      {{ wf.type || 'system' }} · ID {{ wf.id }}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 text-destructive"
                    :disabled="isDeletingWorkflowId === wf.id"
                    @click="handleDeleteSystemWorkflow(wf.id)"
                  >
                    <Icon
                      :name="isDeletingWorkflowId === wf.id ? 'lucide:loader-2' : 'lucide:trash-2'"
                      class="w-4 h-4"
                      :class="{ 'animate-spin': isDeletingWorkflowId === wf.id }"
                    />
                    <span class="sr-only">删除</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Advanced Tab -->
        <div v-if="activeTab === 'advanced'" class="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <!-- Sync Section -->
          <Card class="border border-border/50 shadow-sm">
            <CardHeader>
              <div class="flex items-center gap-2">
                <Icon name="lucide:refresh-cw" class="w-5 h-5 text-primary" />
                <CardTitle>同步 <sup>beta</sup></CardTitle>
              </div>
              <CardDescription>
                {{ isDesktop ? '通过局域网同步数据。(需在同一个WIFI下)' : '配置桌面端服务器地址,实现局域网同步。(需在同一个WIFI下)' }}
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <!-- Desktop Sync UI -->
              <div v-if="isDesktop" class="space-y-3">
                <div class="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                  <div class="flex items-center gap-2">
                    <Icon name="lucide:server" class="w-4 h-4 text-primary" />
                    <span class="text-sm font-medium">本机服务器</span>
                  </div>
                  <Button
                    v-if="!serverUrl"
                    variant="outline"
                    size="sm"
                    :disabled="isLoadingServerInfo"
                    @click="loadServerInfo"
                  >
                    <Icon
                      :name="isLoadingServerInfo ? 'lucide:loader-2' : 'lucide:refresh-cw'"
                      class="w-3 h-3 mr-1"
                      :class="{ 'animate-spin': isLoadingServerInfo }"
                    />
                    获取地址
                  </Button>
                </div>

                <div v-if="serverUrl" class="space-y-3">
                  <div class="flex items-center gap-2 p-2 bg-background rounded border">
                    <code class="flex-1 text-sm font-mono truncate">{{ serverUrl }}</code>
                    <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" @click="copyServerUrl">
                      <Icon name="lucide:copy" class="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <!-- 同步模式选择（桌面端） -->
                  <div class="grid gap-2">
                    <Label>同步模式</Label>
                    <div class="flex gap-2">
                      <Button
                        :variant="syncMode === 'manual' ? 'default' : 'outline'"
                        class="flex-1"
                        size="sm"
                        @click="saveSyncMode('manual')"
                      >
                        <Icon name="lucide:hand" class="w-4 h-4 mr-2" />
                        手动合并
                      </Button>
                      <Button
                        :variant="syncMode === 'auto' ? 'default' : 'outline'"
                        class="flex-1"
                        size="sm"
                        @click="saveSyncMode('auto')"
                      >
                        <Icon name="lucide:zap" class="w-4 h-4 mr-2" />
                        自动合并
                      </Button>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      {{ syncMode === 'manual' ? '所有冲突需手动选择，适合重要内容' : '按更新时间自动合并，时间相同时仍需手动选择' }}
                    </p>
                  </div>

                  <div class="p-3 rounded-lg border" :class="syncInfo.status === 'error' ? 'bg-destructive/5 border-destructive/40' : 'bg-muted/50'">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <Icon :name="syncInfo.status === 'ok' ? 'lucide:check-circle' : 'lucide:alert-circle'" class="w-4 h-4" :class="syncInfo.status === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-destructive'" />
                        <span>{{ syncInfo.status === 'ok' ? '服务运行中' : (syncInfo.message || '不可同步') }}</span>
                      </div>
                      <Button size="sm" variant="ghost" @click="refreshSyncStateCard">
                        <Icon name="lucide:refresh-ccw" class="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1.5">
                      {{ syncSummaryText }}
                      <span v-if="syncInfo.status === 'ok' && syncInfo.version !== null" class="text-green-600 dark:text-green-400"> · 桌面端 v{{ syncInfo.version || 0 }}</span>
                    </p>
                    <p v-if="syncInfo.status === 'error'" class="text-xs text-destructive mt-1">
                      {{ syncInfo.message }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Mobile Sync UI -->
              <div v-if="!isDesktop" class="space-y-4">
                <div class="grid gap-2">
                  <Label>桌面端服务器地址</Label>
                  <div class="flex gap-2">
                    <Input
                      v-model="syncServerAddress"
                      placeholder="http://192.168.1.100:54577"
                      class="flex-1 font-mono text-sm"
                    />
                  </div>
                </div>

                <!-- 同步模式选择 -->
                <div class="grid gap-2">
                  <Label>同步模式</Label>
                  <div class="flex gap-2">
                    <Button
                      :variant="syncMode === 'manual' ? 'default' : 'outline'"
                      class="flex-1"
                      @click="saveSyncMode('manual')"
                    >
                      <Icon name="lucide:hand" class="w-4 h-4 mr-2" />
                      手动合并
                    </Button>
                    <Button
                      :variant="syncMode === 'auto' ? 'default' : 'outline'"
                      class="flex-1"
                      @click="saveSyncMode('auto')"
                    >
                      <Icon name="lucide:zap" class="w-4 h-4 mr-2" />
                      自动合并
                    </Button>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ syncMode === 'manual' ? '所有冲突需手动选择，适合重要内容' : '按更新时间自动合并，时间相同时仍需手动选择' }}
                  </p>
                </div>

                <div class="p-3 rounded-lg border" :class="syncInfo.status === 'error' ? 'bg-destructive/5 border-destructive/40' : 'bg-muted/50'">
                  <div class="flex items-center gap-2 text-sm font-medium">
                    <Icon :name="syncInfo.status === 'ok' ? 'lucide:check-circle' : 'lucide:alert-circle'" class="w-4 h-4" :class="syncInfo.status === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-destructive'" />
                    <span>{{ syncInfo.status === 'ok' ? '可同步' : (syncInfo.message || '不可同步') }}</span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1.5">
                    {{ syncSummaryText }}
                  </p>
                  <p v-if="syncInfo.status === 'error'" class="text-xs text-destructive mt-1">
                    {{ syncInfo.message }}
                  </p>
                </div>

                <div class="flex gap-2 flex-wrap">
                  <Button
                    class="flex-1"
                    :disabled="isSavingSyncConfig || !syncServerAddress.trim()"
                    @click="saveSyncConfig"
                  >
                    <Icon
                      :name="isSavingSyncConfig ? 'lucide:loader-2' : 'lucide:save'"
                      class="w-4 h-4 mr-1"
                      :class="{ 'animate-spin': isSavingSyncConfig }"
                    />
                    {{ syncWorkflowId ? '更新配置' : '保存并创建流' }}
                  </Button>
                  <Button
                    variant="outline"
                    class="flex-1 min-w-[100px]"
                    :disabled="!syncServerAddress.trim()"
                    @click="refreshSyncStateCard"
                  >
                    <Icon name="lucide:wifi" class="w-4 h-4 mr-1" />
                    测试
                  </Button>
                  <Button
                    variant="secondary"
                    class="flex-1 min-w-[100px]"
                    :class="{ 'pointer-events-none opacity-60': isSyncing }"
                    :disabled="isSyncing || !syncServerAddress.trim()"
                    @click="syncOnce"
                  >
                    <Icon
                      :name="isSyncing ? 'lucide:loader-2' : 'lucide:refresh-ccw'"
                      class="w-4 h-4 mr-1"
                      :class="{ 'animate-spin': isSyncing }"
                    />
                    {{ isSyncing ? '同步中…' : '立即同步' }}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Env Vars Section -->
          <Card class="border border-border/50 shadow-sm">
            <CardHeader class="pb-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:key" class="w-5 h-5 text-primary" />
                  <CardTitle>环境变量</CardTitle>
                </div>
                <Button variant="ghost" size="sm" @click="isEnvListExpanded = !isEnvListExpanded">
                  {{ isEnvListExpanded ? '收起' : '展开' }}
                </Button>
              </div>
              <CardDescription>
                配置敏感信息（如 API Key）。共 {{ envs.length }} 个变量。
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1"
                  :disabled="isExporting || envs.length === 0"
                  @click="handleExportEnvs"
                >
                  <Icon
                    :name="isExporting ? 'lucide:loader-2' : 'lucide:copy'"
                    class="w-3.5 h-3.5 mr-1.5"
                    :class="{ 'animate-spin': isExporting }"
                  />
                  {{ isExporting ? '导出中...' : '复制配置' }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1"
                  :disabled="isImporting"
                  @click="handleImportEnvs"
                >
                  <Icon
                    :name="isImporting ? 'lucide:loader-2' : 'lucide:clipboard-paste'"
                    class="w-3.5 h-3.5 mr-1.5"
                    :class="{ 'animate-spin': isImporting }"
                  />
                  {{ isImporting ? '导入中...' : '粘贴配置' }}
                </Button>
              </div>

              <div v-if="isEnvListExpanded" class="space-y-4 pt-2 animate-in slide-in-from-top-2 duration-200">
                <div class="flex gap-2">
                  <Input v-model="newEnvKey" placeholder="键 (如 FEISHU_TOKEN)" class="flex-1" />
                  <Input v-model="newEnvValue" type="password" placeholder="值" class="flex-1" />
                  <Button @click="handleAddEnv">
                    添加
                  </Button>
                </div>

                <div v-if="envs.length > 0" class="border rounded-md divide-y">
                  <div v-for="env in envs" :key="env.id" class="flex items-center justify-between p-3 text-sm">
                    <div class="font-mono font-medium">
                      {{ env.key }}
                    </div>
                    <div class="flex items-center gap-4">
                      <div class="text-muted-foreground">
                        ******
                      </div>
                      <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive" @click="handleDeleteEnv(env.id)">
                        <Icon name="lucide:trash-2" class="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div v-else class="text-sm text-muted-foreground text-center py-2">
                  暂无环境变量
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
</template>
