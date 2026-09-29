<script setup>
import Dashboard from "./components/Dashboard.vue";
import DashboardProvider from "./components/DashboardProvider.vue";
import FluteProjectPreview from "./flute/ProjectPreview.vue";

const isDev = import.meta.env.DEV;
</script>

<template>
  <FluteProjectPreview :enabled="isDev">
    <DashboardProvider>
      <a class="orbit-open" href="/?flute-preview=1">Open scene library ↗</a>
      <Dashboard />
    </DashboardProvider>
  </FluteProjectPreview>
</template>
