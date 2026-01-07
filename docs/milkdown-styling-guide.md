# Milkdown Crepe 样式自定义指南

> 基于 Milkdown v7.18.0 + Crepe Preset
> 
> 官方文档：https://milkdown.dev/docs/guide/styling

## 目录

- [Crepe 主题系统](#crepe-主题系统)
- [CSS 变量覆盖](#css-变量覆盖)
- [深度样式定制](#深度样式定制)
- [编辑器内容样式](#编辑器内容样式)
- [实战案例](#实战案例)

---

## Crepe 主题系统

Crepe 使用 **CSS Variables（CSS 变量）** 来控制主题，可以通过覆盖变量来自定义外观。

### 核心 CSS 变量

Crepe 提供以下主要 CSS 变量（在 `.crepe` 容器下生效）：

```css
/* 颜色系统 */
--crepe-color-background        /* 编辑器背景色 */
--crepe-color-surface           /* 卡片/块背景色 */
--crepe-color-surface-low       /* 次级背景（hover、选中等） */
--crepe-color-on-background     /* 主文本颜色 */
--crepe-color-on-surface        /* 卡片文本颜色 */
--crepe-color-outline           /* 边框颜色 */
--crepe-color-primary           /* 主题色（链接、按钮等） */
--crepe-color-on-primary        /* 主题色上的文本颜色 */

/* 字体系统 */
--crepe-font-family             /* 编辑器字体 */
--crepe-font-code               /* 代码字体 */

/* 间距系统 */
--crepe-editor-padding          /* 编辑器内边距 */
--crepe-line-height             /* 行高 */
```

### 导入必需的 CSS

Crepe 需要导入两个核心样式文件：

```typescript
import '@milkdown/crepe/theme/common/style.css'  // 基础样式
import '@milkdown/crepe/theme/frame.css'         // 框架样式
```

⚠️ **注意**：不建议导入 `dark.css` 或 `light.css`，因为它们会与自定义主题冲突。推荐通过 CSS 变量控制。

---

## CSS 变量覆盖

### 方法 1：全局覆盖（推荐）

在组件的 `<style>` 中定义针对 `.milkdown-container` 的样式：

```vue
<template>
  <div class="milkdown-container" :class="{ 'dark': isDark }">
    <MilkdownProvider>
      <Milkdown />
    </MilkdownProvider>
  </div>
</template>

<style>
/* 浅色模式 */
.milkdown-container:not(.dark) {
  --crepe-color-background: #ffffff;
  --crepe-color-surface: #f9fafb;
  --crepe-color-on-background: #1f2937;
  --crepe-color-primary: #3b82f6;
}

/* 深色模式 */
.milkdown-container.dark {
  --crepe-color-background: #0f172a;
  --crepe-color-surface: #1e293b;
  --crepe-color-on-background: #f1f5f9;
  --crepe-color-primary: #60a5fa;
}
</style>
```

### 方法 2：与 Tailwind/Shadcn 集成

直接使用 Tailwind 的 CSS 变量（`hsl(var(--xxx))`）：

```css
.milkdown-container.dark {
  --crepe-color-background: hsl(var(--background));
  --crepe-color-surface: hsl(var(--card));
  --crepe-color-on-background: hsl(var(--foreground));
  --crepe-color-outline: hsl(var(--border));
  --crepe-color-primary: hsl(var(--primary));
  --crepe-color-on-primary: hsl(var(--primary-foreground));
}
```

**优势**：自动跟随 Shadcn 主题切换，无需手动维护两套颜色。

---

## 深度样式定制

### 使用 `:deep()` 穿透组件

Vue 3 的 `scoped` 样式需要使用 `:deep()` 来修改子组件：

```vue
<style scoped>
/* ✅ 正确：使用 :deep() */
:deep(.milkdown .editor) {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

/* ❌ 错误：无法穿透 scoped */
.milkdown .editor {
  padding: 2rem;
}
</style>
```

### 常见样式覆盖点

#### 1. 编辑器容器

```css
:deep(.milkdown .editor) {
  min-height: 100%;
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
}
```

#### 2. 标题样式

```css
:deep(.milkdown h1) {
  font-size: 2.5rem;
  font-weight: 700;
  margin-top: 1.5rem;
  margin-bottom: 1rem;
}

:deep(.milkdown h2) {
  font-size: 2rem;
  font-weight: 600;
  border-bottom: 2px solid var(--crepe-color-outline);
  padding-bottom: 0.5rem;
}
```

#### 3. 代码块样式

```css
:deep(.milkdown pre) {
  background: var(--crepe-color-surface-low);
  border-radius: 8px;
  padding: 1rem;
  overflow-x: auto;
}

:deep(.milkdown code) {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 0.9em;
}
```

#### 4. 链接样式

```css
:deep(.milkdown a) {
  color: var(--crepe-color-primary);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
}

:deep(.milkdown a:hover) {
  text-decoration-style: solid;
}
```

#### 5. 列表样式

```css
:deep(.milkdown ul),
:deep(.milkdown ol) {
  padding-left: 1.5rem;
  margin: 1rem 0;
}

:deep(.milkdown li) {
  margin: 0.5rem 0;
  line-height: 1.6;
}
```

#### 6. 引用块样式

```css
:deep(.milkdown blockquote) {
  border-left: 4px solid var(--crepe-color-primary);
  padding-left: 1rem;
  margin: 1rem 0;
  color: var(--crepe-color-on-background);
  opacity: 0.8;
  font-style: italic;
}
```

---

## 编辑器内容样式

### 字体定制

```css
/* 编辑器全局字体 */
:deep(.milkdown .editor) {
  font-family: 
    'SweiCurveLeg',          /* 自定义字体 */
    ui-sans-serif, 
    system-ui, 
    -apple-system, 
    'Segoe UI', 
    sans-serif;
  font-size: 16px;
  line-height: 1.75;
}

/* 代码字体 */
:deep(.milkdown code),
:deep(.milkdown pre) {
  font-family: 
    'JetBrains Mono', 
    'Fira Code', 
    'Consolas', 
    monospace;
}
```

### 行高与间距

```css
:deep(.milkdown .editor) {
  line-height: 1.75;
  letter-spacing: 0.01em;
}

:deep(.milkdown p) {
  margin: 1rem 0;
}

:deep(.milkdown > *:first-child) {
  margin-top: 0;
}

:deep(.milkdown > *:last-child) {
  margin-bottom: 0;
}
```

### Placeholder 样式

```css
:deep(.milkdown .placeholder) {
  color: var(--crepe-color-on-background);
  opacity: 0.3;
  pointer-events: none;
}
```

---

## 实战案例

### 案例 1：ZotePad 当前配置

```vue
<style>
/* Shadcn 主题集成 */
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

/* 编辑器布局 */
.milkdown .editor {
  min-height: 100%;
  padding-bottom: 50vh;  /* 底部留白，方便编辑 */
  max-width: 900px;
  margin: 0 auto;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .milkdown .editor {
    padding: 1rem !important;
    padding-bottom: 50vh !important;
  }
}
</style>
```

### 案例 2：极简白色主题

```css
.milkdown-container {
  --crepe-color-background: #ffffff;
  --crepe-color-surface: #f8f9fa;
  --crepe-color-on-background: #212529;
  --crepe-color-primary: #007bff;
  --crepe-font-family: 'Georgia', serif;
}

:deep(.milkdown .editor) {
  padding: 3rem 2rem;
  max-width: 680px;
  margin: 0 auto;
  font-size: 18px;
  line-height: 1.8;
}

:deep(.milkdown h1) {
  font-size: 2.8rem;
  font-weight: 300;
  letter-spacing: -0.02em;
}
```

### 案例 3：GitHub 风格

```css
.milkdown-container {
  --crepe-color-background: #ffffff;
  --crepe-color-surface: #f6f8fa;
  --crepe-color-surface-low: #eaeef2;
  --crepe-color-on-background: #1f2328;
  --crepe-color-outline: #d1d9e0;
  --crepe-color-primary: #0969da;
}

:deep(.milkdown pre) {
  background: #f6f8fa;
  border: 1px solid #d1d9e0;
  border-radius: 6px;
}

:deep(.milkdown blockquote) {
  border-left: 4px solid #d1d9e0;
  color: #59636e;
}

:deep(.milkdown code) {
  background: rgba(175, 184, 193, 0.2);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.85em;
}
```

---

## 调试技巧

### 1. 使用浏览器 DevTools

打开 Chrome DevTools → Elements，查看实际生效的 CSS 变量：

```
.milkdown-container {
  --crepe-color-background: #ffffff;  /* 当前值 */
}
```

### 2. 临时测试样式

在浏览器控制台直接修改：

```javascript
document.documentElement.style.setProperty('--crepe-color-primary', '#ff0000')
```

### 3. 检查样式优先级

如果样式不生效，检查：
- ✅ 是否使用了 `:deep()`（Vue scoped 模式）
- ✅ 选择器是否足够具体（权重）
- ✅ 是否被 `!important` 覆盖
- ✅ 是否在正确的容器下定义（`.milkdown-container`）

---

## 常见问题

### Q1: 为什么 CSS 变量不生效？

**A**: 确保变量定义在 Crepe 能读取的位置：

```css
/* ✅ 正确 */
.milkdown-container {
  --crepe-color-background: #fff;
}

/* ❌ 错误：作用域不对 */
body {
  --crepe-color-background: #fff;
}
```

### Q2: 如何隐藏工具栏？

**A**: Crepe 的工具栏是通过 Feature 控制的：

```typescript
new Crepe({
  features: {
    [Crepe.Feature.Toolbar]: false,  // 隐藏浮动工具栏
    [Crepe.Feature.BlockEdit]: false, // 隐藏块拖拽
  }
})
```

### Q3: 如何修改 Placeholder 文本？

**A**: 通过 Feature 配置：

```typescript
featureConfigs: {
  [Crepe.Feature.Placeholder]: {
    text: '开始输入...',  // 自定义文本
  },
}
```

### Q4: 移动端样式适配？

**A**: 使用媒体查询 + Feature 配置：

```typescript
const isMobile = width.value < 768

new Crepe({
  features: isMobile ? {
    [Crepe.Feature.BlockEdit]: false,
    [Crepe.Feature.Toolbar]: false,
  } : {},
})
```

```css
@media (max-width: 768px) {
  .milkdown .editor {
    padding: 1rem;
    font-size: 15px;
  }
}
```

---

## 参考资源

- [Milkdown 官方文档 - Styling](https://milkdown.dev/docs/guide/styling)
- [Crepe API 文档](https://milkdown.dev/docs/api/crepe)
- [CSS 变量完整列表](https://github.com/Milkdown/milkdown/blob/main/packages/crepe/src/theme/)
- [ZotePad MdEditorCrepe 组件](../app/components/ui/editor/MdEditorCrepe.vue)

---

## 下一步

1. **主题切换**：实现浅色/深色/自动切换
2. **字体定制**：加载自定义 Web Fonts
3. **代码高亮**：集成 Shiki 或 Prism
4. **自定义块**：扩展 Callout、Tabs 等组件
5. **打印样式**：添加 `@media print` 优化

---

**更新日期**: 2026-01-07  
**适用版本**: Milkdown v7.18.0 + Crepe Preset  
**维护者**: ZotePad Team
