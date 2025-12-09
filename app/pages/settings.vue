<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useDesktopServer } from '~/composables/settings/useDesktopServer'
import { useEnvironmentManager } from '~/composables/settings/useEnvironmentManager'
import { useSyncManager } from '~/composables/settings/useSyncManager'
import { useSystemWorkflowManager } from '~/composables/settings/useSystemWorkflowManager'
import { useEnvironment } from '~/composables/useEnvironment'
import { useTauriStore } from '~/composables/useTauriStore'

const config = useRuntimeConfig()
const version = config.public.version
const store = useTauriStore()
const { isDesktop } = useEnvironment()

// COS 和通用设置
const customCss = ref('')
const cosSecretId = ref('')
const cosSecretKey = ref('')
const cosBucket = ref('')
const cosRegion = ref('')
const cosPathPrefix = ref('')
const cosCustomDomain = ref('')

// 使用 4 个子 composable
const {
  SYNC_WORKFLOW_NAME: syncWorkflowName,
  serverUrl,
  syncServerAddress,
  isSavingSyncConfig,
  syncWorkflowId,
  syncToken,
  isSyncing,
  syncStatus,
  syncInfo,
  lastSyncText,
  lastSyncCountText,
  totalSyncCountText,
  saveSyncConfig,
  deleteSyncConfig,
  syncOnce,
  refreshSyncStateCard,
  loadSyncConfig,
} = useSyncManager()

const {
  envs,
  newEnvKey,
  newEnvValue,
  handleAddEnv,
  handleDeleteEnv,
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
  isTestingConnection,
  loadServerInfo,
  copyServerUrl,
  testConnection,
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
    await store.setItem('cosSecretId', cosSecretId.value)
    await store.setItem('cosSecretKey', cosSecretKey.value)
    await store.setItem('cosBucket', cosBucket.value)
    await store.setItem('cosRegion', cosRegion.value)
    await store.setItem('cosPathPrefix', cosPathPrefix.value)
    await store.setItem('cosCustomDomain', cosCustomDomain.value)
    await store.saveStore()
    toast.success('设置已保存')
  }
  catch (error) {
    toast.error('保存失败')
    console.error('保存设置失败:', error)
  }
}

// 初始化
async function initSettingsPage() {
  await store.initStore()

  // 加载 COS 设置
  customCss.value = (await store.getItem<string>('customCss')) || ''
  cosSecretId.value = (await store.getItem<string>('cosSecretId')) || ''
  cosSecretKey.value = (await store.getItem<string>('cosSecretKey')) || ''
  cosBucket.value = (await store.getItem<string>('cosBucket')) || ''
  cosRegion.value = (await store.getItem<string>('cosRegion')) || ''
  cosPathPrefix.value = (await store.getItem<string>('cosPathPrefix')) || ''
  cosCustomDomain.value = (await store.getItem<string>('cosCustomDomain')) || ''

  // 加载各模块数据
  await loadSyncConfig()
  await loadEnvs()
  await loadSystemWorkflows()

  if (isDesktop.value) {
    await loadServerInfo()
  }

  // 静默同步一次(不显示 toast,除非有数据变化)
  await syncOnce(true)
}

