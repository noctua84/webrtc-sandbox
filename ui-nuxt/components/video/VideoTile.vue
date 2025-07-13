<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

interface Props {
  stream: MediaStream | null
  userName: string
  hasVideo?: boolean
  hasAudio?: boolean
  isScreenSharing?: boolean
  isLocal?: boolean
  connectionState?: string
}

const props = withDefaults(defineProps<Props>(), {
  hasVideo: false,
  hasAudio: false,
  isScreenSharing: false,
  isLocal: false,
  connectionState: 'no-connection'
})

// Template refs
const videoElement = ref<HTMLVideoElement>()

// Computed
const displayName = computed(() => props.isLocal ? 'You' : props.userName)

const shouldShowVideo = computed(() => {
  // Show video if we have a stream AND video is enabled AND the track exists and is enabled
  if (!props.stream || !props.hasVideo) return false

  const videoTracks = props.stream.getVideoTracks()
  if (videoTracks.length === 0) return false

  // Check if the video track is actually enabled
  return videoTracks[0].enabled
})

const cardColor = computed(() => {
  if (props.isLocal) return 'primary'
  if (props.connectionState === 'connected') return 'surface'
  if (props.connectionState === 'connecting') return 'warning'
  return 'error'
})

const cardVariant = computed(() => {
  return props.isLocal ? 'tonal' : 'outlined'
})

const avatarSize = computed(() => {
  return 64
})

const iconSize = computed(() => {
  return avatarSize.value * 0.6
})

const avatarColor = computed(() => {
  if (props.isLocal) return 'primary'
  return 'grey'
})

const statusColor = computed(() => {
  switch (props.connectionState) {
    case 'connected': return 'success'
    case 'connecting': return 'warning'
    case 'new': return 'info'
    case 'no-connection': return 'grey'
    default: return 'error'
  }
})

const statusIcon = computed(() => {
  switch (props.connectionState) {
    case 'connected': return 'mdi-check-circle'
    case 'connecting': return 'mdi-loading'
    case 'new': return 'mdi-circle-outline'
    case 'no-connection': return 'mdi-circle-off-outline'
    default: return 'mdi-alert-circle'
  }
})

const statusText = computed(() => {
  switch (props.connectionState) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting'
    case 'new': return 'New'
    case 'no-connection': return 'No Connection'
    default: return 'Failed'
  }
})

const isConnecting = computed(() => {
  return !props.isLocal && ['connecting', 'new'].includes(props.connectionState)
})

// Volume indicator (placeholder - would need audio analysis)
const volumeColor = computed(() => 'success')
const volumeIcon = computed(() => 'mdi-volume-medium')

// Setup video element with stream
const setupVideoElement = async () => {
  await nextTick()
  if (videoElement.value && props.stream) {
    console.log('Setting up video element with stream:', {
      hasVideo: props.hasVideo,
      streamTracks: props.stream.getTracks().length,
      videoTracks: props.stream.getVideoTracks().length,
      isLocal: props.isLocal
    })

    try {
      videoElement.value.srcObject = props.stream
      await videoElement.value.play()
    } catch (error) {
      console.error('Failed to play video:', error)
    }
  }
}

// Watch for stream changes
watch(() => props.stream, async (newStream, oldStream) => {
  console.log('Stream changed:', {
    newStream: !!newStream,
    oldStream: !!oldStream,
    hasVideo: props.hasVideo,
    isLocal: props.isLocal,
    userName: props.userName
  })

  if (videoElement.value) {
    if (newStream) {
      videoElement.value.srcObject = newStream
      try {
        await videoElement.value.play()
      } catch (error) {
        console.error('Failed to play video after stream change:', error)
      }
    } else {
      videoElement.value.srcObject = null
    }
  }
}, { immediate: true })

// Watch for hasVideo changes
watch(() => props.hasVideo, (newHasVideo) => {
  console.log('HasVideo changed:', {
    hasVideo: newHasVideo,
    stream: !!props.stream,
    isLocal: props.isLocal,
    userName: props.userName
  })

  if (newHasVideo && props.stream && videoElement.value) {
    setupVideoElement()
  }
})

