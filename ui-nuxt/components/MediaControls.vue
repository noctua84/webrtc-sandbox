<template>
  <v-card elevation="2">
    <v-card-text class="py-4">
      <v-row align="center">
        <!-- Media Status -->
        <v-col cols="12" md="4">
          <div class="d-flex align-center gap-2">
            <v-chip
                :color="webrtcStore.isMediaActive ? 'success' : 'default'"
                size="small"
                :prepend-icon="webrtcStore.isMediaActive ? 'mdi-video' : 'mdi-video-off'"
            >
              {{ webrtcStore.isMediaActive ? 'Media Active' : 'Media Inactive' }}
            </v-chip>

            <v-chip
                v-if="webrtcStore.isScreenSharing"
                color="info"
                size="small"
                prepend-icon="mdi-monitor-share"
            >
              Screen Share
            </v-chip>
          </div>
        </v-col>

        <!-- Primary Controls -->
        <v-col cols="12" md="4">
          <div class="d-flex justify-center gap-2">
            <!-- Start/Stop Media -->
            <v-btn
                v-if="!webrtcStore.isMediaActive"
                color="success"
                size="large"
                :loading="webrtcStore.isConnecting"
                @click="startMedia"
            >
              <v-icon start>mdi-video</v-icon>
              Start Video
            </v-btn>

            <!-- Media Toggle Controls -->
            <template v-else>
              <v-btn
                  :color="webrtcStore.hasVideo ? 'primary' : 'error'"
                  :variant="webrtcStore.hasVideo ? 'flat' : 'tonal'"
                  size="large"
                  @click="webrtcStore.toggleVideo"
              >
                <v-icon>{{ webrtcStore.hasVideo ? 'mdi-video' : 'mdi-video-off' }}</v-icon>
              </v-btn>

              <v-btn
                  :color="webrtcStore.hasAudio ? 'primary' : 'error'"
                  :variant="webrtcStore.hasAudio ? 'flat' : 'tonal'"
                  size="large"
                  @click="webrtcStore.toggleAudio"
              >
                <v-icon>{{ webrtcStore.hasAudio ? 'mdi-microphone' : 'mdi-microphone-off' }}</v-icon>
              </v-btn>
            </template>
          </div>
        </v-col>

        <!-- Secondary Controls -->
        <v-col cols="12" md="4">
          <div class="d-flex justify-end gap-2">
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
          <div class="d-flex align-center justify-space-between">
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
              @update:model-value="onDeviceChange"
          />

          <!-- Audio Device -->
          <v-select
              v-model="webrtcStore.selectedAudioDevice"
              :items="audioDeviceItems"
              label="Microphone"
              prepend-icon="mdi-microphone"
              variant="outlined"
              @update:model-value="onDeviceChange"
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDeviceSettings = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Error Snackbar -->
    <v-snackbar
        v-model="showError"
        :timeout="4000"
        color="error"
        location="bottom"
    >
      <v-icon start>mdi-alert-circle</v-icon>
      {{ errorMessage }}
    </v-snackbar>
  </v-card>
</template>

<script setup lang="ts">
// Stores
const webrtcStore = useWebRTCStore()
const roomStore = useRoomStore()

// Local state
const showDeviceSettings = ref(false)
const showError = ref(false)
const errorMessage = ref('')

// Computed
const connectedCount = computed(() => webrtcStore.connectedParticipants.length)

const otherParticipantsCount = computed(() => {
  if (!roomStore.currentParticipant) return 0
  return roomStore.participants.filter(
      p => p.socketId !== roomStore.currentParticipant?.socketId
  ).length
})

const videoDeviceItems = computed(() => [
  { title: 'Default Camera', value: null },
  ...webrtcStore.availableDevices.videoDevices.map(device => ({
    title: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
    value: device.deviceId
  }))
])

const audioDeviceItems = computed(() => [
  { title: 'Default Microphone', value: null },
  ...webrtcStore.availableDevices.audioDevices.map(device => ({
    title: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
    value: device.deviceId
  }))
])

// Methods
const startMedia = async () => {
  try {
    await webrtcStore.startMedia()
  } catch (error) {
    showErrorMessage('Failed to start media. Please check your camera and microphone permissions.')
  }
}

const stopMedia = () => {
  webrtcStore.stopMedia()
}

const toggleScreenShare = async () => {
  try {
    if (webrtcStore.isScreenSharing) {
      await webrtcStore.stopScreenShare()
    } else {
      await webrtcStore.startScreenShare()
    }
  } catch (error) {
    showErrorMessage('Failed to toggle screen share. Please try again.')
  }
}

const onDeviceChange = async () => {
  if (webrtcStore.isMediaActive) {
    try {
      // Restart media with new devices
      await webrtcStore.startMedia(webrtcStore.hasVideo, webrtcStore.hasAudio)
    } catch (error) {
      showErrorMessage('Failed to switch device. Please try again.')
    }
  }
}

const showErrorMessage = (message: string) => {
  errorMessage.value = message
  showError.value = true
}

// Initialize devices when component mounts
onMounted(async () => {
  try {
    await webrtcStore.getAvailableDevices()
  } catch (error) {
    console.error('Failed to get available devices:', error)
  }
})
</script>

<style scoped>
.gap-2 {
  gap: 8px;
}
</style>