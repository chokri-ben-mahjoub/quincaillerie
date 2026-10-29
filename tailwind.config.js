/** Palette pilotée par des variables CSS (voir styles.css) : clair/sombre sans dupliquer les classes. */
const v = (name) => `hsl(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: v('background'),
        foreground: v('foreground'),
        card: v('card'),
        muted: v('muted'),
        'muted-foreground': v('muted-foreground'),
        border: v('border'),
        input: v('input'),
        ring: v('ring'),
        primary: v('primary'),
        'primary-foreground': v('primary-foreground'),
        accent: v('accent'),
        destructive: v('destructive'),
        success: v('success'),
        warning: v('warning'),
        sidebar: v('sidebar')
      },
      borderRadius: { lg: '0.75rem', md: '0.5rem', sm: '0.375rem' },
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'Consolas', 'monospace']
      },
      boxShadow: {
        soft: '0 1px 2px hsl(var(--shadow) / 0.06), 0 8px 24px -8px hsl(var(--shadow) / 0.12)'
      }
    }
  },
  plugins: []
}