// Set up video element when mounted
onMounted(() => {
  console.log('VideoTile mounted:', {
    hasVideo: props.hasVideo,
    stream: !!props.stream,
    isLocal: props.isLocal,
    userName: props.userName
  })

  if (props.stream && props.hasVideo) {
    setupVideoElement()
  }
})
</script>

<template>
  <v-card
      :color="cardColor"
      :variant="cardVariant"
      class="video-tile fill-height position-relative overflow-hidden"
  >
    <!-- Video Element -->
    <video
        v-show="shouldShowVideo"
        ref="videoElement"
        class="video-element"
        :muted="isLocal"
        autoplay
        playsinline
    />

    <!-- Avatar Placeholder -->
    <div
        v-show="!shouldShowVideo"
        class="avatar-placeholder d-flex align-center justify-center fill-height"
    >
      <v-avatar :size="avatarSize" :color="avatarColor">
        <v-icon :size="iconSize" color="white">
          {{ isScreenSharing ? 'mdi-monitor' : 'mdi-account' }}
        </v-icon>
      </v-avatar>

      <div class="text-center mt-3">
        <div class="text-subtitle-2 font-weight-medium">{{ displayName }}</div>
        <div v-if="!hasVideo" class="text-caption text-disabled">Camera off</div>
        <div v-else-if="!stream" class="text-caption text-disabled">Connecting...</div>
      </div>
    </div>

    <!-- Overlay Information -->
    <div class="overlay-info">
      <!-- Top Overlay: Name and Status -->
      <div class="overlay-top pa-2">
        <div class="d-flex align-center justify-between">
          <div class="d-flex align-center gap-1">
            <span class="text-white text-body-2 font-weight-medium">{{ displayName }}</span>
            <v-chip
                v-if="isLocal"
                size="x-small"
                color="primary"
                variant="flat"
            >
              You
            </v-chip>
          </div>

          <!-- Connection Status -->
          <div v-if="!isLocal" class="d-flex align-center gap-1">
            <v-icon :color="statusColor" size="16">{{ statusIcon }}</v-icon>
            <span class="text-white text-caption">{{ statusText }}</span>
          </div>
        </div>
      </div>

      <!-- Bottom Overlay: Media Controls -->
      <div class="overlay-bottom pa-2">
        <div class="d-flex align-center justify-between">
          <!-- Media Status Indicators -->
          <div class="d-flex gap-1">
            <v-btn
                :color="hasAudio ? 'success' : 'error'"
                :icon="hasAudio ? 'mdi-microphone' : 'mdi-microphone-off'"
                size="x-small"
                variant="flat"
                class="media-indicator"
                disabled
            />
            <v-btn
                :color="hasVideo ? 'success' : 'error'"
                :icon="hasVideo ? 'mdi-video' : 'mdi-video-off'"
                size="x-small"
                variant="flat"
                class="media-indicator"
                disabled
            />
            <v-btn
                v-if="isScreenSharing"
                color="info"
                icon="mdi-monitor-share"
                size="x-small"
                variant="flat"
                class="media-indicator"
                disabled
            />
          </div>

          <!-- Volume Indicator -->
          <div v-if="hasAudio && !isLocal" class="volume-indicator">
            <v-icon size="16" :color="volumeColor">
              {{ volumeIcon }}
            </v-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <v-overlay
        v-if="isConnecting"
        :model-value="true"
        contained
        class="d-flex align-center justify-center"
    >
      <div class="text-center">
        <v-progress-circular
            color="primary"
            indeterminate
            size="32"
            class="mb-2"
        />
        <div class="text-caption text-white">Connecting...</div>
      </div>
    </v-overlay>
  </v-card>
</template>

<style scoped>
.video-tile {
  border-radius: 12px;
  overflow: hidden;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
  background-color: #000;
}

.avatar-placeholder {
  background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
  border-radius: 12px;
}

.overlay-info {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
}

.overlay-top, .overlay-bottom {
  position: absolute;
  left: 0;
  right: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent);
}

.overlay-top {
  top: 0;
}

.overlay-bottom {
  bottom: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
}

.media-indicator {
  min-width: 28px;
  min-height: 28px;
  pointer-events: auto;
}

.volume-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}

.fill-height {
  height: 100%;
}
</style>