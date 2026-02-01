import type { Config } from 'tailwindcss';

export default {
  darkMode: 'selector', // Dark mode only when 'dark' class is present on html
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {}
  },
  plugins: [
    require('@tailwindcss/typography')
  ]
} satisfies Config;
