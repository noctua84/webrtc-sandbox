<script setup lang="ts">
import { useRoomStore } from "~/stores/room.store";
import { ref, computed } from 'vue'

// Props
interface Props {
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
})

// Stores
const roomStore = useRoomStore()

// Local state
const copied = ref(false)
const copyError = ref('')
const isLeavingRoom = ref(false)
const showRoomDetails = ref(false)

// Computed
const formattedCreatedAt = computed(() => {
  if (!roomStore?.currentRoom?.createdAt) return 'Unknown'
  return formatDate(roomStore.currentRoom.createdAt)
})

// Methods
const handleCopyRoomId = async () => {
  if (!roomStore?.currentRoom?.id) return

  try {
    await navigator.clipboard.writeText(roomStore.currentRoom.id)
    copied.value = true
    copyError.value = ''

    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy room ID:', error)
    copyError.value = 'Failed to copy to clipboard'

    setTimeout(() => {
      copyError.value = ''
    }, 3000)
  }
}

const handleLeaveRoom = async () => {
  if (!roomStore.currentRoom || isLeavingRoom.value) return

  try {
    isLeavingRoom.value = true
    await roomStore.leaveRoom()
  } catch (error) {
    console.error('Failed to leave room:', error)
  } finally {
    isLeavingRoom.value = false
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return 'Just created'
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
const shouldRender = computed(() => roomStore.isInRoom)
</script>

<template>
  <div v-if="shouldRender">
    <!-- Compact Footer Mode -->
    <v-card v-if="compact" elevation="1" class="room-info-footer">
      <v-card-text class="pa-3">
        <div class="d-flex align-center justify-space-between">
          <!-- Left: Room Basic Info -->
          <div class="d-flex align-center gap-4">
            <!-- Room ID (for creators) -->
            <div v-if="roomStore.isRoomCreator" class="d-flex align-center gap-2">
              <v-icon size="16" color="primary">mdi-key-variant</v-icon>
              <span class="text-caption text-medium-emphasis">Room ID:</span>
              <code class="text-caption bg-grey-lighten-4 pa-1 rounded">
                {{ roomStore?.currentRoom?.id }}
              </code>
              <v-btn
                  :color="copied ? 'success' : 'primary'"
                  size="x-small"
                  variant="text"
                  @click="handleCopyRoomId"
              >
                <v-icon>{{ copied ? 'mdi-check' : 'mdi-content-copy'}}</v-icon>
                <v-tooltip activator="parent" location="top">
                  {{ copied ? 'Copied!' : 'Copy Room ID' }}
                </v-tooltip>
              </v-btn>
            </div>

            <!-- Room Status -->
            <div class="d-flex align-center gap-2">
              <v-icon size="16" color="success">mdi-circle</v-icon>
              <span class="text-caption mr-2">
                {{ roomStore.connectedParticipantCount }}/{{ roomStore?.currentRoom?.maxParticipants }} participants
              </span>
            </div>

            <!-- Created Time -->
            <div class="d-flex align-center gap-2">
              <v-icon size="16" color="info">mdi-clock-outline</v-icon>
              <span class="text-caption text-medium-emphasis">
                {{ formattedCreatedAt }}
              </span>
            </div>
          </div>

          <!-- Right: Actions -->
          <div class="d-flex align-center gap-2">
            <!-- Room Details Toggle -->
            <v-btn
                variant="text"
                size="small"
                @click="showRoomDetails = !showRoomDetails"
            >
              <v-icon size="16">{{ showRoomDetails ? 'mdi-chevron-up' : 'mdi-information-outline' }}</v-icon>
              <span class="text-caption ml-1">{{ showRoomDetails ? 'Hide' : 'Details' }}</span>
            </v-btn>

            <!-- Leave Room -->
            <v-btn
                color="error"
                variant="outlined"
                size="small"
                :loading="isLeavingRoom"
                @click="handleLeaveRoom"
            >
              <v-icon start size="16">mdi-exit-to-app</v-icon>
              Leave
            </v-btn>
          </div>
        </div>

        <!-- Expandable Details -->
        <v-expand-transition>
          <div v-show="showRoomDetails" class="mt-3 pt-3 border-t">
            <div class="d-flex gap-6">
              <!-- Your Role -->
              <div class="d-flex align-center gap-2">
                <v-icon size="16" :color="roomStore.isRoomCreator ? 'warning' : 'info'">
                  {{ roomStore.isRoomCreator ? 'mdi-crown' : 'mdi-account' }}
                </v-icon>
                <span class="text-caption text-medium-emphasis">Your Role:</span>
                <span class="text-caption font-weight-medium">
                  {{ roomStore.isRoomCreator ? 'Room Creator' : 'Participant' }}
                </span>
              </div>

              <!-- Connection Quality -->
              <div class="d-flex align-center gap-2">
                <v-icon size="16" color="success">mdi-wifi</v-icon>
                <span class="text-caption text-medium-emphasis">Connection:</span>
                <span class="text-caption font-weight-medium text-success">Good</span>
              </div>

              <!-- Room Type -->
              <div class="d-flex align-center gap-2">
                <v-icon size="16" color="info">mdi-earth</v-icon>
                <span class="text-caption text-medium-emphasis">Type:</span>
                <span class="text-caption font-weight-medium">Public Room</span>
              </div>
            </div>
          </div>
        </v-expand-transition>

        <!-- Copy Error -->
        <v-slide-y-transition>
          <v-alert
              v-if="copyError"
              type="error"
              variant="tonal"
              density="compact"
              class="mt-2"
              closable
              @click:close="copyError = ''"
          >
            {{ copyError }}
          </v-alert>
        </v-slide-y-transition>
      </v-card-text>
    </v-card>

    <!-- Full Mode (Original) -->
    <v-card v-else elevation="2">
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
                    {{ formattedCreatedAt }}
                  </div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </div>

        <!-- Copy Error -->
        <v-alert
            v-if="copyError"
            type="error"
            variant="tonal"
            closable
            class="ma-2"
            @click:close="copyError = ''"
        >
          {{ copyError }}
        </v-alert>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.room-info-footer {
  border-radius: 8px 8px 0 0 !important;
}

.border-t {
  border-top: 1px solid rgba(var(--v-theme-on-surface-rgb), 0.12);
}

.font-mono {
  font-family: 'Courier New', monospace;
}
</style>