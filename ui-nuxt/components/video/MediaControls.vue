<template>
  <!-- Compact Mode for Header Bar -->
  <div v-if="compact" class="d-flex align-center gap-2">
    <!-- Start Media Button (when no media active) -->
    <v-btn
        v-if="!webrtcStore.isMediaActive"
        color="primary"
        variant="flat"
        size="small"
        :loading="webrtcStore.isConnecting"
        @click="handleStartMedia"
    >
      <v-icon start size="16">mdi-microphone</v-icon>
      Start Media
    </v-btn>

    <!-- Video Toggle (when media active) -->
    <v-btn
        v-else
        :color="webrtcStore.hasVideo ? 'success' : 'error'"
        :variant="webrtcStore.hasVideo ? 'outlined' : 'flat'"
        size="small"
        @click="handleToggleVideo"
        class="mr-1"
    >
      <v-icon size="16">{{ webrtcStore.hasVideo ? 'mdi-video' : 'mdi-video-off' }}</v-icon>
      <v-tooltip activator="parent" location="bottom">
        {{ webrtcStore.hasVideo ? 'Turn Off Video' : 'Turn On Video' }}
      </v-tooltip>
    </v-btn>

    <!-- Audio Toggle (when media active) -->
    <v-btn
        v-if="webrtcStore.isMediaActive"
        :color="webrtcStore.hasAudio ? 'success' : 'error'"
        :variant="webrtcStore.hasAudio ? 'outlined' : 'flat'"
        size="small"
        @click="handleToggleAudio"
        class="mr-1"
    >
      <v-icon size="16">{{ webrtcStore.hasAudio ? 'mdi-microphone' : 'mdi-microphone-off' }}</v-icon>
      <v-tooltip activator="parent" location="bottom">
        {{ webrtcStore.hasAudio ? 'Mute' : 'Unmute' }}
      </v-tooltip>
    </v-btn>

    <!-- Screen Share Toggle (when media active) -->
    <v-btn
        v-if="webrtcStore.isMediaActive"
        :color="webrtcStore.isScreenSharing ? 'info' : 'default'"
        :variant="webrtcStore.isScreenSharing ? 'flat' : 'outlined'"
        size="small"
        :loading="webrtcStore.isConnecting"
        @click="handleToggleScreenShare"
        class="mr-1"
    >
      <v-icon size="16">mdi-monitor-share</v-icon>
      <v-tooltip activator="parent" location="bottom">
        {{ webrtcStore.isScreenSharing ? 'Stop Share' : 'Share Screen' }}
      </v-tooltip>
    </v-btn>

    <!-- Stop Media Button (when media active) -->
    <v-btn
        v-if="webrtcStore.isMediaActive"
        color="error"
        variant="outlined"
        size="small"
        @click="handleStopMedia"
    >
      <v-icon size="16">mdi-stop</v-icon>
      <v-tooltip activator="parent" location="bottom">Stop Media</v-tooltip>
    </v-btn>

    <!-- Connection Status Indicator -->
    <div v-if="connectedCount > 0" class="d-flex align-center gap-1 px-2">
      <v-icon size="16" color="success">mdi-connection</v-icon>
      <span class="text-caption text-success">{{ connectedCount }}</span>
    </div>
  </div>

  <!-- Full Mode -->
  <v-card v-else elevation="2" class="ma-2">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-microphone-settings</v-icon>
      Media Controls
    </v-card-title>

    <v-card-text>
      <!-- Main Controls -->
      <v-row class="mb-3">
        <v-col cols="12">
          <!-- Start Media Button -->
          <div v-if="!webrtcStore.isMediaActive" class="d-flex gap-2 flex-wrap mb-3">
            <v-btn
                color="primary"
                variant="flat"
                :loading="webrtcStore.isConnecting"
                @click="handleStartMedia"
            >
              <v-icon start>mdi-microphone</v-icon>
              Join Audio
            </v-btn>

            <v-btn
                color="blue"
                variant="outlined"
                :loading="webrtcStore.isConnecting"
                @click="handleStartScreenShare"
            >
              <v-icon start>mdi-monitor-share</v-icon>
              Start Screen Share
            </v-btn>
          </div>

          <!-- Media Toggle Controls -->
          <div v-else class="d-flex gap-2 flex-wrap">
            <!-- Video Toggle -->
            <v-btn
                :color="webrtcStore.hasVideo ? 'success' : 'error'"
                :variant="webrtcStore.hasVideo ? 'outlined' : 'flat'"
                @click="handleToggleVideo"
            >
              <v-icon start>{{ webrtcStore.hasVideo ? 'mdi-video' : 'mdi-video-off' }}</v-icon>
              {{ webrtcStore.hasVideo ? 'Camera On' : 'Camera Off' }}
            </v-btn>

            <!-- Audio Toggle -->
            <v-btn
                :color="webrtcStore.hasAudio ? 'success' : 'error'"
                :variant="webrtcStore.hasAudio ? 'outlined' : 'flat'"
                @click="handleToggleAudio"
            >
              <v-icon start>{{ webrtcStore.hasAudio ? 'mdi-microphone' : 'mdi-microphone-off' }}</v-icon>
              {{ webrtcStore.hasAudio ? 'Mic On' : 'Mic Off' }}
            </v-btn>

            <!-- Screen Share Toggle -->
            <v-btn
                :color="webrtcStore.isScreenSharing ? 'info' : 'default'"
                :variant="webrtcStore.isScreenSharing ? 'flat' : 'outlined'"
                :loading="webrtcStore.isConnecting"
                @click="handleToggleScreenShare"
            >
              <v-icon start>mdi-monitor-share</v-icon>
              {{ webrtcStore.isScreenSharing ? 'Stop Share' : 'Share Screen' }}
            </v-btn>

            <!-- Stop All Media -->
            <v-btn
                color="error"
                variant="outlined"
                @click="handleStopMedia"
            >
              <v-icon start>mdi-stop</v-icon>
              Stop Media
            </v-btn>
          </div>
        </v-col>
      </v-row>

      <!-- Connection Status -->
      <v-row v-if="otherParticipantsCount > 0">
        <v-col cols="12">
          <div class="d-flex align-center justify-space-between mb-2">
            <div class="text-body-2 text-medium-emphasis">
              Connected: {{ connectedCount }}/{{ otherParticipantsCount }} participant{{ otherParticipantsCount === 1 ? '' : 's' }}
            </div>

            <v-btn
                v-if="otherParticipantsCount > connectedCount"
                color="primary"
                variant="outlined"
                size="small"
                @click="webrtcStore.connectToAllParticipants()"
            >
              <v-icon start size="16">mdi-refresh</v-icon>
              Reconnect All
            </v-btn>
          </div>

          <!-- Connection Progress -->
          <div class="d-flex align-center gap-2">
            <v-progress-linear
                :model-value="connectionProgress"
                :color="connectionProgress === 100 ? 'success' : 'primary'"
                height="6"
                rounded
            />
            <span class="text-caption text-medium-emphasis min-width-fit">
              {{ connectionProgress }}%
            </span>
          </div>
        </v-col>
      </v-row>
    </v-card-text>

    <!-- Device Settings Dialog (when used as standalone dialog) -->
    <v-dialog v-if="showDialog" :model-value="showDialog" max-width="500" @update:model-value="emit('close')">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon start>mdi-cog</v-icon>
          Device Settings
        </v-card-title>

        <v-card-text>
          <!-- Audio Devices -->
          <v-select
              v-if="webrtcStore.availableDevices.audioDevices.length > 0"
              :items="webrtcStore.availableDevices.audioDevices"
              item-title="label"
              item-value="deviceId"
              :model-value="webrtcStore.selectedAudioDevice"
              label="Microphone"
              variant="outlined"
              density="compact"
              class="mb-3"
              @update:model-value="switchAudioDevice"
          />

          <!-- Video Devices -->
          <v-select
              v-if="webrtcStore.availableDevices.videoDevices.length > 0"
              :items="webrtcStore.availableDevices.videoDevices"
              item-title="label"
              item-value="deviceId"
              :model-value="webrtcStore.selectedVideoDevice"
              label="Camera"
              variant="outlined"
              density="compact"
              class="mb-3"
              @update:model-value="switchVideoDevice"
          />

          <!-- Refresh Devices -->
          <v-btn
              variant="outlined"
              block
              @click="refreshDevices"
              class="mb-3"
          >
            <v-icon start>mdi-refresh</v-icon>
            Refresh Devices
          </v-btn>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="emit('close')">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useWebRTCStore } from '@/stores/webrtc.store'
