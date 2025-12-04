<script setup lang="ts">
import type { WorkflowEnv } from '~/composables/repositories/useEnvironmentRepository'
import { toast } from 'vue-sonner'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'
import { useWorkflowRepository } from '~/composables/repositories/useWorkflowRepository'

const { setSetting, getSetting } = useSettingRepository()
const { getAllEnvs, createEnv, deleteEnv } = useEnvironmentRepository()
const { createWorkflow, getAllWorkflows, deleteWorkflow } = useWorkflowRepository()

// 检测是否在 Tauri 桌面端
const isTauriDesktop = ref(false)

const customCss = ref('')
// COS State
const cosSecretId = ref('')
const cosSecretKey = ref('')
const cosBucket = ref('')
const cosRegion = ref('')
const cosPathPrefix = ref('')
const cosCustomDomain = ref('')

// HTTP Server State (仅桌面端)
const serverUrl = ref('')
const isLoadingServerInfo = ref(false)
const isTestingConnection = ref(false)

// 移动端同步配置
const syncServerAddress = ref('')
const isSavingSyncConfig = ref(false)
const syncWorkflowId = ref<number | null>(null)
const SYNC_WORKFLOW_NAME = '🔗 局域网同步测试'

// 获取服务器地址
async function loadServerInfo() {
  if (!isTauriDesktop.value) {
    return
  }

  isLoadingServerInfo.value = true
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const ip = await invoke('get_local_ip') as string
    const port = await invoke('get_http_server_port') as number
    serverUrl.value = `http://${ip}:${port}`
  }
  catch (e) {
    console.error('Failed to get server info:', e)
    serverUrl.value = '获取失败'
  }
  finally {
    isLoadingServerInfo.value = false
  }
}

// 复制服务器地址
async function copyServerUrl() {
  if (!serverUrl.value || serverUrl.value === '获取失败') {
    toast.error('服务器地址无效')
    return
  }

  try {
    await navigator.clipboard.writeText(serverUrl.value)
    toast.success('已复制到剪贴板')
  }
  catch {
    toast.error('复制失败')
  }
}

