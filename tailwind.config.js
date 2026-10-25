export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#111111', dark: '#000000', light: '#EDEDED' },
        ink: '#111111',
        muted: '#5C5C5C',
        line: '#D9D9D9',
        page: '#F2F2F2',
        saffron: '#E07B1A',
        igreen: '#1D6F42',
        mint: { DEFAULT: '#23885A', light: '#5CC694' },
        err: { DEFAULT: '#B42318', bg: '#FEF3F2' },
        warn: { DEFAULT: '#93370D', bg: '#FFF6E5', line: '#F5C27A' },
        ok: { DEFAULT: '#1D6F42', bg: '#EDF7F0' },
        info: { DEFAULT: '#404040', bg: '#F2F2F2' },
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
