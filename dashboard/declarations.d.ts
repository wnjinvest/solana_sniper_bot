// CSS side-effect imports (bijv. import './globals.css') zijn geldig in Next.js
// maar TypeScript's "moduleResolution: bundler" vereist een expliciete declaratie.
declare module '*.css' {}
