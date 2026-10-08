/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14202B',
        mist: '#EEF1F5',
        line: '#D5DBE3',
        cobalt: { DEFAULT: '#2F5BEA', dark: '#2347BF', soft: '#E3EAFD' },
        signal: '#F2B01E',
        danger: '#E5484D',
        night: { DEFAULT: '#0E151C', raised: '#18222C', line: '#2A3744', text: '#C3CEDA' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        body: ['Figtree', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
