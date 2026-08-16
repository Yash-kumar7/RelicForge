/**
 * Where the backend lives, in one place.
 *
 * Everything in this app asked for "/api/..." and "/assets/..." directly, which
 * is correct for the deployment it was built around: Fastify serves the built
 * client, the API and the generated assets from one origin, so a relative path is
 * always right and there is nothing to configure.
 *
 * That stops being true the moment the client is hosted apart from the server,
 * which is the shape a static host plus a Node host takes. Rather than decide
 * that here, both are expressed the same way: with no VITE_BACKEND_URL set, these
 * return exactly the relative paths that were hardcoded before, and the app is
 * byte-for-byte the same as it was. With one set, every request goes to that
 * origin instead.
 *
 * Which means the deployment shape is an environment variable rather than a
 * refactor, and the same build runs either way.
 */

/**
 * Trailing slash removed, because every caller passes a path that starts with
 * one, and "https://api.example.com//api/relics" is a 404 on some servers and a
 * redirect on others.
 */
const BASE = (import.meta.env["VITE_BACKEND_URL"] ?? "").replace(/\/+$/, "");

/** An API route. Pass the path exactly as the server declares it. */
export function api(path: string): string {
  return `${BASE}${path}`;
}

/**
 * A generated asset: models, rigs, concept images.
 *
 * Separate from api() despite doing the same thing today, because these are the
 * 400MB that would move to object storage first if this ever outgrows a disk,
 * and when they do only this function changes.
 */
export function asset(path: string): string {
  return `${BASE}${path}`;
}
