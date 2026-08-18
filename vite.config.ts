import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import tailwindcss from '@tailwindcss/vite'; // if using Tailwind v4

export default defineConfig({
  plugins: [
    react(),
    // tailwindcss(), 
  ],
  build: {
    lib: {
      entry: 'src/index.ts', // your main export file
      name: 'Chart-witgets',
      formats: ['es', 'cjs'],
      fileName: (format) =>
        format === 'es' ? 'index.js' : 'index.cjs',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
    minify: false, // usually false for libraries
  },
});