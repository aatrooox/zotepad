# 路由重构完成（Layout 方案）

## 重构概述

已成功将原来的单页面应用（使用 `v-if` 切换 tab）重构为基于 **Nuxt Layout** 的多页面架构。

## 架构说明

采用 **Layout 方案**：统一的 tabs 栏通过 Layout 实现，各页面独立且使用相同的布局。

### 优点
- ✅ 干净的 URL（`/articles`、`/moments`、`/assets`）
- ✅ 代码结构清晰，职责分离
- ✅ 符合 Nuxt 最佳实践
- ✅ 统一的 tabs 栏体验

### 权衡
- 切换路由会重新挂载组件（可用 `<KeepAlive>` 优化）
- 失去原来 v-if 的极致流畅感

## 文件结构

### Layout
- **layouts/notes.vue** (~100 行)
  - 包含桌面/移动端 tabs 栏
  - 路由切换逻辑
  - Tab 状态管理和持久化

### 页面
1. **pages/index.vue** (~20 行)
   - 重定向页面
   - 根据保存的偏好跳转到对应 tab

2. **pages/articles.vue** (文章/笔记页面)
   - 使用 `notes` layout
   - 笔记列表展示
   - 创建、删除笔记功能
   - 自动同步（移动端）
   - GSAP 动画

3. **pages/moments.vue** (动态页面)
   - 使用 `notes` layout
   - Markdown 编辑器
   - 图片上传（editor + 文件选择）
   - 标签管理
   - 工作流集成（微信公众号等）
   - 自动同步

4. **pages/assets.vue** (资源页面)
   - 使用 `notes` layout
   - 网格/列表视图切换
   - 图片上传
   - 资源删除
   - 复制链接
   - 自动同步

## 路由结构

```
/                    → 重定向到保存的 tab 或 /articles
/articles           → 文章列表（使用 notes layout）
/moments            → 动态流（使用 notes layout）
/assets             → 资源管理（使用 notes layout）
```

## 功能保留

✅ Tab 持久化（保存用户最后访问的 tab）
✅ 移动端/桌面端适配
✅ 自动同步（移动端 + 自动模式）
✅ 手动同步按钮
✅ GSAP 动画
✅ 所有原有 CRUD 功能
✅ 工作流集成
✅ 图片上传到资源表

## Layout 使用方式

每个页面通过 `definePageMeta` 声明使用 notes layout：

```vue
<script setup lang="ts">
definePageMeta({
  layout: 'notes',
})
</script>
```

## 性能优化建议

如需优化页面切换体验，可以：
1. 在 `layouts/notes.vue` 外层包裹 `<KeepAlive>`
2. 配置 `include` 或 `exclude` 控制缓存策略
3. 使用 `onActivated` 和 `onDeactivated` 生命周期钩子

## 测试要点

- [x] Tab 切换是否流畅
- [x] Tab 持久化是否正常
- [x] 同步功能是否正常
- [x] 移动端 UI 是否正常
- [x] 动画是否正常播放
- [x] 图片上传是否记录到资源表
- [x] 工作流是否正常执行
- [ ] 页面切换时数据是否重新加载（预期行为）

## 备份

原文件已备份至：`app/pages/index.vue.backup`
