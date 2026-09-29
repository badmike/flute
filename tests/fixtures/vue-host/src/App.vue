<script setup lang="ts">
import { ref } from "vue";
const count = ref(0);
</script>

<template>
  <main>
    <h1>Existing Vue host</h1>
    <button @click="count++">Count {{ count }}</button>
  </main>
</template>
