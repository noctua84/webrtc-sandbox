<script setup lang="ts">
import {useRoomStore} from "~/stores/room.store";
import RoomInfo from "~/components/RoomInfo.vue";
import ParticipantsList from "~/components/video/ParticipantsList.vue";
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
const showError = ref(false)
const showDeviceSettings = ref(false)
const showAudioSettings = ref(false)
const showConnectionSettings = ref(false)
const showGeneralSettings = ref(false)
const isMeetingStarted = ref(false)

// Methods
const startMeeting = () => {
  isMeetingStarted.value = true
  // Could emit an event to notify other participants that meeting has started
}

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
              <!-- Start Meeting Button (host only, when meeting not started) -->
              <v-btn
                  v-if="roomStore.isRoomCreator && !isMeetingStarted"
                  color="primary"
                  variant="flat"
                  size="small"
                  @click="startMeeting"
              >
                <v-icon start size="16">mdi-play</v-icon>
                Start Meeting
              </v-btn>

              <!-- Media Controls (always visible when meeting started or not host) -->
              <template v-if="isMeetingStarted || !roomStore.isRoomCreator">
                <MediaControls compact />
              </template>
            </div>

            <!-- Right side: All Settings under gear icon -->
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

                  <v-list-item @click="showConnectionSettings = true">
                    <template #prepend>
                      <v-icon>mdi-network</v-icon>
                    </template>
                    <v-list-item-title>Connection Settings</v-list-item-title>
                  </v-list-item>

                  <v-list-item @click="showGeneralSettings = true">
                    <template #prepend>
                      <v-icon>mdi-cog-outline</v-icon>
                    </template>
                    <v-list-item-title>General Settings</v-list-item-title>
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

    <!-- Audio Settings Dialog -->
    <v-dialog v-model="showAudioSettings" max-width="500">
      <v-card>
        <v-card-title>Audio Settings</v-card-title>
        <v-card-text>
          <p>Audio settings will be implemented here</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showAudioSettings = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Connection Settings Dialog -->
    <v-dialog v-model="showConnectionSettings" max-width="500">
      <v-card>
        <v-card-title>Connection Settings</v-card-title>
        <v-card-text>
          <p>Connection settings will be implemented here</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showConnectionSettings = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- General Settings Dialog -->
    <v-dialog v-model="showGeneralSettings" max-width="500">
      <v-card>
        <v-card-title>General Settings</v-card-title>
        <v-card-text>
          <p>General settings will be implemented here</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showGeneralSettings = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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