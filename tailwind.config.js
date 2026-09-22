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
        base: {
          DEFAULT: '#0D0F12',
          alt: '#101216',
        },
        surface: {
          1: '#15181D',
          2: '#191C22',
          3: '#1D2026',
        },
        line: {
          subtle: '#252A32',
          strong: '#2A3038',
        },
        ink: {
          primary: '#F5F6F7',
          secondary: '#8B92A0',
          muted: '#5B6270',
        },
        accent: {
          DEFAULT: '#3B82F6',
          hover: '#2F6FE0',
          soft: 'rgba(59, 130, 246, 0.12)',
        },
        status: {
          success: '#10B981',
          warning: '#F59E0B',
          partner: '#8B5CF6',
          danger: '#F43F5E',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'panel': '0 1px 0 rgba(255, 255, 255, 0.02) inset, 0 8px 20px -12px rgba(0, 0, 0, 0.5)',
        'modal': '0 24px 60px -20px rgba(0, 0, 0, 0.7)',
        'focus-ring': '0 0 0 3px rgba(59, 130, 246, 0.25)',
      },
      borderRadius: {
        'xl2': '14px',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(24px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.18s ease-out',
        'scale-in': 'scaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }
    },
  },
  plugins: [],
}
