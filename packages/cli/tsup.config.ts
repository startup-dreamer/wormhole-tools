import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { cli: 'src/main.ts' },
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    dts: false,
    sourcemap: true,
    clean: false,
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
]);
