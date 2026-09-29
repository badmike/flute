<script setup>
import { Surface } from "@webprodigies/flute/vue";
import Dashboard from "./Dashboard.vue";
import DashboardProvider from "./DashboardProvider.vue";
</script>

<!-- One live Surface around the real dashboard: providers, state and events stay in the original tree. -->
<template>
  <DashboardProvider>
    <Surface id="dashboard" :style="{ width: '1400px', height: '900px' }"><Dashboard /></Surface>
  </DashboardProvider>
</template>
