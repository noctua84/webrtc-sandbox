<script setup lang="ts">
import { useChatStore } from '~/stores/chat.store'
import { useRoomStore } from '~/stores/room.store'
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue'

// Stores
const chatStore = useChatStore()
const roomStore = useRoomStore()

// Local state
const message = ref('')
const isTyping = ref(false)
const showMentions = ref(false)
const mentionQuery = ref('')
const mentionPosition = ref(0)
const showEmojiPicker = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const typingTimeoutRef = ref<NodeJS.Timeout | null>(null)

// Quick emojis
const quickEmojis = ['👍', '👎', '😀', '😂', '❤️', '🎉', '👏', '🔥']

// Computed
const canSendMessage = computed(() =>
    message.value.trim() && chatStore.canSendMessages && !chatStore.isSendingMessage
)

const mentionCandidates = computed(() => {
  if (!showMentions.value || !mentionQuery.value) return []

  return roomStore.participants.filter(participant => {
    // Don't mention self
    if (participant.socketId === roomStore.currentParticipant?.socketId) return false
    // Filter by query
    return participant.userName.toLowerCase().includes(mentionQuery.value.toLowerCase())
  }).slice(0, 5) // Limit to 5 suggestions
})

const characterCount = computed(() => message.value.length)
const isOverLimit = computed(() => characterCount.value > 1000)

