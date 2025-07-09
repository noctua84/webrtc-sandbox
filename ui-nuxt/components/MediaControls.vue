<template>
  <v-card elevation="2" class="ma-2">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-microphone-settings</v-icon>
      Media Controls
    </v-card-title>

    <v-card-text>
      <!-- Main Controls -->
      <v-row class="mb-3">
        <v-col cols="12">
          <div class="d-flex gap-2 flex-wrap">
            <!-- Start/Stop Video -->
            <v-btn
                v-if="!webrtcStore.isMediaActive"
                color="primary"
                variant="flat"
                :loading="webrtcStore.isConnecting"
                @click="startMedia"
            >
              <v-icon start>mdi-video</v-icon>
              Start Video
            </v-btn>

            <!-- Video Toggle -->
            <v-btn
                v-else
                :color="webrtcStore.hasVideo ? 'success' : 'error'"
                :variant="webrtcStore.hasVideo ? 'outlined' : 'flat'"
                @click="toggleVideo"
            >
              <v-icon start>{{ webrtcStore.hasVideo ? 'mdi-video' : 'mdi-video-off' }}</v-icon>
              {{ webrtcStore.hasVideo ? 'Turn Off Video' : 'Turn On Video' }}
            </v-btn>

            <!-- Audio Toggle -->
            <v-btn
                v-if="webrtcStore.isMediaActive"
                :color="webrtcStore.hasAudio ? 'success' : 'error'"
                :variant="webrtcStore.hasAudio ? 'outlined' : 'flat'"
                @click="toggleAudio"
            >
              <v-icon start>{{ webrtcStore.hasAudio ? 'mdi-microphone' : 'mdi-microphone-off' }}</v-icon>
              {{ webrtcStore.hasAudio ? 'Mute' : 'Unmute' }}
            </v-btn>

            <!-- Screen Share -->
            <v-btn
                v-if="webrtcStore.isMediaActive"
                :color="webrtcStore.isScreenSharing ? 'info' : 'default'"
                :variant="webrtcStore.isScreenSharing ? 'flat' : 'outlined'"
                :loading="webrtcStore.isConnecting"
                @click="toggleScreenShare"
            >
              <v-icon start>mdi-monitor-share</v-icon>
              {{ webrtcStore.isScreenSharing ? 'Stop Share' : 'Share Screen' }}
            </v-btn>

            <!-- Device Settings -->
            <v-btn
                variant="outlined"
                icon
                @click="showDeviceSettings = true"
            >
              <v-icon>mdi-cog</v-icon>
            </v-btn>

            <!-- Stop Media -->
            <v-btn
                v-if="webrtcStore.isMediaActive"
                color="error"
                variant="outlined"
                @click="stopMedia"
            >
              <v-icon start>mdi-stop</v-icon>
              Stop
            </v-btn>
          </div>
        </v-col>
      </v-row>

      <!-- Connection Status -->
      <v-row v-if="webrtcStore.isMediaActive && connectedCount > 0" class="mt-2">
        <v-col cols="12">
          <v-divider class="mb-3" />
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="text-subtitle-2 text-medium-emphasis">
              <v-icon size="16" class="mr-1">mdi-connection</v-icon>
              Connected to {{ connectedCount }} participant{{ connectedCount !== 1 ? 's' : '' }}
            </div>

            <v-btn
                v-if="otherParticipantsCount > connectedCount"
                color="primary"
                variant="outlined"
                size="small"
                @click="webrtcStore.connectToAllParticipants"
            >
              <v-icon start size="16">mdi-refresh</v-icon>
              Reconnect All
            </v-btn>
          </div>

          <!-- Connection Progress -->
          <div class="d-flex align-center gap-2">
            <v-progress-linear
                :model-value="connectionProgress"
                :color="connectionProgress === 100 ? 'success' : 'warning'"
                height="6"
                rounded
                class="flex-grow-1"
            />
            <div class="text-caption text-medium-emphasis">
              {{ connectedCount }}/{{ otherParticipantsCount }}
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- Individual Connections -->
      <v-row v-if="webrtcStore.isMediaActive && peerConnectionsArray.length > 0">
        <v-col cols="12">
          <div class="text-subtitle-2 text-medium-emphasis mb-2">
            <v-icon size="16" class="mr-1">mdi-account-group</v-icon>
            Participant Connections
          </div>

          <div class="d-flex flex-column gap-2">
            <v-card
                v-for="peer in peerConnectionsArray"
                :key="peer.participantId"
                variant="outlined"
                class="pa-2"
            >
              <div class="d-flex align-center justify-space-between">
                <div class="d-flex align-center gap-2">
                  <v-avatar size="24" :color="getConnectionColor(peer.connectionState)">
                    <v-icon size="16" color="white">
                      {{ getConnectionIcon(peer.connectionState) }}
                    </v-icon>
                  </v-avatar>
                  <div>
                    <div class="text-body-2 font-weight-medium">{{ peer.userName }}</div>
                    <div class="text-caption text-medium-emphasis">
                      {{ getConnectionText(peer.connectionState) }}
                    </div>
                  </div>
                </div>

                <!-- Connection Quality -->
                <div v-if="peer.connectionState === 'connected'" class="d-flex gap-1">
                  <div class="connection-bar bg-success"></div>
                  <div class="connection-bar bg-success"></div>
                  <div class="connection-bar bg-success"></div>
                </div>

                <!-- Loading indicator -->
                <v-progress-circular
                    v-else-if="isConnecting(peer.connectionState)"
                    size="20"
                    width="2"
                    indeterminate
                    color="primary"
                />
              </div>
            </v-card>
          </div>
        </v-col>
      </v-row>

      <!-- Quick Actions -->
      <v-row v-if="webrtcStore.isMediaActive && otherParticipantsCount > 0" class="mt-2">
        <v-col cols="12">
          <v-divider class="mb-3" />
          <div class="d-flex gap-2">
            <v-btn
                variant="outlined"
                size="small"
                @click="webrtcStore.connectToAllParticipants"
            >
              <v-icon start size="16">mdi-refresh</v-icon>
              Reconnect All
            </v-btn>
            <v-btn
                variant="outlined"
                size="small"
                @click="webrtcStore.clearLogs"
            >
              <v-icon start size="16">mdi-delete</v-icon>
              Clear Logs
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-card-text>

    <!-- Device Settings Dialog -->
    <v-dialog v-model="showDeviceSettings" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon start>mdi-cog</v-icon>
          Device Settings
        </v-card-title>

        <v-card-text>
          <!-- Video Device -->
          <v-select
              v-model="webrtcStore.selectedVideoDevice"
              :items="videoDeviceItems"
              label="Camera"
              prepend-icon="mdi-video"
              variant="outlined"
              class="mb-4"
              @update:model-value="onVideoDeviceChange"
          />

          <!-- Audio Device -->
          <v-select
              v-model="webrtcStore.selectedAudioDevice"
              :items="audioDeviceItems"
              label="Microphone"
              prepend-icon="mdi-microphone"
              variant="outlined"
              class="mb-4"
              @update:model-value="onAudioDeviceChange"
          />

          <!-- Quality Settings -->
          <v-select
              v-model="selectedQuality"
              :items="qualityOptions"
              label="Video Quality"
              prepend-icon="mdi-quality-high"
              variant="outlined"
              class="mb-4"
          />

          <!-- Refresh Devices -->
          <v-btn
              variant="outlined"
              block
              @click="refreshDevices"
          >
            <v-icon start>mdi-refresh</v-icon>
            Refresh Devices
          </v-btn>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDeviceSettings = false">
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { useWebRTCStore } from '../stores/webrtc'
import { useRoomStore } from '../stores/room'
import { ref, computed, onMounted } from 'vue'

