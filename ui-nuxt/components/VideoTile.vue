<template>
  <v-card
      :color="cardColor"
      :variant="cardVariant"
      class="video-tile fill-height position-relative overflow-hidden"
  >
    <!-- Video Element -->
    <video
        v-if="hasVideo && stream"
        ref="videoElement"
        class="video-element"
        :muted="isLocal"
        autoplay
        playsinline
    />

    <!-- Avatar Placeholder -->
    <div
        v-else
        class="avatar-placeholder d-flex align-center justify-center fill-height"
    >
      <v-avatar :size="avatarSize" :color="avatarColor">
        <v-icon :size="iconSize" color="white">
          {{ isScreenSharing ? 'mdi-monitor' : 'mdi-account' }}
        </v-icon>
      </v-avatar>
    </div>

    <!-- Overlay Information -->
    <v-overlay
        :model-value="true"
        contained
        class="overlay-info"
        opacity="0"
    >
      <!-- Top Bar -->
      <div class="overlay-top d-flex align-center justify-space-between pa-2">
        <!-- User Name -->
        <v-chip
            :color="isLocal ? 'primary' : 'default'"
            size="small"
            class="font-weight-medium"
        >
          <v-icon v-if="isLocal" start size="16">mdi-account-circle</v-icon>
          {{ displayName }}
        </v-chip>

        <!-- Connection Status -->
        <v-chip
            v-if="!isLocal"
            :color="statusColor"
            size="x-small"
            :prepend-icon="statusIcon"
        >
          {{ statusText }}
        </v-chip>
      </div>

      <!-- Bottom Bar -->
      <div class="overlay-bottom d-flex align-center justify-space-between pa-2">
        <!-- Media Status -->
        <div class="d-flex gap-1">
          <v-btn
              :color="hasAudio ? 'success' : 'error'"
              :icon="hasAudio ? 'mdi-microphone' : 'mdi-microphone-off'"
              size="x-small"
              variant="flat"
              class="media-indicator"
          />
          <v-btn
              :color="hasVideo ? 'success' : 'error'"
              :icon="hasVideo ? 'mdi-video' : 'mdi-video-off'"
              size="x-small"
              variant="flat"
              class="media-indicator"
          />
          <v-btn
              v-if="isScreenSharing"
              color="info"
              icon="mdi-monitor-share"
              size="x-small"
              variant="flat"
              class="media-indicator"
          />
        </div>

        <!-- Volume Indicator -->
        <div v-if="hasAudio && !isLocal" class="volume-indicator">
          <v-icon size="16" :color="volumeColor">
            {{ volumeIcon }}
          </v-icon>
        </div>
      </div>
    </v-overlay>

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
        <div class="text-caption">Connecting...</div>
      </div>
    </v-overlay>
  </v-card>
</template>

<script setup lang="ts">
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
  // Responsive avatar size based on tile size
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

// Watch for stream changes
watch(() => props.stream, (newStream) => {
  if (videoElement.value && newStream) {
    videoElement.value.srcObject = newStream
  }
}, { immediate: true })

// Set up video element when mounted
onMounted(() => {
  if (videoElement.value && props.stream) {
    videoElement.value.srcObject = props.stream
  }
})
</script>

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
  background-color: #f0f0f0;
  border-radius: 12px;
}
.overlay-info {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}
.overlay-top, .overlay-bottom {
  position: absolute;
  left: 0;
  right: 0;
}
.overlay-top {
  top: 0;
  background: rgba(0, 0, 0, 0.5);
}
.overlay-bottom {
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}
.media-indicator {
  min-width: 32px;
  min-height: 32px;
}
.volume-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}
.video-tile {
  position: relative;
  overflow: hidden;
}
.fill-height {
  height: 100%;
}
</style>
