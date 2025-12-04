<script setup lang="ts">
import type { WorkflowEnv } from '~/composables/repositories/useEnvironmentRepository'
import { toast } from 'vue-sonner'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
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
                推送
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card class="border-0 shadow-none">
                <CardHeader class="px-0 pt-0">
                  <CardDescription>
                    配置敏感信息（如 API Key）。在推送、拉取API中通过 <code>{{ `\{\{env.KEY\}\}` }}</code> 使用。
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
