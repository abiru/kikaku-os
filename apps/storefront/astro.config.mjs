// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
// import tailwindcss from '@tailwindcss/vite';
// https://astro.build/config

// https://astro.build/config
export default defineConfig({
  // vite: {
  //   plugins: [tailwindcss()]
  // },
  adapter: cloudflare(),

  vite: {
    plugins: [tailwindcss()]
  }
});