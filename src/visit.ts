export function visit(path: string) {
  const url = new URL(path, location.origin);
  const next = url.pathname + url.search;
  if (location.pathname + location.search === next) return;
  history.pushState(null, '', next);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
