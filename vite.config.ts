import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
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
    define: {
      __ENV__: JSON.stringify(mode),
    },
  };
});
