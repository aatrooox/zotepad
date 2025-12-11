# Lottie 动画素材下载指南

> **目标**: 为 ZotePad 侧边栏吉祥物下载合适的猫咪 Lottie 动画素材  
> **平台**: LottieFiles  
> **许可**: 优先选择 CC0（公共领域）或 CC BY 4.0（需署名）

---

## 📦 MVP 所需素材清单

| 动画名称 | 用途 | 循环 | 优先级 |
|---------|------|------|--------|
| 待机动画 (Idle) | 默认状态，呼吸/眨眼 | ✅ | 🔴 必需 |
| 睡觉动画 (Sleep) | 长时间无操作 | ✅ | 🟡 推荐 |
| 伸懒腰 (Stretch) | 随机动作 | ❌ | 🟡 推荐 |
| 庆祝动画 (Celebrate) | 成就触发 | ❌ | 🔴 必需 |

---

## 🔍 步骤 1: 访问 LottieFiles

1. 打开浏览器访问: https://lottiefiles.com/
2. 点击顶部导航栏 **"Search"** 或直接在首页搜索框输入关键词

---

## 🔍 步骤 2: 搜索合适的动画

### 推荐搜索关键词

```
cat idle
cat sleep
cat stretch
cat celebrate
cat happy
cat simple
minimalist cat
cute cat animation
```

### 筛选条件

在搜索结果页面左侧使用筛选器：

1. **License（许可）**:
   - ✅ 勾选 **"Free"**（免费）
   - ✅ 勾选 **"CC0"**（公共领域，无需署名）
   - ⚠️ 可选 **"CC BY 4.0"**（需署名，但可商用）

2. **Style（风格）**:
   - Minimalist（极简）
   - Flat（扁平）
   - Cute（可爱）

3. **Color（颜色）**:
   - 选择与你的 Morandi Green 主题相近的绿色系
   - 或选择白色/灰色背景透明的素材

4. **Loop（循环）**:
   - 待机和睡觉动画需要勾选 **"Loop"**

---

## 📥 步骤 3: 下载动画

### 找到合适动画后

1. **点击动画缩略图** 进入详情页
2. 查看 **右侧信息栏**:
   - ✅ 确认 **License** 为 CC0 或 CC BY 4.0
   - ✅ 确认 **Size** 不超过 200KB（太大影响性能）
   - ✅ 确认 **Loop** 状态符合需求

3. **点击右上角 "Download" 按钮**
4. 选择 **"Lottie JSON"** 格式（默认）
5. 点击 **"Download JSON"**

### 文件命名规范

下载后请按以下格式重命名：

```
cat-idle.json       # 待机
cat-sleep.json      # 睡觉
cat-stretch.json    # 伸懒腰
cat-celebrate.json  # 庆祝
```

---

## 📂 步骤 4: 保存到项目

将下载的 JSON 文件放到以下目录：

```
w:\zzclub\zotepad\public\mascots\cat\
├── idle.json
├── sleep.json
├── stretch.json
└── celebrate.json
```

**创建目录命令**:
```powershell
# 在 PowerShell 中执行
mkdir w:\zzclub\zotepad\public\mascots\cat
```

---

## 🎨 推荐动画资源

### 方案 A: 极简风格（推荐）

**搜索**: `minimalist cat animation`

**推荐特征**:
- 线条简洁，颜色单一
- 文件体积 < 100KB
- 适配 Morandi Green 配色

### 方案 B: 可爱风格

**搜索**: `cute cat lottie`

**推荐特征**:
- 圆润造型
- 表情丰富
- 适合成就庆祝动画

### 方案 C: 现实风格

**搜索**: `realistic cat animation`

**推荐特征**:
- 细节丰富
- 动作流畅
- 文件体积可能较大（需注意）

---

## ⚠️ 注意事项

### 许可证检查清单

在下载前务必确认：

- [ ] **许可证** 标明为 **CC0** 或 **CC BY 4.0**
- [ ] 如果是 **CC BY 4.0**，记录作者名称用于署名
- [ ] 避免 **All Rights Reserved** 或未标注许可的动画

### 署名方式（CC BY 4.0）

如果使用了需署名的动画，请在以下文件中添加：

**创建 `public/mascots/cat/CREDITS.txt`**:

```txt
Cat Animation Credits:
- Idle Animation: "Cat Breathing" by [作者名] (https://lottiefiles.com/xxxxx)
  License: CC BY 4.0
- Sleep Animation: "Sleeping Cat" by [作者名] (https://lottiefiles.com/xxxxx)
  License: CC BY 4.0
```

---

## 🔧 备选方案：自制动画

### 如果找不到合适的免费素材

**使用 Figma 创建简单动画**:

1. 下载 Figma: https://www.figma.com/
2. 绘制简单的猫咪图形（圆形+三角形耳朵即可）
3. 安装插件: [Figma to Lottie](https://www.figma.com/community/plugin/809860933081668537/Figma-to-Lottie)
4. 在 Figma 中创建简单的位移/缩放动画
5. 导出为 Lottie JSON

**优势**:
- 完全自主版权
- 可精确匹配你的设计风格
- 学习曲线：约 1-2 小时

---

## ✅ 素材验证

下载完成后，请检查：

1. **文件格式**: 确保是 `.json` 文件
2. **文件大小**: 单个文件 < 200KB（推荐 < 100KB）
3. **文件内容**: 用文本编辑器打开，应该看到 JSON 格式内容
4. **预览动画**: 
   - 访问 https://lottiefiles.com/preview
   - 拖拽 JSON 文件查看效果
   - 确认循环/非循环状态

---

## 🚀 下一步

完成素材下载后，请在此文档下方回复：

```
✅ 素材已准备完毕
文件列表：
- idle.json (XX KB)
- sleep.json (XX KB)
- stretch.json (XX KB)
- celebrate.json (XX KB)

许可证：CC0 / CC BY 4.0
```

我将开始实现 MVP 版本代码。

---

## 📚 参考链接

- [LottieFiles 官网](https://lottiefiles.com/)
- [LottieFiles 许可说明](https://lottiefiles.com/page/license)
- [Creative Commons 许可详解](https://creativecommons.org/licenses/)
- [Lottie 在线预览工具](https://lottiefiles.com/preview)

---

**文档版本**: v1.0  
**创建日期**: 2025-12-11
