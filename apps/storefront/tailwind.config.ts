import type { Config } from 'tailwindcss';

export default {
  darkMode: 'selector', // Enable dark mode with class-based selector
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {}
  },
  plugins: [
    require('@tailwindcss/typography')
  ]
} satisfies Config;
