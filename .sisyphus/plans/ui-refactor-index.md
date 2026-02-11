# UI 重构：个人数据中心仪表盘

> **计划索引** - 本文件是计划入口，详细任务见各阶段文件

---

## 概览

| 属性 | 值 |
|------|-----|
| **项目目标** | 将 ZotePad 从「笔记管理工具」重构为「个人本地数据中心 + 轻量写作工具」，并集成博客 API |
| **总任务数** | 20 个 Task，分 4 个 Phase |
| **预估工时** | 18-22 小时 |
| **状态** | 🟡 待执行 |

---

## 阶段索引

| Phase | 文件 | 任务 | 预估 | 依赖 |
|-------|------|------|------|------|
| **Phase 1** | [基础设施](./ui-refactor-phase1-infrastructure.md) | Task 1-4 | 3-4h | 无 |
| **Phase 2** | [核心功能](./ui-refactor-phase2-core.md) | Task 5-10 | 6-8h | Phase 1 |
| **Phase 3** | [导航收尾](./ui-refactor-phase3-navigation.md) | Task 11-13 | 3-4h | Phase 2 |
| **Phase 4** | [博客 API 集成](./ui-refactor-phase4-blog-api.md) | Task 14-20 | 5-6h | Phase 2 |

---

## 执行顺序

```
Phase 1: 基础设施 (先完成)
├── Task 1: Todos 表 Migration（含链接度元数据）
├── Task 2: Link Relations 表 Migration
├── Task 3: useTodoRepository        ─┬─ 可并行
└── Task 4: useLinkRelationRepository ─┘

    ↓

Phase 2: 核心功能 (Phase 1 完成后)
├── Task 5: 仪表盘首页骨架
├── Task 6: Profile 卡片组件      ─┬─ 可并行
├── Task 7: 写作统计区块          ─┤
├── Task 8: 待办清单区块          ─┤
├── Task 9: 最近活动区块          ─┘
└── Task 10: 快速记录组件

    ↓
    
Phase 3 & Phase 4 可并行执行
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Phase 3: 导航收尾          Phase 4: 博客 API 集成  │
│  ├── Task 11: 导航重构      ├── Task 14: 配置文件   │
│  ├── Task 12: 文章入口      ├── Task 15: Composable │
│  └── Task 13: 响应式优化    ├── Task 16-19: UI 入口 │
│                             └── Task 20: 设置页     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Deliverables 总览

### Phase 1 产出
- `src-tauri/src/lib.rs` - 新增 todos 表 + link_relations 表 Migration
- `app/composables/repositories/useTodoRepository.ts` - 新增
- `app/composables/repositories/useLinkRelationRepository.ts` - 新增
- `app/config/sync-tables.ts` - 更新（添加 todos/link_relations 配置）

### Phase 2 产出
- `app/pages/_backup/index.vue` - 原首页备份
- `app/pages/index.vue` - 新仪表盘
- `app/components/app/dashboard/DashboardProfile.vue` - 新增
- `app/components/app/dashboard/DashboardStats.vue` - 新增
- `app/components/app/dashboard/DashboardTodos.vue` - 新增
- `app/components/app/dashboard/DashboardActivity.vue` - 新增
- `app/components/app/dashboard/QuickCapture.vue` - 新增

### Phase 3 产出
- `app/components/app/_backup/MobileTabBar.vue` - 原导航备份
- `app/components/app/_backup/sidebar/SidebarNavigation.vue` - 原侧边栏备份
- `app/components/app/MobileTabBar.vue` - 新简化导航
- `app/components/app/sidebar/SidebarNavigation.vue` - 新侧边栏

### Phase 4 产出
- `app/config/builtin-workflows.json` - 新增（可替换）
- `app/types/builtin-workflow.ts` - 新增
- `app/composables/useBuiltinWorkflows.ts` - 新增
- `app/composables/useBlogAPI.ts` - 新增
- `app/components/app/BlogPublishButton.vue` - 新增
- `app/components/app/BlogSyncButton.vue` - 新增
- `app/components/app/dashboard/DashboardBlogStats.vue` - 新增
- 设置页 API 配置入口 - 新增

---

## 核心约束 (Guardrails)

**必须遵守**:
- ❌ 不修改 `app/components/md-editor/MdEditorCrepe.vue`
- ❌ 不修改 `app/composables/useWorkflowRunner.ts`
- ❌ 不修改现有 repository CRUD 逻辑
- ❌ 不修改 `useSyncManager.ts` 或 sync 相关代码
- ❌ **不删除任何现有页面或路由**（只调整入口可见性）
- ❌ 不实现链接度计算算法（只预留字段）

**用户原话**:
> "现在已有的功能是不删除的。只是完全的重构UI。调整其跳转逻辑。只是没用的入口隐藏掉。"

### 页面备份策略

重构页面/组件时，先备份原文件到 `_backup/` 目录：

```
app/pages/_backup/                    # 页面备份
app/components/app/_backup/           # 组件备份
```

**好处**：原代码不丢失，随时可回滚，方便对比新旧实现。

---

## 如何执行

### 方式 1: 使用 /start-work (推荐)

```bash
# 执行 Phase 1
/start-work .sisyphus/plans/ui-refactor-phase1-infrastructure.md

