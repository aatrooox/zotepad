<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useEnvironmentRepository } from '~/composables/repositories/useEnvironmentRepository'

interface Props {
  missingVariables: string[]
  variant?: 'inline' | 'banner'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'inline',
})

const emit = defineEmits<{
  saved: []
}>()

const { createEnv } = useEnvironmentRepository()

const isOpen = ref(false)
const isSaving = ref(false)

// 提取纯变量名（去掉 env. 前缀）
const cleanVariables = computed(() => {
  return props.missingVariables.map((v) => {
    return v.startsWith('env.') ? v.slice(4) : v
  })
})

// 变量值映射
const variableValues = ref<Record<string, string>>({})

// 当 drawer 打开时，初始化变量值
watch(isOpen, (open) => {
  if (open) {
    variableValues.value = {}
    cleanVariables.value.forEach((key) => {
      variableValues.value[key] = ''
    })
  }
})

const handlePaste = async (key: string) => {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      variableValues.value[key] = text
      toast.success('已粘贴')
    }
  }
  catch {
    toast.error('无法访问剪贴板')
  }
}

const handleSave = async () => {
  const toSave = Object.entries(variableValues.value).filter(([_, value]) => value.trim() !== '')

  if (toSave.length === 0) {
    toast.error('请至少填写一个变量')
    return
  }

  isSaving.value = true
  try {
    for (const [key, value] of toSave) {
      await createEnv(key, value)
    }
    toast.success(`已保存 ${toSave.length} 个环境变量`)
    isOpen.value = false
    emit('saved')
  }
  catch (e) {
    console.error(e)
    toast.error('保存失败')
  }
  finally {
    isSaving.value = false
  }
}

const filledCount = computed(() => {
  return Object.values(variableValues.value).filter(v => v.trim() !== '').length
})
</script>

<template>
  <Drawer v-model:open="isOpen">
    <DrawerTrigger as-child>
      <!-- 行内样式 -->
      <button
        v-if="variant === 'inline'"
        class="flex items-center gap-1.5 text-destructive hover:underline cursor-pointer"
      >
        <Icon name="lucide:alert-triangle" class="w-3.5 h-3.5 shrink-0" />
        <span class="text-xs">
          缺失变量: {{ missingVariables.join(', ') }}
        </span>
      </button>

      <!-- Banner 样式 -->
      <button
        v-else
        class="w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-left hover:bg-destructive/15 transition-colors cursor-pointer"
      >
        <div class="flex items-center gap-2 text-destructive">
          <Icon name="lucide:alert-triangle" class="w-4 h-4 shrink-0" />
          <span class="text-sm font-medium">存在未配置的变量</span>
          <span class="ml-auto text-xs opacity-70">点击配置</span>
        </div>
        <p class="text-xs text-muted-foreground mt-1">
          <span class="font-mono text-destructive">{{ missingVariables.join(', ') }}</span>
        </p>
      </button>
    </DrawerTrigger>

    <DrawerContent>
      <div class="mx-auto w-full max-w-lg">
        <DrawerHeader>
          <DrawerTitle>配置缺失的环境变量</DrawerTitle>
          <DrawerDescription>
            这些变量将安全地存储在本地，仅在运行工作流时使用。
          </DrawerDescription>
        </DrawerHeader>

        <div class="p-4 space-y-4">
          <div v-for="key in cleanVariables" :key="key" class="space-y-1.5">
            <Label class="text-sm font-medium font-mono">{{ key }}</Label>
            <div class="flex gap-2">
              <Input
                v-model="variableValues[key]"
                type="password"
                :placeholder="`输入 ${key} 的值`"
                class="flex-1 font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                @click="handlePaste(key)"
              >
                <Icon name="lucide:clipboard-paste" class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <DrawerFooter>
          <Button :disabled="isSaving || filledCount === 0" @click="handleSave">
            <Icon v-if="isSaving" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
            <Icon v-else name="lucide:save" class="w-4 h-4 mr-2" />
            保存 {{ filledCount > 0 ? `(${filledCount}/${cleanVariables.length})` : '' }}
          </Button>
          <DrawerClose as-child>
            <Button variant="outline">
              取消
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
</template>
