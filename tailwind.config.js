/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4d1a2a',
          dark: '#3a1220',
          light: '#6b2d40',
          cream: {
            DEFAULT: '#f5f1eb',
            light: '#faf8f5',
          },
        },
      },
    },
  },
  plugins: [],
};
