<script setup lang="ts">
import type { Note } from '~/types/models'
import gsap from 'gsap'
import { toast } from 'vue-sonner'
import { useNoteRepository } from '~/composables/repositories/useNoteRepository'

useHead({ title: 'Notes' })

const { getAllNotes, deleteNote, createNote } = useNoteRepository()
const notes = ref<Note[]>([])
const router = useRouter()
const cardsRef = ref<HTMLElement[]>([])

const animateCards = () => {
  if (cardsRef.value.length) {
    gsap.fromTo(
      cardsRef.value,
      {
        opacity: 0,
        y: 20,
        scale: 0.95,
      },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.4,
        stagger: 0.05,
        ease: 'back.out(1.2)',
        clearProps: 'all',
      },
    )
  }
}

const loadNotes = async () => {
  try {
    notes.value = await getAllNotes() || []
    nextTick(() => {
      animateCards()
    })
  }
  catch (e) {
    console.error(e)
    toast.error('加载笔记失败')
  }
}

onMounted(() => {
  loadNotes()
})

const handleCreate = async () => {
  try {
    const id = await createNote('无标题笔记', '')
    if (id) {
      router.push(`/notes/${id}`)
    }
  }
  catch {
    toast.error('创建笔记失败')
  }
}

const handleDelete = async (id: number, event?: Event) => {
  // if (!confirm('Are you sure you want to delete this note?'))
  //   return

  try {
    // Animate deletion
    if (event && event.target) {
      const target = event.target as HTMLElement
      const card = target.closest('.note-card')
      if (card) {
        await gsap.to(card, {
          opacity: 0,
          scale: 0.8,
          duration: 0.2,
          ease: 'power2.in',
        })
      }
    }

    await deleteNote(id)
    toast.success('笔记已删除')
    await loadNotes()
  }
  catch {
    toast.error('删除笔记失败')
  }
}

const formatDate = (dateStr?: string) => {
  if (!dateStr)
    return ''
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const getTags = (tagsStr?: string) => {
  if (!tagsStr)
    return []
  try {
    return JSON.parse(tagsStr)
  }
  catch {
    return []
  }
}

// Keep track of refs for animation
const setCardRef = (el: any) => {
  if (el && el.$el) {
    cardsRef.value.push(el.$el)
  }
  else if (el) {
    cardsRef.value.push(el)
  }
}

// Reset refs before update to avoid duplicates
onBeforeUpdate(() => {
  cardsRef.value = []
})
</script>

<template>
  <div class="h-full flex flex-col bg-background/50">
    <!-- Header -->
    <div class="px-8 py-6 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-foreground">
          所有笔记
        </h1>
        <p class="text-muted-foreground text-sm mt-1">
          {{ notes.length }} 篇笔记
        </p>
      </div>
      <Button size="icon" class="rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300" @click="handleCreate">
        <Icon name="lucide:plus" class="w-5 h-5" />
      </Button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto p-8">
      <div v-if="notes.length === 0" class="h-[60vh] flex flex-col items-center justify-center text-muted-foreground space-y-6 animate-in fade-in zoom-in duration-500">
        <div class="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <Icon name="lucide:file-plus" class="w-10 h-10 opacity-40" />
        </div>
        <div class="text-center space-y-2">
          <h3 class="text-xl font-semibold text-foreground">
            暂无笔记
          </h3>
          <p class="max-w-xs mx-auto">
            创建您的第一篇笔记以开始记录想法。
          </p>
        </div>
        <Button variant="outline" size="lg" class="mt-4 rounded-full" @click="handleCreate">
          创建笔记
        </Button>
      </div>

      <div v-else class="flex flex-col pb-20 max-w-4xl mx-auto">
        <div
          v-for="note in notes"
          :key="note.id"
          :ref="setCardRef"
          class="group note-card list-item-hover rounded-lg mb-2 border border-transparent hover:border-border/60 bg-card/30"
        >
          <div class="flex items-center p-4 gap-4">
            <!-- Main Content Link -->
            <NuxtLink :to="`/notes/${note.id}`" class="flex-1 flex items-center gap-4 min-w-0">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-1">
                  <h3 class="font-semibold text-base truncate group-hover:text-primary transition-colors">
                    {{ note.title || '无标题' }}
                  </h3>
                  <span class="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <Icon name="lucide:clock" class="w-3 h-3" />
                    {{ formatDate(note.updated_at) }}
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <div v-if="getTags(note.tags).length > 0" class="flex flex-wrap gap-1.5">
                    <Badge
                      v-for="tag in getTags(note.tags).slice(0, 5)"
                      :key="tag"
                      variant="secondary"
                      class="text-[10px] px-2 py-0 h-5 bg-secondary/50 hover:bg-secondary transition-colors font-normal"
                    >
                      {{ tag }}
                    </Badge>
                    <span v-if="getTags(note.tags).length > 5" class="text-[10px] text-muted-foreground">
                      +{{ getTags(note.tags).length - 5 }}
                    </span>
                  </div>
                  <span v-else class="text-xs text-muted-foreground italic">无标签</span>
                </div>
              </div>
            </NuxtLink>

            <!-- Actions -->
            <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 relative z-10">
              <button
                class="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors cursor-pointer"
                @click.stop.prevent="(e) => handleDelete(note.id, e)"
              >
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
