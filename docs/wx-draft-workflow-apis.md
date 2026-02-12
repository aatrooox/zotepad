# 微信草稿箱工作流接口交接文档

本文档用于说明 **ZotePad 工作流（useWorkflowRunner）** 中“发送到微信公众号草稿箱”的接口约定，便于其他人集成/复用同样的接口。

## 1. 相关代码位置（实现依据）

- 工作流执行器：`app/composables/useWorkflowRunner.ts`
  - 模板变量替换（`{{key}}`）
  - API 步骤执行与加密请求
  - 微信素材上传特殊处理（FormData）
- 系统工作流步骤定义：`app/composables/settings/useSystemWorkflowManager.ts`
  - `buildWxDraftSteps()`（图文 news）
  - `buildWxNewspicDraftSteps()`（小绿书 newspic）
- 上下文构造示例：
  - `app/pages/write/article/[id].vue`
  - `app/pages/local-workspace.vue`

> 说明：文档中的 URL、参数模板、调用顺序均来自上述代码。

---

## 2. 工作流调用顺序（固定顺序）

### 2.1 图文模式（news）
1) **获取 access_token**
2) **上传图片素材（遍历 photos）**
3) **创建草稿（news）**

### 2.2 小绿书模式（newspic）
1) **获取 access_token**
2) **上传图片素材（遍历 photos）**
3) **准备 image_info（JS 脚本步骤）**
4) **创建草稿（newspic）**

---

## 3. 接口清单与参数

### 3.1 获取 Access Token

**URL（生产）**
```
https://zzao.club/api/v1/wx/cgi-bin/token
```

**URL（本地）**
```
http://localhost:4775/api/v1/wx/cgi-bin/token
```

**Method**
```
POST
```

**Headers**
```
Content-Type: application/json
Authorization: Bearer {{env.ZZCLUB_PAT}}
```

**Body（模板）**
```json
{
  "appId": "{{env.WX_APPID}}",
  "appSecret": "{{env.WX_APPSECRET}}"
}
```

**加密说明（必须）**
- 该 URL 在 `ENCRYPTED_API_URLS` 中，`useWorkflowRunner` 会自动将请求体加密后发送：
```json
{ "encrypted": "<base64:iv:authTag:ciphertext>" }
```
- 加密密钥来自 `runtimeConfig.public.cryptoSecretKey`（即 `NUXT_PUBLIC_CRYPTO_SECRET_KEY`）。
- 若未配置密钥将抛错：`Crypto secret key is not configured`。

**期望返回结构（关键字段）**
```json
{
  "code": 0,
  "data": {
    "accessToken": "ACCESS_TOKEN",
    "expiresIn": 7200
  }
}
```

> 下游步骤依赖：`step1.data.accessToken`

---

### 3.2 上传图片素材（永久素材）

**URL（生产）**
```
https://zzao.club/api/v1/wx/cgi-bin/material/add_material
```

**URL（本地）**
```
http://localhost:4775/api/v1/wx/cgi-bin/material/add_material
```

**Method**
```
POST
```

**Headers**
```
Authorization: Bearer {{env.ZZCLUB_PAT}}
```

**Body（FormData，由工作流自动构造）**
- `access_token`: 来自 `step1.data.accessToken`
- `type`: 固定 `image`
- `media`: 文件对象（由 photos 中的 URL/数据生成）

**特殊处理说明**
- 该 URL 在 `WX_MATERIAL_UPLOAD_URLS` 中，`useWorkflowRunner` 会：
  - 遍历 `ctx.photos` 数组逐个上传
  - 支持 `data:`、`blob:`、`http(s):` 三种图片来源
  - 自动推断文件名与扩展名（jpeg/png/webp/bmp/gif）
  - 将上传后返回的图片地址替换到 HTML 中

**响应兼容结构（代码已兼容）**
```json
// 代理服务包装结构
{
  "code": 0,
  "data": { "media_id": "MEDIA_ID", "url": "WECHAT_URL" }
}
```

```json
// 微信原始结构
{ "media_id": "MEDIA_ID", "url": "WECHAT_URL" }
```

