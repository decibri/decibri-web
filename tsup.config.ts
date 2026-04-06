import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  dts: true,
  minify: true,
  outDir: 'dist',
  globalName: 'DecibriWeb',
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
});
