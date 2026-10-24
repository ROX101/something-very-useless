export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#14235A', dark: '#0C1740', light: '#E9EDF6' },
        ink: '#1A2233',
        muted: '#5B6577',
        line: '#D5DAE3',
        page: '#EEF1F5',
        saffron: '#E07B1A',
        igreen: '#1D6F42',
        err: { DEFAULT: '#B42318', bg: '#FEF3F2' },
        warn: { DEFAULT: '#93370D', bg: '#FFF6E5', line: '#F5C27A' },
        ok: { DEFAULT: '#1D6F42', bg: '#EDF7F0' },
        info: { DEFAULT: '#175CD3', bg: '#EEF4FF' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"IBM Plex Sans Devanagari"', 'system-ui', 'sans-serif'],
        serif: ['"IBM Plex Serif"', '"IBM Plex Sans Devanagari"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '4px' },
    },
  },
  plugins: [],
}
