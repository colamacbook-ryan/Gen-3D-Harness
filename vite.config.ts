import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // Bàn duyệt (phương án 1) là trang thứ hai, không kéo three theo
    rollupOptions: { input: { main: 'index.html', duyet: 'duyet.html' } },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'] },
});
