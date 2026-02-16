

## Fix: "Nr is not defined" MapLibre Crash

### Problem
All map layers fail to render due to a repeated "Nr is not defined" runtime error from MapLibre GL. This is a known transpilation/bundling issue with maplibre-gl v5.x where internal helper functions (like `_defineProperty`, `__spreadProps`, or minified equivalents like `Nr`) are not defined when the build target is too low.

The current `vite.config.ts` sets `es2022` for `optimizeDeps` (dev server pre-bundling) but does NOT set it for the production `build.target`, which defaults to a lower ES version.

### Solution

**File: `vite.config.ts`** -- Add a `build.target` of `"es2022"` so the production bundle also uses modern syntax that maplibre-gl requires:

```typescript
export default defineConfig(({ mode }) => ({
  server: { ... },
  plugins: [ ... ],
  resolve: { ... },
  build: {
    target: "es2022",
  },
  optimizeDeps: {
    include: ["maplibre-gl"],
    esbuildOptions: {
      target: "es2022",
    },
  },
}));
```

This is a one-line addition. No other files need to change. Once the build target is aligned, the minified helper (`Nr`) will be properly defined and all layers will render again.

### Technical Details

- maplibre-gl v5.x ships code that relies on ES2022+ class features and helpers
- Vite's default build target is lower than ES2022, causing helper references to be stripped or undefined
- The `optimizeDeps.esbuildOptions.target` only affects the dev server pre-bundling, not the final build output
- Adding `build.target: "es2022"` ensures both dev and production builds use the correct syntax level

