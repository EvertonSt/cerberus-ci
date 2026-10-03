// Tailwind 4 ships its own PostCSS plugin; there is no tailwind.config.js
// any more. The design tokens live in `src/app/globals.css` as `@theme`.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
