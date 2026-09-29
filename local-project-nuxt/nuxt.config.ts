export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  telemetry: false,
  css: ["~/assets/style.css"],
  app: { head: { title: "Orbit · Nuxt local project" } },
});
