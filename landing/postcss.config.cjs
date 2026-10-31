// Vite takes the first PostCSS config it finds from here up, so the landing
// has its own, with the same Tailwind plugin as the app's at the repo root.
module.exports = {
    plugins: {
        '@tailwindcss/postcss': {},
    },
};
