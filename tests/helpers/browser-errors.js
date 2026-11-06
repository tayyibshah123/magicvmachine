// One resource/error policy for single-game and two-edition browser checks.
export async function captureBrowserErrors(context, origin) {
  const errors = [];
  const required = request => {
    const url = new URL(request.url());
    return url.origin === origin && (['script', 'document', 'stylesheet'].includes(request.resourceType())
      || url.pathname.endsWith('/service-worker.js'));
  };
  const watch = page => page.on('pageerror', error => errors.push(error.message));
  for (const page of context.pages()) watch(page);
  context.on('page', watch);
  context.on('response', response => {
    if (response.status() >= 400 && required(response.request())) errors.push(response.status() + ' ' + response.url());
  });
  context.on('requestfailed', request => {
    if (required(request)) errors.push((request.failure()?.errorText || 'Request failed') + ' ' + request.url());
  });
  await context.addInitScript(() => {
    window.__qaUnhandled = [];
    window.addEventListener('unhandledrejection', event => window.__qaUnhandled.push(String(event.reason?.stack || event.reason)));
  });
  return { errors, async collectUnhandled() {
    for (const page of context.pages()) {
      if (page.isClosed()) continue;
      try { errors.push(...await page.evaluate(() => window.__qaUnhandled || [])); }
      catch (error) { errors.push('Could not inspect browser errors: ' + error.message); }
    }
  } };
}
