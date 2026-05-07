// Single source of truth for the app version. Bump on any shippable change
// to JS / CSS / assets. Also update the string in `service-worker.js`
// (CACHE_NAME) to match — service workers run in a separate worker context
// and can't import ES modules, so the duplication is intentional.
//
// Format: "major.minor.patch". When this bumps, the service-worker cache
// invalidates on next launch and the "About" section in Settings shows the
// new number so players know what they're running.
export const APP_VERSION = '1.7.6';
export const APP_CACHE_KEY = 'mvm-shell-v' + APP_VERSION.replace(/\./g, '-');
