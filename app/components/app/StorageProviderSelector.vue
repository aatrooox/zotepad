<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useStorageSelector } from '~/composables/useStorageSelector'

const { isOpen, availableProviders, select, cancel } = useStorageSelector()

const providerConfig: Record<string, { icon: string, label: string }> = {
  cos: { icon: 'simple-icons:tencentqq', label: '腾讯云 COS' },
  oss: { icon: 'simple-icons:aliyun', label: '阿里云 OSS' },
  s3: { icon: 'simple-icons:amazonaws', label: 'Amazon S3' },
  kodo: { icon: 'simple-icons:qiniu', label: '七牛云 Kodo' },
}

const getIcon = (p: string) => providerConfig[p]?.icon || 'lucide:cloud'
const getLabel = (p: string) => providerConfig[p]?.label || p.toUpperCase()

function handleOpenChange(open: boolean) {
  if (!open) {
    cancel()
  }
}
</script>

<template>
  <Drawer :open="isOpen" @update:open="handleOpenChange">
    <DrawerContent>
      <div class="mx-auto w-full max-w-sm">
        <DrawerHeader>
          <DrawerTitle class="text-center">
            选择上传服务
          </DrawerTitle>
          <DrawerDescription class="text-center">
            请选择要上传到的图床服务
          </DrawerDescription>
        </DrawerHeader>
        <div class="p-4 pb-8">
          <div class="flex items-center justify-center gap-6 flex-wrap">
            <button
              v-for="p in availableProviders"
              :key="p"
              class="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-muted/50 active:bg-muted transition-all group min-w-[80px]"
              @click="select(p)"
            >
              <div class="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/10 transition-all duration-300">
                <Icon :name="getIcon(p)" class="w-7 h-7" />
              </div>
              <span class="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">{{ getLabel(p) }}</span>
            </button>
          </div>
        </div>
        <DrawerFooter>
          <DrawerClose as-child>
            <Button variant="outline" class="w-full" @click="cancel">
              取消
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
</template>
