<script setup lang="ts">
import type { WorkflowEnv } from '~/composables/repositories/useEnvironmentRepository'
import { toast } from 'vue-sonner'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'

const { setSetting, getSetting } = useSettingRepository()
const { getAllEnvs, createEnv, deleteEnv } = useEnvironmentRepository()

const customCss = ref('')
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
  // apiUrl.value = await getSetting('api_url') || ''
  // apiMethod.value = await getSetting('api_method') || 'POST'
  // apiHeaders.value = await getSetting('api_headers') || '{\n  "Content-Type": "application/json"\n}'
  // apiBodyTemplate.value = await getSetting('api_body_template') || '{\n  "content": "{{content}}",\n  "html": "{{html}}"\n}'

  await loadEnvs()
})

const saveSettings = async () => {
  try {
    await setSetting('custom_css', customCss.value)
    // await setSetting('api_url', apiUrl.value)
    // await setSetting('api_method', apiMethod.value)
    // await setSetting('api_headers', apiHeaders.value)
    // await setSetting('api_body_template', apiBodyTemplate.value)
    toast.success('设置已保存')
  }
  catch {
    toast.error('保存设置失败')
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="container mx-auto p-4 max-w-2xl pb-20">
      <div class="flex items-center gap-4 mb-6">
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

        <!-- API Configuration -->
        <!-- <Card>
          <CardHeader>
            <CardTitle>API 配置</CardTitle>
            <CardDescription>配置笔记发送的目标地址。</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <Label>目标 URL</Label>
              <Input v-model="apiUrl" placeholder="https://api.example.com/posts" />
            </div>

            <div class="space-y-2">
              <Label>请求方法</Label>
              <Select v-model="apiMethod">
                <SelectTrigger>
                  <SelectValue placeholder="选择方法" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">
                    POST
                  </SelectItem>
                  <SelectItem value="PUT">
                    PUT
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-2">
              <Label>请求头 (JSON)</Label>
              <Textarea v-model="apiHeaders" class="font-mono h-24" />
            </div>

            <div class="space-y-2">
              <Label>请求体模板 (JSON)</Label>
              <p v-pre class="text-xs text-muted-foreground">
                可用变量: {{ content }}, {{ html }}, {{ title }}
              </p>
              <Textarea v-model="apiBodyTemplate" class="font-mono h-32" />
            </div>
          </CardContent>
        </Card> -->

        <Button class="w-full" @click="saveSettings">
          保存设置
        </Button>
      </div>
    </div>
  </div>
</template>
