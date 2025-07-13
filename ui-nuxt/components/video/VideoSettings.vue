<template>
  <v-dialog :model-value="modelValue" max-width="600" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-video-settings</v-icon>
        Video Settings
      </v-card-title>

      <v-card-text>
        <!-- Camera Device Selection -->
        <div class="mb-4">
          <v-select
              v-if="webrtcStore.availableDevices.videoDevices.length > 0"
              :items="webrtcStore.availableDevices.videoDevices"
              item-title="label"
              item-value="deviceId"
              :model-value="webrtcStore.selectedVideoDevice"
              label="Select camera"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-video"
              @update:model-value="handleCameraChange"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="item.raw.deviceId">
                <template #prepend>
                  <v-icon>{{ item.raw.deviceId === webrtcStore.selectedVideoDevice ? 'mdi-check' : 'mdi-video' }}</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-select>

          <v-alert v-else type="warning" variant="tonal" class="mb-3">
            <v-icon start>mdi-alert</v-icon>
            No camera devices found. Please check your device connections.
          </v-alert>
        </div>

        <!-- Video Quality Settings -->
        <div class="mb-4">
          <v-select
              :items="videoQualityOptions"
              item-title="label"
              item-value="value"
              :model-value="selectedVideoQuality"
              label="Video resolution"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-monitor-screenshot"
              @update:model-value="handleQualityChange"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="item.raw.subtitle">
                <template #prepend>
                  <v-icon>mdi-monitor</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-select>
        </div>

        <!-- Frame Rate Settings -->
        <div class="mb-4">
          <v-select
              :items="frameRateOptions"
              item-title="label"
              item-value="value"
              :model-value="selectedFrameRate"
              label="Frames per second"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-speedometer"
              @update:model-value="handleFrameRateChange"
          />
        </div>

        <!-- Video Preview -->
        <div class="mb-4">
          <v-card variant="outlined" class="preview-container">
            <div class="preview-wrapper">
              <video
                  v-if="previewStream && isPreviewActive"
                  ref="previewVideo"
                  autoplay
                  muted
                  playsinline
                  class="preview-video"
              />
              <div
                  v-else
                  class="preview-placeholder d-flex align-center justify-center"
              >
                <div class="text-center">
                  <v-icon size="48" color="grey-lighten-2">mdi-video-off</v-icon>
                  <div class="text-caption text-disabled mt-2">
                    {{ isStartingPreview ? 'Starting preview...' : 'Click "Start Preview" to test camera' }}
                  </div>
                </div>
              </div>
            </div>

            <v-card-actions>
              <v-btn
                  :color="isPreviewActive ? 'error' : 'primary'"
                  variant="outlined"
                  size="small"
                  :loading="isStartingPreview"
                  @click="togglePreview"
              >
                <v-icon start>{{ isPreviewActive ? 'mdi-stop' : 'mdi-play' }}</v-icon>
                {{ isPreviewActive ? 'Stop Preview' : 'Start Preview' }}
              </v-btn>

              <v-spacer />

              <v-btn
                  v-if="isPreviewActive"
                  variant="text"
                  size="small"
                  @click="flipCamera"
              >
                <v-icon start>mdi-flip-horizontal</v-icon>
                Flip
              </v-btn>
            </v-card-actions>
          </v-card>
        </div>

        <!-- Mirror/Flip Settings -->
        <div class="mb-4">
          <v-switch
              v-model="mirrorVideo"
              label="Mirror my video (only for you)"
              color="primary"
              hide-details
              @update:model-value="handleMirrorChange"
          />
        </div>

        <!-- Refresh Devices -->
        <v-btn
            variant="outlined"
            block
            :loading="isRefreshing"
            @click="refreshDevices"
        >
          <v-icon start>mdi-refresh</v-icon>
          Refresh Video Devices
        </v-btn>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="$emit('update:modelValue', false)">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useWebRTCStore } from '@/stores/webrtc.store'

// Props & Emits
interface Props {
  modelValue: boolean
}

defineProps<Props>()
defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// Stores
const webrtcStore = useWebRTCStore()

// Local state
const isRefreshing = ref(false)
const isPreviewActive = ref(false)
const isStartingPreview = ref(false)
const previewStream = ref<MediaStream | null>(null)
const previewVideo = ref<HTMLVideoElement | null>(null)
const selectedVideoQuality = ref('720p')
const selectedFrameRate = ref(30)
const mirrorVideo = ref(true)
const isFlipped = ref(false)

// Video quality options
const videoQualityOptions = [
  {
    label: '4K (2160p)',
    value: '4k',
    subtitle: '3840×2160 - Best quality, high bandwidth',
    constraints: { width: 3840, height: 2160 }
  },
  {
    label: 'Full HD (1080p)',
    value: '1080p',
    subtitle: '1920×1080 - High quality',
    constraints: { width: 1920, height: 1080 }
  },
  {
    label: 'HD (720p)',
    value: '720p',
    subtitle: '1280×720 - Good quality, recommended',
    constraints: { width: 1280, height: 720 }
  },
  {
    label: 'SD (480p)',
    value: '480p',
    subtitle: '640×480 - Lower quality, low bandwidth',
    constraints: { width: 640, height: 480 }
  },
  {
    label: 'Low (360p)',
    value: '360p',
    subtitle: '480×360 - Lowest quality',
    constraints: { width: 480, height: 360 }
  }
]

