<!-- ui-nuxt/components/chat/ChatMessage.vue -->
<script setup lang="ts">
import { useChatStore } from '~/stores/chat.store'
import { useRoomStore } from '~/stores/room.store'
import { ref, computed, nextTick, watch } from 'vue'
import type { ChatMessage } from "~/types/chat.types"

interface Props {
  message: ChatMessage
}

const props = defineProps<Props>()

// Stores
const chatStore = useChatStore()
const roomStore = useRoomStore()

// Local state
const isEditing = ref(false)
const editContent = ref(props.message.content)
const showMenu = ref(false)
const showReactions = ref(false)
const isProcessing = ref(false)
const editTextarea = ref<HTMLTextAreaElement | null>(null)

// Quick reactions
const quickReactions = ['👍', '👎', '😀', '😂', '❤️', '🎉', '🔥', '💯']

// Computed
const isOwnMessage = computed(() =>
    props.message.senderId === roomStore.currentParticipant?.socketId
)

const canEdit = computed(() =>
    chatStore.canEditMessage(props.message)
)

const canDelete = computed(() =>
    chatStore.canDeleteMessage(props.message)
)

const isMentioned = computed(() =>
    chatStore.isMentioned(props.message)
)

const senderInitials = computed(() => {
  const words = props.message.senderName.split(' ')
  if (words.length >= 2) {
    return words[0][0] + words[1][0]
  }
  return words[0]?.slice(0, 2) || '??'
})

