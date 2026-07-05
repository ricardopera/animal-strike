import { defineConfig } from 'vite';

// Production builds are deployed to GitHub Pages at /animal-strike/, so asset
// paths must be prefixed with that base. In dev (localhost) the base is '/'.
// `import.meta.env.BASE_URL` in the client mirrors this value at runtime.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/animal-strike/' : '/',
}));
