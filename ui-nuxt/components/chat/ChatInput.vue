<script setup lang="ts">
import { useChatStore } from '~/stores/chat.store'
import { useRoomStore } from '~/stores/room.store'
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'

// Stores
const chatStore = useChatStore()
const roomStore = useRoomStore()

// Local state
const message = ref('')
const showEmojiPicker = ref(false)
const showTypingIndicator = ref(false)
const typingTimer = ref<NodeJS.Timeout | null>(null)
const isTyping = ref(false)

// Constants
const maxLength = 1000
const typingThrottle = 2000 // 2 seconds

// Quick emoji options
const quickEmojis = [
  '😀', '😂', '😍', '🤔', '😢', '😡', '👍', '👎',
  '❤️', '🎉', '🔥', '💯', '✅', '❌', '🤝', '🙏'
]

// Computed
const canSend = computed(() =>
    message.value.trim().length > 0 &&
    message.value.length <= maxLength &&
    !chatStore.isSending
)

const replyTo = computed(() => chatStore.replyTo)

const truncatedReplyContent = computed(() => {
  if (!replyTo.value) return ''
  const content = replyTo.value.content
  return content.length > 50 ? content.slice(0, 50) + '...' : content
})

// Methods
const sendMessage = async () => {
  if (!canSend.value) return

  const content = message.value.trim()
  const replyToId = replyTo.value?.id || undefined

  try {
    await chatStore.sendMessage(content, replyToId)
    message.value = ''
    clearReply()
    stopTyping()
  } catch (error) {
    console.error('Failed to send message:', error)
    // Could show error toast here
  }
}

const addNewLine = () => {
  message.value += '\n'
}

const insertEmoji = (emoji: string) => {
  message.value += emoji
  showEmojiPicker.value = false

  // Focus back to input
  nextTick(() => {
    const textarea = document.querySelector('.chat-input textarea')
    if (textarea) {
      (textarea as HTMLTextAreaElement).focus()
    }
  })
}

const clearReply = () => {
  chatStore.clearReplyTo()
}

const onInput = () => {
  startTyping()
}

const onFocus = () => {
  startTyping()
}

const onBlur = () => {
  // Small delay to allow for quick refocus
  setTimeout(() => {
    if (document.activeElement?.tagName !== 'TEXTAREA') {
      stopTyping()
    }
  }, 100)
}

const startTyping = () => {
  if (!isTyping.value) {
    isTyping.value = true
    showTypingIndicator.value = true
    chatStore.sendTypingIndicator(true)
  }

  // Reset timer
  if (typingTimer.value) {
    clearTimeout(typingTimer.value)
  }

  typingTimer.value = setTimeout(() => {
    stopTyping()
  }, typingThrottle)
}

const stopTyping = () => {
  if (isTyping.value) {
    isTyping.value = false
    showTypingIndicator.value = false
    chatStore.sendTypingIndicator(false)
  }

  if (typingTimer.value) {
    clearTimeout(typingTimer.value)
    typingTimer.value = null
  }
}

// Auto-focus on mount
onMounted(() => {
  nextTick(() => {
    const textarea = document.querySelector('.chat-input textarea')
    if (textarea) {
      (textarea as HTMLTextAreaElement).focus()
    }
  })
})

// Cleanup on unmount
onBeforeUnmount(() => {
  stopTyping()
})

// Handle room changes
watch(() => roomStore.isInRoom, (inRoom) => {
  if (!inRoom) {
    message.value = ''
    stopTyping()
  }
})
</script>

<template>
  <div class="chat-input">
    <!-- Reply Context -->
    <div v-if="replyTo" class="reply-context">
      <div class="d-flex align-center justify-space-between pa-2 bg-surface-variant">
        <div class="d-flex align-center gap-2">
          <v-icon size="16" color="primary">mdi-reply</v-icon>
          <span class="text-caption">
            Replying to <strong>{{ replyTo.senderName }}</strong>
          </span>
        </div>
        <v-btn
            icon
            size="x-small"
            variant="text"
            @click="clearReply"
        >
          <v-icon size="16">mdi-close</v-icon>
        </v-btn>
      </div>
      <div class="reply-preview pa-2 text-caption text-medium-emphasis">
        {{ truncatedReplyContent }}
      </div>
    </div>

    <!-- Input Area -->
    <div class="input-area pa-3">
      <div class="d-flex align-center gap-2">
        <!-- Emoji Picker Button -->
        <v-menu v-model="showEmojiPicker" :close-on-content-click="false">
          <template #activator="{ props }">
            <v-btn
                v-bind="props"
                icon
                size="small"
                variant="text"
            >
              <v-icon>mdi-emoticon-outline</v-icon>
            </v-btn>
          </template>

          <v-card class="emoji-picker" max-width="280">
            <v-card-text class="pa-2">
              <div class="text-subtitle-2 mb-2">Quick Reactions</div>
              <div class="d-flex flex-wrap gap-1">
                <v-btn
                    v-for="emoji in quickEmojis"
                    :key="emoji"
                    size="small"
                    variant="text"
                    @click="insertEmoji(emoji)"
                >
                  {{ emoji }}
                </v-btn>
              </div>
            </v-card-text>
          </v-card>
        </v-menu>

        <!-- Text Input -->
        <v-textarea
            v-model="message"
            placeholder="Type a message..."
            variant="outlined"
            density="compact"
            rows="1"
            auto-grow
            :max-rows="4"
            :max-length="maxLength"
            hide-details
            class="flex-grow-1"
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.shift.enter.exact.prevent="addNewLine"
            @input="onInput"
            @focus="onFocus"
            @blur="onBlur"
        />

        <!-- Send Button -->
        <v-btn
            :disabled="!canSend"
            :loading="chatStore.isSending"
            color="primary"
            icon
            @click="sendMessage"
        >
          <v-icon>mdi-send</v-icon>
        </v-btn>
      </div>

      <!-- Character Counter -->
      <div v-if="message.length > maxLength * 0.8" class="character-counter">
        <span :class="{ 'text-error': message.length > maxLength }">
          {{ message.length }}/{{ maxLength }}
        </span>
      </div>

      <!-- Typing Indicator -->
      <div v-if="showTypingIndicator" class="typing-status">
        <v-icon size="12" color="success" class="mr-1">mdi-circle</v-icon>
        <span class="text-caption text-success">Others can see you're typing...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  background-color: rgb(var(--v-theme-surface));
}

.reply-context {
  border-top: 1px solid rgb(var(--v-theme-outline));
}

.reply-preview {
  border-left: 3px solid rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.05);
  margin: 0 8px;
  border-radius: 0 4px 4px 0;
}

.input-area {
  background-color: rgb(var(--v-theme-surface));
}

.character-counter {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
  font-size: 0.75rem;
}

.typing-status {
  display: flex;
  align-items: center;
  margin-top: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

.emoji-picker {
  max-height: 300px;
  overflow-y: auto;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Focus styles */
.chat-input :deep(.v-field--focused) {
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.2);
}
</style>