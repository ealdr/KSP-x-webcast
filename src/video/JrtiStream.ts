/**
 * JRTI camera discovery and URL helpers.
 *
 * Camera URL pattern: http://localhost:8080/camera/<id>
 * IDs are hash codes (can be negative) that are stable within a KSP session
 * but may change on mod reload.
 *
 * Discovery: fetch the JRTI homepage via the Vite dev-server proxy at
 * /jrti-proxy/ (proxied to http://localhost:8080/) and scan the HTML for
 * /camera/<id> patterns.  The proxy sidesteps the CORS restriction that
 * would block a direct fetch() from localhost:3000 → localhost:8080.
 * Actual MJPEG streams are embedded as <img src="..."> which the browser
 * loads without CORS restrictions.
 */

export interface VideoState {
  baseUrl: string       // e.g. "http://localhost:8080"
  cameras: string[]     // paths, e.g. ["/camera/-1781452376", "/camera/9876"]
  mainIdx: number
  pipIdx: number | null
}

/**
 * URL for a camera by index.
 * Returns a relative path (/camera/<id>) so requests go through the Vite
 * proxy (localhost:3000/camera/... → localhost:8080/camera/...), which
 * avoids Chrome's ORB blocking of cross-origin MJPEG streams.
 */
export function cameraUrl(state: VideoState, idx: number): string {
  return state.cameras[idx] ?? ''  // full URL, e.g. "http://localhost:8080/camera/-1781452376"
}

/**
 * Fetch the JRTI index page via proxy and extract /camera/<id> paths.
 * Returns an empty array if JRTI is unreachable or no cameras are found.
 */
export async function discoverCameras(): Promise<string[]> {
  const res = await fetch('/jrti-proxy/', { cache: 'no-store' })
  if (!res.ok) throw new Error(`JRTI returned HTTP ${res.status}`)
  const html = await res.text()

  // Match /camera/ followed by an optional minus sign and digits/word-chars
  const matches = html.matchAll(/\/camera\/[-\w]+/g)
  const paths   = [...new Set([...matches].map(m => m[0]))]
  return paths
}
