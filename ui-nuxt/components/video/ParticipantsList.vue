<script setup lang="ts">
import { useRoomStore } from "~/stores/room.store";
import { ref, computed } from 'vue'

// Stores
const roomStore = useRoomStore()

// Local state
const showOfflineParticipants = ref(true)

// Computed
const onlineParticipants = computed(() =>
    roomStore.participants.filter(p => p.isConnected)
)

const offlineParticipants = computed(() =>
    roomStore.participants.filter(p => !p.isConnected)
)

const hasOfflineParticipants = computed(() =>
    offlineParticipants.value.length > 0
)

// Methods
const formatLastSeen = (lastSeen: string) => {
  if (!lastSeen) return 'Unknown'

  const now = new Date()
  const lastSeenDate = new Date(lastSeen)
  const diffInSeconds = Math.floor((now.getTime() - lastSeenDate.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return 'Just now'
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `${minutes} min ago`
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours}h ago`
  } else {
    const days = Math.floor(diffInSeconds / 86400)
    return `${days}d ago`
  }
}

const getParticipantColor = (participant: any) => {
  if (participant.socketId === roomStore.currentParticipant?.socketId) {
    return 'primary'
  }
  return participant.isConnected ? 'success' : 'warning'
}
</script>

<template>
  <v-card class="fill-height d-flex flex-column" elevation="2">
    <v-card-title class="d-flex align-center justify-space-between pa-4 pb-2">
      <div class="d-flex align-center gap-2">
        <v-icon color="primary">mdi-account-group</v-icon>
        <span>Participants</span>
      </div>
      <v-chip
          size="small"
          color="success"
          variant="outlined"
      >
        {{ roomStore.connectedParticipantCount }}
      </v-chip>
    </v-card-title>

    <v-divider />

    <div class="flex-grow-1 overflow-y-auto pa-2">
      <!-- Online Participants -->
      <div v-if="onlineParticipants.length > 0" class="mb-4">
        <div class="text-caption text-medium-emphasis px-2 py-1 mb-2 font-weight-medium">
          <v-icon size="16" color="success" class="mr-1">mdi-circle</v-icon>
          Online ({{ onlineParticipants.length }})
        </div>

        <div class="d-flex flex-column gap-2">
          <v-card
              v-for="participant in onlineParticipants"
              :key="participant.socketId"
              variant="tonal"
              :color="getParticipantColor(participant)"
              class="participant-card"
              elevation="0"
          >
            <v-card-text class="pa-3">
              <div class="d-flex align-center gap-3">
                <!-- Avatar -->
                <v-avatar
                    :color="getParticipantColor(participant)"
                    size="32"
                >
                  <span class="text-white text-caption font-weight-medium">
                    {{ participant.userName.charAt(0).toUpperCase() }}
                  </span>
                </v-avatar>

                <!-- Participant Info -->
                <div class="flex-grow-1 min-width-0">
                  <div class="d-flex align-center gap-1 mb-1">
                    <span class="text-subtitle-2 font-weight-medium text-truncate">
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
                    >
                      <v-icon start size="12">mdi-crown</v-icon>
                      Host
                    </v-chip>
                  </div>

                  <!-- Status -->
                  <div class="text-caption d-flex align-center gap-1">
                    <v-icon size="12" color="success">mdi-circle</v-icon>
                    <span class="text-success">Active now</span>
                  </div>
                </div>

                <!-- Media Status Icons -->
                <div class="d-flex flex-column gap-1">
                  <!-- Video Status -->
                  <v-icon
                      size="16"
                      :color="participant.mediaStatus?.hasVideo ? 'success' : 'error'"
                  >
                    {{ participant.mediaStatus?.hasVideo ? 'mdi-video' : 'mdi-video-off' }}
                  </v-icon>

                  <!-- Audio Status -->
                  <v-icon
                      size="16"
                      :color="participant.mediaStatus?.hasAudio ? 'success' : 'error'"
                  >
                    {{ participant.mediaStatus?.hasAudio ? 'mdi-microphone' : 'mdi-microphone-off' }}
                  </v-icon>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </div>

      <!-- Offline Participants (if any) -->
      <div v-if="hasOfflineParticipants">
        <v-btn
            variant="text"
            size="small"
            class="text-caption text-medium-emphasis px-2 py-1 mb-2 font-weight-medium justify-start"
            @click="showOfflineParticipants = !showOfflineParticipants"
        >
          <v-icon
              size="16"
              color="warning"
              class="mr-1"
              :class="showOfflineParticipants ? 'mdi-chevron-down' : 'mdi-chevron-right'"
          >
            {{ showOfflineParticipants ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
          </v-icon>
          <v-icon size="16" color="warning" class="mr-1">mdi-circle-outline</v-icon>
          Offline ({{ offlineParticipants.length }})
        </v-btn>

        <v-expand-transition>
          <div v-show="showOfflineParticipants" class="d-flex flex-column gap-2">
            <v-card
                v-for="participant in offlineParticipants"
                :key="`offline-${participant.userName}`"
                variant="outlined"
                color="warning"
                class="participant-card"
                elevation="0"
            >
              <v-card-text class="pa-3">
                <div class="d-flex align-center gap-3">
                  <!-- Avatar -->
                  <v-avatar
                      color="grey"
                      size="32"
                  >
                    <span class="text-white text-caption font-weight-medium">
                      {{ participant.userName.charAt(0).toUpperCase() }}
                    </span>
                  </v-avatar>

                  <!-- Participant Info -->
                  <div class="flex-grow-1 min-width-0">
                    <div class="d-flex align-center gap-1 mb-1">
                      <span class="text-subtitle-2 font-weight-medium text-truncate">
                        {{ participant.userName }}
                      </span>

                      <!-- Creator indicator -->
                      <v-chip
                          v-if="participant.isCreator"
                          size="x-small"
                          color="warning"
                          variant="outlined"
                      >
                        <v-icon start size="12">mdi-crown</v-icon>
                        Host
                      </v-chip>
                    </div>

                    <!-- Last seen -->
                    <div class="text-caption d-flex align-center gap-1">
                      <v-icon size="12" color="warning">mdi-circle-outline</v-icon>
                      <span class="text-warning">{{ formatLastSeen(participant.lastSeen) }}</span>
                    </div>
                  </div>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </v-expand-transition>
      </div>

      <!-- Empty State -->
      <div v-if="roomStore.participants.length === 0" class="text-center pa-4">
        <v-icon size="48" color="grey-lighten-2" class="mb-2">mdi-account-group-outline</v-icon>
        <div class="text-caption text-medium-emphasis">
          No participants yet
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <v-divider />
    <div class="pa-3">
      <v-btn
          v-if="roomStore.isRoomCreator"
          variant="outlined"
          size="small"
          block
          color="primary"
      >
        <v-icon start size="16">mdi-share-variant</v-icon>
        Invite People
      </v-btn>
    </div>
  </v-card>
</template>

<style scoped>
.participant-card {
  transition: all 0.2s ease;
}

.participant-card:hover {
  transform: translateY(-1px);
}

.min-width-0 {
  min-width: 0;
}

.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Custom scrollbar for participant list */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-on-surface), 0.3);
}
</style>