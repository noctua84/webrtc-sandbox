<template>
  <div
      :class="[
      'chat-message',
      { 'own-message': isOwnMessage },
      { 'mentioned': isMentioned }
    ]"
  >
    <!-- Message Bubble -->
    <div class="message-bubble">
      <!-- Message Header -->
      <div v-if="!isOwnMessage" class="message-header">
        <v-avatar size="24" :color="senderColor">
          <span class="text-caption text-white font-weight-bold">
            {{ senderInitials }}
          </span>
        </v-avatar>
        <span class="sender-name">{{ message.senderName }}</span>
        <span class="timestamp">{{ formattedTime }}</span>
      </div>

      <!-- Message Content -->
      <div class="message-content">
        <!-- Editing Mode -->
        <div v-if="isEditing" class="edit-container">
          <v-textarea
              v-model="editContent"
              variant="outlined"
              density="compact"
              rows="2"
              auto-grow
              :max-length="1000"
              hide-details
              @keydown.enter.exact.prevent="handleEdit"
              @keydown.escape="cancelEdit"
          />
          <div class="edit-actions">
            <v-btn
                size="small"
                variant="text"
                @click="cancelEdit"
            >
              Cancel
            </v-btn>
            <v-btn
                size="small"
                color="primary"
                variant="flat"
                :disabled="!editContent.trim() || editContent === message.content"
                @click="handleEdit"
            >
              Save
            </v-btn>
          </div>
        </div>

        <!-- Display Mode -->
        <div v-else>
          <!-- Reply Context -->
          <div v-if="message.replyTo" class="reply-context">
            <v-icon size="14" class="mr-1">mdi-reply</v-icon>
            <span class="text-caption text-medium-emphasis">
              Replying to a message
            </span>
          </div>

          <!-- Message Text -->
          <div class="message-text">
            {{ message.content }}
          </div>

          <!-- Edit Indicator -->
          <div v-if="message.edited" class="edit-indicator">
            <v-icon size="12" class="mr-1">mdi-pencil</v-icon>
            <span class="text-caption text-medium-emphasis">edited</span>
          </div>

          <!-- Reactions -->
          <div v-if="hasReactions" class="reactions">
            <v-chip
                v-for="(count, emoji) in message.reactions"
                :key="emoji"
                size="x-small"
                :color="hasUserReacted(emoji) ? 'primary' : 'default'"
                :variant="hasUserReacted(emoji) ? 'flat' : 'outlined'"
                class="reaction-chip"
                @click="toggleReaction(emoji)"
            >
              {{ emoji }} {{ count }}
            </v-chip>
          </div>
        </div>

        <!-- Own Message Timestamp -->
        <div v-if="isOwnMessage" class="own-timestamp">
          {{ formattedTime }}
          <v-icon v-if="message.edited" size="12" class="ml-1">mdi-pencil</v-icon>
        </div>
      </div>

      <!-- Message Actions Menu -->
      <v-menu v-model="showMenu" :close-on-content-click="false">
        <template #activator="{ props }">
          <v-btn
              v-bind="props"
              icon
              size="x-small"
              variant="text"
              class="message-menu-btn"
              @click="showMenu = true"
          >
            <v-icon size="16">mdi-dots-vertical</v-icon>
          </v-btn>
        </template>

        <v-list density="compact">
          <!-- React -->
          <v-list-item @click="showReactions = !showReactions">
            <template #prepend>
              <v-icon>mdi-emoticon-outline</v-icon>
            </template>
            <v-list-item-title>React</v-list-item-title>
          </v-list-item>

          <!-- Reply -->
          <v-list-item @click="replyToMessage">
            <template #prepend>
              <v-icon>mdi-reply</v-icon>
            </template>
            <v-list-item-title>Reply</v-list-item-title>
          </v-list-item>

          <!-- Edit (own messages only) -->
          <v-list-item v-if="canEdit" @click="startEdit">
            <template #prepend>
              <v-icon>mdi-pencil</v-icon>
            </template>
            <v-list-item-title>Edit</v-list-item-title>
          </v-list-item>

          <!-- Delete -->
          <v-list-item
              v-if="canDelete"
              @click="handleDelete"
              class="text-error"
          >
            <template #prepend>
              <v-icon color="error">mdi-delete</v-icon>
            </template>
            <v-list-item-title>Delete</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <!-- Reaction Picker -->
      <div v-if="showReactions" class="reaction-picker">
        <v-card elevation="4" class="pa-2">
          <div class="d-flex gap-1 flex-wrap">
            <v-btn
                v-for="emoji in quickReactions"
                :key="emoji"
                size="small"
                variant="text"
                @click="toggleReaction(emoji)"
            >
              {{ emoji }}
            </v-btn>
          </div>
        </v-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '../stores/chat'
