<script setup lang="ts">
import { useRoomStore } from '~/stores/room.store'
import { ref, computed, watch, onMounted } from 'vue'

// Store
const roomStore = useRoomStore()

// Local state
const userName = ref('')
const roomId = ref('')
const actionType = ref<'create' | 'join' | null>(null)
const isReconnecting = ref(false)

// Input refs for focus management
const userNameInput = ref<HTMLInputElement | null>(null)

// Computed
const isLoading = computed(() =>
    roomStore.isCreatingRoom || roomStore.isJoiningRoom || isReconnecting.value
)

const userNameRules = computed(() => [
  (v: string) => !!v?.trim() || 'Name is required',
  (v: string) => (v?.trim().length >= 2) || 'Name must be at least 2 characters',
  (v: string) => (v?.trim().length <= 50) || 'Name must be less than 50 characters'
])

const roomIdRules = computed(() => [
  (v: string) => !!v?.trim() || 'Room ID is required',
  (v: string) => (v?.trim().length >= 3) || 'Room ID must be at least 3 characters'
])

const isFormValid = computed(() => {
  const userNameValid = userName.value.trim().length >= 2
  if (!actionType.value) return false
  if (actionType.value === 'create') {
    return userNameValid
  }
  return userNameValid && roomId.value.trim().length >= 3
})

const hasReconnectionData = computed(() => {
  return roomStore.getReconnectionData() !== null
})

const reconnectionData = computed(() => {
  return roomStore.getReconnectionData()
})

// Methods
const handleSubmit = async () => {
  if (!isFormValid.value) return

  try {
    if (actionType.value === 'create') {
      await roomStore.createRoom(userName.value.trim())
    } else {
      await roomStore.joinRoom(roomId.value.trim(), userName.value.trim())
    }
  } catch (error) {
    // Error is handled by the store and displayed in the main page
    console.error('Form submission error:', error)
  }
}

const handleReconnect = async () => {
  const data = roomStore.getReconnectionData()
  if (!data) return

  try {
    isReconnecting.value = true
    await roomStore.reconnectToRoom(data.roomId, data.reconnectionToken, data.userName)
  } catch (error) {
    console.error('Reconnection error:', error)
  } finally {
    isReconnecting.value = false
  }
}

const setActionType = (newType: 'create' | 'join' | null) => {
  actionType.value = newType
  roomId.value = '' // Clear room ID when switching

  // Focus the appropriate input after action type changes
  nextTick(() => {
    if (newType === 'join' && userNameInput.value) {
      userNameInput.value.focus()
    }
  })
}

// Clear form when switching action types
watch(actionType, () => {
  roomId.value = ''
})

// Auto-focus username input when component mounts
onMounted(() => {
  nextTick(() => {
    if (userNameInput.value) {
      userNameInput.value.focus()
    }
  })
})
</script>

<template>
  <v-container class="fill-height">
    <v-row justify="center" align="center" class="fill-height">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card elevation="8">
          <v-card-title class="text-center pa-6">
            <v-icon color="primary" size="48" class="mb-2">mdi-video-plus</v-icon>
            <div class="text-h4 font-weight-light">Join Video Call</div>
          </v-card-title>

          <v-card-text class="pa-6">
            <!-- Reconnection Option -->
            <v-alert
                v-if="hasReconnectionData"
                type="info"
                variant="tonal"
                class="mb-4"
            >
              <div class="d-flex align-center justify-space-between">
                <div>
                  <div class="font-weight-medium">Reconnect to previous room?</div>
                  <div class="text-caption">
                    Room: {{ reconnectionData?.roomId }} as {{ reconnectionData?.userName }}
                  </div>
                </div>
                <v-btn
                    color="info"
                    variant="flat"
                    size="small"
                    :loading="isReconnecting"
                    @click="handleReconnect"
                >
                  Reconnect
                </v-btn>
              </div>
            </v-alert>

            <v-form @submit.prevent="handleSubmit">
              <!-- Username Input -->
              <v-text-field
                  ref="userNameInput"
                  v-model="userName"
                  :rules="userNameRules"
                  placeholder="Enter your name"
                  prepend-icon="mdi-account"
                  variant="outlined"
                  class="mb-4"
                  autofocus
                  autocomplete="name"
              />

              <!-- Action Toggle -->
              <div class="mb-6">
                <div class="text-subtitle-2 text-medium-emphasis mb-3">What would you like to do?</div>
                <v-btn-toggle
                    :model-value="actionType"
                    @update:model-value="setActionType"
                    color="primary"
                    variant="outlined"
                    divided
                    class="w-100"
                    :disabled="isLoading"
                >
                  <v-btn value="create" class="flex-grow-1">
                    <v-icon start>mdi-plus</v-icon>
                    Create Room
                  </v-btn>
                  <v-btn value="join" class="flex-grow-1">
                    <v-icon start>mdi-login</v-icon>
                    Join Room
                  </v-btn>

                </v-btn-toggle>
              </div>

              <!-- Room ID Input (for joining) -->
              <v-text-field
                  v-if="actionType === 'join'"
                  v-model="roomId"
                  :rules="roomIdRules"
                  label="Room ID"
                  placeholder="Enter room ID"
                  prepend-icon="mdi-key"
                  variant="outlined"
                  class="mb-4"
                  :disabled="isLoading"
                  autocomplete="off"
              />

              <!-- Submit Button -->
              <v-btn
                  v-if="actionType !== null"
                  type="submit"
                  color="primary"
                  size="large"
                  block
                  :loading="isLoading"
                  :disabled="!isFormValid"
                  class="mb-4"
              >
                <v-icon start>
                  {{ actionType === 'create' ? 'mdi-plus' : 'mdi-login' }}
                </v-icon>
                {{ actionType === 'create' ? 'Create Room' : 'Join Room' }}
              </v-btn>
            </v-form>

            <!-- Help Text -->
            <v-alert
                type="info"
                variant="tonal"
                density="compact"
            >
              <div class="text-caption">
                <template v-if="actionType === null">
                  Select an action above to continue.
                </template>
                <template v-else-if="actionType === 'create'">
                  Create a new video room and share the room ID with others to let them join.
                </template>
                <template v-else>
                  Enter a room ID that someone shared with you to join their video room.
                </template>
              </div>
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.w-100 {
  width: 100%;
}

/* Improve button toggle styling */
:deep(.v-btn-toggle) {
  border-radius: 8px;
  overflow: hidden;
}

:deep(.v-btn-toggle .v-btn) {
  border-radius: 0;
}

:deep(.v-btn-toggle .v-btn:first-child) {
  border-radius: 8px 0 0 8px;
}

:deep(.v-btn-toggle .v-btn:last-child) {
  border-radius: 0 8px 8px 0;
}
</style>