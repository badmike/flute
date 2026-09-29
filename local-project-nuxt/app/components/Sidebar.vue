<script setup>
import { ref } from "vue";
const items = ["Overview", "Analytics", "Customers", "Projects", "Messages", "Settings"];
const icons = ["◫", "▥", "◎", "▤", "◌", "⚙"];
const active = ref("Overview");
</script>

<template>
  <aside class="orbit-sidebar">
    <div class="orbit-logo">◒ <strong>orbit</strong></div>
    <span class="orbit-label">WORKSPACE</span>
    <nav>
      <button v-for="(label, i) in items" :key="label" :class="{ active: active === label }" @click="active = label">
        <span>{{ icons[i] }}</span>{{ label }}
      </button>
    </nav>
    <div class="orbit-person"><span>AM</span><div>Alex Morgan<small>Personal workspace</small></div></div>
  </aside>
</template>
