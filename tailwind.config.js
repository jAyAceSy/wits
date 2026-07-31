/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f4f6f8',
          100: '#e4e9ee',
          200: '#c7d1db',
          300: '#9fb0bf',
          400: '#71879c',
          500: '#546a80',
          600: '#44546a',
          700: '#39465a',
          800: '#2b3644',
          900: '#1a212b',
          950: '#0f1319',
        },
        signal: {
          DEFAULT: '#ff7a1a',
          50: '#fff3ea',
          100: '#ffe3cc',
          400: '#ff9a4d',
          500: '#ff7a1a',
          600: '#e85f00',
          700: '#bf4a00',
        },
        ok: {
          500: '#1f9d55',
          600: '#17803f',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px 0 rgba(15, 19, 25, 0.06), 0 1px 3px 0 rgba(15, 19, 25, 0.08)',
      },
    },
  },
  plugins: [],
}
