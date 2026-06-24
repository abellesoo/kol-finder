/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Schibsted Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: '#221E18',
        paper: '#F4F1EB',
        sidebar: '#EEEAE1',
        mist: '#E1DCD0',
        surface: '#FAF8F3',
        'card-edge': '#E7E2D6',
        accent: '#C8A96E',
        'accent-dim': '#F1E7D2',
        muted: '#7E7768',
        faint: '#A89E8C',
        body: '#5C5340',
        rose: '#B06070',
        sage: '#4A7C59',
      },
    },
  },
  plugins: [],
}