# Phase 1 完成后，执行 Phase 2
/start-work .sisyphus/plans/ui-refactor-phase2-core.md

# Phase 2 完成后，Phase 3 和 Phase 4 可以并行或顺序执行
/start-work .sisyphus/plans/ui-refactor-phase3-navigation.md
/start-work .sisyphus/plans/ui-refactor-phase4-blog-api.md
```

### 方式 2: 手动逐 Task 执行

打开对应 Phase 文件，按 Task 顺序执行。

### 注意事项

**Phase 4 需要用户提供博客 API 规格**后才能完成具体 endpoint 配置。可以：
1. 先完成架构部分（Task 12-13）
2. 等待 API 规格后再填充具体 endpoint
3. 再完成 UI 入口部分（Task 14-18）

---

## 验收标准

完成全部 3 Phase 后验证：

```bash
# 类型检查
pnpm nuxi typecheck

# Lint 检查
pnpm lint

# 路由检查
for route in / /notes/articles /notes/moments /notes/assets /workflows /achievements /settings; do
  curl -s -o /dev/null -w "%{http_code} $route\n" "http://localhost:4577$route"
done

# 构建检查
pnpm generate
```

### 功能验收清单
- [ ] 首页显示仪表盘（Profile + 统计 + 待办 + 活动）
- [ ] 待办清单 CRUD 功能正常
- [ ] 快速记录可保存到动态/待办/文章
- [ ] 所有原有功能入口可访问
- [ ] 移动端和桌面端 UI 均正常

---

## 上下文资料

### 关键参考文件
| 文件 | 用途 |
|------|------|
| `src-tauri/src/lib.rs:739-780` | Migration 模式参考 |
| `app/composables/repositories/useMomentRepository.ts` | Repository 模式参考（含 tags JSON 处理）|
| `app/composables/repositories/useAssetTagRepository.ts` | 关系表 Repository 参考 |
| `app/config/sync-tables.ts` | 同步表配置参考 |
| `app/pages/achievements.vue:173-290` | Profile 卡片 UI 参考 |
| `app/composables/usePointsSystem.ts` | 积分/等级 API |
| `app/composables/useStatsCollector.ts` | 统计数据 API |

### 链接度（Linkage）设计说明

**目标**: 量化用户与某个项目/人/事物之间的关联强度。

**当前阶段**: 只预留元数据字段，不实现计算算法。

**数据模型**:
- `todos` 表包含 `target_type`, `target_id`, `target_name`, `link_score`, `link_summary` 字段
- `link_relations` 表记录任意实体间的多态关系（from_table/from_uuid → to_table/to_uuid）
- 关系可有 `weight` 权重和 `relation_type` 语义类型

**未来扩展**:
- 链接度计算公式: `SUM(weight * type_mult * time_decay)`
- 定期重算并缓存到 `link_score` 字段
- 在 UI 展示关联强度排序

### 技术栈
- **Frontend**: Nuxt 4 + Vue 3 + Tailwind CSS v4
- **Backend**: Tauri v2 (Rust) + SQLite
- **UI**: Shadcn (Reka UI) + GSAP

---

## 归档

原始完整计划已归档：[ui-refactor-dashboard.md](./ui-refactor-dashboard.md)

---

*创建时间: 2026-02-11*
*最后更新: 2026-02-11 (增加链接度元数据设计，Phase 1 扩展为 4 个 Task)*
