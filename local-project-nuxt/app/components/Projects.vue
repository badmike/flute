<script setup>
import { inject, ref } from "vue";
const metrics = inject("orbit-metrics", ref(null));
const checked = ref([]);
const status = ["Due tomorrow", "In progress", "In review"];
const glyph = ["↗", "◐", "◌"];
</script>

<template>
  <section class="orbit-card">
    <div class="orbit-card-title">Recent projects <span class="orbit-muted">View all ↗</span></div>
    <label v-for="(name, i) in metrics?.projects ?? []" :key="name" class="orbit-project">
      <input v-model="checked" type="checkbox" :value="name" />
      <span>{{ name }}<small>{{ status[i] }}</small></span>
      <b>{{ glyph[i] }}</b>
    </label>
  </section>
</template>
