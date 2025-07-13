<script setup lang="ts">
import { useChatStore } from '~/stores/chat.store'
import { computed } from 'vue'

// Stores
const chatStore = useChatStore()

// Computed
const typingUsers = computed(() => chatStore.typingUsers)

const typingStatusText = computed(() => {
  const count = typingUsers.value.length

  if (count === 0) return ''

  if (count === 1) {
    return `${typingUsers.value[0]} is typing...`
  }

  if (count === 2) {
    return `${typingUsers.value[0]} and ${typingUsers.value[1]} are typing...`
  }

  if (count === 3) {
    return `${typingUsers.value[0]}, ${typingUsers.value[1]} and ${typingUsers.value[2]} are typing...`
  }

  return `${count} people are typing...`
})
</script>

<template>
  <div v-if="typingUsers.length > 0" class="typing-indicator">
    <div class="typing-bubble">
      <div class="typing-content">
        <!-- Typing Animation Dots -->
        <div class="typing-dots">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>
    </div>

    <!-- Typing Status Text -->
    <div class="typing-text">
      <span class="text-caption text-medium-emphasis">
        {{ typingStatusText }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.typing-indicator {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 8px;
  animation: fadeIn 0.3s ease-in-out;
}

.typing-bubble {
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgb(var(--v-theme-outline));
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  padding: 8px 12px;
  max-width: fit-content;
}

.typing-content {
  display: flex;
  align-items: center;
  min-height: 20px;
}

.typing-dots {
  display: flex;
  align-items: center;
  gap: 3px;
}

.dot {
  width: 6px;
  height: 6px;
  background-color: rgb(var(--v-theme-on-surface-variant));
  border-radius: 50%;
  animation: typingDots 1.4s ease-in-out infinite both;
}

.dot:nth-child(1) {
  animation-delay: -0.32s;
}

.dot:nth-child(2) {
  animation-delay: -0.16s;
}

.dot:nth-child(3) {
  animation-delay: 0s;
}

.typing-text {
  align-self: flex-end;
  margin-bottom: 2px;
}

@keyframes typingDots {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Dark mode adjustments */
.v-theme--dark .typing-bubble {
  background-color: rgb(var(--v-theme-surface-bright));
}

.v-theme--dark .dot {
  background-color: rgb(var(--v-theme-on-surface));
}
</style>