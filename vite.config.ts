import { defineConfig } from 'vite';
// In development the page talks to the local Cloudflare Worker (`npm run dev:api`, port 8787).
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { target: 'es2022' },
});