const formattedTime = computed(() => {
  const date = new Date(props.message.timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

const renderedContent = computed(() => {
  const content = props.message.content

  // Simple mention rendering
  return content.replace(/@(\w+)/g, (match, username) => {
    const participant = roomStore.participants.find(p =>
        p.userName.toLowerCase() === username.toLowerCase()
    )

    if (participant) {
      return `<span class="mention">@${username}</span>`
    }
    return match
  })
})

// Methods
const startEdit = async () => {
  if (!canEdit.value) return

  isEditing.value = true
  editContent.value = props.message.content
  showMenu.value = false

  await nextTick()
  editTextarea.value?.focus()
}

const cancelEdit = () => {
  isEditing.value = false
  editContent.value = props.message.content
}

const saveEdit = async () => {
  if (!editContent.value.trim() || editContent.value === props.message.content) {
    cancelEdit()
    return
  }

  isProcessing.value = true

  try {
    await chatStore.editMessage(props.message.id, editContent.value)
    isEditing.value = false
  } catch (error) {
    console.error('Failed to edit message:', error)
    // Show error to user (could use toast/notification)
    alert('Failed to edit message')
  } finally {
    isProcessing.value = false
  }
}

const deleteMessage = async () => {
  if (!canDelete.value) return

  // Use browser confirm for now (could be replaced with custom dialog)
  if (!confirm('Are you sure you want to delete this message?')) return

  isProcessing.value = true

  try {
    await chatStore.deleteMessage(props.message.id)
    showMenu.value = false
  } catch (error) {
    console.error('Failed to delete message:', error)
    alert('Failed to delete message')
  } finally {
    isProcessing.value = false
  }
}

const handleReaction = async (emoji: string) => {
  if (isOwnMessage.value) return

  try {
    const hasReacted = chatStore.hasUserReacted(props.message, emoji)

    if (hasReacted) {
      await chatStore.removeReaction(props.message.id, emoji)
    } else {
      await chatStore.addReaction(props.message.id, emoji)
    }

    showReactions.value = false
  } catch (error) {
    console.error('Failed to toggle reaction:', error)
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    saveEdit()
  } else if (e.key === 'Escape') {
    cancelEdit()
  }
}

// Watch for prop changes
watch(() => props.message.content, (newContent) => {
  if (!isEditing.value) {
    editContent.value = newContent
  }
})
</script>

<template>
  <!-- System message rendering -->
  <div v-if="message.type === 'system'" class="flex justify-center my-2">
    <v-chip
        size="small"
        variant="outlined"
        color="grey-darken-1"
        prepend-icon="mdi-information"
    >
      {{ message.content }}
    </v-chip>
  </div>

  <!-- Regular message -->
  <div v-else class="group relative">
    <div
        :class="[
          'flex gap-3 mb-4',
          { 'flex-row-reverse': isOwnMessage },
          { 'bg-blue-50 -mx-2 px-2 py-1 rounded': isMentioned }
        ]"
    >
      <!-- Avatar -->
      <v-avatar
          :color="isOwnMessage ? 'primary' : 'grey-lighten-1'"
          size="32"
          class="flex-shrink-0"
      >
        <span class="text-sm font-medium">
          {{ senderInitials }}
        </span>
      </v-avatar>

      <!-- Message content -->
      <div class="flex-1 min-w-0">
        <!-- Sender name and timestamp -->
        <div
            :class="[
              'flex items-center gap-2 mb-1',
              { 'flex-row-reverse': isOwnMessage }
            ]"
        >
          <span class="text-sm font-medium text-grey-darken-2">
            {{ message.senderName }}
          </span>
          <span class="text-xs text-grey">
            {{ formattedTime }}
          </span>
          <span v-if="message.edited" class="text-xs text-grey italic">
            (edited)
          </span>
        </div>

        <!-- Message bubble -->
        <div class="relative">
          <!-- Edit mode -->
          <div v-if="isEditing" class="space-y-2">
            <v-textarea
                ref="editTextarea"
                v-model="editContent"
                variant="outlined"
                density="compact"
                rows="3"
                auto-grow
                hide-details
                :disabled="isProcessing"
                @keydown="handleKeydown"
            />
            <div class="flex gap-2 justify-end">
              <v-btn
                  size="small"
                  variant="text"
                  @click="cancelEdit"
                  :disabled="isProcessing"
              >
                Cancel
              </v-btn>
              <v-btn
                  size="small"
                  color="primary"
                  :loading="isProcessing"
                  @click="saveEdit"
              >
                Save
              </v-btn>
            </div>
          </div>

          <!-- Display mode -->
          <div v-else>
            <div
                :class="[
                  'inline-block px-3 py-2 rounded-lg max-w-sm break-words',
                  isOwnMessage
                    ? 'bg-primary text-white'
                    : isMentioned
                      ? 'bg-blue-100 text-grey-darken-4 border border-blue-200'
                      : 'bg-grey-lighten-4 text-grey-darken-3'
                ]"
            >
              <div
                  class="text-sm whitespace-pre-wrap"
                  v-html="renderedContent"
              />
            </div>

            <!-- Reactions -->
            <div
                v-if="message.reactions && message.reactions.length > 0"
                :class="[
                  'flex flex-wrap gap-1 mt-2',
                  { 'justify-end': isOwnMessage, 'justify-start': !isOwnMessage }
                ]"
            >
              <v-btn
                  v-for="reaction in message.reactions"
                  :key="reaction.emoji"
                  size="x-small"
                  variant="outlined"
                  :color="chatStore.hasUserReacted(message, reaction.emoji) ? 'primary' : 'grey'"
                  :disabled="isOwnMessage"
                  @click="handleReaction(reaction.emoji)"
              >
                {{ reaction.emoji }} {{ reaction.count }}
              </v-btn>
            </div>
          </div>
        </div>
      </div>

      <!-- Message actions -->
      <div
          v-if="!isEditing"
          :class="[
            'absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity',
            isOwnMessage ? 'left-0' : 'right-0'
          ]"
      >
        <div class="flex gap-1">
          <!-- Reaction button -->
          <v-menu v-model="showReactions" location="bottom">
            <template #activator="{ props: menuProps }">
              <v-btn
                  v-bind="menuProps"
                  icon="mdi-emoticon-happy-outline"
                  size="x-small"
                  variant="text"
                  :disabled="isOwnMessage"
              />
            </template>
            <v-card class="pa-2">
              <div class="flex flex-wrap gap-1 max-w-64">
                <v-btn
                    v-for="emoji in quickReactions"
                    :key="emoji"
                    size="small"
                    variant="text"
                    @click="handleReaction(emoji)"
                >
                  {{ emoji }}
                </v-btn>
              </div>
            </v-card>
          </v-menu>

          <!-- Message menu -->
          <v-menu v-model="showMenu" location="bottom">
            <template #activator="{ props: menuProps }">
              <v-btn
                  v-bind="menuProps"
                  icon="mdi-dots-vertical"
                  size="x-small"
                  variant="text"
              />
            </template>
            <v-list density="compact">
              <v-list-item
                  v-if="canEdit"
                  prepend-icon="mdi-pencil"
                  @click="startEdit"
              >
                <v-list-item-title>Edit</v-list-item-title>
              </v-list-item>
              <v-list-item
                  v-if="canDelete"
                  prepend-icon="mdi-delete"
                  @click="deleteMessage"
              >
                <v-list-item-title>Delete</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mention {
  @apply bg-blue-100 text-blue-800 px-1 rounded font-medium;
}

/* Group hover effects */
.group:hover .group-hover\:opacity-100 {
  opacity: 1;
}
</style>