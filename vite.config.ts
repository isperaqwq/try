import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

function syncRootBundle() {
  return {
    name: 'suiji-sync-root-bundle',
    closeBundle() {
      const root = process.cwd();
      const distJs = resolve(root, 'dist/index.js');
      const distCss = resolve(root, 'dist/index.css');
      if (existsSync(distJs)) {
        copyFileSync(distJs, resolve(root, 'index.js'));
      }
      if (existsSync(distCss)) {
        copyFileSync(distCss, resolve(root, 'style.css'));
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [vue(), syncRootBundle()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  preview: {
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: mode === 'production' ? false : true,
    minify: mode === 'production' ? 'esbuild' : false,
    rollupOptions: {
      input: 'src/index.ts',
      output: {
        format: 'es',
        entryFileNames: 'index.js',
        inlineDynamicImports: true,
        assetFileNames: (info: any) => {
          const name = info?.names?.[0] ?? info?.name ?? '';
          return name.endsWith('.css') ? 'index.css' : 'assets/[name][extname]';
        },
      },
    },
  },
}));
