/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#020408',
          900: '#040712',
          850: '#070B1E',
          800: '#0B122B',
          700: '#101B3D',
        },
        accent: {
          cyan: '#00E5FF',
          blue: '#2563EB',
          sky: '#38BDF8',
          emerald: '#10B981',
          violet: '#8B5CF6',
          amber: '#F59E0B',
          rose: '#F43F5E',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass-glow': '0 0 25px -5px rgba(0, 229, 255, 0.35)',
        'glass-card': '0 20px 45px -15px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        'glass-modal': '0 30px 70px -15px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.20)',
      }
    },
  },
  plugins: [],
}
