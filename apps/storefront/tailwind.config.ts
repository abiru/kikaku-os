import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {}
  },
  plugins: [
    require('@tailwindcss/typography')
  ]
} satisfies Config;