```json
// 错误结构
{ "errcode": 40001, "errmsg": "invalid credential" }
```

**上传完成后的返回（工作流内部统一返回）**
```json
{
  "code": 200,
  "message": "All photos uploaded successfully",
  "data": {
    "uploadedMedia": [
      { "originalUrl": "...", "mediaId": "...", "wxUrl": "...", "index": 0 }
    ],
    "imageUrlMap": { "<原始URL>": "<微信URL>" },
    "coverMediaId": "<第一张图片的 mediaId>",
    "totalUploaded": 3,
    "html": "<替换后的 HTML>",
    "photos": ["<替换后的图片URL>"]
  }
}
```

> 下游步骤依赖：`step2.data.html`、`step2.data.coverMediaId`

---

### 3.3 创建草稿（图文 news）

**URL（生产）**
```
https://zzao.club/api/v1/wx/cgi-bin/draft/add
```

**Method**
```
POST
```

**Headers**
```
Content-Type: application/json
Authorization: Bearer {{env.ZZCLUB_PAT}}
```

**Body（模板）**
```json
{
  "access_token": "{{step1.data.accessToken}}",
  "articles": [
    {
      "article_type": "news",
      "title": "{{title}}",
      "content": "{{step2.data.html}}",
      "thumb_media_id": "{{step2.data.coverMediaId}}"
    }
  ]
}
```

---

### 3.4 创建草稿（小绿书 newspic）

**额外 JS 步骤：准备 image_info**
```js
const media = ctx.step2.data.uploadedMedia || []
const image_list = media.map(m => ({ image_media_id: m.mediaId }))
return { image_info: { image_list } }
```

**Body（模板）**
```json
{
  "access_token": "{{step1.data.accessToken}}",
  "articles": [
    {
      "article_type": "newspic",
      "title": "{{title}}",
      "content": "{{content}}",
      "thumb_media_id": "{{step2.data.coverMediaId}}",
      "image_info": "{{step3.image_info}}"
    }
  ]
}
```

---

## 4. 上下文（ctx）字段要求

`runWorkflow(steps, ctx)` 调用时，必须确保上下文包含以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 文章标题（草稿标题） |
| `content` | string | 原始内容（newspic 使用） |
| `html` | string | 微信格式 HTML（news 使用） |
| `photos` | string[] | HTML 中提取的图片 URL 数组 |
| `tags` | string[] | 可选，业务字段 |

> `useWorkflowRunner` 会把 `images` 自动别名到 `photos`（若存在）。

**示例 ctx：**
```json
{
  "title": "我的文章",
  "content": "markdown/纯文本",
  "html": "<p>...</p><img src=\"https://...\">",
  "photos": ["https://.../1.png", "https://.../2.png"],
  "tags": []
}
```

---

## 5. 步骤输出如何被后续步骤引用

- 每个步骤执行后会写入：
  - `ctx.step1`, `ctx.step2`, `ctx.step3` ...
  - `ctx[step.id]`（如果步骤有 id）
- 模板变量 `{{step1.data.accessToken}}` 即从 `ctx.step1.data.accessToken` 读取。

---

## 6. 必要环境变量

系统工作流要求以下环境变量存在（在设置页面配置）：

- `ZZCLUB_PAT`
- `WX_APPID`
- `WX_APPSECRET`

同时需要配置运行时密钥：

- `NUXT_PUBLIC_CRYPTO_SECRET_KEY`

---

## 7. 常见问题与注意事项

1) **accessToken 不存在**
   - 原因：token 接口返回结构不是 `data.accessToken`。
   - 解决：确保服务端返回 `{ data: { accessToken } }`。

2) **图片为空**
   - `ctx.photos` 为空会直接报错：`No photos available for upload`。
   - UI 会在无图时默认塞一张占位图（仅示例）。

3) **加密失败**
   - 未配置 `NUXT_PUBLIC_CRYPTO_SECRET_KEY` 或密钥不匹配。

4) **草稿创建失败**
   - 检查 `thumb_media_id` 是否来自素材上传（coverMediaId）。
   - 检查 HTML 内容是否包含非法标签（微信侧会过滤）。
