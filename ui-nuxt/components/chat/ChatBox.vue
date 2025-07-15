<!-- ui-nuxt/components/chat/ChatComponent.vue -->
<script setup lang="ts">
import { useChatStore } from '~/stores/chat.store'
import { useRoomStore } from '~/stores/room.store'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ChatInput from '~/components/chat/ChatInput.vue'
import TypingIndicator from '~/components/chat/TypingIndicator.vue'
import { ref, computed, nextTick, watch, onMounted } from 'vue'

// Stores
const chatStore = useChatStore()
const roomStore = useRoomStore()

// Local state
const isCollapsed = ref(false)
const hasLoadedHistory = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const messagesEnd = ref<HTMLElement | null>(null)

// Computed
const hasMessages = computed(() => chatStore.hasMessages)
const shouldShowChat = computed(() => roomStore.isInRoom)

// Methods
const scrollToBottom = (smooth = true) => {
  if (messagesEnd.value) {
    messagesEnd.value.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto'
    })
  }
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// Auto-scroll to bottom when new messages arrive
watch(() => chatStore.messages.length, () => {
  nextTick(() => {
    scrollToBottom()
  })
})

// Load chat history when joining a room - SSR-safe
watch(() => roomStore.currentRoom?.id, async (roomId) => {
  if (!process.client) return

  // Reset history loaded flag when room changes
  if (!roomStore.isInRoom || !roomId) {
    hasLoadedHistory.value = false
    return
  }

  // Only load if we haven't loaded for this room yet
  if (!hasLoadedHistory.value && !chatStore.isLoading) {
    console.log('🔄 Loading chat history for room:', roomId)
    hasLoadedHistory.value = true // Set immediately to prevent loops

    try {
      // Initialize chat if needed
      await chatStore.initializeChat()
      await chatStore.loadChatHistory()

      // Scroll to bottom after loading history
      await nextTick(() => {
        scrollToBottom(false) // No smooth scroll for initial load
      })
    } catch (error) {
      console.error('Failed to load chat history:', error)
      hasLoadedHistory.value = false // Reset on error so user can retry
    }
  }
})

// Clean up when leaving room
watch(() => roomStore.isInRoom, (inRoom) => {
  if (!inRoom) {
    console.log('🧹 Cleaning up chat messages')
    chatStore.clearMessages()
    hasLoadedHistory.value = false // Reset for next room
  }
})

// Initialize chat on mount (client-side only)
onMounted(() => {
  if (process.client && roomStore.isInRoom) {
    chatStore.initializeChat()
  }
})

// Debug info - useful for development
const debugInfo = computed(() => ({
  isLoading: chatStore.isLoading,
  messageCount: chatStore.messageCount,
  hasMessages: chatStore.hasMessages,
  error: chatStore.error,
  hasLoadedHistory: hasLoadedHistory.value,
  roomId: roomStore.currentRoom?.id,
  isInitialized: chatStore.isInitialized
}))
</script>

<template>
  <!-- Only render if in a room -->
  <v-card
      v-if="shouldShowChat"
      :class="[
        'flex flex-col transition-all duration-300',
        isCollapsed ? 'h-12' : 'h-96'
      ]"
      elevation="2"
  >
    <!-- Header -->
    <v-card-title class="d-flex align-center justify-space-between pa-3 bg-grey-lighten-5">
      <div class="d-flex align-center gap-2">
        <v-icon color="primary">mdi-chat</v-icon>
        <span class="text-h6">Chat</span>
        <v-badge
            v-if="chatStore.messageCount > 0"
            :content="chatStore.messageCount"
            color="primary"
            inline
        />
      </div>

      <v-btn
          :icon="isCollapsed ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          size="small"
          variant="text"
          @click="toggleCollapse"
      />
    </v-card-title>

    <!-- Chat content -->
    <template v-if="!isCollapsed">
      <!-- Error state -->
      <v-alert
          v-if="chatStore.error"
          type="error"
          variant="tonal"
          closable
          class="ma-3"
          @click:close="chatStore.clearError"
      >
        {{ chatStore.error }}
      </v-alert>

      <!-- Loading state -->
      <div v-if="chatStore.isLoading" class="d-flex justify-center align-center pa-4">
        <v-progress-circular indeterminate color="primary" />
        <span class="ml-2">Loading chat history...</span>
      </div>

      <!-- Messages area -->
      <v-card-text
          v-else
          ref="messagesContainer"
          class="flex-1 overflow-y-auto pa-3"
          style="max-height: 280px; min-height: 200px;"
      >
        <!-- No messages state -->
        <div v-if="!hasMessages" class="d-flex flex-column align-center justify-center h-100 text-grey">
          <v-icon size="48" class="mb-3">mdi-chat-outline</v-icon>
          <p class="text-body-2 mb-1">No messages yet</p>
          <p class="text-caption">Be the first to say hello!</p>
        </div>

        <!-- Messages list -->
        <template v-else>
          <ChatMessage
              v-for="message in chatStore.messages"
              :key="message.id"
              :message="message"
          />
          <TypingIndicator />
          <div ref="messagesEnd" />
        </template>
      </v-card-text>

      <!-- Input area -->
      <div class="border-t">
        <ChatInput />
      </div>
    </template>
  </v-card>
</template>

<style scoped>
/* Custom scrollbar for messages area */
:deep(.v-card-text) {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

:deep(.v-card-text::-webkit-scrollbar) {
  width: 6px;
}

:deep(.v-card-text::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(.v-card-text::-webkit-scrollbar-thumb) {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

:deep(.v-card-text::-webkit-scrollbar-thumb:hover) {
  background-color: rgba(0, 0, 0, 0.3);
}
</style>