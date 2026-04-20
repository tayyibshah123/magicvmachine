import { defineConfig } from 'vitest/config';

// Keep tests fully isolated from the game's canvas/DOM requirements by using
// jsdom, and point the includes at the dedicated __tests__ directory.
export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/__tests__/**/*.test.js'],
        globals: true
    }
});
