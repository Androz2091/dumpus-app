import typography from '@tailwindcss/typography';
import { type Config } from 'tailwindcss';

// The app's colours, from `src/utils/palette.ts` at the repo root (Tailwind
// 3.3's, in hex), under the app's names: `brand` is the app's default theme,
// so `bg-brand-300` or `text-gray-400` look the same on both.
const palette = {
    sky: {
        50: '#f0f9ff',
        100: '#e0f2fe',
        200: '#bae6fd',
        300: '#7dd3fc',
        400: '#38bdf8',
        500: '#0ea5e9',
        600: '#0284c7',
        700: '#0369a1',
        800: '#075985',
        900: '#0c4a6e',
        950: '#082f49',
    },
    slate: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
        950: '#020617',
    },
    rose: {
        50: '#fff1f2',
        100: '#ffe4e6',
        200: '#fecdd3',
        300: '#fda4af',
        400: '#fb7185',
        500: '#f43f5e',
        600: '#e11d48',
        700: '#be123c',
        800: '#9f1239',
        900: '#881337',
        950: '#4c0519',
    },
    emerald: {
        50: '#ecfdf5',
        100: '#d1fae5',
        200: '#a7f3d0',
        300: '#6ee7b7',
        400: '#34d399',
        500: '#10b981',
        600: '#059669',
        700: '#047857',
        800: '#065f46',
        900: '#064e3b',
        950: '#022c22',
    },
    yellow: {
        50: '#fefce8',
        100: '#fef9c3',
        200: '#fef08a',
        300: '#fde047',
        400: '#facc15',
        500: '#eab308',
        600: '#ca8a04',
        700: '#a16207',
        800: '#854d0e',
        900: '#713f12',
        950: '#422006',
    },
};

export default {
    content: ['./index.html', './src/**/*.{vue,ts}'],
    theme: {
        colors: {
            brand: palette.sky,
            gray: palette.slate,
            danger: palette.rose,
            success: palette.emerald,
            yellow: palette.yellow,
            white: '#fff',
            black: '#000',
            transparent: 'transparent',
            inherit: 'inherit',
            currentColor: 'currentColor',
        },
        extend: {
            fontFamily: {
                sans: ['Rubik', 'Rubik Fallback', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [typography],
} satisfies Config;
