<script setup>
import Dashboard from "~/components/Dashboard.vue";
import DashboardProvider from "~/components/DashboardProvider.vue";
</script>

<template>
  <DashboardProvider>
    <a class="orbit-open" href="/flute?flute-preview=1">Open scene library ↗</a>
    <Dashboard />
  </DashboardProvider>
</template>
