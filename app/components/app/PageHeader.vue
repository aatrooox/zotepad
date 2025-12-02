<script setup lang="ts">
interface Props {
  title: string
  description?: string
  showBack?: boolean
  backTo?: string
}

const props = withDefaults(defineProps<Props>(), {
  showBack: false,
  backTo: '/',
})

const router = useRouter()

const handleBack = () => {
  if (props.backTo) {
    router.push(props.backTo)
  }
  else {
    router.back()
  }
}
</script>

<template>
  <div class="page-header px-4 md:px-8 py-4 md:py-6 flex items-center gap-3 sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
    <Button v-if="showBack" variant="ghost" size="icon" class="shrink-0 -ml-2" @click="handleBack">
      <Icon name="lucide:arrow-left" class="w-5 h-5" />
    </Button>
    <div class="flex-1 min-w-0">
      <h1 class="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">
        {{ title }}
      </h1>
      <p v-if="description" class="text-muted-foreground text-sm mt-0.5 hidden md:block">
        {{ description }}
      </p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>
