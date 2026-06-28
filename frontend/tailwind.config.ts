import type { Config } from 'tailwindcss';

// Swarm neon-green theme. Colors are driven by CSS variables (see styles/globals.css)
// so components reference semantic tokens (bg, surface, primary, severity-*).
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        line: 'var(--line)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          strong: 'rgb(var(--primary-strong) / <alpha-value>)',
          dim: 'var(--primary-dim)',
        },
        sev: {
          critical: 'rgb(var(--sev-critical) / <alpha-value>)',
          high: 'rgb(var(--sev-high) / <alpha-value>)',
          medium: 'rgb(var(--sev-medium) / <alpha-value>)',
          low: 'rgb(var(--sev-low) / <alpha-value>)',
          info: 'rgb(var(--sev-info) / <alpha-value>)',
        },
        danger: 'rgb(var(--danger) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 12px rgba(41,255,160,0.45)',
        'glow-sm': '0 0 6px rgba(41,255,160,0.35)',
        'glow-lg': '0 0 28px rgba(41,255,160,0.30)',
      },
      keyframes: {
        pulseGlow: {
          '0%,100%': { opacity: '1', boxShadow: '0 0 6px rgba(41,255,160,0.7)' },
          '50%': { opacity: '0.5', boxShadow: '0 0 2px rgba(41,255,160,0.3)' },
        },
        fadeIn: { from: { opacity: '0', transform: 'translateY(2px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'pulse-glow': 'pulseGlow 1.4s ease-in-out infinite',
        'fade-in': 'fadeIn 0.18s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
