<script setup>
import Customers from "./Customers.vue";
import Heading from "./Heading.vue";
import Projects from "./Projects.vue";
import Revenue from "./Revenue.vue";
import Sidebar from "./Sidebar.vue";
</script>

<template>
  <div class="orbit-dashboard">
    <Sidebar />
    <main class="orbit-main">
      <Heading />
      <div class="orbit-grid">
        <Revenue />
        <div class="orbit-side"><Customers /><Projects /></div>
      </div>
    </main>
  </div>
</template>