// Frame rate options
const frameRateOptions = [
  { label: '60 FPS', value: 60 },
  { label: '30 FPS (Recommended)', value: 30 },
  { label: '24 FPS', value: 24 },
  { label: '15 FPS', value: 15 }
]

// Methods
const handleCameraChange = async (deviceId: string) => {
  try {
    await webrtcStore.switchVideoDevice(deviceId)
    if (isPreviewActive.value) {
      // Restart preview with new camera
      await stopPreview()
      await startPreview()
    }
  } catch (error) {
    console.error('Failed to switch camera:', error)
  }
}

const handleQualityChange = (quality: string) => {
  selectedVideoQuality.value = quality
  if (isPreviewActive.value) {
    // Restart preview with new quality
    restartPreview()
  }
}

const handleFrameRateChange = (frameRate: number) => {
  selectedFrameRate.value = frameRate
  if (isPreviewActive.value) {
    // Restart preview with new frame rate
    restartPreview()
  }
}

const handleMirrorChange = (enabled: boolean) => {
  mirrorVideo.value = enabled
  if (previewVideo.value) {
    previewVideo.value.style.transform = enabled ? 'scaleX(-1)' : 'none'
  }
}

const refreshDevices = async () => {
  try {
    isRefreshing.value = true
    await webrtcStore.getAvailableDevices()
  } catch (error) {
    console.error('Failed to refresh devices:', error)
  } finally {
    isRefreshing.value = false
  }
}

const togglePreview = async () => {
  if (isPreviewActive.value) {
    await stopPreview()
  } else {
    await startPreview()
  }
}

const startPreview = async () => {
  try {
    isStartingPreview.value = true

    const qualityOption = videoQualityOptions.find(q => q.value === selectedVideoQuality.value)
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: webrtcStore.selectedVideoDevice ?
            { exact: webrtcStore.selectedVideoDevice } : undefined,
        ...qualityOption?.constraints,
        frameRate: selectedFrameRate.value
      },
      audio: false // Preview doesn't need audio
    }

    previewStream.value = await navigator.mediaDevices.getUserMedia(constraints)
    isPreviewActive.value = true

    // Wait for next tick to ensure video element is rendered
    await nextTick()

    if (previewVideo.value && previewStream.value) {
      previewVideo.value.srcObject = previewStream.value
      if (mirrorVideo.value) {
        previewVideo.value.style.transform = 'scaleX(-1)'
      }
    }

  } catch (error) {
    console.error('Failed to start video preview:', error)
    isPreviewActive.value = false
  } finally {
    isStartingPreview.value = false
  }
}

const stopPreview = async () => {
  isPreviewActive.value = false

  if (previewStream.value) {
    previewStream.value.getTracks().forEach(track => track.stop())
    previewStream.value = null
  }

  if (previewVideo.value) {
    previewVideo.value.srcObject = null
  }
}

const restartPreview = async () => {
  if (isPreviewActive.value) {
    await stopPreview()
    await startPreview()
  }
}

const flipCamera = () => {
  if (previewVideo.value) {
    isFlipped.value = !isFlipped.value
    const currentTransform = previewVideo.value.style.transform
    const mirrorTransform = mirrorVideo.value ? 'scaleX(-1)' : 'none'
    const flipTransform = isFlipped.value ? 'scaleY(-1)' : 'none'

    if (mirrorVideo.value && isFlipped.value) {
      previewVideo.value.style.transform = 'scaleX(-1) scaleY(-1)'
    } else if (mirrorVideo.value) {
      previewVideo.value.style.transform = 'scaleX(-1)'
    } else if (isFlipped.value) {
      previewVideo.value.style.transform = 'scaleY(-1)'
    } else {
      previewVideo.value.style.transform = 'none'
    }
  }
}

// Watch for video element changes
watch(previewVideo, (newVideo) => {
  if (newVideo && previewStream.value) {
    newVideo.srcObject = previewStream.value
    if (mirrorVideo.value) {
      newVideo.style.transform = 'scaleX(-1)'
    }
  }
})

// Lifecycle
onMounted(() => {
  // Auto-refresh devices when dialog opens
  refreshDevices()
})

onUnmounted(() => {
  stopPreview()
})
</script>

<style scoped>
.preview-container {
  background: #000;
}

.preview-wrapper {
  position: relative;
  width: 100%;
  height: 200px;
  background: #000;
}

.preview-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}

.preview-placeholder {
  width: 100%;
  height: 100%;
  background: #f5f5f5;
}
</style>