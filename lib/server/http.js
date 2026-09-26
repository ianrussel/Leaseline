// Shared helper for the app/api/*/route.js handlers - not itself a route.

/**
 * The request's JSON body, or {} when it's missing or malformed - same as the old Vercel
 * functions' `req.body || {}`, so each handler's own field validation still produces the
 * specific "Missing 'x'" 400 rather than a generic parse error.
 */
export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