// Methods
const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  const value = target.value
  const cursorPosition = target.selectionStart

  message.value = value

  // Check for @ mentions
  const beforeCursor = value.substring(0, cursorPosition)
  const mentionMatch = beforeCursor.match(/@(\w*)$/)

  if (mentionMatch) {
    showMentions.value = true
    mentionQuery.value = mentionMatch[1]
    mentionPosition.value = cursorPosition - mentionMatch[1].length - 1
  } else {
    showMentions.value = false
    mentionQuery.value = ''
  }

  // Handle typing indicators
  if (value.trim() && !isTyping.value) {
    isTyping.value = true
    chatStore.sendTypingIndicator(true)
  }

  // Clear existing timeout
  if (typingTimeoutRef.value) {
    clearTimeout(typingTimeoutRef.value)
  }

  // Set new timeout to stop typing indicator
  typingTimeoutRef.value = setTimeout(() => {
    if (isTyping.value) {
      isTyping.value = false
      chatStore.sendTypingIndicator(false)
    }
  }, 1000)

  // Auto-resize textarea
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 120)}px`
    }
  })
}

const selectMention = (participant: any) => {
  if (!textareaRef.value) return

  const beforeMention = message.value.substring(0, mentionPosition.value)
  const afterMention = message.value.substring(textareaRef.value.selectionStart)
  const newMessage = `${beforeMention}@${participant.userName} ${afterMention}`

  message.value = newMessage
  showMentions.value = false
  mentionQuery.value = ''

  // Focus back to textarea
  nextTick(() => {
    if (textareaRef.value) {
      const newCursorPosition = mentionPosition.value + participant.userName.length + 2
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(newCursorPosition, newCursorPosition)
    }
  })
}

const addEmoji = (emoji: string) => {
  const cursorPos = textareaRef.value?.selectionStart || message.value.length
  const newMessage = message.value.slice(0, cursorPos) + emoji + message.value.slice(cursorPos)
  message.value = newMessage
  showEmojiPicker.value = false

  nextTick(() => {
    textareaRef.value?.focus()
    const newPos = cursorPos + emoji.length
    textareaRef.value?.setSelectionRange(newPos, newPos)
  })
}

const handleSend = async () => {
  if (!canSendMessage.value) return

  const messageToSend = message.value.trim()
  message.value = ''

  // Stop typing indicator
  if (isTyping.value) {
    isTyping.value = false
    chatStore.sendTypingIndicator(false)
  }

  try {
    // Extract mentions from message
    const mentions: string[] = []
    const mentionRegex = /@(\w+)/g
    let match

    while ((match = mentionRegex.exec(messageToSend)) !== null) {
      const username = match[1]
      const participant = roomStore.participants.find(p =>
          p.userName.toLowerCase() === username.toLowerCase()
      )
      if (participant && !mentions.includes(participant.socketId)) {
        mentions.push(participant.socketId)
      }
    }

    await chatStore.sendMessage(messageToSend, 'text')
  } catch (error) {
    console.error('Failed to send message:', error)
    // Restore message on error
    message.value = messageToSend
  }
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (showMentions.value) {
    if (event.key === 'Escape') {
      showMentions.value = false
      mentionQuery.value = ''
      return
    }
    // Could add arrow key navigation here
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

// Cleanup on unmount
onUnmounted(() => {
  if (typingTimeoutRef.value) {
    clearTimeout(typingTimeoutRef.value)
  }
  if (isTyping.value) {
    chatStore.sendTypingIndicator(false)
  }
})

// Initialize chat when mounted
onMounted(async () => {
  await chatStore.initializeChat()
})
</script>

<template>
  <div class="chat-input-container pa-3">
    <!-- Mention Dropdown -->
    <v-menu
        v-model="showMentions"
        :close-on-content-click="false"
        location="top"
        offset="8"
    >
      <template #activator="{ props: menuProps }">
        <div v-bind="menuProps" style="position: absolute; top: 0; left: 0; width: 1px; height: 1px;" />
      </template>

      <v-card v-if="mentionCandidates.length > 0" max-width="300">
        <v-card-text class="pa-2">
          <div class="text-caption text-medium-emphasis mb-2">Select a person to mention:</div>
          <v-list density="compact">
            <v-list-item
                v-for="participant in mentionCandidates"
                :key="participant.socketId"
                @click="selectMention(participant)"
                class="mention-item"
            >
              <template #prepend>
                <v-avatar size="24" color="primary">
                  <span class="text-caption text-white">
                    {{ participant.userName.charAt(0).toUpperCase() }}
                  </span>
                </v-avatar>
              </template>
              <v-list-item-title class="text-sm">{{ participant.userName }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-menu>

    <!-- Main Input Area -->
    <div class="d-flex flex-column gap-2">
      <!-- Textarea -->
      <div class="position-relative">
        <v-textarea
            ref="textareaRef"
            v-model="message"
            variant="outlined"
            placeholder="Type a message... (use @ to mention someone)"
            rows="1"
            auto-grow
            :max-rows="4"
            :disabled="!chatStore.canSendMessages"
            :error="isOverLimit"
            hide-details
            @input="handleInput"
            @keydown="handleKeyDown"
        />

        <!-- Emoji Button -->
        <v-btn
            icon
            size="small"
            variant="text"
            class="position-absolute emoji-btn"
            @click="showEmojiPicker = !showEmojiPicker"
        >
          <v-icon size="20">mdi-emoticon-outline</v-icon>
        </v-btn>
      </div>

      <!-- Input Actions Row -->
      <div class="d-flex align-center justify-space-between">
        <!-- Character Count -->
        <div class="text-caption" :class="isOverLimit ? 'text-error' : 'text-medium-emphasis'">
          {{ characterCount }}/1000
        </div>

        <!-- Send Button -->
        <v-btn
            color="primary"
            variant="flat"
            size="small"
            :disabled="!canSendMessage || isOverLimit"
            :loading="chatStore.isSendingMessage"
            @click="handleSend"
        >
          <v-icon start size="16">mdi-send</v-icon>
          Send
        </v-btn>
      </div>

      <!-- Quick Emojis -->
      <v-expand-transition>
        <div v-show="showEmojiPicker" class="emoji-picker pa-2 border rounded">
          <div class="text-caption text-medium-emphasis mb-2">Quick Emojis:</div>
          <div class="d-flex gap-1 flex-wrap">
            <v-btn
                v-for="emoji in quickEmojis"
                :key="emoji"
                size="small"
                variant="text"
                @click="addEmoji(emoji)"
            >
              {{ emoji }}
            </v-btn>
          </div>
        </div>
      </v-expand-transition>

      <!-- Mention Help -->
      <div v-if="message.includes('@') && !showMentions && mentionQuery" class="text-caption text-medium-emphasis">
        💡 Tip: Type @username to mention someone in the room
      </div>

      <!-- Error Message -->
      <v-alert
          v-if="isOverLimit"
          type="error"
          variant="tonal"
          density="compact"
          class="text-caption"
      >
        Message is too long. Please keep it under 1000 characters.
      </v-alert>
    </div>
  </div>
</template>

<style scoped>
.chat-input-container {
  border-top: 1px solid rgba(var(--v-theme-outline), 0.2);
}

.emoji-btn {
  top: 8px;
  right: 8px;
}

.mention-item {
  cursor: pointer;
  border-radius: 6px;
  margin-bottom: 2px;
}

.mention-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.1);
}

.emoji-picker {
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-outline), 0.2) !important;
}

.position-relative {
  position: relative;
}

.position-absolute {
  position: absolute;
}
</style>