# Milkdown (Crepe) 可行性分析报告

基于您提到的 [Milkdown](https://milkdown.dev/) 及其上层封装组件 [Crepe](https://milkdown.dev/docs/guide/using-crepe)，针对 ZotePad 项目当前的架构与需求进行了深度评估。

**结论先行**：
Milkdown (Crepe) 是一个**极高潜力**的升级方向，能将 ZotePad 从“传统 Markdown 编辑器”升级为类似 **Notion/Obsidian 实时预览** 的现代化编辑器。它能覆盖现有业务场景，但**集成成本中等偏高**，不是简单的 Props 替换，而需要编写一个封装层（Wrapper Component）。

---

## 1. 核心场景匹配度

| 需求点 (来自迁移指南) | Milkdown (Crepe) 解决方案 | 评估 |
| :--- | :--- | :--- |
| **Vue 3 集成** | 官方提供 `@milkdown/vue`，通过 Composition API 和 Provider 模式注入。 | ✅ **原生支持**，但不像 `input` 标签那样简单绑定，需封装组件处理 `v-model` 同步。 |
| **HTML 输出 (微信)** | **需要额外处理**。Milkdown 是所见即所得，DOM 结构包含大量编辑器辅助元素（拖拽手柄、菜单容器）。直接取 innerHTML 会包含脏数据。 | ⚠️ **注意**：建议在后台引入 `markdown-it` 将 Markdown 另行渲染为纯净 HTML 用于微信发布，**不要直接使用编辑器 DOM**。 |
| **图片上传** | 提供官方插件 `@milkdown/plugin-upload`。支持拦截粘贴/拖拽，支持 Promise 异步上传占位。 | 🌟 **优于现状**。交互体验更好（上传中有 Loading 态，而不是卡住）。 |
| **只读预览** | 设置 `ctx.update(editorViewOptionsCtx, { editable: () => false })`。 | 🟡 **可行**。但意味着“预览组件”也包含完整编辑器引擎，包体积较大。展示页建议仍用轻量级 Markdown 渲染器。 |
| **暗色模式** | Crepe 主题完全基于 CSS 变量。 | ✅ **完美集成**。只需在 Tailwind 的 `.dark` 类下覆写 CSS 变量即可。 |

---

## 2. Crepe 带来的改变

如果不使用核心 Core 而直接使用 Crepe 预设：

### 优势 (Pros) ✨
1.  **交互升级**：自带 `/` 斜线命令菜单（插入表格、图片、列表等）和 选中文字悬浮工具栏（加粗、斜体）。
2.  **Notion 风格**：完全抛弃了“左源码、右预览”的分栏模式，改为**实时渲染 (Live Preview)**。这更符合 ZotePad "本地笔记 App" 的定位，类似 Obsidian 的默认体验。
3.  **块级操作**：Crepe 支持对段落/列表进行块级拖拽。

### 挑战 (Cons) 🛡️
1.  **源码模式缺失**：Milkdown 默认不提供“纯 Markdown 源码”的编辑模式（虽然可以通过插件实现双向切换，但 Crepe 主要是为了 WYSIWYG 设计的）。如果您习惯写原始 Markdown 语法（如手动打 `**bold**`），它会立即渲染成粗体，可能需要适应。
2.  **样式定制黑盒**：Crepe 自带了一套很漂亮的样式，但如果要改得像 Shadcn UI 一样，需要覆盖较多的 CSS 变量。

---

## 3. 迁移技术路线图

如果决定采用 Milkdown (Crepe)，推荐的实施步骤如下：

### 第一步：创建封装组件 `MdEditorCrepe.vue`
不要直接在页面裸写逻辑，封装一个组件屏蔽底层差异。

```vue
<template>
  <MilkdownProvider>
    <div class="prose dark:prose-invert max-w-none">
      <Milkdown />
    </div>
  </MilkdownProvider>
</template>

<script setup lang="ts">
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/vue';
import { Crepe } from '@milkdown/crepe';
import { listener, listenerCtx } from '@milkdown/plugin-listener';

const props = defineProps(['modelValue']);
const emit = defineEmits(['update:modelValue', 'save', 'upload-img']);

useEditor((root) => {
  const crepe = new Crepe({
    root,
    defaultValue: props.modelValue,
    featureConfigs: {
      // 可以在这里配置图片上传器，对接您的 useStorageService
      [Crepe.Feature.ImageBlock]: {
        onUpload: async (file) => {
          // 调用现有的 cosService
          const urls = await uploadToCos(file);
          return urls[0]; 
        }
      }
    }
  });

  // 配置监听器同步 v-model
  crepe.config((ctx) => {
    ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
      emit('update:modelValue', markdown);
    });
  });

  return crepe;
});
</script>
```

### 第二步：解决 HTML 输出问题
在 `app/pages/write/article/[id].vue` 中，**不要依赖**编辑器产生的 HTML。
保留 `wechat-formatter.ts` 或引入 `markdown-it`：

```ts
// 当需要发布到微信时
import MarkdownIt from 'markdown-it';
const mdParser = new MarkdownIt();
const cleanHtml = mdParser.render(note.content); // 重新渲染源码
// 发送 cleanHtml 给微信
```

这样既享受了高级编辑体验，又保证了发送给微信的代码是纯净标准的。

---

## 结论

**Milkdown (Crepe) 完全满足场景**，并且能大幅提升 ZotePad 的产品质感（从“像个开发工具”变为“像个现代笔记应用”）。

唯一要注意的是**微信发布逻辑**需要解耦：编辑用 Milkdown，发布用纯渲染器生成 HTML。这不仅不是缺点，反而是架构上的优化。
