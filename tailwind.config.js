/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        labour: '#DC241f',
        conservative: '#0087DC',
        libdem: '#FDBB30',
        snp: '#FFF95D',
        green: '#6AB023',
        plaid: '#005B54',
        reform: '#12B6CF',
        other: '#808080',
      },
    },
  },
  plugins: [],
}
