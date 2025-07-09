<template>
  <v-card
      v-if="roomStore.isInRoom"
      :class="[
      'chat-component',
      'position-fixed',
      'd-flex',
      'flex-column',
      { 'chat-collapsed': isCollapsed }
    ]"
      elevation="8"
  >
    <!-- Header -->
    <v-card-title class="pa-3 d-flex align-center justify-space-between">
      <div class="d-flex align-center gap-2">
        <v-icon>mdi-chat</v-icon>
        <span>Chat</span>
        <v-chip
            v-if="chatStore.messages.length > 0"
            size="x-small"
            color="primary"
        >
          {{ chatStore.messages.length }}
        </v-chip>
      </div>

      <v-btn
          icon
          size="small"
          @click="toggleCollapse"
      >
        <v-icon>{{ isCollapsed ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </v-btn>
    </v-card-title>

    <!-- Chat Content -->
    <div v-if="!isCollapsed" class="chat-content d-flex flex-column">
      <!-- Messages Container -->
      <div
          ref="messagesContainer"
          class="messages-container flex-grow-1 pa-3"
          @scroll="onScroll"
      >
        <!-- Loading State -->
        <div v-if="chatStore.isLoading" class="d-flex justify-center pa-4">
          <v-progress-circular
              indeterminate
              size="24"
              color="primary"
          />
          <span class="ml-2 text-caption">Loading messages...</span>
        </div>

        <!-- Empty State -->
        <div v-else-if="!chatStore.hasMessages" class="text-center pa-4">
          <v-icon size="48" color="grey-lighten-2" class="mb-2">mdi-chat-outline</v-icon>
          <div class="text-caption text-medium-emphasis">
            No messages yet. Start the conversation!
          </div>
        </div>

        <!-- Messages -->
        <div v-else class="d-flex flex-column gap-2">
          <ChatMessage
              v-for="message in chatStore.messages"
              :key="message.id"
              :message="message"
          />
        </div>

        <!-- Typing Indicators -->
        <TypingIndicator v-if="chatStore.hasTypingUsers" />

        <!-- Scroll anchor -->
        <div ref="messagesEnd" />
      </div>

      <!-- Chat Input -->
      <div class="chat-input-container">
        <v-divider />
        <ChatInput />
      </div>
    </div>

    <!-- Error State -->
    <v-alert
        v-if="chatStore.error"
        type="error"
        variant="tonal"
        closable
        class="ma-2"
        @click:close="chatStore.clearError"
    >
      {{ chatStore.error }}
    </v-alert>
  </v-card>
</template>

<script setup lang="ts">
import { useChatStore } from '../stores/chat'
import { useRoomStore } from '../stores/room'
import ChatMessage from './ChatMessage.vue'
import ChatInput from './ChatInput.vue'
import TypingIndicator from './TypingIndicator.vue'

// Stores
const chatStore = useChatStore()
const roomStore = useRoomStore()

// Local state
const isCollapsed = ref(false)
const hasLoadedHistory = ref(false)
const isNearBottom = ref(true)

// Template refs
const messagesContainer = ref<HTMLElement>()
const messagesEnd = ref<HTMLElement>()

// Methods
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value

  // Auto-scroll when expanding
  if (!isCollapsed.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
}

const scrollToBottom = (smooth = true) => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTo({
      top: messagesContainer.value.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    })
  }
}

const onScroll = () => {
  if (!messagesContainer.value) return

  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value
  const threshold = 100 // pixels from bottom

  isNearBottom.value = scrollHeight - scrollTop - clientHeight < threshold
}

// Auto-scroll to bottom when new messages arrive (only if user is near bottom)
watch(() => chatStore.messages.length, () => {
  if (isNearBottom.value && !isCollapsed.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
})

// Load chat history when joining a room
watch(() => roomStore.currentRoom?.id, async (roomId) => {
  if (!roomId) {
    hasLoadedHistory.value = false
    return
  }

  if (!hasLoadedHistory.value && !chatStore.isLoading) {
    hasLoadedHistory.value = true

    try {
      await chatStore.loadChatHistory()
      // Scroll to bottom after loading history
      nextTick(() => {
        scrollToBottom(false) // No smooth scroll for initial load
      })
    } catch (error) {
      console.error('Failed to load chat history:', error)
      hasLoadedHistory.value = false
    }
  }
})

// Clean up when leaving room
watch(() => roomStore.isInRoom, (inRoom) => {
  if (!inRoom) {
    chatStore.clearMessages()
    hasLoadedHistory.value = false
  }
})

// Auto-expand chat on new messages (mobile behavior)
watch(() => chatStore.messages.length, (newLength, oldLength) => {
  if (newLength > oldLength && isCollapsed.value) {
    // Flash the header to indicate new message
    const header = document.querySelector('.chat-component .v-card-title')
    if (header) {
      header.classList.add('chat-new-message')
      setTimeout(() => {
        header.classList.remove('chat-new-message')
      }, 2000)
    }
  }
})

// Initialize scroll position
onMounted(() => {
  nextTick(() => {
    scrollToBottom(false)
  })
})
</script>

<style scoped>
.chat-component {
  bottom: 20px;
  right: 20px;
  width: 350px;
  max-height: 500px;
  z-index: 100;
  transition: all 0.3s ease;
}

.chat-collapsed {
  max-height: 64px;
}

.chat-content {
  height: 436px; /* Total height minus header */
}

.messages-container {
  overflow-y: auto;
  scroll-behavior: smooth;
}

.chat-input-container {
  flex-shrink: 0;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .chat-component {
    bottom: 10px;
    right: 10px;
    left: 10px;
    width: auto;
    max-height: 400px;
  }

  .chat-content {
    height: 336px;
  }
}

/* Scrollbar styling */
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* New message flash animation */
:global(.chat-new-message) {
  animation: flash 0.5s ease-in-out 2;
}

@keyframes flash {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(var(--v-theme-primary), 0.1); }
}
</style>