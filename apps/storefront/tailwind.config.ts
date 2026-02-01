import type { Config } from 'tailwindcss';

export default {
  darkMode: false, // Completely disable dark mode - all dark: classes will be ignored
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {}
  },
  plugins: [
    require('@tailwindcss/typography')
  ]
} satisfies Config;
