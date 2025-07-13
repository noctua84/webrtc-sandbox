<script setup lang="ts">
import { useChatStore } from '~/stores/chat.store'
import { useRoomStore } from '~/stores/room.store'
import { ref, computed, nextTick, watch } from 'vue'
import type { ChatMessage } from "~/types/chat.types";

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

const formattedDate = computed(() => {
  const date = new Date(props.message.timestamp)
  const now = new Date()
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffInDays === 0) return 'Today'
  if (diffInDays === 1) return 'Yesterday'
  if (diffInDays < 7) return date.toLocaleDateString([], { weekday: 'long' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
})

const hasReactions = computed(() =>
    props.message.reactions && props.message.reactions.length > 0
)

const reactionCounts = computed(() => {
  if (!props.message.reactions) return {}

  const counts: Record<string, { count: number; users: string[] }> = {}

  props.message.reactions.forEach(reaction => {
    counts[reaction.emoji] = {
      count: reaction.count,
      users: reaction.userIds
    }
  })

  return counts
})

// Methods
const startEdit = () => {
  isEditing.value = true
  editContent.value = props.message.content
  showMenu.value = false

  nextTick(() => {
    // Focus the textarea using template ref
    if (editTextarea.value) {
      editTextarea.value.focus()
      editTextarea.value.select()
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
    isProcessing.value = true
    await chatStore.editMessage(props.message.id, editContent.value)
    isEditing.value = false
  } catch (error) {
    console.error('Failed to edit message:', error)
    // Show error feedback - could emit to parent or use toast
  } finally {
    isProcessing.value = false
  }
}

const handleDelete = async () => {
  const confirmMessage = isOwnMessage.value
      ? 'Are you sure you want to delete this message?'
      : 'Are you sure you want to delete this message as room admin?'

  if (!confirm(confirmMessage)) {
    return
  }

  try {
    isProcessing.value = true
    await chatStore.deleteMessage(props.message.id)
    showMenu.value = false
  } catch (error) {
    console.error('Failed to delete message:', error)
    // Show error feedback
  } finally {
    isProcessing.value = false
  }
}

const toggleReaction = async (emoji: string) => {
  try {
    isProcessing.value = true

    if (hasUserReacted(emoji)) {
      await chatStore.removeReaction(props.message.id, emoji)
    } else {
      await chatStore.addReaction(props.message.id, emoji)
    }

    showReactions.value = false
    showMenu.value = false
  } catch (error) {
    console.error('Failed to toggle reaction:', error)
  } finally {
    isProcessing.value = false
  }
}

const hasUserReacted = (emoji: string): boolean => {
  const currentUserId = roomStore.currentParticipant?.socketId
  if (!currentUserId || !props.message.reactions) return false

  const reaction = props.message.reactions.find(r => r.emoji === emoji)
  return reaction ? reaction.userIds.includes(currentUserId) : false
}

const getReactionTooltip = (emoji: string) => {
  const reaction = reactionCounts.value[emoji]
  if (!reaction) return ''

  const currentUserId = roomStore.currentParticipant?.socketId
  const hasReacted = reaction.users.includes(currentUserId || '')

  if (reaction.count === 1) {
    return hasReacted ? 'You reacted with ' + emoji : 'Someone reacted with ' + emoji
  }

  if (hasReacted) {
    return `You and ${reaction.count - 1} other${reaction.count > 2 ? 's' : ''} reacted with ${emoji}`
  }

  return `${reaction.count} people reacted with ${emoji}`
}

// Missing functionality - Add reply support
const replyToMessage = () => {
  // Emit event to parent component or store to set reply context
  // This would need to be implemented in the chat input
  console.log('Reply to message:', props.message.id)
  showMenu.value = false

  // For now, just log - this would be implemented based on chat input design
  // chatStore.setReplyTo(props.message)
}

// Handle system messages differently
const isSystemMessage = computed(() => props.message.type === 'system')

// Copy message content
const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content)
    showMenu.value = false
    // Could show a toast or temporary success indicator
  } catch (error) {
    console.error('Failed to copy message:', error)
  }
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

// Handle clicks outside to close menus
const handleClickOutside = (event: Event) => {
  const target = event.target as Element
  if (!target.closest('.message-menu') && !target.closest('.reaction-picker')) {
    closeMenus()
  }
}

// Add event listener for outside clicks
watch([showMenu, showReactions], ([menuOpen, reactionsOpen]) => {
  if (menuOpen || reactionsOpen) {
    document.addEventListener('click', handleClickOutside)
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
})

// Handle @mentions in message content
const parsedContent = computed(() => {
  if (!props.message.mentions || props.message.mentions.length === 0) {
    return props.message.content
  }

  let content = props.message.content

  // Replace @mentions with highlighted spans
  props.message.mentions.forEach(mentionId => {
    const participant = roomStore.participants.find(p => p.socketId === mentionId)
    if (participant) {
      const mentionRegex = new RegExp(`@${participant.userName}`, 'gi')
      content = content.replace(mentionRegex, `<span class="mention">@${participant.userName}</span>`)
    }
  })

  return content
})

// Get mention participants for display
const mentionedParticipants = computed(() => {
  if (!props.message.mentions) return []

  return props.message.mentions
      .map(mentionId => roomStore.participants.find(p => p.socketId === mentionId))
      .filter(Boolean)
})
</script>

<template>
  <div
      :class="[
      'chat-message',
      { 'own-message': isOwnMessage },
      { 'mentioned': isMentioned },
      { 'system-message': isSystemMessage },
      { 'processing': isProcessing }
    ]"
  >
    <!-- System Message (different layout) -->
    <div v-if="isSystemMessage" class="system-message-content">
      <v-chip
          size="small"
          variant="tonal"
          color="info"
          class="system-chip"
      >
        <v-icon start size="14">mdi-information</v-icon>
        {{ message.content }}
      </v-chip>
      <span class="system-timestamp">{{ formattedTime }}</span>
    </div>

    <!-- Regular Message -->
    <div v-else class="message-bubble">
      <!-- Message Header (for others' messages) -->
      <div v-if="!isOwnMessage" class="message-header">
        <v-avatar size="32" :color="senderColor">
          <span class="text-caption text-white font-weight-bold">
            {{ senderInitials }}
          </span>
        </v-avatar>
        <div class="header-info">
          <span class="sender-name">{{ message.senderName }}</span>
          <span class="timestamp">{{ formattedTime }}</span>
        </div>
      </div>

      <!-- Message Content -->
      <div class="message-content">
        <!-- Reply Context -->
        <div v-if="message.replyTo" class="reply-context">
          <v-icon size="14" class="mr-1">mdi-reply</v-icon>
          <span class="text-caption text-medium-emphasis">
            Replying to a message
          </span>
        </div>

        <!-- Editing Mode -->
        <div v-if="isEditing" class="edit-container">
          <v-textarea
              ref="editTextarea"
              v-model="editContent"
              variant="outlined"
              density="compact"
              rows="2"
              auto-grow
              :max-length="1000"
              hide-details
              :disabled="isProcessing"
              @keydown.enter.exact.prevent="handleEdit"
              @keydown.escape="cancelEdit"
          />
          <div class="edit-actions">
            <v-btn
                size="small"
                variant="text"
                :disabled="isProcessing"
                @click="cancelEdit"
            >
              Cancel
            </v-btn>
            <v-btn
                size="small"
                color="primary"
                variant="flat"
                :loading="isProcessing"
                :disabled="!editContent.trim() || editContent === message.content"
                @click="handleEdit"
            >
              Save
            </v-btn>
          </div>
        </div>

        <!-- Display Mode -->
        <div v-else class="message-text-container">
          <!-- Message Text with mentions support -->
          <div
              class="message-text"
              :class="{ 'emoji-message': message.type === 'emoji' }"
              v-html="parsedContent"
          ></div>

          <!-- Mentioned participants indicator -->
          <div v-if="mentionedParticipants.length > 0" class="mentions-indicator">
            <v-icon size="12" class="mr-1">mdi-at</v-icon>
            <span class="text-caption">
              Mentioned: {{ mentionedParticipants.map(p => p.userName).join(', ') }}
            </span>
          </div>

          <!-- Edit Indicator -->
          <div v-if="message.edited" class="edit-indicator">
            <v-icon size="12" class="mr-1">mdi-pencil</v-icon>
            <span class="text-caption text-medium-emphasis">
              edited {{ message.editedAt ? new Date(message.editedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '' }}
            </span>
          </div>
        </div>

        <!-- Reactions -->
        <div v-if="hasReactions" class="reactions">
          <v-chip
              v-for="(reactionData, emoji) in reactionCounts"
              :key="emoji"
              size="small"
              :color="hasUserReacted(emoji) ? 'primary' : 'default'"
              :variant="hasUserReacted(emoji) ? 'flat' : 'outlined'"
              class="reaction-chip"
              @click="toggleReaction(emoji)"
          >
            <v-tooltip activator="parent" location="top">
              {{ getReactionTooltip(emoji) }}
            </v-tooltip>
            {{ emoji }} {{ reactionData.count }}
          </v-chip>
        </div>

        <!-- Own Message Timestamp -->
        <div v-if="isOwnMessage" class="own-timestamp">
          {{ formattedTime }}
          <v-icon v-if="message.edited" size="12" class="ml-1">mdi-pencil</v-icon>
        </div>
      </div>

      <!-- Message Actions Menu -->
      <div class="message-menu">
        <v-menu v-model="showMenu" :close-on-content-click="false" location="start">
          <template #activator="{ props: menuProps }">
            <v-btn
                v-bind="menuProps"
                icon
                size="small"
                variant="text"
                class="message-menu-btn"
                :disabled="isProcessing"
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

            <!-- Copy -->
            <v-list-item @click="copyMessage">
              <template #prepend>
                <v-icon>mdi-content-copy</v-icon>
              </template>
              <v-list-item-title>Copy</v-list-item-title>
            </v-list-item>

            <v-divider v-if="canEdit || canDelete" />

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
          <v-card elevation="8" class="pa-2">
            <div class="d-flex gap-1 flex-wrap">
              <v-btn
                  v-for="emoji in quickReactions"
                  :key="emoji"
                  size="small"
                  variant="text"
                  :color="hasUserReacted(emoji) ? 'primary' : 'default'"
                  @click="toggleReaction(emoji)"
              >
                {{ emoji }}
              </v-btn>
            </div>
          </v-card>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  position: relative;
  margin-bottom: 12px;
  transition: opacity 0.3s ease;
}

.chat-message.processing {
  opacity: 0.7;
}

.message-bubble {
  position: relative;
  max-width: 85%;
}

.own-message .message-bubble {
  margin-left: auto;
}

.mentioned {
  background-color: rgba(var(--v-theme-primary), 0.05);
  border-left: 3px solid rgb(var(--v-theme-primary));
  padding-left: 8px;
  margin-left: -8px;
}

.system-message {
  text-align: center;
  margin: 8px 0;
}

.system-message-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.system-timestamp {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sender-name {
  font-weight: 500;
  font-size: 0.875rem;
}

.timestamp {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.message-content {
  background-color: rgb(var(--v-theme-surface));
  border-radius: 12px;
  padding: 8px 12px;
  position: relative;
  border: 1px solid rgba(var(--v-theme-outline), 0.2);
}

.own-message .message-content {
  background-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.reply-context {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  padding: 4px 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 6px;
  font-size: 0.75rem;
}

.edit-container {
  margin: -4px;
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}

.message-text {
  word-wrap: break-word;
  line-height: 1.4;
}

.emoji-message .message-text {
  font-size: 1.5rem;
  line-height: 1.2;
}

/* Mention styling */
.message-text :deep(.mention) {
  background-color: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  padding: 2px 4px;
  border-radius: 4px;
  font-weight: 500;
}

.mentions-indicator {
  display: flex;
  align-items: center;
  margin-top: 4px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.edit-indicator {
  display: flex;
  align-items: center;
  margin-top: 4px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.reaction-chip {
  cursor: pointer;
  font-size: 0.75rem;
  height: 24px;
}

.own-timestamp {
  text-align: right;
  margin-top: 4px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-primary), 0.7);
}

.message-menu {
  position: absolute;
  top: -8px;
  right: -8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.chat-message:hover .message-menu {
  opacity: 1;
}

.message-menu-btn {
  background-color: rgba(var(--v-theme-surface), 0.9) !important;
  border: 1px solid rgba(var(--v-theme-outline), 0.2) !important;
  backdrop-filter: blur(4px);
}

.reaction-picker {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1000;
  margin-top: 4px;
}
</style>