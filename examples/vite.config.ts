import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@shashank-sharma/aperture-theme': path.resolve(__dirname, '../src'),
    },
  },
});


