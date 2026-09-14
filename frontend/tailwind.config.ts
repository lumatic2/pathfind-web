import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./frontend/src/**/*.{ts,tsx,html}', './index.html', './app.html'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
