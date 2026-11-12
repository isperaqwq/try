import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  define: {
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    ...(command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {}),
  },
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
    sourcemap: false,
    minify: 'esbuild',
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
