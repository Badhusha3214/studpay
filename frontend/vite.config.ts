import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Stub the NFC plugin on web — Capacitor loads the real one at runtime
      '@capgo/capacitor-nfc': path.resolve(__dirname, './src/composables/nfc-stub.ts'),
    },
  },
  server: {
    port: 5174,
  },
});
