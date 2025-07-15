<!-- ui-nuxt/components/chat/TypingIndicator.vue -->
<script setup lang="ts">
import { useChatStore } from '~/stores/chat.store'
import { computed } from 'vue'

// Store
const chatStore = useChatStore()

// Computed
const typingUsers = computed(() => chatStore.typingUserNames)

const typingText = computed(() => {
  const users = typingUsers.value

  if (users.length === 0) return ''
  if (users.length === 1) return `${users[0]} is typing...`
  if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`

  return `${users[0]} and ${users.length - 1} others are typing...`
})

const shouldShow = computed(() => typingUsers.value.length > 0)
</script>

<template>
  <Transition
      name="typing"
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 transform translate-y-2"
      enter-to-class="opacity-100 transform translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 transform translate-y-0"
      leave-to-class="opacity-0 transform translate-y-2"
  >
    <div v-if="shouldShow" class="flex items-center gap-3 px-3 py-2">
      <!-- Avatar stack for typing users -->
      <div class="flex -space-x-2">
        <v-avatar
            v-for="(userName, index) in typingUsers.slice(0, 3)"
            :key="userName"
            size="24"
            color="grey-lighten-1"
            :style="{ zIndex: 10 - index }"
            class="border-2 border-white"
        >
          <span class="text-xs font-medium">
            {{ userName.charAt(0).toUpperCase() }}
          </span>
        </v-avatar>
      </div>

      <!-- Typing text and animation -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-grey italic">
          {{ typingText }}
        </span>

        <!-- Typing dots animation -->
        <div class="flex space-x-1">
          <div
              v-for="i in 3"
              :key="i"
              class="w-1 h-1 bg-grey rounded-full animate-bounce"
              :style="{ animationDelay: `${(i - 1) * 150}ms` }"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Bouncing dots animation */
@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-bounce {
  animation: bounce 1.4s infinite ease-in-out both;
}
</style>