// 测试连接
async function testConnection() {
  if (!serverUrl.value || serverUrl.value === '获取失败') {
    toast.error('请先获取服务器地址')
    return
  }

  isTestingConnection.value = true
  try {
    const response = await fetch(`${serverUrl.value}/health`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    if (data.success && data.data) {
      const timestamp = new Date(data.data.timestamp).toLocaleString()
      toast.success(`连接成功！\n服务器: ${data.data.server_ip}\n时间: ${timestamp}`, {
        duration: 5000,
      })
    }
    else {
      toast.warning('服务器响应异常')
    }
  }
  catch (e: any) {
    console.error('Connection test failed:', e)
    toast.error(`连接失败: ${e.message}`)
  }
  finally {
    isTestingConnection.value = false
  }
}

// const apiUrl = ref('')
// const apiMethod = ref('POST')
// const apiHeaders = ref('{}')
// const apiBodyTemplate = ref('{"content": "{{content}}", "html": "{{html}}"}')

// Env Vars State
const envs = ref<WorkflowEnv[]>([])
const newEnvKey = ref('')
const newEnvValue = ref('')

// 加载移动端同步配置
async function loadSyncConfig() {
  // 从设置中读取同步地址
  const savedAddress = await getSetting('sync_server_address')
  if (savedAddress) {
    syncServerAddress.value = savedAddress
  }

  // 检查是否已有同步测试的 workflow
  const workflows = await getAllWorkflows()
  const syncWorkflow = workflows?.find(w => w.name === SYNC_WORKFLOW_NAME)
  if (syncWorkflow) {
    syncWorkflowId.value = syncWorkflow.id
  }
}

// 保存移动端同步配置
async function saveSyncConfig() {
  const address = syncServerAddress.value.trim()
  if (!address) {
    toast.error('请输入服务器地址')
    return
  }

  // 验证地址格式
  if (!address.startsWith('http://') && !address.startsWith('https://')) {
    toast.error('请输入完整地址，包含 http:// 或 https://')
    return
  }

  isSavingSyncConfig.value = true
  try {
    // 保存地址到设置
    await setSetting('sync_server_address', address, 'sync')

    // 检查是否已有同步 workflow
    const workflows = await getAllWorkflows()
    const existingWorkflow = workflows?.find(w => w.name === SYNC_WORKFLOW_NAME)

    if (existingWorkflow) {
      // 如果已存在，删除旧的再创建新的（更新 URL）
      await deleteWorkflow(existingWorkflow.id)
    }

    // 创建新的同步测试 workflow
    const steps = [
      {
        id: 'health-check',
        name: '健康检查',
        type: 'api',
        url: `${address}/health`,
        method: 'GET',
        headers: {},
        body: '',
        timeout: 5000,
      },
    ]

    const newId = await createWorkflow(
      SYNC_WORKFLOW_NAME,
      '测试与桌面端的局域网连接',
      steps,
    )
    syncWorkflowId.value = newId ?? null

    toast.success('同步配置已保存，流已创建')
  }
  catch (e: any) {
    console.error('Failed to save sync config:', e)
    toast.error(`保存失败: ${e.message}`)
  }
  finally {
    isSavingSyncConfig.value = false
  }
}

// 测试移动端同步连接
async function testMobileConnection() {
  const address = syncServerAddress.value.trim()
  if (!address) {
    toast.error('请先配置服务器地址')
    return
  }

  isTestingConnection.value = true
  try {
    const response = await fetch(`${address}/health`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    if (data.success && data.data) {
      const timestamp = new Date(data.data.timestamp).toLocaleString()
      toast.success(`连接成功！\n服务器: ${data.data.server_ip}\n时间: ${timestamp}`, {
        duration: 5000,
      })
    }
    else {
      toast.warning('服务器响应异常')
    }
  }
  catch (e: any) {
    console.error('Mobile connection test failed:', e)
    toast.error(`连接失败: ${e.message}`)
  }
  finally {
    isTestingConnection.value = false
  }
}

// 删除同步配置
async function deleteSyncConfig() {
  toast('确定要删除同步配置吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          // 删除设置
          await setSetting('sync_server_address', '', 'sync')
          syncServerAddress.value = ''

          // 删除 workflow
          if (syncWorkflowId.value) {
            await deleteWorkflow(syncWorkflowId.value)
            syncWorkflowId.value = null
          }

          toast.success('同步配置已删除')
        }
        catch (e: any) {
          console.error('Failed to delete sync config:', e)
          toast.error(`删除失败: ${e.message}`)
        }
      },
    },
    cancel: {
      label: '取消',
    },
  })
}

const loadEnvs = async () => {
  try {
    const result = await getAllEnvs()
    envs.value = result || []
  }
  catch (e) {
    console.error(e)
    toast.error('加载环境变量失败')
  }
}

const handleAddEnv = async () => {
  if (!newEnvKey.value || !newEnvValue.value) {
    toast.error('键和值不能为空')
    return
  }
  try {
    await createEnv(newEnvKey.value, newEnvValue.value)
    newEnvKey.value = ''
    newEnvValue.value = ''
    await loadEnvs()
    toast.success('环境变量已添加')
  }
  catch (e) {
    console.error(e)
    toast.error('添加失败，键名可能重复')
  }
}

const handleDeleteEnv = (id: number) => {
  toast('确定要删除该环境变量吗？', {
    action: {
      label: '删除',
      onClick: async () => {
        try {
          await deleteEnv(id)
          await loadEnvs()
          toast.success('环境变量已删除')
        }
        catch (e) {
          console.error(e)
          toast.error('删除失败')
        }
      },
    },
    cancel: {
      label: '取消',
    },
  })
}

