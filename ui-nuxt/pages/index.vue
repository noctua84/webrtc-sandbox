<script setup lang="ts">
import { useRoomStore } from "~/stores/room.store"
import RoomInfo from "~/components/RoomInfo.vue"
import ParticipantsList from "~/components/video/ParticipantsList.vue"
import RoomForm from "~/components/RoomForm.vue"
import MediaControls from "~/components/video/MediaControls.vue"
import VideoGrid from "~/components/video/VideoGrid.vue"
import ConnectionStatus from "~/components/ConnectionStatus.vue"
import ChatBox from "~/components/chat/ChatBox.vue"
import AudioSettings from "~/components/video/AudioSettings.vue"
import VideoSettings from "~/components/video/VideoSettings.vue"
import { ref, computed } from 'vue'

definePageMeta({
  title: 'WebRTC Video Streaming'
})

// Stores
const roomStore = useRoomStore()

// Local state
const showDeviceSettings = ref(false)
const showAudioSettings = ref(false)
const showVideoSettings = ref(false)

// Computed
const isLoading = computed(() => {
  return roomStore.isCreatingRoom || roomStore.isJoiningRoom
})

const loadingMessage = computed(() => {
  if (roomStore.isCreatingRoom) return 'Creating room...'
  if (roomStore.isJoiningRoom) return 'Joining room...'
  return 'Loading...'
})
</script>

<template>
  <v-container fluid class="fill-height pa-0">
    <!-- Header -->
    <v-app-bar color="surface" elevation="2" density="compact">
      <template v-slot:prepend>
        <div class="d-flex align-center gap-3 ml-4">
          <v-icon color="primary" size="large">mdi-video</v-icon>
          <span class="text-h6 mr-4">WebRTC Video Streaming</span>
          <ConnectionStatus />
        </div>
      </template>
    </v-app-bar>

    <!-- Main Content Area -->
    <v-main class="fill-height">
      <div class="fill-height d-flex flex-column">
        <!-- Room Form (when not in room) -->
        <RoomForm v-if="!roomStore.currentRoom" class="fill-height" />

        <!-- Video Interface Layout (when in room) -->
        <div v-else class="fill-height d-flex flex-column">
          <!-- Controls Header Bar -->
          <v-card flat class="px-4 py-2 d-flex align-center justify-space-between" elevation="1">
            <!-- Left side: Media Controls -->
            <div class="d-flex align-center gap-2">
              <!-- Always show media controls when in room -->
              <MediaControls compact />
            </div>

            <!-- Right side: Settings -->
            <div class="d-flex align-center gap-2">
              <v-menu location="bottom">
                <template #activator="{ props }">
                  <v-btn
                      v-bind="props"
                      variant="outlined"
                      size="small"
                      icon
                  >
                    <v-icon>mdi-cog</v-icon>
                    <v-tooltip activator="parent" location="bottom">Settings</v-tooltip>
                  </v-btn>
                </template>

                <v-list>
                  <v-list-item @click="showDeviceSettings = true">
                    <template #prepend>
                      <v-icon>mdi-video-settings</v-icon>
                    </template>
                    <v-list-item-title>Device Settings</v-list-item-title>
                  </v-list-item>

                  <v-list-item @click="showAudioSettings = true">
                    <template #prepend>
                      <v-icon>mdi-tune</v-icon>
                    </template>
                    <v-list-item-title>Audio Settings</v-list-item-title>
                  </v-list-item>

                  <v-list-item @click="showVideoSettings = true">
                    <template #prepend>
                      <v-icon>mdi-video-settings</v-icon>
                    </template>
                    <v-list-item-title>Video Settings</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </div>
          </v-card>

          <!-- Main Content Row - Takes full remaining height -->
          <div class="flex-grow-1 d-flex">
            <!-- Left Sidebar: Participants List -->
            <div class="participants-sidebar">
              <ParticipantsList class="fill-height" />
            </div>

            <!-- Center Column: Video Grid + Chat - Takes all remaining space -->
            <div class="flex-grow-1 d-flex flex-column pa-4">
              <!-- Video Grid and Chat Row - Takes most space -->
              <div class="flex-grow-1 d-flex gap-4 mb-4">
                <!-- Video Grid - Takes remaining space -->
                <div class="flex-grow-1">
                  <VideoGrid class="fill-height" />
                </div>

                <!-- Chat Box - Fixed width -->
                <div class="chat-sidebar">
                  <ChatBox class="fill-height" />
                </div>
              </div>

              <!-- Room Info Footer - Fixed height -->
              <RoomInfo compact />
            </div>
          </div>
        </div>
      </div>
    </v-main>

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

    <!-- Settings Dialogs -->
    <MediaControls
        v-if="showDeviceSettings"
        :show-dialog="showDeviceSettings"
        @close="showDeviceSettings = false"
    />

    <AudioSettings
        v-model="showAudioSettings"
    />

    <VideoSettings
        v-model="showVideoSettings"
    />
  </v-container>
</template>

<style scoped>
/* Ensure proper height inheritance */
.fill-height {
  height: 100% !important;
}

/* Custom styling for compact layout */
.v-main {
  padding-top: 64px !important; /* Account for app bar */
}

/* Sidebar sizing */
.participants-sidebar {
  width: 280px;
  background-color: rgb(var(--v-theme-surface));
  border-right: 1px solid rgba(var(--v-theme-outline), 0.2);
}

.chat-sidebar {
  width: 350px;
}

/* Ensure video grid takes remaining space */
.flex-grow-1 {
  flex-grow: 1;
  min-width: 0; /* Important for flex items with text overflow */
}
</style>