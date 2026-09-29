<script setup>
import { onBeforeUnmount, onMounted, provide, ref } from "vue";

// Metrics come from public/metrics.json through provide/inject, like any real app data provider.
const metrics = ref(null);
const error = ref(false);
provide("orbit-metrics", metrics);
const controller = new AbortController();
onMounted(() => {
  fetch("/metrics.json", { signal: controller.signal })
    .then(response => { if (!response.ok) throw Error(); return response.json(); })
    .then(value => { metrics.value = value; })
    .catch(failure => { if (failure.name !== "AbortError") error.value = true; });
});
onBeforeUnmount(() => controller.abort());
</script>

<template>
  <p v-if="error" role="alert">Metrics unavailable. Reload to retry.</p>
  <slot v-else />
</template>
