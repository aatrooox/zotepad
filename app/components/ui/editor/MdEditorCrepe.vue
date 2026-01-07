<template>
  <ClientOnly fallback-tag="div" fallback="Loading editor...">
    <div class="h-full w-full milkdown-container overflow-y-auto" :class="{ 'dark': isDark }">
      <MilkdownProvider>
        <Editor 
          :model-value="modelValue" 
          :is-dark="isDark" 
          :read-only="readOnly"
          @update:model-value="updateValue" 
          @save="$emit('save')" 
          @upload-img="(files, cb) => $emit('upload-img', files, cb)"
        />
      </MilkdownProvider>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/vue'
import { Crepe } from '@milkdown/crepe'
import { replaceAll } from '@milkdown/utils'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { useWindowSize } from '@vueuse/core'
import { createFrontmatterHandler } from './frontmatter-handler'

import '@milkdown/crepe/theme/common/style.css'
// 显式根据深色模式引入不同的主题文件可能会有冲突，Crepe 推荐用 CSS 变量控制
import '@milkdown/crepe/theme/frame.css'

const props = defineProps<{
  modelValue: string
  isDark?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'save'): void
  (e: 'upload-img', files: File[], callback: (urls: string[]) => void): void
}>()

const updateValue = (val: string) => {
  emit('update:modelValue', val)
}

// 创建 frontmatter 处理器
const frontmatterHandler = createFrontmatterHandler()

// 内部编辑器组件
const Editor = defineComponent({
  name: 'CrepeEditorInner',
  components: { Milkdown },
  props: ['modelValue', 'isDark', 'readOnly'],
  // 必须声明 emits，否则 setup 中无法正常向上传递
  emits: ['update:modelValue', 'save', 'upload-img'],
  setup(props, { emit }) {
    const crepeRef = shallowRef<any>() // 使用 any 或 Crepe 类型，保持简单
    let lastEmittedValue = '' // 记录最后一次发出的值，防止回流导致的光标跳动

    // 监听键盘事件实现保存快捷键
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        emit('save')
      }
    }

    const { get, loading } = useEditor((root) => {
      const { width } = useWindowSize()
      const isMobile = width.value < 768

      // 从 modelValue 中提取并缓存 frontmatter，只传递正文给编辑器
      const contentForEditor = frontmatterHandler.prepareForEditor(props.modelValue)

      const crepe = new Crepe({
        root,
        defaultValue: contentForEditor,
        // 如果是移动端，禁用BlockEdit（块拖拽）等重Hover特性
        features: isMobile ? {
          [Crepe.Feature.BlockEdit]: false,
          [Crepe.Feature.Toolbar]: false, // 浮动工具栏在移动端也很难用
        } : {},
        // 这里可以配置 Crepe 的特性
        featureConfigs: {
          [Crepe.Feature.Placeholder]: {
            text: '开始输入...',
          },
          // 正确的 ImageBlock 上传配置
          [Crepe.Feature.ImageBlock]: {
            onUpload: (file) => {
              return new Promise((resolve, reject) => {
                // 将文件传递给父组件处理，父组件处理完通过回调返回 URL
                emit('upload-img', [file], (urls: string[]) => {
                  if (urls && urls.length > 0) {
                    resolve(urls[0] as string)
                  } else {
                    reject(new Error('Image upload failed or cancelled'))
                  }
                })
              })
            },
          },
        },
      })

      // 保存 crepe 实例到 ref
      crepeRef.value = crepe
      
      // 初始化只读状态
      crepe.setReadonly(props.readOnly)

      // 关键：必须在同一个链式调用中完成所有配置和创建
      crepe.editor
        .config((ctx) => {
          ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
            // 将编辑器内容与缓存的 frontmatter 合并后再发出
            const fullMarkdown = frontmatterHandler.prepareForSave(markdown)
            lastEmittedValue = fullMarkdown
            emit('update:modelValue', fullMarkdown)
          })
        })
        .use(listener)
        .create()
        .then(() => {
          console.log('✅ Crepe editor created with frontmatter support')
        })
      
      return crepe
    })

    // 监听只读状态变化
    watch(() => props.readOnly, (val) => {
      const crepe = crepeRef.value
      if (crepe) {
        crepe.setReadonly(val)
      }
    })

    onMounted(() => {
      window.addEventListener('keydown', handleKeydown)
    })

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeydown)
    })
    
    return () => h(Milkdown)
  }
})
</script>

<style>
/* 覆盖 Crepe 的 CSS 变量以通过 Tailwind 的 dark 类自动切换 */
.milkdown-container.dark {
  /* Dark Mode Variables matching Shadcn/Tailwind Zinc/Slate */
  --crepe-color-background: hsl(var(--background));
  --crepe-color-surface: hsl(var(--card));
  --crepe-color-surface-low: hsl(var(--muted));
  --crepe-color-on-background: hsl(var(--foreground));
  --crepe-color-on-surface: hsl(var(--card-foreground));
  --crepe-color-outline: hsl(var(--border));
  --crepe-color-primary: hsl(var(--primary));
  --crepe-color-on-primary: hsl(var(--primary-foreground));
}

.milkdown-container:not(.dark) {
  /* Light Mode Variables */
  --crepe-color-background: hsl(var(--background));
  --crepe-color-surface: hsl(var(--card));
  --crepe-color-surface-low: hsl(var(--muted));
  --crepe-color-on-background: hsl(var(--foreground));
  
  --crepe-color-primary: hsl(var(--primary));
}

/* 强制让编辑器撑满高度 */
.milkdown .editor {
  min-height: 100%;
  padding-bottom: 50vh; /* 底部留白 */
  max-width: 900px;     /* 限制最大宽度提升阅读体验 */
  margin: 0 auto;
}

/* 移动端适配：减少 Padding */
@media (max-width: 768px) {
  .milkdown .editor {
    padding: 1rem !important;
    padding-bottom: 50vh !important;
  }
}
</style>
