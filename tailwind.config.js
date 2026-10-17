/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          950: 'rgb(var(--color-studio-950) / <alpha-value>)',
          900: 'rgb(var(--color-studio-900) / <alpha-value>)',
          850: 'rgb(var(--color-studio-850) / <alpha-value>)',
          800: 'rgb(var(--color-studio-800) / <alpha-value>)',
          700: 'rgb(var(--color-studio-700) / <alpha-value>)',
          600: 'rgb(var(--color-studio-600) / <alpha-value>)',
          accent: 'rgb(var(--color-studio-accent) / <alpha-value>)',
          neonBlue: 'rgb(var(--color-studio-neonBlue) / <alpha-value>)',
          neonGreen: 'rgb(var(--color-studio-neonGreen) / <alpha-value>)',
          neonOrange: 'rgb(var(--color-studio-neonOrange) / <alpha-value>)',
          neonPink: 'rgb(var(--color-studio-neonPink) / <alpha-value>)',
          amber: 'rgb(var(--color-studio-amber) / <alpha-value>)'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
