import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the same image works whether it is served at `/`
  // (active/blue) or under `/staging/` (inactive/green) during blue/green.
  // With an absolute base the HTML would emit `/assets/…`, which 404s when
  // the app is mounted under a sub-path.
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
