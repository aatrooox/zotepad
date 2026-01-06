# md-editor-v3 使用情况与迁移指南

本文档记录了 `md-editor-v3` 在 ZotePad 项目中的详细使用情况。如果后续计划更换编辑器（例如迁移到基于 CodeMirror 6 的自定义实现），请务必参考以下内容，确保新方案覆盖所有现有功能。

## 1. 核心输入与输出 (Core I/O)

| 类别 | 监听/绑定 | 业务逻辑 | 迁移要求 |
| :--- | :--- | :--- | :--- |
| **输入** | `v-model` | 绑定到 `content` 变量，即 Markdown 源码字符串。 | 必须支持双向绑定 Markdown 源码。 |
| **输出** | `@save` / `@on-save` | 绑定 `Ctrl+S` (Command+S) 快捷键，触发 `saveNote` 或 `handleSave`。 | 编辑器必须支持键盘快捷键捕获并向外抛出事件。 |
| **输出** | `@on-html-changed` | **关键功能**：文章页通过此事件实时获取 Markdown 渲染后的 HTML 字符串并存入 `htmlContent`。此数据直接用于**发布到微信公众号**。 | **高风险**：如果不提供 HTML 输出，或输出结构差异巨大，微信发布功能将失效或排版错乱。 |
| **样式** | `theme` | 绑定应用内的 `resolvedTheme` ('light'/'dark')，根据系统/用户设置自动切换。 | 新编辑器需具备完善的亮/暗色模式支持。 |

## 2. 关键业务集成 (Integrations)

### A. 图片上传 (`@on-upload-img`)

目前在 `app/pages/write/article/[id].vue` 中使用了自定义图片上传处理，这是编辑体验的核心部分。

*   **当前逻辑**：
    1.  监听编辑器 `@on-upload-img` 事件，接收 `files: File[]` 和 `callback` 函数。
    2.  调用 `useStorageService` 的 `uploadFiles(files)` 上传到对象存储 (COS/S3)。
    3.  获取返回的 URL 列表。
    4.  调用 `callback(urls)` 将 URL 以 Markdown 格式 (`![alt](url)`) 回填到编辑器光标处。
*   **迁移要求**：
    *   新编辑器必须提供**粘贴 (Paste)** 和 **拖拽 (Drop)** 事件的拦截接口。
    *   必须支持“异步插入”：在上传过程中最好能显示 loading 占位符，上传成功后替换为图片语法。

### B. 微信公众号发布 (WeChat Publishing)

这是一个强依赖 `md-editor-v3` **渲染引擎** 的流程。

*   **当前逻辑**：
    1.  编辑器内部渲染 Markdown -> HTML。
    2.  触发 `@on-html-changed`，Vue 将 HTML 存入 `htmlContent`。
    3.  **消费环节**：当用户点击“发布到微信”时，系统读取 `htmlContent`，可能会经过 `wechat-formatter.ts` 处理后发送给微信 API。
*   **迁移风险**：
    *   微信对 HTML 标签和内联样式有严格限制。
    *   `md-editor-v3` 可能内置了一些 GitHub 风格的样式类或结构。如果新编辑器生成的 HTML 结构不同（例如代码块的包裹方式、引用块的 class），可能会导致发到微信的文章排版崩坏。
    *   *建议*：迁移后需重点测试代码块、列表、引用、加粗等语法的微信预览效果。

### C. 主题与预览 (`MdPreview`)

项目中多处使用了 `MdPreview` 组件用于只读展示，例如：
*   动态列表页 (`notes/moments/[id].vue`)
*   历史版本预览等

*   **当前逻辑**：独立使用 `MdPreview` 组件，仅传入 `modelValue`。
*   **迁移要求**：如果不使用 `md-editor-v3`，你需要引入可以通过 props 渲染 Markdown 的组件（如基于 `markdown-it` 封装），并确保其**渲染样式**与编辑器内的预览样式保持一致（字体、行高、代码高亮配色）。

## 3. 组件级配置 (Props & Config)

以下是代码中显式用到的配置项，新编辑器需要实现等效控制：

*   **Toolbar 定制** (`:toolbars`, `:toolbars-exclude`)
    *   文章页使用了自定义 toolbar 配置。
    *   本地工作区排除了 `['save', 'github']` 等按钮。
*   **外观控制**
    *   `:preview="false"`：在文章页强制关闭分栏预览（专注模式）。
    *   `:editable="true/false"`：控制只读状态。
    *   `:code-foldable="false"`：禁用代码块折叠（为了和微信展示保持一致）。
    *   `:show-code-row="true"`：显示代码行号。
    *   `preview-theme="github"`：指定预览区的主题样式。

## 4. 样式依赖 (CSS)

*   **Layout 适配**: 在 `local-workspace.vue` 等文件中，使用了 `:deep(.md-editor) { height: 100% }` 来强制撑开高度，适应 Flex 布局。
*   **迁移要求**：新编辑器必须能响应父容器高度变化，最好支持 CSS 变量以便与 Tailwind/Shadcn UI 主题色对齐。

## 总结：迁移清单

若决定迁移，请按以下顺序验证：
1.  ✅ **基础编辑**：可以输入文字，支持快捷键保存。
2.  ✅ **渲染一致性**：新编辑器提供的 HTML 输出，在微信草稿箱中显示正常。
3.  ✅ **图片上传**：实现了拦截粘贴/拖拽并上传到 COS。
4.  ✅ **只读组件**：找到了替代 `MdPreview` 的方案用于展示页。
