import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'frontend/src'),
      },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          landing: path.resolve(process.cwd(), 'index.html'),
          app: path.resolve(process.cwd(), 'app.html'),
        },
      },
    },
    server: {
      port: 5173,
    },
  };
});
