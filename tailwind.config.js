/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: '#0D0D0D',
        paper: '#F7F6F3',
        mist: '#E8E6E1',
        accent: '#C8A96E',
        'accent-dim': '#E8D9BC',
        rose: '#D4627A',
        sage: '#4A7C59',
      },
    },
  },
  plugins: [],
}
