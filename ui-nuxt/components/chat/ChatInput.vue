<!-- ui-nuxt/components/chat/ChatInput.vue -->
<script setup lang="ts">
import { useChatStore } from '~/stores/chat.store'
import { useRoomStore } from '~/stores/room.store'
import { ref, computed, nextTick, watch } from 'vue'

// Stores
const chatStore = useChatStore()
const roomStore = useRoomStore()

// Local state
const message = ref('')
const isTyping = ref(false)
const showMentions = ref(false)
const showEmojiPicker = ref(false)
const mentionQuery = ref('')
const mentionPosition = ref(0)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const typingTimeoutRef = ref<NodeJS.Timeout | null>(null)

// Quick emojis
const quickEmojis = ['😀', '😂', '❤️', '👍', '👎', '🎉', '🔥', '💯', '😊', '😢', '😮', '😡']

// Computed
const canSend = computed(() =>
    message.value.trim() && chatStore.canSendMessage && !chatStore.isSendingMessage
)

const filteredParticipants = computed(() => {
  if (!showMentions.value || !mentionQuery.value) return []

  return roomStore.participants
      .filter(p =>
          p.userName.toLowerCase().includes(mentionQuery.value.toLowerCase()) &&
          p.socketId !== roomStore.currentParticipant?.socketId
      )
      .slice(0, 5) // Limit to 5 suggestions
})

// Methods
const handleInputChange = (value: string) => {
  message.value = value

  // Handle mention detection
  const textarea = textareaRef.value
  if (!textarea) return

  const cursorPosition = textarea.selectionStart || 0
  const beforeCursor = value.substring(0, cursorPosition)
  const mentionMatch = beforeCursor.match(/@(\w*)$/)

  if (mentionMatch) {
    showMentions.value = true
    mentionQuery.value = mentionMatch[1].toLowerCase()
    mentionPosition.value = cursorPosition - mentionMatch[1].length - 1
  } else {
    showMentions.value = false
    mentionQuery.value = ''
  }

  // Handle typing indicators
  handleTypingIndicator(value)
}

const handleTypingIndicator = (value: string) => {
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
}

const selectMention = (username: string) => {
  if (!textareaRef.value) return

  const beforeMention = message.value.substring(0, mentionPosition.value)
  const afterMention = message.value.substring(textareaRef.value.selectionStart || 0)
  const newMessage = `${beforeMention}@${username} ${afterMention}`

  message.value = newMessage
  showMentions.value = false
  mentionQuery.value = ''

  // Focus back to textarea and position cursor
  nextTick(() => {
    if (textareaRef.value) {
      const newCursorPosition = mentionPosition.value + username.length + 2
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(newCursorPosition, newCursorPosition)
    }
  })
}

const handleEmojiClick = (emoji: string) => {
  message.value += emoji
  showEmojiPicker.value = false

  // Focus back to textarea
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

const sendMessage = async () => {
  if (!canSend.value) return

  const messageToSend = message.value.trim()
  message.value = ''

  // Stop typing indicator
  if (isTyping.value) {
    isTyping.value = false
    chatStore.sendTypingIndicator(false)
  }

  try {
    await chatStore.sendMessage(messageToSend)
  } catch (error) {
    console.error('Failed to send message:', error)
    // Restore message on error
    message.value = messageToSend
    // Show error to user (could use toast/notification)
    alert('Failed to send message')
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (showMentions.value) {
    if (e.key === 'Escape') {
      showMentions.value = false
      mentionQuery.value = ''
      return
    }
    // Could add arrow key navigation for mentions here
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// Cleanup on unmount
onBeforeUnmount(() => {
  if (typingTimeoutRef.value) {
    clearTimeout(typingTimeoutRef.value)
  }

  if (isTyping.value) {
    chatStore.sendTypingIndicator(false)
  }
})
</script>

<template>
  <div class="relative">
    <!-- Mention suggestions -->
    <v-card
        v-if="showMentions && filteredParticipants.length > 0"
        class="absolute bottom-full left-0 right-0 mb-2 z-10"
        elevation="8"
    >
      <v-list density="compact">
        <v-list-item
            v-for="participant in filteredParticipants"
            :key="participant.socketId"
            @click="selectMention(participant.userName)"
            class="cursor-pointer"
        >
          <template #prepend>
            <v-avatar size="24" color="grey-lighten-1">
              <span class="text-xs">{{ participant.userName.charAt(0).toUpperCase() }}</span>
            </v-avatar>
          </template>
          <v-list-item-title>{{ participant.userName }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <!-- Input area -->
    <div class="flex items-end gap-2 p-3">
      <!-- Emoji picker button -->
      <v-menu v-model="showEmojiPicker" location="top">
        <template #activator="{ props: menuProps }">
          <v-btn
              v-bind="menuProps"
              icon="mdi-emoticon-happy-outline"
              size="small"
              variant="text"
              color="grey-darken-1"
          />
        </template>
        <v-card class="pa-2">
          <div class="grid grid-cols-6 gap-1 max-w-60">
            <v-btn
                v-for="emoji in quickEmojis"
                :key="emoji"
                size="small"
                variant="text"
                @click="handleEmojiClick(emoji)"
            >
              {{ emoji }}
            </v-btn>
          </div>
        </v-card>
      </v-menu>

      <!-- Text input -->
      <div class="flex-1">
        <v-textarea
            ref="textareaRef"
            :model-value="message"
            variant="outlined"
            density="compact"
            rows="1"
            auto-grow
            max-rows="4"
            hide-details
            placeholder="Type a message... (@username to mention)"
            :disabled="!chatStore.canSendMessage"
            @update:model-value="handleInputChange"
            @keydown="handleKeydown"
        />
      </div>

      <!-- Send button -->
      <v-btn
          icon="mdi-send"
          color="primary"
          :disabled="!canSend"
          :loading="chatStore.isSendingMessage"
          @click="sendMessage"
      />
    </div>

    <!-- Character limit indicator (optional) -->
    <div v-if="message.length > 800" class="text-right px-3 pb-1">
      <span
          :class="[
            'text-xs',
            message.length > 1000 ? 'text-red-500' : 'text-amber-600'
          ]"
      >
        {{ message.length }}/1000
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Custom styles for mention highlighting */
:deep(.mention) {
  background-color: rgb(219 234 254);
  color: rgb(29 78 216);
  padding: 0 4px;
  border-radius: 4px;
  font-weight: 500;
}
</style>