// Stores
const webrtcStore = useWebRTCStore()
const roomStore = useRoomStore()

// Local state
const showDeviceSettings = ref(false)
const selectedQuality = ref('720p')

// Computed
const connectedCount = computed(() => {
  return Array.from(webrtcStore.peerConnections.values())
      .filter(peer => peer.connectionState === 'connected').length
})

const otherParticipantsCount = computed(() => {
  return roomStore.participants.filter(
      p => p.socketId !== roomStore.currentParticipant?.socketId
  ).length
})

const connectionProgress = computed(() => {
  if (otherParticipantsCount.value === 0) return 100
  return (connectedCount.value / otherParticipantsCount.value) * 100
})

const peerConnectionsArray = computed(() => {
  return Array.from(webrtcStore.peerConnections.values())
})

const videoDeviceItems = computed(() => {
  return webrtcStore.availableDevices.videoDevices.map(device => ({
    title: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
    value: device.deviceId
  }))
})

const audioDeviceItems = computed(() => {
  return webrtcStore.availableDevices.audioDevices.map(device => ({
    title: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
    value: device.deviceId
  }))
})

const qualityOptions = [
  { title: 'High (1080p)', value: '1080p' },
  { title: 'Medium (720p)', value: '720p' },
  { title: 'Low (480p)', value: '480p' }
]

