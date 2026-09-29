<script setup>
import { Surface } from "@webprodigies/flute/vue";
import Customers from "./Customers.vue";
import DashboardProvider from "./DashboardProvider.vue";
import Heading from "./Heading.vue";
import Projects from "./Projects.vue";
import Revenue from "./Revenue.vue";
import Sidebar from "./Sidebar.vue";

const at = (left, top, width, height) => ({ position: "absolute", left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
</script>

<!-- The dashboard backdrop lives in the named content slot; the five live regions are separate depth layers. -->
<template>
  <DashboardProvider>
    <Surface id="dashboard" :style="{ width: '1400px', height: '900px' }">
      <template #content>
        <div class="orbit-dashboard" :style="{ position: 'absolute', left: '0px', top: '0px', borderRadius: '24px' }" />
      </template>
      <Surface id="sidebar" :style="at(0, 0, 230, 900)"><div :style="{ height: '900px', display: 'flex' }"><Sidebar /></div></Surface>
      <Surface id="heading" :style="at(270, 40, 1090, 126)"><Heading /></Surface>
      <Surface id="revenue" :style="at(270, 210, 628, 505)"><Revenue /></Surface>
      <Surface id="customers" :style="at(922, 210, 438, 230)"><Customers /></Surface>
      <Surface id="projects" :style="at(922, 464, 438, 300)"><Projects /></Surface>
    </Surface>
  </DashboardProvider>
</template>
