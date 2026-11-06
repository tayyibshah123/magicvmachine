import { vi } from 'vitest';
import gameHtml from '../../../index.html?raw';

export function mountGamePage() {
    document.body.innerHTML = new DOMParser().parseFromString(gameHtml, 'text/html').body.innerHTML;
    return document.getElementById('gameCanvas');
}

// Scope registrations made by a production binding method to one test.
// The callbacks still run on the real jsdom document/window EventTargets.
export function trackBrowserListeners() {
    const registrations = [];
    const spies = [document, window].map(target => {
        const original = target.addEventListener.bind(target);
        return vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
            registrations.push({ target, type, listener, options });
            return original(type, listener, options);
        });
    });
    return () => {
        for (const { target, type, listener, options } of registrations) {
            target.removeEventListener(type, listener, options);
        }
        for (const spy of spies) spy.mockRestore();
    };
}
