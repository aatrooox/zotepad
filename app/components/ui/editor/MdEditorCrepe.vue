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
      
      // 销毁 Crepe 实例以防止内存泄漏
      const crepe = crepeRef.value
      if (crepe && crepe.editor) {
        try {
          crepe.destroy()
          console.log('🗑️ Crepe editor destroyed')
        }
        catch (e) {
          console.warn('Failed to destroy Crepe editor:', e)
        }
      }
      crepeRef.value = null
    })
    
    return () => h(Milkdown)
  }
})
</script>

<style>
/* ============ 主题变量：与 Tailwind/Shadcn 集成 ============ */
.milkdown-container.dark {
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
  --crepe-color-background: hsl(var(--background));
  --crepe-color-surface: hsl(var(--card));
  --crepe-color-surface-low: hsl(var(--muted));
  --crepe-color-on-background: hsl(var(--foreground));
  --crepe-color-primary: hsl(var(--primary));
}

/* ============ 编辑器布局 ============ */
.milkdown .editor {
  min-height: 100%;
  padding-bottom: 50vh;
  max-width: 900px;
  margin: 0 auto;
  
  /* 全局字体：使用 SweiCurveLeg */
  font-family: 'SweiCurveLeg', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.75;
  letter-spacing: 0.01em;
}

/* ============ 标题样式 ============ */
.milkdown h1 {
  font-size: 2.25rem;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 2rem;
  margin-bottom: 1rem;
  letter-spacing: -0.02em;
}

.milkdown .editor h2 {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.75rem;
  margin-bottom: 0.75rem;
  letter-spacing: -0.01em;
}

.milkdown .editor h3 {
  font-size: 20px;
  font-weight: 400;
  line-height: 1.4;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

.milkdown h4 {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.5;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}

.milkdown h5,
.milkdown h6 {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

/* ============ 段落样式 ============ */
.milkdown .editor p {
  line-height: 1.9;
  margin: 1.25rem 0;
}

.milkdown .editor p:first-child {
  margin-top: 0;
}

.milkdown .editor p:last-child {
  margin-bottom: 0;
}

/* ============ 列表样式 ============ */
/* .milkdown ul,
.milkdown ol {
  padding-left: 1.75rem;
  margin: 1rem 0;
  line-height: 1.8;
}

.milkdown li {
  margin: 0.5rem 0;
}

.milkdown li > p {
  margin: 0.25rem 0;
} */

/* ============ 引用块样式 ============ */
.milkdown .editor blockquote {
  padding-left: 1rem;
}

.milkdown .editor blockquote p {
  font-size: 14px;
  color: hsl(var(--foreground));
  margin: 0.5rem 0;
}

/* ============ 代码样式 ============ */
.milkdown .editor code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;
  font-size: 0.875em;
  background: hsl(var(--primary) / 0.12);
  color: var(--crepe-color-primary);
  padding: 1px 2px;
  border-radius: 4px;
}

.milkdown pre {
  background: hsl(var(--muted));
  border-radius: 8px;
  padding: 1rem;
  margin: 1.5rem 0;
  overflow-x: auto;
  line-height: 1.6;
}

.milkdown pre code {
  background: none;
  padding: 0;
  font-size: 0.9em;
}

/* ============ 链接样式 ============ */
.milkdown .editor a {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-decoration-style: wavy;
  text-underline-offset: 3px;
  transition: text-decoration-style 0.2s ease;
}

.milkdown a:hover {
  text-decoration-style: solid;
}

/* ============ 水平分割线 ============ */
.milkdown hr {
  border: none;
  border-top: 2px solid hsl(var(--border));
  margin: 2rem 0;
  opacity: 0.5;
}

/* ============ 表格样式 ============ */
/* .milkdown table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  font-size: 0.9375rem;
}

.milkdown th,
.milkdown td {
  border: 1px solid var(--crepe-color-outline);
  padding: 0.75rem 1rem;
  text-align: left;
} */

/* .milkdown th {
  background: var(--crepe-color-surface-low);
  font-weight: 600;
} */

/* ============ Placeholder 样式 ============ */
.milkdown .placeholder {
  color: hsl(var(--muted-foreground));
  opacity: 0.5;
  pointer-events: none;
}

/* ============ 移动端适配 ============ */
@media (max-width: 768px) {
  .milkdown .editor {
    padding: 1rem !important;
    padding-bottom: 50vh !important;
    font-size: 15px;
  }

  .milkdown h1 {
    font-size: 1.875rem;
  }

  .milkdown h2 {
    font-size: 1.5rem;
  }

  .milkdown h3 {
    font-size: 1.25rem;
  }

  .milkdown p {
    line-height: 1.8;
  }
}
</style>
