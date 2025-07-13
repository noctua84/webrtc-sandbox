<template>
  <v-app>
    <v-app-bar color="primary" dark>
      <v-app-bar-title>
        <v-icon icon="mdi-wifi" class="mr-2"></v-icon>
        Video Streaming App
      </v-app-bar-title>
    </v-app-bar>

    <v-main>
      <slot />
    </v-main>
  </v-app>
</template>