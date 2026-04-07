/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        crm: {
          bg:      '#f5f7fa',
          sidebar: '#f0f2f8',
          card:    '#ffffff',
          table:   '#ffffff',
          header:  '#ffffff',
          hover:   '#f0f2f8',
          border:  '#e5e7ef',
          text:    '#1a1a2e',
          muted:   '#8e8ea0',
          dim:     '#b0b0c0',
          accent:  '#4a6cf7',
          green:   '#22c55e',
          blue:    '#4a6cf7',
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