onMounted(async () => {
  // 检测 Tauri 桌面端环境
  console.log('[Settings] Checking Tauri desktop environment...')
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    console.log('[Settings] @tauri-apps/api/core imported successfully')

    // 尝试调用桌面端专属命令
    const ip = await invoke('get_local_ip') as string
    console.log('[Settings] get_local_ip returned:', ip)

    isTauriDesktop.value = true
    console.log('[Settings] isTauriDesktop set to true')

    // 自动加载服务器信息
    await loadServerInfo()
  }
  catch (e) {
    // 不是桌面端或命令不存在
    console.log('[Settings] Tauri desktop detection failed:', e)
    isTauriDesktop.value = false
  }

  console.log('[Settings] Final isTauriDesktop value:', isTauriDesktop.value)

  customCss.value = await getSetting('custom_css') || ''

  // Load COS Settings
  cosSecretId.value = await getSetting('secret_id') || ''
  cosSecretKey.value = await getSetting('secret_key') || ''
  cosBucket.value = await getSetting('bucket') || ''
  cosRegion.value = await getSetting('region') || ''
  cosPathPrefix.value = await getSetting('path_prefix') || ''
  cosCustomDomain.value = await getSetting('custom_domain') || ''

  await loadEnvs()

  // 非桌面端加载同步配置
  if (!isTauriDesktop.value) {
    await loadSyncConfig()
  }
})

