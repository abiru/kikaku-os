// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import clerk from '@clerk/astro';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare(),

  image: {
    service: {
      entrypoint: 'astro/assets/services/noop'
    }
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // Force a single React instance across all islands/dependencies.
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
    }
  },

  integrations: [clerk(), react()]
});
