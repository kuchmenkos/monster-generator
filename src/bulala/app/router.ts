export type Route = "base" | "battles" | "workshop";

const ROUTES: Route[] = ["base", "battles", "workshop"];

export function parseHash(hash = location.hash): Route {
  const raw = hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return ROUTES.includes(raw as Route) ? (raw as Route) : "base";
}

export function setRoute(route: Route) {
  const next = `#/${route}`;
  if (location.hash !== next) location.hash = next;
  else window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function onRoute(handler: (route: Route) => void): () => void {
  const run = () => handler(parseHash());
  window.addEventListener("hashchange", run);
  return () => window.removeEventListener("hashchange", run);
}

export function ensureDefaultRoute() {
  if (!location.hash || location.hash === "#") location.replace("#/base");
}
