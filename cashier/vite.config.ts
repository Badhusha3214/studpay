import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@capgo/capacitor-nfc': path.resolve(__dirname, './src/composables/nfc-stub.ts'),
    },
  },
  server: {
    port: 5175,
  },
});
