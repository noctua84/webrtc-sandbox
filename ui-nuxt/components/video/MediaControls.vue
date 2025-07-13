<script setup lang="ts">
import { useWebRTCStore } from "~/stores/webrtc.store";
import { useRoomStore } from "~/stores/room.store";
import { ref, computed, onMounted } from 'vue'

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

// Local state
const showDeviceSettings = ref(false)
const isStartingMedia = ref(false)

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

// Methods
const startMedia = async () => {
  try {
    isStartingMedia.value = true
    await webrtcStore.startMedia()
  } catch (error) {
    console.error('Failed to start media:', error)
  } finally {
    isStartingMedia.value = false
  }
}

const stopMedia = async () => {
  try {
    await webrtcStore.stopMedia()
  } catch (error) {
    console.error('Failed to stop media:', error)
  }
}

const toggleVideo = async () => {
  try {
    if (!webrtcStore.isMediaActive) {
      await webrtcStore.startMedia(true, false)
    } else {
      await webrtcStore.toggleVideo()
    }
  } catch (error) {
    console.error('Failed to toggle video:', error)
  }
}

const toggleAudio = async () => {
  try {
    if (!webrtcStore.isMediaActive) {
      // Start with audio only
      await webrtcStore.startMedia(false, true)
    } else {
      await webrtcStore.toggleAudio()
    }
  } catch (error) {
    console.error('Failed to toggle audio:', error)
  }
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

<template>
  <!-- Compact Mode for Header Bar -->
  <div v-if="compact" class="d-flex align-center gap-2">
    <!-- Video Toggle (always available) -->
    <v-btn
        :color="webrtcStore.hasVideo ? 'success' : 'error'"
        :variant="webrtcStore.hasVideo ? 'outlined' : 'flat'"
        size="small"
        @click="toggleVideo"
    >
      <v-icon size="16">{{ webrtcStore.hasVideo ? 'mdi-video' : 'mdi-video-off' }}</v-icon>
      <v-tooltip activator="parent" location="bottom">
        {{ webrtcStore.hasVideo ? 'Turn Off Video' : 'Turn On Video' }}
      </v-tooltip>
    </v-btn>

    <!-- Audio Toggle (always available) -->
    <v-btn
        :color="webrtcStore.hasAudio ? 'success' : 'error'"
        :variant="webrtcStore.hasAudio ? 'outlined' : 'flat'"
        size="small"
        @click="toggleAudio"
    >
      <v-icon size="16">{{ webrtcStore.hasAudio ? 'mdi-microphone' : 'mdi-microphone-off' }}</v-icon>
      <v-tooltip activator="parent" location="bottom">
        {{ webrtcStore.hasAudio ? 'Mute' : 'Unmute' }}
      </v-tooltip>
    </v-btn>

    <!-- Screen Share (always available) -->
    <v-btn
        :color="webrtcStore.isScreenSharing ? 'info' : 'default'"
        :variant="webrtcStore.isScreenSharing ? 'flat' : 'outlined'"
        size="small"
        :loading="webrtcStore.isConnecting"
        @click="toggleScreenShare"
    >
      <v-icon size="16">mdi-monitor-share</v-icon>
      <v-tooltip activator="parent" location="bottom">
        {{ webrtcStore.isScreenSharing ? 'Stop Share' : 'Share Screen' }}
      </v-tooltip>
    </v-btn>

    <!-- Connection Status Indicator -->
    <div v-if="connectedCount > 0" class="d-flex align-center gap-1 px-2">
      <v-icon size="16" color="success">mdi-connection</v-icon>
      <span class="text-caption text-success">{{ connectedCount }}</span>
    </div>
  </div>

  <!-- Full Mode (Original) -->
  <v-card v-else elevation="2" class="ma-2">
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

<style scoped>
.min-width-fit {
  min-width: fit-content;
}
</style>