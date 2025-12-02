<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { useUserRepository } from '~/composables/repositories/useUserRepository'

useHead({ title: 'Tauri 插件演示' })

const { get: httpGet } = useTauriHTTP()
const { autoInit: initSQL } = useTauriSQL()
const { createUser, getAllUsers } = useUserRepository()
const { sendNotification } = useTauriNotification()
const { setItem, getItem, initStore } = useTauriStore()

const isLoading = ref(false)
const httpResult = ref('')
const sqlResult = ref('')

// HTTP 请求演示
async function testHTTP() {
  isLoading.value = true
  try {
    console.log('开始 HTTP 请求测试...')
    const response = await httpGet('https://jsonplaceholder.typicode.com/posts/1')
    console.log('HTTP 响应:', response)

    if (response) {
      httpResult.value = JSON.stringify(response.data, null, 2)
      toast.success('HTTP 请求成功！')
    }
    else {
      httpResult.value = '请求失败：无响应数据'
      toast.error('HTTP 请求失败：无响应数据')
    }
  }
  catch (error: any) {
    console.error('HTTP 请求失败:', error)
    httpResult.value = `请求失败：${error.message || error}`
    toast.error(`HTTP 请求失败：${error.message || '未知错误'}`)
  }
  finally {
    isLoading.value = false
  }
}

// SQLite 演示
async function testSQL() {
  isLoading.value = true
  try {
    console.log('开始 SQLite 初始化...')
    await initSQL()
    console.log('SQLite 初始化完成')

    // 创建测试用户
    console.log('创建测试用户...')
    const userId = await createUser(`测试用户${Date.now()}`, `test${Date.now()}@example.com`)
    console.log('用户创建完成，ID:', userId)

    // 查询用户数据
    console.log('查询用户数据...')
    const users = await getAllUsers()
    console.log('查询到用户数据:', users)

    sqlResult.value = JSON.stringify(users.slice(0, 3), null, 2)
    toast.success('SQLite 操作成功！')
  }
  catch (error: any) {
    console.error('SQLite 操作失败:', error)
    sqlResult.value = `操作失败：${error.message || error}`

    // 检查是否是迁移错误
    if (error.message && error.message.includes('migration')) {
      toast.error('数据库迁移错误，请重启应用或清除数据库文件')
      sqlResult.value += '\n\n建议解决方案：\n1. 重启应用\n2. 或清除数据库文件后重试'
    }
    else {
      toast.error('SQLite 操作失败')
    }
  }
  finally {
    isLoading.value = false
  }
}

// 系统通知演示
async function testNotification() {
  try {
    await sendNotification('Tauri 应用', '这是一条来自 Tauri 应用的系统通知！')
    toast.success('系统通知已发送！')
  }
  catch (error) {
    console.error('通知发送失败:', error)
    toast.error('通知发送失败')
  }
}

// Store 演示
async function testStore() {
  try {
    await initStore()
    const key = 'demo_key'
    const value = `测试值 ${Date.now()}`

    await setItem(key, value)
    const retrieved = await getItem(key)

    toast.success(`Store 操作成功！存储的值: ${retrieved}`)
  }
  catch (error) {
    console.error('Store 操作失败:', error)
    toast.error('Store 操作失败')
  }
}
</script>

<template>
  <div class="min-h-screen p-4 md:p-8 pt-safe pb-safe">
    <div class="max-w-4xl mx-auto">
      <!-- 标题 -->
      <div class="text-center mb-6 md:mb-8">
        <h1 class="text-2xl md:text-3xl font-bold text-foreground mb-4">
          Tauri 插件演示
        </h1>
        <NuxtLink
          to="/"
          class="text-primary hover:underline"
        >
          ← 返回首页
        </NuxtLink>
      </div>

      <!-- 功能演示区域 -->
      <div class="grid md:grid-cols-2 gap-6">
        <!-- HTTP 请求 -->
        <div class="p-6 border rounded-lg">
          <h2 class="text-xl font-semibold mb-4">
            HTTP 请求
          </h2>
          <p class="text-sm text-muted-foreground mb-4">
            测试通过 @tauri-apps/plugin-http 发送 HTTP 请求
          </p>
          <button
            type="button"
            :disabled="isLoading"
            class="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            @click="testHTTP"
          >
            {{ isLoading ? '请求中...' : '发送 HTTP 请求' }}
          </button>
          <div
            v-if="httpResult"
            class="mt-4 p-3 bg-muted rounded text-xs overflow-auto max-h-32"
          >
            <pre>{{ httpResult }}</pre>
          </div>
        </div>

        <!-- SQLite 数据库 -->
        <div class="p-6 border rounded-lg">
          <h2 class="text-xl font-semibold mb-4">
            SQLite 数据库
          </h2>
          <p class="text-sm text-muted-foreground mb-4">
            测试通过 @tauri-apps/plugin-sql 操作 SQLite 数据库
          </p>
          <button
            type="button"
            :disabled="isLoading"
            class="w-full p-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            @click="testSQL"
          >
            {{ isLoading ? '操作中...' : '测试 SQLite 操作' }}
          </button>
          <div
            v-if="sqlResult"
            class="mt-4 p-3 bg-muted rounded text-xs overflow-auto max-h-32"
          >
            <pre>{{ sqlResult }}</pre>
          </div>
        </div>

        <!-- 系统通知 -->
        <div class="p-6 border rounded-lg">
          <h2 class="text-xl font-semibold mb-4">
            系统通知
          </h2>
          <p class="text-sm text-muted-foreground mb-4">
            测试发送系统通知
          </p>
          <button
            type="button"
            class="w-full p-3 bg-purple-600 text-white rounded hover:bg-purple-700"
            @click="testNotification"
          >
            发送系统通知
          </button>
        </div>

        <!-- Store 存储 -->
        <div class="p-6 border rounded-lg">
          <h2 class="text-xl font-semibold mb-4">
            Store 存储
          </h2>
          <p class="text-sm text-muted-foreground mb-4">
            测试通过 @tauri-apps/plugin-store 进行本地存储
          </p>
          <button
            type="button"
            class="w-full p-3 bg-orange-600 text-white rounded hover:bg-orange-700"
            @click="testStore"
          >
            测试 Store 存储
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
