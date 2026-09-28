import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Three.js + the Rapier physics engine make one big bundle; that's fine for a desktop game.
    chunkSizeWarningLimit: 8000,
  },
});
