<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { useColorMode } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { extractFrontmatter, parseYAML } from '~/components/ui/editor/frontmatter-handler'
import MdEditorCrepe from '~/components/ui/editor/MdEditorCrepe.vue'
import { getWeChatMinimalHTML } from '~/utils/wechat-formatter'

useHead({ title: 'Preview & Export - ZotePad' })

type ExportResult = string

const route = useRoute()
const colorMode = useColorMode({ emitAuto: true })

const filePath = computed(() => {
  const q = route.query.path
  return (typeof q === 'string' && q.length > 0) ? q : null
})

const fileContent = ref('')
const isLoading = ref(false)
const lastExportPath = ref<string | null>(null)
const lastError = ref<string | null>(null)

const { info, error } = useLog()

void info('preview page setup', { tag: 'preview' })

const resolvedTheme = computed(() => {
  if (colorMode.value !== 'auto')
    return colorMode.value as 'light' | 'dark'
  return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
})

function slugifyFallback(name: string) {
  return name
    .trim()
    .replace(/\.[^/.]+$/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'untitled'
}

function getSlugFromMarkdown(path: string, content: string) {
  const { frontmatter } = extractFrontmatter(content)
  if (frontmatter) {
    const parsed = parseYAML(frontmatter)
    const slug = (parsed.slug as string | undefined) || ''
    if (typeof slug === 'string' && slug.trim())
      return slug.trim()
  }
  const fileName = path.split(/[\\/]/).pop() || 'untitled.md'
  return slugifyFallback(fileName)
}

async function waitForEditorDom(timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector('.milkdown .editor') as HTMLElement | null
    if (el && (el.textContent || '').trim().length > 0)
      return el
    await new Promise(r => setTimeout(r, 80))
  }
  return null
}

async function loadAndAutoExport(path: string) {
  isLoading.value = true
  lastError.value = null
  lastExportPath.value = null

  void info('loadAndAutoExport start', { tag: 'preview', context: { path } })

  try {
    // Read markdown via Tauri plugin-fs
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    fileContent.value = await readTextFile(path)
    void info('readTextFile ok', { tag: 'preview', context: { len: fileContent.value?.length || 0 } })

    // Wait editor render
    await nextTick()
    const editorDom = await waitForEditorDom(8000)
    void info('waitForEditorDom result', { tag: 'preview', context: { found: !!editorDom } })
    if (!editorDom)
      throw new Error('未找到编辑器内容（渲染超时）')

    const htmlFragment = getWeChatMinimalHTML(editorDom)
    const slug = getSlugFromMarkdown(path, fileContent.value)

    void info('prepared export', { tag: 'preview', context: { slug, htmlLen: htmlFragment.length } })

    // Write by Rust side to ensure directory creation & stable path
    const outPath = await invoke<ExportResult>('export_wechat_html', { slug, html: htmlFragment, source_path: path })
    lastExportPath.value = outPath
    void info('export_wechat_html ok', { tag: 'preview', context: { outPath } })
    toast.success(`已自动导出：${outPath}`)
  }
  catch (e: any) {
    void error('loadAndAutoExport failed', e, { tag: 'preview' })
    lastError.value = e?.message || String(e)
    toast.error(`自动导出失败：${lastError.value}`)
  }
  finally {
    isLoading.value = false
  }
}

watch(filePath, (p) => {
  if (p)
    loadAndAutoExport(p)
}, { immediate: true })
</script>

<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <header class="px-4 py-2 border-b bg-card flex items-center justify-between">
      <div class="min-w-0">
        <div class="text-sm font-medium truncate">Preview 模式（自动导出）</div>
        <div class="text-xs text-muted-foreground truncate" :title="filePath || ''">
          {{ filePath || '等待外部指令打开文件…' }}
        </div>
      </div>
      <div class="text-xs text-muted-foreground">
        <span v-if="isLoading">处理中…</span>
        <span v-else-if="lastExportPath">已导出</span>
        <span v-else>就绪</span>
      </div>
    </header>

    <div class="flex-1 overflow-hidden relative">
      <MdEditorCrepe
        v-model="fileContent"
        :is-dark="resolvedTheme === 'dark'"
        :read-only="true"
      />

      <div v-if="isLoading" class="absolute inset-0 bg-background/50 flex items-center justify-center z-50">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>

      <div v-if="lastError" class="absolute bottom-3 left-3 right-3 text-xs text-red-500 bg-background/80 border rounded p-2">
        {{ lastError }}
      </div>
    </div>
  </div>
</template>
