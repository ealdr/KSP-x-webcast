/**
 * Telemachus WebSocket client.
 *
 * Protocol:
 *   1. Connect to ws://<host>/datalink
 *   2. Send { "+": ["v.altitude", ...], "rate": <ms> } to subscribe
 *   3. Server pushes JSON objects at the requested rate:
 *      { "v.altitude": 12345.6, "v.surfaceSpeed": 450.2, ... }
 *
 * Variable reference:
 *   v.altitude              — altitude above sea level (m)
 *   v.speed                 — speed relative to surface (m/s)
 *   v.missionTime           — time since vessel was created (s); use as UT proxy
 *   v.dynamicPressurekPa    — dynamic pressure / Max-Q (kPa)
 *   f.stage                 — current stage number
 *   v.situation             — vessel situation string: LANDED, FLYING, ORBITING, etc.
 *   v.thrust                — current engine thrust (kN)
 */

export interface TelemachusData {
  'v.altitude'?:            number
  'v.speed'?:               number
  'v.missionTime'?:         number
  'v.dynamicPressurekPa'?:  number
  'f.stage'?:               number
  'v.situation'?:           string
  'v.thrust'?:              number
  [key: string]: unknown
}

type DataCallback = (data: TelemachusData) => void

export class TelemachusClient {
  private ws: WebSocket | null = null
  private dataCallback: DataCallback | null = null

  connect(url = 'ws://localhost:3000/telemachus-ws/datalink'): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      this.ws = ws

      ws.onopen = () => {
        console.log('[Telemachus] Connected to', url)
        resolve()
      }

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data as string) as TelemachusData
          this.dataCallback?.(data)
        } catch (e) {
          console.warn('[Telemachus] Failed to parse message:', e)
        }
      }

      ws.onerror = () => {
        reject(new Error('Telemachus WebSocket error — is Telemachus running on port 8085?'))
      }

      ws.onclose = () => {
        console.log('[Telemachus] Connection closed')
      }
    })
  }

  subscribe(vars: string[], rateMs = 500): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Telemachus] Not connected — cannot subscribe')
      return
    }
    this.ws.send(JSON.stringify({ '+': vars, rate: rateMs }))
    console.log('[Telemachus] Subscribed to', vars, 'at', rateMs, 'ms')
  }

  onData(cb: DataCallback): void {
    this.dataCallback = cb
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }
}
