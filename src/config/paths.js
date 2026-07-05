// Resolve a runtime asset path against the deployment base URL.
//
// GitHub Pages serves project sites from a subpath (e.g. /animal-strike/), so
// absolute paths like "/audio/x.mp3" 404 on Pages (they resolve to the domain
// root). Vite injects `import.meta.env.BASE_URL` = the `base` config value
// ("/" in dev, "/animal-strike/" in the Pages build). Prefixing with it makes
// every asset path work in both environments without per-call changes.
//
// Usage: asset('/audio/music/menu_loop.mp3') -> '/audio/music/menu_loop.mp3' (dev)
//                                                 '/animal-strike/audio/music/menu_loop.mp3' (Pages)
export function asset(path) {
  const base = import.meta.env.BASE_URL || '/';   // e.g. '/' or '/animal-strike/'
  // strip exactly one leading slash so we don't double it; ensure exactly one
  const trimmed = path.replace(/^\/+/, '');
  return base.replace(/\/+$/, '') + '/' + trimmed;
}
