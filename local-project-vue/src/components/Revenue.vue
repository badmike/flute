<script setup>
import { inject, ref } from "vue";
const metrics = inject("orbit-metrics", ref(null));
const period = ref("This month");
</script>

<template>
  <section class="orbit-card orbit-revenue">
    <div class="orbit-card-title">
      <span>Revenue overview</span>
      <button @click="period = period === 'This month' ? 'Last month' : 'This month'">{{ period }}⌄</button>
    </div>
    <h2>{{ metrics?.revenue ?? "—" }} <small>↗ 18.6%</small></h2>
    <p>Your business, moving forward.</p>
    <div class="orbit-chart">
      <div v-for="(height, i) in metrics?.bars ?? []" :key="i" :style="{ height: height + '%' }"><span>{{ i + 1 }}</span></div>
    </div>
    <footer>JUN 01 <span>JUN 30</span></footer>
  </section>
</template>
