import type { Placement } from '@floating-ui/dom'
// 从 Crepe 导入配置函数
import type { ToolbarFeatureConfig } from '@milkdown/crepe'
/**
 * 自定义 Toolbar 工具栏
 *
 * 基于 @milkdown/crepe Toolbar Feature 源码修改
 * 核心改动：允许配置 TooltipProvider 的 placement
 *
 * 参考：packages/crepe/src/feature/toolbar/index.ts
 */
import type { Ctx } from '@milkdown/kit/ctx'
import type { EditorState, PluginView, Selection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { App, ShallowRef } from 'vue'
// 自定义 Toolbar 组件（需要自己实现 或 从 Crepe 复制）
// 这里假设你复制了 Crepe 的 Toolbar 组件到本地
import { Toolbar } from '@milkdown/crepe/feature/toolbar/component'

import { getGroups } from '@milkdown/crepe/feature/toolbar/config'

import { tooltipFactory, TooltipProvider } from '@milkdown/kit/plugin/tooltip'
import { TextSelection } from '@milkdown/kit/prose/state'
import { createApp, ref, shallowRef } from 'vue'

/**
 * 扩展配置，添加 placement 支持
 */
export interface CustomToolbarConfig extends ToolbarFeatureConfig {
  /**
   * Tooltip 位置
   * @default 'top' (Crepe 默认行为)
   * 移动端建议 'bottom'
   */
  placement?: Placement

  /**
   * 与选区的偏移距离（像素）
   * @default 10
   */
  offset?: number
}

const customToolbarTooltip = tooltipFactory('CUSTOM_TOOLBAR')

class CustomToolbarView implements PluginView {
  #tooltipProvider: TooltipProvider
  #content: HTMLElement
  #app: App
  #selection: ShallowRef<Selection>
  #show = ref(false)

  constructor(ctx: Ctx, view: EditorView, config?: CustomToolbarConfig) {
    const content = document.createElement('div')
    content.className = 'milkdown-toolbar'
    this.#selection = shallowRef(view.state.selection)

    const app = createApp(Toolbar, {
      ctx,
      hide: this.hide,
      config,
      selection: this.#selection,
      show: this.#show,
    })
    app.mount(content)
    this.#content = content
    this.#app = app

    // ✨ 核心改动：添加 floatingUIOptions 支持
    this.#tooltipProvider = new TooltipProvider({
      content: this.#content,
      debounce: 20,
      offset: config?.offset ?? 10,
      floatingUIOptions: {
        placement: config?.placement ?? 'top', // 🎯 可配置位置
      },
      shouldShow(view: EditorView) {
        const { doc, selection } = view.state
        const { empty, from, to } = selection

        // 无选中内容 -> 不显示
        if (empty)
          return false

        // 光标在文档边界 -> 不显示
        if (from === 0 || to === doc.nodeSize - 2)
          return false

        // 非文本选区 -> 不显示
        const isTextSelection = selection instanceof TextSelection
        if (!isTextSelection)
          return false

        // 选中内容 -> 显示
        return true
      },
    })

    this.#tooltipProvider.onShow = () => {
      this.#show.value = true
    }
    this.#tooltipProvider.onHide = () => {
      this.#show.value = false
    }

    this.update(view)
  }

  update = (view: EditorView, prevState?: EditorState) => {
    this.#tooltipProvider.update(view, prevState)
    this.#selection.value = view.state.selection
  }

  destroy = () => {
    this.#tooltipProvider.destroy()
    this.#app.unmount()
    this.#content.remove()
  }

  hide = () => {
    this.#tooltipProvider.hide()
  }
}

/**
 * 使用方法：
 *
 * ```ts
 * import { useCustomToolbar } from '~/composables/useCustomToolbar'
 *
 * const { createCustomToolbar } = useCustomToolbar()
 *
 * editor.use(createCustomToolbar({
 *   placement: isMobile ? 'bottom' : 'top',
 *   offset: isMobile ? 60 : 10, // 移动端离底部 60px（避开系统键盘）
 * }))
 * ```
 */
export function useCustomToolbar() {
  /**
   * 创建自定义 Toolbar 插件
   */
  function createCustomToolbar(config?: CustomToolbarConfig) {
    return [
      (ctx: Ctx) => {
        ctx.set(customToolbarTooltip.key, {
          view: (view: EditorView) => new CustomToolbarView(ctx, view, config),
        })
      },
      customToolbarTooltip,
    ]
  }

  return {
    createCustomToolbar,
  }
}
