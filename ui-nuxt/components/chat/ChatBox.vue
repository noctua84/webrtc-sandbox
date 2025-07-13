<script setup lang="ts">
import { useChatStore } from "~/stores/chat.store";
import { useRoomStore } from "~/stores/room.store";
import ChatMessage from "~/components/chat/ChatMessage.vue";
import ChatInput from "~/components/chat/ChatInput.vue";
import TypingIndicator from "~/components/chat/TypingIndicator.vue";
import { ref, computed, nextTick, watch, onMounted } from 'vue'

// Stores
const chatStore = useChatStore()
const roomStore = useRoomStore()

// Local state
const messagesContainer = ref<HTMLElement | null>(null)
const messagesEnd = ref<HTMLElement | null>(null)
const isNearBottom = ref(true)
const hasLoadedHistory = ref(false)

// Computed
const hasMessages = computed(() => chatStore.messageCount > 0)

// Methods
const scrollToBottom = (smooth = true) => {
  if (messagesEnd.value) {
    messagesEnd.value.scrollIntoView({
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
  if (isNearBottom.value) {
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

  if (!hasLoadedHistory.value && !chatStore.isSendingMessage) {
    hasLoadedHistory.value = true

    try {
      await chatStore.loadChatHistory()
      // Scroll to bottom after loading history
      await nextTick(() => {
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

// Initialize scroll position
onMounted(() => {
  nextTick(() => {
    scrollToBottom(false)
  })
})
</script>

<template>
  <v-card
      v-if="roomStore.isInRoom"
      class="fill-height d-flex flex-column"
      elevation="2"
  >
    <!-- Header -->
    <v-card-title class="d-flex align-center justify-space-between pa-4 pb-2">
      <div class="d-flex align-center gap-2">
        <v-icon color="primary">mdi-chat</v-icon>
        <span>Chat</span>
        <v-chip
            v-if="chatStore.messages.length > 0"
            size="small"
            color="primary"
            variant="outlined"
        >
          {{ chatStore.messages.length }}
        </v-chip>
      </div>

      <!-- Chat Actions -->
      <div class="d-flex align-center gap-1">
        <!-- Clear Chat (for room creators) -->
        <v-btn
            v-if="roomStore.isRoomCreator && hasMessages"
            icon
            size="small"
            variant="text"
            @click="chatStore.clearMessages()"
        >
          <v-icon size="16">mdi-delete-sweep</v-icon>
          <v-tooltip activator="parent" location="bottom">Clear Chat</v-tooltip>
        </v-btn>

        <!-- Chat Settings -->
        <v-btn
            icon
            size="small"
            variant="text"
        >
          <v-icon size="16">mdi-cog</v-icon>
          <v-tooltip activator="parent" location="bottom">Chat Settings</v-tooltip>
        </v-btn>
      </div>
    </v-card-title>

    <v-divider />

    <!-- Messages Container -->
    <div class="flex-grow-1 d-flex flex-column min-height-0">
      <div
          ref="messagesContainer"
          class="messages-container flex-grow-1 pa-3 overflow-y-auto"
          @scroll="onScroll"
      >
        <!-- Loading State -->
        <div v-if="chatStore.isSendingMessage" class="d-flex justify-center pa-4">
          <v-progress-circular
              indeterminate
              size="24"
              color="primary"
          />
          <span class="ml-2 text-caption">Loading messages...</span>
        </div>

        <!-- Empty State -->
        <div v-else-if="!hasMessages" class="text-center pa-6">
          <v-icon size="64" color="grey-lighten-2" class="mb-3">mdi-chat-outline</v-icon>
          <div class="text-body-2 text-medium-emphasis mb-2">
            No messages yet
          </div>
          <div class="text-caption text-medium-emphasis">
            Start the conversation below!
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
        <TypingIndicator v-if="chatStore.typingUsers.length > 0" />

        <!-- Scroll anchor -->
        <div ref="messagesEnd" />
      </div>

      <!-- Scroll to Bottom Button -->
      <v-fab
          v-if="!isNearBottom && hasMessages"
          icon="mdi-chevron-down"
          size="small"
          location="bottom end"
          class="scroll-to-bottom-fab"
          color="primary"
          @click="scrollToBottom()"
      />
    </div>

    <!-- Chat Input -->
    <div class="chat-input-container">
      <v-divider />
      <ChatInput />
    </div>

    <!-- Error State -->
    <v-slide-y-transition>
      <v-alert
          v-if="chatStore.hasError"
          type="error"
          variant="tonal"
          density="compact"
          closable
          class="ma-2"
          @click:close="chatStore.clearChatError()"
      >
        {{ chatStore.chatError?.message }}
      </v-alert>
    </v-slide-y-transition>
  </v-card>
</template>

<style scoped>
.min-height-0 {
  min-height: 0;
}

.messages-container {
  scroll-behavior: smooth;
}

.chat-input-container {
  flex-shrink: 0;
}

.scroll-to-bottom-fab {
  position: absolute !important;
  bottom: 80px;
  right: 16px;
  z-index: 10;
}

/* Custom scrollbar styling */
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-on-surface), 0.3);
}

/* New message flash animation */
:global(.chat-new-message) {
  animation: flash 0.5s ease-in-out 2;
}

@keyframes flash {
  0%, 100% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(var(--v-theme-primary), 0.1);
  }
}

/* Ensure proper spacing and alignment */
.v-card-title {
  flex-shrink: 0;
}

/* Mobile responsive adjustments */
@media (max-width: 768px) {
  .messages-container {
    padding: 12px;
  }

  .scroll-to-bottom-fab {
    bottom: 70px;
    right: 12px;
  }
}
</style>