import { useRoomStore } from '../stores/room'
import type { ChatMessage } from '../types/chat.types'

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

const senderColor = computed(() => {
  // Generate consistent color based on sender name
  const colors = ['primary', 'secondary', 'success', 'info', 'warning', 'purple', 'indigo', 'teal']
  const hash = props.message.senderId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0)
    return a & a
  }, 0)
  return colors[Math.abs(hash) % colors.length]
})

const formattedTime = computed(() => {
  const date = new Date(props.message.timestamp)
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
})

const hasReactions = computed(() =>
    props.message.reactions && Object.keys(props.message.reactions).length > 0
)

// Methods
const startEdit = () => {
  isEditing.value = true
  editContent.value = props.message.content
  showMenu.value = false

  nextTick(() => {
    // Focus the textarea
    const textarea = document.querySelector('.edit-container textarea')
    if (textarea) {
      (textarea as HTMLTextAreaElement).focus()
    }
  })
}

const cancelEdit = () => {
  isEditing.value = false
  editContent.value = props.message.content
}

const handleEdit = async () => {
  if (!editContent.value.trim() || editContent.value === props.message.content) {
    cancelEdit()
    return
  }

  try {
    await chatStore.editMessage(props.message.id, editContent.value)
    isEditing.value = false
  } catch (error) {
    console.error('Failed to edit message:', error)
    // Show error feedback
  }
}

const handleDelete = async () => {
  if (!confirm('Are you sure you want to delete this message?')) {
    return
  }

  try {
    await chatStore.deleteMessage(props.message.id)
    showMenu.value = false
  } catch (error) {
    console.error('Failed to delete message:', error)
    // Show error feedback
  }
}

const toggleReaction = async (emoji: string) => {
  try {
    if (hasUserReacted(emoji)) {
      await chatStore.removeReaction(props.message.id, emoji)
    } else {
      await chatStore.addReaction(props.message.id, emoji)
    }
    showReactions.value = false
    showMenu.value = false
  } catch (error) {
    console.error('Failed to toggle reaction:', error)
  }
}

const hasUserReacted = (emoji: string): boolean => {
  const currentUserId = roomStore.currentParticipant?.socketId
  if (!currentUserId || !props.message.reactions) return false

  const reactionUsers = props.message.reactionUsers?.[emoji] || []
  return reactionUsers.includes(currentUserId)
}

const replyToMessage = () => {
  chatStore.setReplyTo(props.message)
  showMenu.value = false
}

// Close menus when clicking outside
const closeMenus = () => {
  showMenu.value = false
  showReactions.value = false
}

// Watch for message updates
watch(() => props.message.content, (newContent) => {
  if (!isEditing.value) {
    editContent.value = newContent
  }
})
</script>

<style scoped>
.chat-message {
  position: relative;
  margin-bottom: 8px;
}

.own-message {
  display: flex;
  justify-content: flex-end;
}

.own-message .message-bubble {
  background-color: rgb(var(--v-theme-primary));
  color: white;
  border-bottom-right-radius: 4px;
}

.mentioned {
  background-color: rgba(var(--v-theme-warning), 0.1);
  border-left: 3px solid rgb(var(--v-theme-warning));
  padding-left: 8px;
  margin-left: -8px;
}

.message-bubble {
  position: relative;
  max-width: 80%;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  padding: 8px 12px;
  word-wrap: break-word;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.sender-name {
  font-weight: 500;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface));
}

.timestamp {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface-variant));
  margin-left: auto;
}

.message-content {
  position: relative;
}

.message-text {
  font-size: 0.875rem;
  line-height: 1.4;
  white-space: pre-wrap;
}

.own-message .message-text {
  color: white;
}

.edit-container {
  margin: -4px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.reply-context {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  padding: 4px 8px;
  background-color: rgba(var(--v-theme-primary), 0.1);
  border-radius: 4px;
  font-size: 0.75rem;
}

.edit-indicator {
  display: flex;
  align-items: center;
  margin-top: 4px;
  font-size: 0.75rem;
}

.own-message .edit-indicator {
  color: rgba(255, 255, 255, 0.7);
}

.reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.reaction-chip {
  cursor: pointer;
  transition: all 0.2s ease;
}

.reaction-chip:hover {
  transform: scale(1.05);
}

.own-timestamp {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 4px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
}

.message-menu-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.message-bubble:hover .message-menu-btn {
  opacity: 1;
}

.reaction-picker {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  margin-top: 4px;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .message-bubble {
    max-width: 90%;
  }

  .message-menu-btn {
    opacity: 1;
  }
}
</style>