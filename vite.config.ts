import { defineConfig } from 'vite'
import http from 'node:http'

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    proxy: {
      // Telemachus WebSocket + HTTP — proxied to avoid browser CORS restrictions.
      '/telemachus-ws': {
        target: 'http://localhost:8085',
        changeOrigin: true,
        ws: true,
        rewrite: path => path.replace(/^\/telemachus-ws/, ''),
      },
      // JRTI homepage discovery
      '/jrti-proxy': {
        target: 'http://localhost:8080',
        rewrite: path => path.replace(/^\/jrti-proxy/, '') || '/',
        changeOrigin: true,
      },
    },
  },
  // Raw passthrough for MJPEG camera streams — must be top-level, not inside server{}.
  // Vite's built-in proxy buffers responses which breaks multipart/x-mixed-replace.
  // This pipes bytes directly with no buffering.
  plugins: [
    {
      name: 'mjpeg-proxy',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/camera/')) return next()
          const upstream = http.request(
            { host: 'localhost', port: 8080, path: req.url, method: req.method },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers)
              proxyRes.pipe(res, { end: true })
            },
          )
          upstream.on('error', (err) => {
            res.writeHead(502)
            res.end(`JRTI unreachable: ${err.message}`)
          })
          req.pipe(upstream, { end: true })
        })
      },
    },
  ],
})
