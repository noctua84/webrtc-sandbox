<script setup lang="ts">
import { ref } from 'vue'
import { useRoomStore } from '~/stores/room.store'

// Stores
const roomStore = useRoomStore()

// Local state
const copied = ref(false)
const showCopySuccess = ref(false)
const showCopyError = ref(false)
const showLeaveDialog = ref(false)
const isLeavingRoom = ref(false)

// Methods
const handleCopyRoomId = async () => {
  try {
    await navigator.clipboard.writeText(roomStore.currentRoom!.id)
    copied.value = true
    showCopySuccess.value = true

    // Reset copied state after 2 seconds
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy room ID:', error)
    showCopyError.value = true
  }
}

const handleLeaveRoom = () => {
  showLeaveDialog.value = true
}

const confirmLeaveRoom = async () => {
  try {
    isLeavingRoom.value = true
    await roomStore.leaveRoom()
    showLeaveDialog.value = false
  } catch (error) {
    console.error('Error leaving room:', error)
    // Error is already handled in the store and shown in UI
  } finally {
    isLeavingRoom.value = false
  }
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const formatTimeAgo = (dateString: string): string => {
  const now = new Date()
  const date = new Date(dateString)
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return 'just now'
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  } else {
    const days = Math.floor(diffInSeconds / 86400)
    return `${days} day${days !== 1 ? 's' : ''} ago`
  }
}

// Only show component if user is in a room
if (!roomStore.isInRoom) {
  // Component won't render
}
</script>

