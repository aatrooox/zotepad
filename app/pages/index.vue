<script setup lang="ts">
useHead({ title: '首页' })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-8">
    <div class="max-w-md w-full">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-foreground mb-4">
          Tauri + Nuxt 3 应用
        </h1>
        <p class="text-muted-foreground">
          这是一个基于 Tauri 和 Nuxt 3 的跨平台应用模板，包含了常用的插件封装和组件。
        </p>
      </div>

      <div class="space-y-4">
        <NuxtLink
          to="/tauri-demo"
          class="block w-full p-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-center font-medium"
        >
          🚀 查看 Tauri 插件演示
        </NuxtLink>

        <div class="text-center text-sm text-muted-foreground">
          <p>包含 HTTP 请求、SQLite 数据库、系统通知等功能演示</p>
        </div>
      </div>
    </div>
  </div>
</template>
