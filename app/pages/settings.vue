<script setup lang="ts">
import type { WorkflowEnv } from '~/composables/repositories/useEnvironmentRepository'
import { toast } from 'vue-sonner'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'

const { setSetting, getSetting } = useSettingRepository()
const { getAllEnvs, createEnv, deleteEnv } = useEnvironmentRepository()

const customCss = ref('')
// COS State
const cosSecretId = ref('')
const cosSecretKey = ref('')
const cosBucket = ref('')
const cosRegion = ref('')
const cosPathPrefix = ref('')
const cosCustomDomain = ref('')

// const apiUrl = ref('')
// const apiMethod = ref('POST')
// const apiHeaders = ref('{}')
// const apiBodyTemplate = ref('{"content": "{{content}}", "html": "{{html}}"}')

// Env Vars State
const envs = ref<WorkflowEnv[]>([])
const newEnvKey = ref('')
const newEnvValue = ref('')

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

const handleDeleteEnv = async (id: number) => {
  try {
    await deleteEnv(id)
    await loadEnvs()
    toast.success('环境变量已删除')
  }
  catch (e) {
    console.error(e)
    toast.error('删除失败')
  }
}

onMounted(async () => {
  customCss.value = await getSetting('custom_css') || ''

  // Load COS Settings
  cosSecretId.value = await getSetting('secret_id') || ''
  cosSecretKey.value = await getSetting('secret_key') || ''
  cosBucket.value = await getSetting('bucket') || ''
  cosRegion.value = await getSetting('region') || ''
  cosPathPrefix.value = await getSetting('path_prefix') || ''
  cosCustomDomain.value = await getSetting('custom_domain') || ''

  await loadEnvs()
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
        <!-- COS Settings -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon name="lucide:cloud" class="w-5 h-5" />
              腾讯云 COS 设置
            </CardTitle>
            <CardDescription>配置对象存储以支持图片上传功能。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
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

        <!-- Custom CSS -->
        <Card>
          <CardHeader>
            <CardTitle>自定义 CSS</CardTitle>
            <CardDescription>应用自定义样式到预览和导出的 HTML。</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea v-model="customCss" placeholder="/* 在此处输入自定义 CSS */" class="font-mono h-32" />
          </CardContent>
        </Card>

        <!-- Environment Variables -->
        <Card>
          <CardHeader>
            <CardTitle>环境变量 (Secrets)</CardTitle>
            <CardDescription>
              配置敏感信息（如 API Key）。在推送配置中通过 <code>{{ `\{\{env.KEY\}\}` }}</code> 使用。
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
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

        <Button class="w-full hidden md:flex" @click="saveSettings">
          保存设置
        </Button>
      </div>

      <div class="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-background/80 backdrop-blur-md border-t border-border/40 z-50 md:hidden">
        <Button class="w-full" @click="saveSettings">
          保存设置
        </Button>
      </div>
    </div>
  </div>
</template>