const saveSettings = async () => {
  try {
    await setSetting('custom_css', customCss.value)

    // Save COS Settings
    await setSetting('secret_id', cosSecretId.value, 'cos')
    await setSetting('secret_key', cosSecretKey.value, 'cos')
    await setSetting('bucket', cosBucket.value, 'cos')
    await setSetting('region', cosRegion.value, 'cos')
    await setSetting('path_prefix', cosPathPrefix.value, 'cos')
    await setSetting('custom_domain', cosCustomDomain.value, 'cos')

    toast.success('设置已保存')
  }
  catch {
    toast.error('保存设置失败')
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <!-- Mobile Header -->
    <div class="flex md:hidden px-4 pb-3 pt-safe-offset-4 items-center justify-between mt-2 shrink-0">
      <span class="text-lg font-bold tracking-tight">设置</span>
    </div>

    <div class="container mx-auto p-4 max-w-2xl pb-24 md:pb-20">
      <!-- 桌面端显示返回按钮和标题 -->
      <div class="hidden md:flex items-center gap-4 mb-6">
        <NuxtLink to="/">
          <Button variant="outline" size="icon">
            <Icon name="lucide:arrow-left" class="w-4 h-4" />
          </Button>
        </NuxtLink>
        <h1 class="text-2xl font-bold">
          设置
        </h1>
      </div>

      <div class="space-y-6">
        <Accordion type="multiple" collapsible class="w-full">
          <!-- COS Settings -->
          <AccordionItem value="cos">
            <AccordionTrigger class="hover:no-underline">
              <div class="flex items-center gap-2 text-base font-semibold">
                <!-- <Icon name="lucide:cloud" class="w-5 h-5" /> -->
                资源
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card class="border-0 shadow-none">
                <CardHeader class="px-0 pt-0">
                  <CardDescription>配置对象存储（腾讯云COS）以支持图片上传功能。</CardDescription>
                </CardHeader>
                <CardContent class="space-y-4 px-0 pb-2">
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
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          <!-- Environment Variables -->
          <AccordionItem value="env">
            <AccordionTrigger class="hover:no-underline">
              <div class="text-base font-semibold">
                流
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card class="border-0 shadow-none">
                <CardHeader class="px-0 pt-0">
                  <CardDescription>
                    配置敏感信息（如 API Key）。在流、拉取API中通过 <code>{{ `\{\{env.KEY\}\}` }}</code> 使用。
                  </CardDescription>
                </CardHeader>
                <CardContent class="space-y-4 px-0 pb-2">
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
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          <!-- Custom CSS -->
          <AccordionItem value="css">
            <AccordionTrigger class="hover:no-underline">
              <div class="text-base font-semibold">
                记录 （开发中）
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card class="border-0 shadow-none">
                <CardHeader class="px-0 pt-0">
                  <CardDescription>自定义文章样式。</CardDescription>
                </CardHeader>
                <CardContent class="px-0 pb-2">
                  <Textarea v-model="customCss" placeholder="/* 目前还不可用 */" class="font-mono h-32" />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          <!-- Sync Settings -->
          <AccordionItem value="sync">
            <AccordionTrigger class="hover:no-underline">
              <div class="text-base font-semibold">
                同步
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card class="border-0 shadow-none">
                <CardHeader class="px-0 pt-0">
                  <CardDescription>
                    {{ isTauriDesktop ? '通过局域网同步数据。(需在同一个WIFI下)' : '配置桌面端服务器地址，实现局域网同步。(需在同一个WIFI下' }}
                  </CardDescription>
                </CardHeader>
                <CardContent class="space-y-4 px-0 pb-2">
                  <!-- 桌面端 HTTP 服务器信息 -->
                  <div v-if="isTauriDesktop" class="p-4 bg-muted/50 rounded-lg space-y-3 border">
                    <div class="flex items-center justify-between">
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

                      <div class="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          class="flex-1"
                          :disabled="isTestingConnection"
                          @click="testConnection"
                        >
                          <Icon
                            :name="isTestingConnection ? 'lucide:loader-2' : 'lucide:wifi'"
                            class="w-3 h-3 mr-1"
                            :class="{ 'animate-spin': isTestingConnection }"
                          />
                          测试连接
                        </Button>
                        <Button variant="ghost" size="sm" @click="loadServerInfo">
                          <Icon name="lucide:refresh-cw" class="w-3 h-3" />
                        </Button>
                      </div>

                      <p class="text-xs text-muted-foreground">
                        在同一局域网的其他设备上，使用此地址向客户端流数据。
                      </p>
                    </div>
                  </div>

                  <!-- 移动端配置服务器地址 -->
                  <div v-if="!isTauriDesktop" class="space-y-4">
                    <div class="grid gap-2">
                      <Label>桌面端服务器地址</Label>
                      <div class="flex gap-2">
                        <Input
                          v-model="syncServerAddress"
                          placeholder="http://192.168.1.100:54577"
                          class="flex-1 font-mono text-sm"
                        />
                      </div>
                      <p class="text-xs text-muted-foreground">
                        输入桌面端显示的局域网地址，确保手机与电脑在同一网络。
                      </p>
                    </div>

                    <!-- 已配置状态 -->
                    <div v-if="syncWorkflowId" class="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <Icon name="lucide:check-circle" class="w-4 h-4" />
                        <span class="text-sm font-medium">已配置同步流</span>
                      </div>
                      <p class="text-xs text-muted-foreground mt-1">
                        可在「流」页面找到「{{ SYNC_WORKFLOW_NAME }}」进行测试。
                      </p>
                    </div>

                    <div class="flex gap-2">
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
                        :disabled="isTestingConnection || !syncServerAddress.trim()"
                        @click="testMobileConnection"
                      >
                        <Icon
                          :name="isTestingConnection ? 'lucide:loader-2' : 'lucide:wifi'"
                          class="w-4 h-4 mr-1"
                          :class="{ 'animate-spin': isTestingConnection }"
                        />
                        测试
                      </Button>
                    </div>

                    <div v-if="syncWorkflowId" class="pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        class="text-destructive hover:text-destructive w-full"
                        @click="deleteSyncConfig"
                      >
                        <Icon name="lucide:trash-2" class="w-3 h-3 mr-1" />
                        删除同步配置
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="system">
            <AccordionTrigger class="hover:no-underline">
              <div class="text-base font-semibold">
                系统设置
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card class="border-0 shadow-none">
                <CardHeader class="px-0 pt-0">
                  <CardDescription>还没有任何设置</CardDescription>
                </CardHeader>
                <CardContent class="px-0 pb-2">
                  <!-- <Textarea v-model="customCss" placeholder="/* 目前还不可用 */" class="font-mono h-32" /> -->
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button class="w-full hidden md:flex" @click="saveSettings">
          保存设置
        </Button>
      </div>

      <div class="fixed bottom-20 left-4 right-4 z-40 md:hidden">
        <Button class="w-full shadow-lg" @click="saveSettings">
          保存设置
        </Button>
      </div>
    </div>
  </div>
</template>
