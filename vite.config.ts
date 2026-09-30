import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

// Raíz del proyecto sin depender de `__dirname` (config ESM nativa).
const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      // Vendors en chunks propios: el código de la app cambia a cada deploy y
      // no debe invalidar la caché de React/Clerk, que casi nunca cambian.
      // (Rolldown, el bundler de Vite 8, exige la forma de función.)
      rollupOptions: {
        output: {
          manualChunks: (moduleId: string) => {
            if (/node_modules\/(react|react-dom|scheduler)\//.test(moduleId)) return 'vendor-react';
            if (moduleId.includes('node_modules/@clerk/')) return 'vendor-clerk';
            return undefined;
          },
        },
      },
      // Leaflet, Clerk y React pesan juntos; el límite se mantiene explícito
      // para que las regresiones de tamaño salten en el build.
      chunkSizeWarningLimit: 700,
    },
  };
});
