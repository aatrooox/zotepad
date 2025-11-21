<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// 定义错误数据类型
interface ErrorData {
  routeName?: string
  routePath?: string
  type?: string
  message?: string
  dependencies?: string[]
}

// 获取错误信息
const error = useError()

// 页面标题
useHead({
  title: `错误 ${error.value?.statusCode || '未知'} - 社区服务中心`,
})

// 清除错误并返回首页
function goHome() {
  clearError({ redirect: '/' })
}

// 重试当前页面
function retry() {
  clearError()
}

// 检查是否是环境兼容性错误
const isEnvironmentError = computed(() => {
  return error.value?.statusCode === 503 && error.value?.statusMessage === '需要客户端环境'
})

// 获取错误详细信息
const errorData = computed((): ErrorData => {
  return (error.value?.data as ErrorData) || {}
})
</script>

<template>
  <div class="min-h-screen bg-gray-950 flex items-center justify-center p-4">
    <div class="w-full max-w-2xl">
      <!-- 环境兼容性错误 -->
      <Card v-if="isEnvironmentError" class="bg-gray-900 border-gray-800">
        <CardHeader class="text-center">
          <div class="mx-auto w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mb-4">
            <Icon name="lucide:alert-triangle" class="w-8 h-8 text-orange-500" />
          </div>
          <CardTitle class="text-2xl text-gray-100">
            需要客户端环境
          </CardTitle>
          <CardDescription class="text-gray-400 text-lg">
            此页面需要在 Tauri 桌面应用中运行
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <!-- 错误详情 -->
          <div class="bg-gray-800 rounded-lg p-4">
            <h3 class="text-gray-100 font-semibold mb-2">
              页面信息
            </h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-400">页面名称:</span>
                <span class="text-gray-300">{{ errorData.routeName || '未知' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">页面路径:</span>
                <span class="text-gray-300">{{ errorData.routePath || '未知' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">页面类型:</span>
                <span class="text-gray-300">{{ errorData.type || '未知' }}</span>
              </div>
            </div>
          </div>

          <!-- 依赖信息 -->
          <div v-if="errorData.dependencies?.length" class="bg-gray-800 rounded-lg p-4">
            <h3 class="text-gray-100 font-semibold mb-2">
              所需依赖
            </h3>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="dep in errorData.dependencies"
                :key="dep"
                class="px-2 py-1 bg-cyan-600/20 text-cyan-400 rounded text-xs"
              >
                {{ dep }}
              </span>
            </div>
          </div>

          <!-- 说明信息 -->
          <div class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <Icon name="lucide:info" class="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 class="text-blue-400 font-medium mb-1">
                  解决方案
                </h4>
                <p class="text-gray-300 text-sm leading-relaxed">
                  {{ errorData.message || '此页面需要在客户端环境中运行才能正常使用。' }}
                </p>
                <p class="text-gray-400 text-sm mt-2">
                  请下载并安装桌面客户端，或访问其他不依赖客户端功能的页面。
                </p>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-3 pt-2">
            <Button class="flex-1" @click="goHome">
              <Icon name="lucide:home" class="w-4 h-4 mr-2" />
              返回首页
            </Button>
            <Button variant="outline" class="flex-1" @click="retry">
              <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- 其他错误 -->
      <Card v-else class="bg-gray-900 border-gray-800">
        <CardHeader class="text-center">
          <div class="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
            <Icon name="lucide:x-circle" class="w-8 h-8 text-red-500" />
          </div>
          <CardTitle class="text-2xl text-gray-100">
            {{ error?.statusCode || '未知错误' }}
          </CardTitle>
          <CardDescription class="text-gray-400 text-lg">
            {{ error?.statusMessage || '发生了未知错误' }}
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-if="error?.message" class="bg-gray-800 rounded-lg p-4">
            <p class="text-gray-300 text-sm">
              {{ error.message }}
            </p>
          </div>

          <div class="flex gap-3">
            <Button class="flex-1" @click="goHome">
              <Icon name="lucide:home" class="w-4 h-4 mr-2" />
              返回首页
            </Button>
            <Button variant="outline" class="flex-1" @click="retry">
              <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-2" />
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
