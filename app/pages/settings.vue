<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useSettingRepository } from '~/composables/repositories/useSettingRepository'

const { setSetting, getSetting } = useSettingRepository()

const customCss = ref('')
const apiUrl = ref('')
const apiMethod = ref('POST')
const apiHeaders = ref('{}')
const apiBodyTemplate = ref('{"content": "{{content}}", "html": "{{html}}"}')

onMounted(async () => {
  customCss.value = await getSetting('custom_css') || ''
  apiUrl.value = await getSetting('api_url') || ''
  apiMethod.value = await getSetting('api_method') || 'POST'
  apiHeaders.value = await getSetting('api_headers') || '{\n  "Content-Type": "application/json"\n}'
  apiBodyTemplate.value = await getSetting('api_body_template') || '{\n  "content": "{{content}}",\n  "html": "{{html}}"\n}'
})

const saveSettings = async () => {
  try {
    // Validate JSON
    try {
      JSON.parse(apiHeaders.value)
      JSON.parse(apiBodyTemplate.value)
    }
    catch {
      toast.error('Headers 或 Body Template 中的 JSON 格式无效')
      return
    }

    await setSetting('custom_css', customCss.value)
    await setSetting('api_url', apiUrl.value)
    await setSetting('api_method', apiMethod.value)
    await setSetting('api_headers', apiHeaders.value)
    await setSetting('api_body_template', apiBodyTemplate.value)
    toast.success('设置已保存')
  }
  catch {
    toast.error('保存设置失败')
  }
}
</script>

<template>
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

      <!-- API Configuration -->
      <Card>
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
      </Card>

      <Button class="w-full" @click="saveSettings">
        保存设置
      </Button>
    </div>
  </div>
</template>
