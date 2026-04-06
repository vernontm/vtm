/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        crm: {
          bg:      '#0a0a08',
          sidebar: '#111110',
          card:    '#161614',
          table:   '#161614',
          header:  '#111110',
          hover:   '#1c1c1a',
          border:  '#252523',
          text:    '#e8e6df',
          muted:   '#7a7870',
          dim:     '#4a4845',
          accent:  '#c8f135',
          green:   '#c8f135',
          blue:    '#5b9cf6',
          orange:  '#f5a623',
          red:     '#ff5c5c',
          purple:  '#784bd1',
          yellow:  '#ffcb00',
        },
      },
    },
  },
  plugins: [],
};
