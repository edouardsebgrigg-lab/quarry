import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Files in assets/ (e.g. assets/models/truck_used.glb) are served as-is at /models/...
  publicDir: 'assets',
  build: {
    // Three.js + the Rapier physics engine make one big bundle; that's fine for a desktop game.
    chunkSizeWarningLimit: 8000,
  },
});
