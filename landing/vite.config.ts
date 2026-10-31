import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    ssr: {
        // Vite 8 leaves bare imports to Node in the server build, CSS `@import`s
        // included: without this, vite-ssg's server build reads
        // `@import 'tailwindcss'` as a file path and fails.
        noExternal: ['tailwindcss'],
    },
});
