<script setup>
import { inject, ref } from "vue";
const metrics = inject("orbit-metrics", ref(null));
</script>

<template>
  <section class="orbit-card">
    <span class="orbit-muted">Total customers</span>
    <h2>{{ metrics?.customers ?? "—" }}</h2>
    <span class="orbit-positive">↗ 12.8% this month</span>
    <div class="orbit-avatars"><span v-for="t in ['JL', 'KM', 'AS', 'TW', '+8k']" :key="t">{{ t }}</span></div>
  </section>
</template>