<template>
  <v-card elevation="2">
    <v-card-title class="d-flex align-center justify-space-between">
      <div class="d-flex align-center gap-2">
        <v-icon color="primary">mdi-home-group</v-icon>
        <span>Current Room</span>
      </div>

      <v-btn
          color="error"
          variant="outlined"
          size="small"
          :loading="isLeavingRoom"
          @click="handleLeaveRoom"
      >
        <v-icon start>mdi-exit-to-app</v-icon>
        Leave Room
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- Room Details -->
      <div class="mb-6">
        <!-- Room ID (Host Only) -->
        <v-card
            v-if="roomStore.isRoomCreator"
            color="primary"
            variant="tonal"
            class="mb-4"
        >
          <v-card-text>
            <div class="d-flex align-center justify-space-between">
              <div>
                <v-icon color="primary" class="mb-2">mdi-share-variant</v-icon>
                <div class="text-subtitle-2 font-weight-medium text-primary">
                  Invite Others
                </div>
                <div class="text-caption text-medium-emphasis mb-3">
                  Share this room ID with others so they can join:
                </div>
                <div class="d-flex align-center gap-2">
                  <v-text-field
                      :model-value="roomStore?.currentRoom?.id"
                      readonly
                      density="compact"
                      variant="outlined"
                      class="font-mono mr-3"
                      style="max-width: 200px;"
                      hide-details
                  />
                  <v-btn
                      :color="copied ? 'success' : 'primary'"
                      :icon="copied ? 'mdi-check' : 'mdi-content-copy'"
                      size="small"
                      @click="handleCopyRoomId"
                  />
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Room Information -->
        <v-row>
          <v-col cols="12" md="6">
            <v-card variant="tonal" color="surface">
              <v-card-text>
                <v-icon color="primary" class="mb-2">mdi-account-star</v-icon>
                <div class="text-caption text-medium-emphasis">Your Role</div>
                <div class="text-subtitle-2 font-weight-medium">
                  <span v-if="roomStore.isRoomCreator" class="text-primary">
                    <v-icon size="16" class="mr-1">mdi-crown</v-icon>
                    Room Creator
                  </span>
                  <span v-else class="text-medium-emphasis">
                    <v-icon size="16" class="mr-1">mdi-account</v-icon>
                    Participant
                  </span>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" md="6">
            <v-card variant="tonal" color="surface">
              <v-card-text>
                <v-icon color="success" class="mb-2">mdi-account-group</v-icon>
                <div class="text-caption text-medium-emphasis">Participants</div>
                <div class="text-subtitle-2 font-weight-medium">
                  <span class="text-success">{{ roomStore.connectedParticipantCount }}</span>
                  <span class="text-medium-emphasis"> / {{ roomStore?.currentRoom?.maxParticipants }} connected</span>
                  <div v-if="roomStore.participantCount !== roomStore.connectedParticipantCount" class="text-caption">
                    ({{ roomStore.participantCount }} total)
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12">
            <v-card variant="tonal" color="surface">
              <v-card-text>
                <v-icon color="info" class="mb-2">mdi-clock-outline</v-icon>
                <div class="text-caption text-medium-emphasis">Created</div>
                <div class="text-subtitle-2 font-weight-medium">
                  {{ formatDate(roomStore?.currentRoom?.createdAt as string) }}
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <!-- Participants List -->
      <div>
        <div class="d-flex align-center justify-space-between mb-3">
          <h3 class="text-h6 font-weight-medium">
            Participants
          </h3>
          <v-chip
              size="small"
              color="primary"
              variant="outlined"
          >
            {{ roomStore.connectedParticipantCount }} connected
          </v-chip>
        </div>

        <div class="d-flex flex-column gap-2">
          <v-card
              v-for="participant in roomStore.participants"
              :key="participant.socketId || `disconnected-${participant.userName}`"
              :color="participant.isConnected ? 'surface' : 'warning'"
              :variant="participant.isConnected ? 'tonal' : 'outlined'"
              class="participant-card"
          >
            <v-card-text class="py-3">
              <div class="d-flex align-center justify-space-between">
                <div class="d-flex align-center gap-3">
                  <!-- Avatar -->
                  <v-avatar
                      :color="participant.isConnected ? 'primary' : 'grey'"
                      size="40"
                  >
                    <span class="text-white font-weight-medium">
                      {{ participant.userName.charAt(0).toUpperCase() }}
                    </span>
                  </v-avatar>

                  <!-- Participant Info -->
                  <div>
                    <div class="d-flex align-center gap-2">
                      <span class="text-subtitle-2 font-weight-medium">
                        {{ participant.userName }}
                      </span>

                      <!-- You indicator -->
                      <v-chip
                          v-if="participant.socketId === roomStore.currentParticipant?.socketId"
                          size="x-small"
                          color="primary"
                          variant="outlined"
                      >
                        You
                      </v-chip>

                      <!-- Creator indicator -->
                      <v-chip
                          v-if="participant.isCreator"
                          size="x-small"
                          color="warning"
                          variant="outlined"
                          prepend-icon="mdi-crown"
                      >
                        Host
                      </v-chip>
                    </div>

                    <div class="text-caption text-medium-emphasis">
                      <span>{{ participant.isCreator ? 'Room Creator' : 'Participant' }}</span>
                      <span v-if="participant.isConnected" class="text-success"> • Connected</span>
                      <span v-else class="text-warning"> • Disconnected • May reconnect</span>
                      <span v-if="participant.joinedAt"> • Joined {{ formatTimeAgo(participant.joinedAt) }}</span>
                    </div>

                    <!-- Media Status -->
                    <div v-if="participant.mediaStatus && participant.isConnected" class="d-flex gap-1 mt-1">
                      <v-chip
                          size="x-small"
                          :color="participant.mediaStatus.hasVideo ? 'success' : 'error'"
                          :prepend-icon="participant.mediaStatus.hasVideo ? 'mdi-video' : 'mdi-video-off'"
                          variant="flat"
                      />
                      <v-chip
                          size="x-small"
                          :color="participant.mediaStatus.hasAudio ? 'success' : 'error'"
                          :prepend-icon="participant.mediaStatus.hasAudio ? 'mdi-microphone' : 'mdi-microphone-off'"
                          variant="flat"
                      />
                      <v-chip
                          v-if="participant.mediaStatus.isScreenSharing"
                          size="x-small"
                          color="info"
                          prepend-icon="mdi-monitor-share"
                          variant="flat"
                      />
                    </div>
                  </div>
                </div>

                <!-- Connection Status Indicator -->
                <div class="d-flex align-center">
                  <v-icon
                      :color="participant.isConnected ? 'success' : 'warning'"
                      size="12"
                  >
                    {{ participant.isConnected ? 'mdi-circle' : 'mdi-circle-outline' }}
                  </v-icon>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </div>
    </v-card-text>

    <!-- Success Snackbar -->
    <v-snackbar
        v-model="showCopySuccess"
        :timeout="2000"
        color="success"
        location="bottom"
    >
      <v-icon start>mdi-check-circle</v-icon>
      Room ID copied to clipboard!
    </v-snackbar>

    <!-- Error Snackbar -->
    <v-snackbar
        v-model="showCopyError"
        :timeout="3000"
        color="error"
        location="bottom"
    >
      <v-icon start>mdi-alert-circle</v-icon>
      Failed to copy room ID
    </v-snackbar>

    <!-- Leave Room Confirmation Dialog -->
    <v-dialog
        v-model="showLeaveDialog"
        max-width="400"
        persistent
    >
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="warning">mdi-alert-circle</v-icon>
          <span>Leave Room</span>
        </v-card-title>

        <v-card-text>
          <p>Are you sure you want to leave this room?</p>
          <p v-if="roomStore.isRoomCreator" class="text-warning text-caption mt-2">
            <v-icon size="16" class="mr-1">mdi-information</v-icon>
            As the room creator, leaving will end the room for all participants.
          </p>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn
              variant="text"
              @click="showLeaveDialog = false"
          >
            Cancel
          </v-btn>
          <v-btn
              color="error"
              variant="outlined"
              :loading="isLeavingRoom"
              @click="confirmLeaveRoom"
          >
            Leave Room
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.participant-card {
  transition: all 0.2s ease;
}

.participant-card:hover {
  transform: translateY(-1px);
}

.font-mono {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}
</style>