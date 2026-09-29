import { defineConfig, mergeConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import config from './vite.config';
// Browser-only fixtures never enter the product's production build. The Vue plugin is only
// needed here: the library itself ships render functions and compiles no single-file components.
export default mergeConfig(config,defineConfig({plugins:[vue()],publicDir:'tests/preview/public',build:{outDir:'.test-dist',rollupOptions:{input:{app:'index.html',focus:'tests/fixtures/focus.html',focusVue:'tests/fixtures/focus-vue.html',preview:'tests/preview/fixture.html',previewVue:'tests/preview/fixture-vue.html'}}}}));
