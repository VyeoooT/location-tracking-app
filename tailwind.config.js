/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#208AEF',
        success: '#34C759',
        danger: '#FF3B30',
        link: '#3c87f7',
      },
    },
  },
  plugins: [],
};
