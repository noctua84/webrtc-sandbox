<script setup lang="ts">
import {useWebRTCStore} from "~/stores/webrtc.store";
import {useRoomStore} from "~/stores/room.store";
import VideoTile from "./VideoTile.vue";
import {computed} from "vue";

// Stores
const webrtcStore = useWebRTCStore()
const roomStore = useRoomStore()

// Computed
const screenSharingParticipant = computed(() => {
  // Check if local user is sharing screen
  if (webrtcStore.isScreenSharing) {
    return { isLocal: true, socketId: roomStore.currentParticipant?.socketId }
  }

  // Check if any remote participant is sharing screen
  const sharingParticipant = otherParticipants.value.find(
      p => p.mediaStatus?.isScreenSharing
  )

  return sharingParticipant
      ? { isLocal: false, socketId: sharingParticipant.socketId }
      : null
})

const otherParticipants = computed(() => {
  if (!roomStore.currentParticipant) return []
  return roomStore.participants.filter(
      p => p.socketId !== roomStore.currentParticipant?.socketId
  )
})

const totalParticipants = computed(() => {
  return webrtcStore.isMediaActive ? 1 + otherParticipants.value.length : 0
})

const maxSlots = computed(() => 4) // Maximum 4 participants

const emptySlots = computed(() => {
  const used = totalParticipants.value
  const max = maxSlots.value
  return Math.max(0, max - used)
})

const gridClass = computed(() => {
  const total = totalParticipants.value
  const isScreenSharing = !!screenSharingParticipant.value

  if (total <= 1) return 'd-flex align-center justify-center'
  if (isScreenSharing) return 'grid-screen-sharing'
  if (total === 2) return 'grid-2'
  if (total <= 4) return 'grid-4'
  if (total <= 9) return 'grid-9'
  return 'grid-4' // Fallback
})

const tileClass = computed(() => {
  const isScreenSharing = !!screenSharingParticipant.value

  if (isScreenSharing) {
    return (participantId?: string) => {
      const isSharing = participantId === screenSharingParticipant.value?.socketId
      return isSharing ? 'tile-screen-share' : 'tile-small'
    }
  }

  const total = totalParticipants.value

  if (total <= 1) return () => 'tile-single'
  if (total === 2) return () => 'tile-half'
  if (total <= 4) return () => 'tile-quarter'
  if (total <= 9) return () => 'tile-ninth'
  return () => 'tile-quarter' // Fallback
})

// Methods
const getConnectionState = (participantId: string): string => {
  const status = webrtcStore.connectionStatuses[participantId]
  if (!status) return 'no-connection'

  const hasConnection = webrtcStore.peerConnections.has(participantId)
  if (!hasConnection) return 'no-connection'

  return status.connectionState
}
</script>

<template>
  <v-card elevation="2" class="fill-height">
    <v-card-text class="pa-2 fill-height">
      <div
          v-if="!webrtcStore.isMediaActive"
          class="d-flex align-center justify-center fill-height"
      >
        <div class="text-center">
          <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-video-off</v-icon>
          <div class="text-h6 text-medium-emphasis">Start your camera to begin video call</div>
          <div class="text-caption text-disabled mt-2">
            Click "Start Video" in the controls above
          </div>
        </div>
      </div>

      <div v-else :class="gridClass" class="fill-height">
        <!-- Local Video -->
        <VideoTile
            :stream="webrtcStore.localStream"
            :user-name="roomStore.currentParticipant?.userName || 'You'"
            :has-video="webrtcStore.hasVideo"
            :has-audio="webrtcStore.hasAudio"
            :is-screen-sharing="webrtcStore.isScreenSharing"
            :is-local="true"
            :class="tileClass(roomStore.currentParticipant?.socketId)"
        />

        <!-- Remote Videos -->
        <VideoTile
            v-for="participant in otherParticipants"
            :key="participant.socketId"
            :stream="webrtcStore.remoteStreams.get(participant.socketId) || null"
            :user-name="participant.userName"
            :has-video="participant.mediaStatus?.hasVideo || false"
            :has-audio="participant.mediaStatus?.hasAudio || false"
            :is-screen-sharing="participant.mediaStatus?.isScreenSharing || false"
            :connection-state="getConnectionState(participant.socketId)"
            :class="tileClass(participant.socketId)"
        />

        <!-- Empty Slots -->
        <div
            v-for="i in emptySlots"
            :key="`empty-${i}`"
            :class="tileClass"
            class="d-flex align-center justify-center"
        >
          <div class="text-center">
            <v-icon size="48" color="grey-lighten-2">mdi-account-plus</v-icon>
            <div class="text-caption text-disabled mt-2">Waiting for participant</div>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.fill-height {
  height: 100%;
}

/* Grid Layouts */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  height: 100%;
}

.grid-4 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
  height: 100%;
}

.grid-screen-sharing {
  display: grid;
  grid-template-columns: 3fr 1fr;
  grid-template-rows: auto;
  grid-auto-rows: 1fr;
  gap: 8px;
  height: 100%;
}

.grid-9 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  gap: 8px;
  height: 100%;
}

/* Tile Sizes */
.tile-single {
  width: 100%;
  height: 100%;
  max-width: 800px;
  max-height: 600px;
  margin: 0 auto;
}

.tile-half {
  width: 100%;
  height: 100%;
}

.tile-quarter {
  width: 100%;
  height: 100%;
  min-height: 200px;
}

.tile-screen-share {
  grid-row: span 3;
  width: 100%;
  height: 100%;
}

.tile-small {
  width: 100%;
  height: 100%;
  min-height: 120px;
  width: 120px;
}

.tile-ninth {
  width: 100%;
  height: 100%;
  min-height: 150px;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .grid-2,
  .grid-4 {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(auto-fill, minmax(200px, 1fr));
  }

  .tile-quarter {
    min-height: 150px;
  }
}
</style>