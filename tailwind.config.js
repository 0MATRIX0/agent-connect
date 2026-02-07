/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#050505',
        void: '#09090b',
        surface: 'rgba(255,255,255,0.05)',
        'surface-hover': 'rgba(255,255,255,0.08)',
      },
      borderColor: {
        glass: 'rgba(255,255,255,0.1)',
        'glass-bright': 'rgba(255,255,255,0.15)',
      },
      boxShadow: {
        'glow-emerald': '0 0 10px #10B981',
        'glow-rose': '0 0 10px #F43F5E',
        'glow-amber': '0 0 10px #F59E0B',
        'glow-blue': '0 0 10px #3B82F6',
        'glow-purple': '0 0 10px #A855F7',
      },
      backdropBlur: {
        glass: '16px',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        'drawer-slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'drawer-slide-out': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'drawer-slide-in': 'drawer-slide-in 0.3s ease-out',
        'drawer-slide-out': 'drawer-slide-out 0.3s ease-in',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
