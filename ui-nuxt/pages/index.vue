<script setup lang="ts">
import {useRoomStore} from "~/stores/room.store";
import RoomInfo from "~/components/RoomInfo.vue";
import RoomForm from "~/components/RoomForm.vue";
import MediaControls from "~/components/video/MediaControls.vue";
import VideoGrid from "~/components/video/VideoGrid.vue";
import ConnectionStatus from "~/components/ConnectionStatus.vue";
import ChatBox from "~/components/chat/ChatBox.vue";
import { ref, computed } from 'vue'

definePageMeta({
  title: 'WebRTC Video Streaming'
})

// Stores
const roomStore = useRoomStore()

// Local state
const chatVisible = ref(false)
const showError = ref(false)

// Computed
const isLoading = computed(() => {
  return roomStore.isCreatingRoom || roomStore.isJoiningRoom // || webrtcStore.isConnecting
})

const loadingMessage = computed(() => {
  if (roomStore.isCreatingRoom) return 'Creating room...'
  if (roomStore.isJoiningRoom) return 'Joining room...'
  // if (webrtcStore.isConnecting) return 'Setting up media...'
  return 'Loading...'
})

// Methods
const toggleChat = () => {
  chatVisible.value = !chatVisible.value
}
</script>

<template>
  <v-container fluid class="fill-height">
    <v-row class="fill-height">
      <!-- Main Content -->
      <v-col cols="12" :md="chatVisible ? 9 : 12" class="d-flex flex-column">
        <!-- Header -->
        <v-card class="mb-4" elevation="2">
          <v-card-title class="d-flex align-center justify-space-between">
            <div class="d-flex align-center gap-3">
              <v-icon color="primary" size="large">mdi-video</v-icon>
              <span class="text-h5 mr-4">WebRTC Video Streaming</span>
              <ConnectionStatus />
            </div>

            <div class="d-flex align-center gap-2">
              <!-- Chat Toggle -->
              <v-btn
                  v-if="roomStore.currentRoom"
                  :color="chatVisible ? 'primary' : 'default'"
                  variant="outlined"
                  @click="toggleChat"
                  class="mr-3"
              >
                <v-icon start>mdi-chat</v-icon>
                Chat
              </v-btn>

              <!-- Room Info -->
              <v-chip
                  v-if="roomStore.currentRoom"
                  color="success"
                  variant="outlined"
                  prepend-icon="mdi-account-group"
              >
                {{ roomStore.participants.length }} participant{{ roomStore.participants.length !== 1 ? 's' : '' }}
              </v-chip>
            </div>
          </v-card-title>
        </v-card>

        <!-- Room Management or Video Grid -->
        <div class="flex-grow-1 d-flex flex-column">
          <!-- Room Form (when not in room) -->
          <RoomForm v-if="!roomStore.currentRoom" />

          <!-- Video Interface (when in room) -->
          <div v-else class="d-flex flex-column fill-height">
            <!-- Media Controls-->
            <MediaControls class="mb-4" />

            <!-- Video Grid-->
            <VideoGrid class="flex-grow-1" />

            <!-- Room Info -->
            <RoomInfo class="mt-4" />
          </div>
        </div>
      </v-col>

      <!-- Chat Sidebar -->
      <v-col
          v-if="chatVisible && roomStore.currentRoom"
          cols="12"
          md="3"
          class="d-flex flex-column"
      >
        <ChatBox class="fill-height" />
      </v-col>
    </v-row>

    <!-- Loading Overlay -->
    <v-overlay
        :model-value="isLoading"
        class="align-center justify-center"
        persistent
    >
      <v-progress-circular
          color="primary"
          size="64"
          indeterminate
      />
      <div class="text-center mt-4">
        <div class="text-h6">{{ loadingMessage }}</div>
      </div>
    </v-overlay>
  </v-container>
</template>

<style scoped>

</style>