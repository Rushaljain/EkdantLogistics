/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.04), 0 1px 3px 0 rgba(0, 0, 0, 0.03)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 8px 16px -4px rgba(15, 23, 42, 0.06), 0 4px 8px -2px rgba(15, 23, 42, 0.03)',
      },
      colors: {
        app: 'var(--app-bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          secondary: 'var(--surface-secondary)',
        },
        input: {
          bg: 'var(--input-bg)',
        },
        sidebar: {
          bg: 'var(--sidebar-bg)',
          hover: 'var(--sidebar-hover)',
          active: 'var(--sidebar-active)',
        },
        brand: {
          primary: 'var(--primary)',
          'primary-hover': 'var(--primary-hover)',
          'primary-soft': 'var(--primary-soft)',
          'primary-text': 'var(--primary-text)',
          accent: 'var(--accent)',
          'accent-soft': 'var(--accent-soft)',
        },
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          'on-dark': 'var(--text-on-dark)',
          'on-dark-muted': 'var(--text-on-dark-muted)',
        },
        divider: 'var(--border)',
        state: {
          success: 'var(--success)',
          'success-bg': 'var(--success-bg)',
          warning: 'var(--warning)',
          'warning-bg': 'var(--warning-bg)',
          error: 'var(--error)',
          'error-bg': 'var(--error-bg)',
          info: 'var(--info)',
          'info-bg': 'var(--info-bg)',
        },
        action: {
          ring: 'var(--focus-ring)',
          disabled: 'var(--disabled-bg)',
          'disabled-text': 'var(--disabled-text)',
        }
      }
    },
  },
  plugins: [],
}
