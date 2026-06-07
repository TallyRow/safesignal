import { defineConfig } from 'tsup';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    testing: 'src/testing/index.ts',
    'transport-beacon': 'src/transport-beacon/index.ts',
    'transport-otlp': 'src/transport-otlp/index.ts',
    capture: 'src/capture/index.ts',
    'dev-console': 'src/dev-console/index.ts',
    stacks: 'src/stacks/index.ts',
    'framework-react': 'src/framework-react/index.ts',
    'framework-vue': 'src/framework-vue/index.ts',
  },
  // `react` / `vue` are (consumer-provided) peer dependencies — never bundle them
  // into the ./framework-react / ./framework-vue entries. peerDependencies are
  // auto-externalized; this is explicit defense-in-depth, asserted by the
  // bundle-shape security tests.
  external: ['react', 'vue'],
  format: ['esm', 'cjs'],
  outExtension: ({ format }) => ({ js: format === 'esm' ? '.mjs' : '.cjs' }),
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  platform: 'browser',
  splitting: false,
  treeshake: true,
  minify: false,
  define: {
    __DEV__: isProduction ? 'false' : 'true',
  },
});