import { useRoomStore } from '@/stores/room.store'

// Props
interface Props {
  compact?: boolean
  showDialog?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  showDialog: false
})

// Emits
const emit = defineEmits<{
  close: []
}>()

// Stores
const webrtcStore = useWebRTCStore()
const roomStore = useRoomStore()

// Computed
const connectedCount = computed(() => {
  return webrtcStore.connectedParticipants.length
})

const otherParticipantsCount = computed(() => {
  return roomStore.participants.filter(p =>
      p.socketId !== roomStore.currentParticipant?.socketId
  ).length
})

const connectionProgress = computed(() => {
  if (otherParticipantsCount.value === 0) return 100
  return Math.round((connectedCount.value / otherParticipantsCount.value) * 100)
})

// Methods that match React app exactly
const handleStartMedia = async () => {
  try {
    // Start with camera OFF by default, microphone ON
    await webrtcStore.startMedia(false, true)

    // Auto-connect to existing participants (matches React app)
    if (otherParticipantsCount.value > 0) {
      await webrtcStore.connectToAllParticipants()
    }
  } catch (error) {
    console.error('Failed to start media:', error)
  }
}

const handleStartScreenShare = async () => {
  try {
    await webrtcStore.startScreenShare()
  } catch (error) {
    console.error('Failed to start screen share:', error)
  }
}

const handleStopMedia = () => {
  webrtcStore.stopMedia()
}

const handleToggleVideo = () => {
  webrtcStore.toggleVideo()
}

const handleToggleAudio = () => {
  webrtcStore.toggleAudio()
}

const handleToggleScreenShare = async () => {
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
    await webrtcStore.getAvailableDevices()
  } catch (error) {
    console.error('Failed to refresh devices:', error)
  }
}

const switchVideoDevice = async (deviceId: string) => {
  try {
    await webrtcStore.switchVideoDevice(deviceId)
  } catch (error) {
    console.error('Failed to switch video device:', error)
  }
}

const switchAudioDevice = async (deviceId: string) => {
  try {
    await webrtcStore.switchAudioDevice(deviceId)
  } catch (error) {
    console.error('Failed to switch audio device:', error)
  }
}

// Initialize devices on mount
onMounted(() => {
  webrtcStore.getAvailableDevices()
})
</script>

<style scoped>
.min-width-fit {
  min-width: fit-content;
}
</style>