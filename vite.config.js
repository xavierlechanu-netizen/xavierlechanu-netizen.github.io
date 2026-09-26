import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Générer dynamiquement les entrées pour Rollup (tous les .html dans src/)
const srcDir = resolve(__dirname, 'src');
const htmlFiles = fs.readdirSync(srcDir).filter(file => file.endsWith('.html'));
const inputMap = {};
htmlFiles.forEach(file => {
    const name = file.replace('.html', '');
    inputMap[name] = resolve(srcDir, file);
});

export default defineConfig({
  root: 'src',
  publicDir: 'public', // Résolu par rapport à root (donc src/public)
  server: {
    port: 5000,
  },
  base: '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: inputMap,
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('localforage')) {
              return 'vendor-storage';
            }
            return 'vendor-libs';
          }
        }
      }
    }
  }
});