onMounted(() => {
  initSettingsPage()
})
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
                <Icon name="lucide:cloud" class="w-5 h-5" />
                对象存储 (COS)
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
                环境变量
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
                同步 <sup>beta</sup>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card class="border-0 shadow-none">
                <CardHeader class="px-0 pt-0">
                  <CardDescription>
                    {{ isDesktop ? '通过局域网同步数据。(需在同一个WIFI下)' : '配置桌面端服务器地址,实现局域网同步。(需在同一个WIFI下)' }}
                  </CardDescription>
                </CardHeader>
                <CardContent class="space-y-4 px-0 pb-2">
                  <!-- 桌面端 HTTP 服务器信息 -->
                  <div v-if="isDesktop" class="p-4 bg-muted/50 rounded-lg space-y-3 border">
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
                        <p class="text-xs text-muted-foreground mt-1">
                          {{ lastSyncText }}
                          <span v-if="syncInfo.seq !== null"> · 服务器序列 {{ syncInfo.seq }}</span>
                          <span v-if="lastSyncCountText"> · {{ lastSyncCountText }}</span>
                          <span v-if="totalSyncCountText"> · {{ totalSyncCountText }}</span>
                          <span v-if="syncInfo.paired"> · 已被配对访问</span>
                        </p>
                        <p v-if="syncInfo.status === 'error'" class="text-xs text-destructive mt-1">
                          {{ syncInfo.message }}
                        </p>
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

                      <div class="flex items-center gap-2">
                        <Button
                          class="flex-1"
                          variant="secondary"
                          :class="{ 'pointer-events-none opacity-60': isSyncing }"
                          :disabled="isSyncing || !serverUrl"
                          @click="syncOnce"
                        >
                          <Icon
                            :name="isSyncing ? 'lucide:loader-2' : 'lucide:refresh-ccw'"
                            class="w-3.5 h-3.5 mr-1"
                            :class="{ 'animate-spin': isSyncing }"
                          />
                          {{ isSyncing ? '同步中…' : '立即同步（桌面端）' }}
                        </Button>
                        <p class="text-xs text-muted-foreground flex-1">
                          {{ syncStatus }}
                        </p>
                      </div>

                      <p class="text-xs text-muted-foreground">
                        在同一局域网的其他设备上，使用此地址向客户端流数据。
                      </p>
                    </div>
                  </div>

                  <!-- 移动端配置服务器地址 -->
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
                      <p class="text-xs text-muted-foreground">
                        输入桌面端显示的局域网地址，确保手机与电脑在同一网络。
                      </p>
                    </div>

                    <div class="p-3 rounded-lg border" :class="syncInfo.status === 'error' ? 'bg-destructive/5 border-destructive/40' : 'bg-muted/50'">
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <Icon :name="syncInfo.status === 'ok' ? 'lucide:check-circle' : 'lucide:alert-circle'" class="w-4 h-4" :class="syncInfo.status === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-destructive'" />
                        <span>{{ syncInfo.status === 'ok' ? '可同步' : (syncInfo.message || '不可同步') }}</span>
                      </div>
                      <p class="text-xs text-muted-foreground mt-1">
                        {{ lastSyncText }}
                        <span v-if="syncInfo.seq !== null"> · 服务器序列 {{ syncInfo.seq }}</span>
                        <span v-if="lastSyncCountText"> · {{ lastSyncCountText }}</span>
                        <span v-if="totalSyncCountText"> · {{ totalSyncCountText }}</span>
                      </p>
                      <p v-if="syncInfo.status === 'error'" class="text-xs text-destructive mt-1">
                        {{ syncInfo.message }}
                      </p>
                    </div>

                    <div class="grid gap-2">
                      <Label>同步 Token</Label>
                      <Input
                        v-model="syncToken"
                        placeholder="默认 zotepad-dev-token"
                        class="font-mono text-sm"
                      />
                      <p class="text-xs text-muted-foreground">
                        与桌面端 HTTP 服务保持一致，未设置则使用默认。
                      </p>
                    </div>

                    <!-- 已配置状态 -->
                    <div v-if="syncWorkflowId" class="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <Icon name="lucide:check-circle" class="w-4 h-4" />
                        <span class="text-sm font-medium">已配置同步流</span>
                      </div>
                      <p class="text-xs text-muted-foreground mt-1">
                        可在「流」页面找到「{{ syncWorkflowName }}」进行测试。
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
                        class="flex-1 min-w-[120px]"
                        :disabled="!syncServerAddress.trim()"
                        @click="refreshSyncStateCard"
                      >
                        <Icon
                          name="lucide:wifi"
                          class="w-4 h-4 mr-1"
                        />
                        测试
                      </Button>
                      <Button
                        variant="secondary"
                        class="flex-1 min-w-[120px]"
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

                    <p class="text-xs text-muted-foreground">
                      {{ syncStatus }}
                    </p>

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

          <!-- 系统流 -->
          <AccordionItem value="system-workflows">
            <AccordionTrigger class="hover:no-underline">
              <div class="text-base font-semibold">
                系统流
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card class="border-0 shadow-none">
                <CardContent class="space-y-2 px-0 pb-2">
                  <div
                    v-for="state in systemWorkflowStates"
                    :key="state.spec.type"
                    class="flex items-center gap-3 border rounded-lg px-3 py-2 bg-muted/30"
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

                  <div v-if="extraSystemWorkflows.length" class="space-y-2">
                    <div class="text-xs text-muted-foreground">
                      其他 system:* 流
                    </div>
                    <div
                      v-for="wf in extraSystemWorkflows"
                      :key="wf.id"
                      class="flex items-center gap-3 border rounded-lg px-3 py-2 bg-muted/20"
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
                  版本：v{{ version }}
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
