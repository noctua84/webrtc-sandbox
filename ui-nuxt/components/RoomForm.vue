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
            <v-form @submit.prevent="handleSubmit">
              <!-- Username Input -->
              <v-text-field
                  v-model="userName"
                  :rules="userNameRules"
                  label="Your Name"
                  placeholder="Enter your name"
                  prepend-icon="mdi-account"
                  variant="outlined"
                  class="mb-4"
                  :disabled="isLoading"
                  autofocus
              />

              <!-- Action Toggle -->
              <v-btn-toggle
                  v-model="actionType"
                  color="primary"
                  variant="outlined"
                  divided
                  mandatory
                  class="mb-6 w-100"
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
              />

              <!-- Submit Button -->
              <v-btn
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

              <!-- Reconnection Option -->
              <v-card
                  v-if="hasReconnectionData"
                  color="info"
                  variant="tonal"
                  class="mt-4"
              >
                <v-card-text class="text-center">
                  <v-icon color="info" class="mb-2">mdi-restore</v-icon>
                  <div class="text-subtitle-2 mb-2">Reconnect to Previous Room</div>
                  <div class="text-caption mb-3">
                    Continue your previous session as {{ reconnectionData?.userName }}
                  </div>
                  <v-btn
                      color="info"
                      variant="outlined"
                      size="small"
                      :loading="isReconnecting"
                      @click="handleReconnect"
                  >
                    <v-icon start>mdi-restore</v-icon>
                    Reconnect
                  </v-btn>
                </v-card-text>
              </v-card>
            </v-form>
          </v-card-text>

          <!-- Help Text -->
          <v-card-actions class="pa-6 pt-0">
            <div class="text-caption text-medium-emphasis">
              <v-icon size="16" class="mr-1">mdi-information-outline</v-icon>
              {{ actionType === 'create'
                ? 'Create a new room and share the Room ID with others to join'
                : 'Enter the Room ID shared by the room creator'
              }}
            </div>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoomStore } from '~/stores/room.store'

// Stores
const roomStore = useRoomStore()

// Local state
const userName = ref('')
const roomId = ref('')
const actionType = ref<'create' | 'join'>('create')
const isReconnecting = ref(false)

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

// Clear form when switching action types
watch(actionType, () => {
  roomId.value = ''
})
</script>

<style scoped>
.w-100 {
  width: 100%;
}
</style>