// Methods
const startMedia = async () => {
  try {
    await webrtcStore.startMedia()
  } catch (error) {
    console.error('Failed to start media:', error)
  }
}

const stopMedia = () => {
  webrtcStore.stopMedia()
}

const toggleVideo = () => {
  webrtcStore.toggleVideo()
}

const toggleAudio = () => {
  webrtcStore.toggleAudio()
}

const toggleScreenShare = async () => {
  try {
    if (webrtcStore.isScreenSharing) {
      await webrtcStore.stopScreenShare()
    } else {
      await webrtcStore.startScreenShare()
    }
  } catch (error) {
    console.error('Failed to toggle screen share:', error)
  }
}

const refreshDevices = async () => {
  try {
    await webrtcStore.enumerateDevices()
  } catch (error) {
    console.error('Failed to refresh devices:', error)
  }
}

const onVideoDeviceChange = async (deviceId: string) => {
  try {
    await webrtcStore.switchVideoDevice(deviceId)
  } catch (error) {
    console.error('Failed to switch video device:', error)
  }
}

const onAudioDeviceChange = async (deviceId: string) => {
  try {
    await webrtcStore.switchAudioDevice(deviceId)
  } catch (error) {
    console.error('Failed to switch audio device:', error)
  }
}

// Helper functions
const getConnectionColor = (state: RTCPeerConnectionState) => {
  switch (state) {
    case 'connected': return 'success'
    case 'connecting': return 'warning'
    case 'new': return 'info'
    case 'disconnected':
    case 'failed': return 'error'
    default: return 'grey'
  }
}

const getConnectionIcon = (state: RTCPeerConnectionState) => {
  switch (state) {
    case 'connected': return 'mdi-check'
    case 'connecting': return 'mdi-loading'
    case 'new': return 'mdi-circle-outline'
    case 'disconnected':
    case 'failed': return 'mdi-close'
    default: return 'mdi-help'
  }
}

const getConnectionText = (state: RTCPeerConnectionState) => {
  switch (state) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting...'
    case 'new': return 'Establishing...'
    case 'disconnected': return 'Disconnected'
    case 'failed': return 'Failed'
    default: return 'Unknown'
  }
}

const isConnecting = (state: RTCPeerConnectionState) => {
  return ['connecting', 'new'].includes(state)
}

// Initialize devices on mount
onMounted(() => {
  webrtcStore.enumerateDevices()
})
</script>

<style scoped>
.gap-2 {
  gap: 8px;
}

.connection-bar {
  width: 3px;
  height: 12px;
  border-radius: 2px;
}
</style>