/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        accent: {
          50: '#fffbea',
          100: '#fff3b8',
          200: '#ffe27a',
          300: '#ffd24d',
          400: '#f6bd2f',
          500: '#d99b16',
          600: '#b7791f',
          700: '#975a16',
          800: '#744210',
          900: '#5b350c',
          950: '#3d2508',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      screens: {
        xs: '400px',
      },
    },
  },
  plugins: [],
}
