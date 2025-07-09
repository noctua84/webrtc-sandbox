<template>
  <v-chip
      :color="statusColor"
      :variant="statusVariant"
      size="small"
      :prepend-icon="statusIcon"
  >
    {{ statusText }}
  </v-chip>
</template>

<script setup lang="ts">
// Stores
import {useSocket} from "../composables/useSocket";

const socketStore = useSocket()

// Computed
const statusColor = computed(() => {
  if (!socketStore.isConnected) return 'error'
  return 'success'
})

const statusVariant = computed(() => {
  return socketStore.isConnected ? 'flat' : 'outlined'
})

const statusIcon = computed(() => {
  if (!socketStore.isConnected) return 'mdi-wifi-off'
  return 'mdi-wifi'
})

const statusText = computed(() => {
  if (!socketStore.isConnected) return 'Disconnected'
  return 'Connected'
})
</script>