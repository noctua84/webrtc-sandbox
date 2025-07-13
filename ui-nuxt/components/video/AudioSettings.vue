<template>
  <v-dialog :model-value="modelValue" max-width="500" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-tune</v-icon>
        Audio Settings
      </v-card-title>

      <v-card-text>
        <!-- Microphone Device Selection -->
        <div class="mb-4">
          <v-select
              v-if="webrtcStore.availableDevices.audioDevices.length > 0"
              :items="webrtcStore.availableDevices.audioDevices"
              item-title="label"
              item-value="deviceId"
              :model-value="webrtcStore.selectedAudioDevice"
              label="Select microphone"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-microphone"
              @update:model-value="handleMicrophoneChange"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="item.raw.deviceId">
                <template #prepend>
                  <v-icon>{{ item.raw.deviceId === webrtcStore.selectedAudioDevice ? 'mdi-check' : 'mdi-microphone' }}</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-select>

          <v-alert v-else type="warning" variant="tonal" class="mb-3">
            <v-icon start>mdi-alert</v-icon>
            No microphone devices found. Please check your device connections.
          </v-alert>
        </div>

        <!-- Speaker/Output Device Selection -->
        <div class="mb-4">
          <v-select
              v-if="availableOutputDevices.length > 0"
              :items="availableOutputDevices"
              item-title="label"
              item-value="deviceId"
              :model-value="selectedOutputDevice"
              label="Select speaker/headphones"
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-volume-high"
              @update:model-value="handleOutputDeviceChange"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="item.raw.deviceId">
                <template #prepend>
                  <v-icon>{{ item.raw.deviceId === selectedOutputDevice ? 'mdi-check' : 'mdi-volume-high' }}</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-select>

          <v-alert v-else type="info" variant="tonal" class="mb-3">
            <v-icon start>mdi-information</v-icon>
            Output device selection is limited by browser security. Default system output will be used.
          </v-alert>
        </div>

        <!-- Audio Test Controls -->
        <div class="mb-4">
          <div class="d-flex gap-2 align-center">
            <v-btn
                :color="isTesting ? 'error' : 'primary'"
                variant="outlined"
                size="small"
                :loading="isStartingTest"
                @click="toggleAudioTest"
            >
              <v-icon start>{{ isTesting ? 'mdi-stop' : 'mdi-play' }}</v-icon>
              {{ isTesting ? 'Stop Test' : 'Test Microphone' }}
            </v-btn>

            <!-- Audio Level Indicator -->
            <div v-if="isTesting" class="flex-grow-1">
              <v-progress-linear
                  :model-value="audioLevel"
                  color="success"
                  height="8"
                  rounded
                  bg-color="grey-lighten-3"
              />
              <div class="text-caption text-center mt-1">
                {{ Math.round(audioLevel) }}% volume
              </div>
            </div>
          </div>
        </div>

        <!-- Refresh Devices -->
        <v-btn
            variant="outlined"
            block
            :loading="isRefreshing"
            @click="refreshDevices"
        >
          <v-icon start>mdi-refresh</v-icon>
          Refresh Audio Devices
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
const isTesting = ref(false)
const isStartingTest = ref(false)
const audioLevel = ref(0)
const selectedOutputDevice = ref<string>('')
const availableOutputDevices = ref<MediaDeviceInfo[]>([])
const testAudioContext = ref<AudioContext | null>(null)
const testAnalyzer = ref<AnalyserNode | null>(null)
const testStream = ref<MediaStream | null>(null)
const animationFrame = ref<number>(0)

// Methods
const handleMicrophoneChange = async (deviceId: string) => {
  try {
    await webrtcStore.switchAudioDevice(deviceId)
  } catch (error) {
    console.error('Failed to switch microphone:', error)
  }
}

const handleOutputDeviceChange = async (deviceId: string) => {
  selectedOutputDevice.value = deviceId
  // Note: Setting audio output device programmatically is limited in browsers
  // This would typically require using HTMLMediaElement.setSinkId() on audio elements
  // For now, we just store the preference
  console.log('Output device selected:', deviceId)
}

const refreshDevices = async () => {
  try {
    isRefreshing.value = true
    await webrtcStore.getAvailableDevices()
    await getOutputDevices()
  } catch (error) {
    console.error('Failed to refresh devices:', error)
  } finally {
    isRefreshing.value = false
  }
}

const getOutputDevices = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    availableOutputDevices.value = devices.filter(device => device.kind === 'audiooutput')
  } catch (error) {
    console.error('Failed to get output devices:', error)
    availableOutputDevices.value = []
  }
}

const toggleAudioTest = async () => {
  if (isTesting.value) {
    stopAudioTest()
  } else {
    await startAudioTest()
  }
}

const startAudioTest = async () => {
  try {
    isStartingTest.value = true

    // Get audio stream with selected microphone
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: webrtcStore.selectedAudioDevice ?
            { exact: webrtcStore.selectedAudioDevice } : undefined
      }
    }

    testStream.value = await navigator.mediaDevices.getUserMedia(constraints)

    // Set up audio analysis
    testAudioContext.value = new AudioContext()
    testAnalyzer.value = testAudioContext.value.createAnalyser()
    testAnalyzer.value.fftSize = 256

    const source = testAudioContext.value.createMediaStreamSource(testStream.value)
    source.connect(testAnalyzer.value)

    isTesting.value = true
    startAudioLevelMonitoring()

  } catch (error) {
    console.error('Failed to start audio test:', error)
  } finally {
    isStartingTest.value = false
  }
}

const stopAudioTest = () => {
  isTesting.value = false
  audioLevel.value = 0

  if (animationFrame.value) {
    cancelAnimationFrame(animationFrame.value)
    animationFrame.value = 0
  }

  if (testStream.value) {
    testStream.value.getTracks().forEach(track => track.stop())
    testStream.value = null
  }

  if (testAudioContext.value) {
    testAudioContext.value.close()
    testAudioContext.value = null
  }

  testAnalyzer.value = null
}

const startAudioLevelMonitoring = () => {
  if (!testAnalyzer.value || !isTesting.value) return

  const bufferLength = testAnalyzer.value.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  const updateLevel = () => {
    if (!testAnalyzer.value || !isTesting.value) return

    testAnalyzer.value.getByteFrequencyData(dataArray)

    // Calculate average volume level
    let sum = 0
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i]
    }
    const average = sum / bufferLength
    audioLevel.value = (average / 255) * 100

    animationFrame.value = requestAnimationFrame(updateLevel)
  }

  updateLevel()
}

// Lifecycle
onMounted(() => {
  getOutputDevices()
})

onUnmounted(() => {
  stopAudioTest()
})
</script>