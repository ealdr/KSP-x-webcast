/**
 * Minimal kRPC WebSocket client.
 *
 * Protocol (WebSocket transport):
 *   1. Client opens WS to ws://localhost:50000/?name=<name>
 *   2. Client sends ConnectionRequest (protobuf-encoded)
 *   3. Server replies with ConnectionResponse; status 0 = OK
 *   4. Client sends Request messages; server replies with Response messages (sequential)
 *
 * Procedure naming convention in kRPC:
 *   - Top-level service getters:   get_ActiveVessel, get_UT, …
 *   - Class getters:               Vessel_get_Orbit, Flight_get_Speed, …
 *   - Class methods:               Vessel_Flight, …
 *   All under service "SpaceCenter".
 *
 * Class instances are identified by opaque uint64 IDs.  The raw bytes returned
 * by one ProcedureResult can be passed directly as Argument.value bytes to the
 * next call — the encoding is identical on both sides.
 */

import {
  concat,
  fBytes,
  fStr,
  fVarint,
  getAllBytes,
  getBytes,
  getVarint,
  hex,
  parseFields,
} from './proto'

export interface CallSpec {
  service: string
  procedure: string
  /** Raw value bytes for each positional argument (index = position). */
  args?: Uint8Array[]
}

type PendingCall = {
  resolve: (results: Uint8Array[]) => void
  reject: (err: Error) => void
}

export class KrpcClient {
  private ws: WebSocket | null = null
  private handshakeDone = false
  private handshakeResolve: (() => void) | null = null
  private handshakeReject: ((e: Error) => void) | null = null
  private pending: PendingCall | null = null

  /**
   * Connect to kRPC and complete the ConnectionRequest handshake.
   * @param url  Full WebSocket URL including ?name= query parameter.
   */
  connect(url = 'ws://localhost:3001/?name=stream-overlay'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.handshakeResolve = resolve
      this.handshakeReject = reject

      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      this.ws = ws

      ws.onopen = () => {
        console.log('[kRPC] WebSocket open, sending ConnectionRequest…')
        const msg = fStr(2, 'stream-overlay')
        console.log('[kRPC] ConnectionRequest bytes:', hex(msg))
        ws.send(msg)
      }

      ws.onmessage = (evt) => {
        const data = new Uint8Array(evt.data as ArrayBuffer)
        console.log('[kRPC] Received', data.length, 'bytes:', hex(data))
        this.onMessage(data)
      }

      ws.onerror = (e) => {
        console.error('[kRPC] WebSocket error:', e)
        const err = new Error('kRPC WebSocket error — is kRPC server running?')
        this.handshakeReject?.(err)
        this.pending?.reject(err)
      }

      ws.onclose = () => {
        if (!this.handshakeDone) {
          this.handshakeReject?.(new Error('kRPC WebSocket closed during handshake'))
        }
      }
    })
  }

  private onMessage(data: Uint8Array): void {
    if (!this.handshakeDone) {
      this.handleConnectionResponse(data)
    } else {
      this.handleResponse(data)
    }
  }

  private handleConnectionResponse(data: Uint8Array): void {
    try {
      const fields = parseFields(data)
      // Field 1: status varint (0 = OK); absent in proto3 if OK
      const status = getVarint(fields, 1) ?? 0
      if (status !== 0) {
        const msgBytes = getBytes(fields, 2)
        const msgStr = msgBytes ? new TextDecoder().decode(msgBytes) : `status ${status}`
        throw new Error(`kRPC connection refused: ${msgStr}`)
      }
      // Field 3: client_identifier bytes (save if we later need stream server)
      this.handshakeDone = true
      this.handshakeResolve?.()
    } catch (e) {
      this.handshakeReject?.(e as Error)
    }
  }

  private handleResponse(data: Uint8Array): void {
    const pending = this.pending
    if (!pending) {
      console.warn('[kRPC] Received response with no pending call')
      return
    }
    this.pending = null
    try {
      pending.resolve(this.parseResponse(data))
    } catch (e) {
      pending.reject(e as Error)
    }
  }

  private parseResponse(data: Uint8Array): Uint8Array[] {
    const responseFields = parseFields(data)

    // Field 1: top-level Error message (absent if no error)
    const errBytes = getBytes(responseFields, 1)
    if (errBytes) {
      const errFields = parseFields(errBytes)
      const desc = getBytes(errFields, 3)
      const descStr = desc ? new TextDecoder().decode(desc) : 'unknown error'
      throw new Error(`kRPC error: ${descStr}`)
    }

    // Field 2 (repeated): ProcedureResult messages
    const resultList = getAllBytes(responseFields, 2)
    return resultList.map((rb) => {
      const rf = parseFields(rb)

      // Field 1: per-result Error
      const resultErr = getBytes(rf, 1)
      if (resultErr) {
        const ef = parseFields(resultErr)
        const desc = getBytes(ef, 3)
        const descStr = desc ? new TextDecoder().decode(desc) : 'call error'
        throw new Error(`kRPC procedure error: ${descStr}`)
      }

      // Field 2: return value bytes (empty Uint8Array for void procedures)
      return getBytes(rf, 2) ?? new Uint8Array(0)
    })
  }

  /**
   * Execute one or more procedure calls in a single Request.
   * Returns an array of raw value bytes, one per call, in order.
   * Throws if the server returns any error.
   */
  call(...specs: CallSpec[]): Promise<Uint8Array[]> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.handshakeDone) {
        return reject(new Error('kRPC client not connected'))
      }
      if (this.pending) {
        return reject(new Error('kRPC client: overlapping call (use sequential awaits)'))
      }
      this.pending = { resolve, reject }
      this.ws.send(this.encodeRequest(specs))
    })
  }

  private encodeRequest(specs: CallSpec[]): Uint8Array {
    // Request.calls (field 1, repeated ProcedureCall)
    const callParts = specs.map((spec) => {
      const parts: Uint8Array[] = [
        fStr(1, spec.service),   // ProcedureCall.service
        fStr(2, spec.procedure), // ProcedureCall.procedure
      ]
      for (let i = 0; i < (spec.args?.length ?? 0); i++) {
        // Argument: position (field 1) + value bytes (field 2)
        const argMsg = concat(fVarint(1, i), fBytes(2, spec.args![i]))
        parts.push(fBytes(3, argMsg)) // ProcedureCall.arguments (field 3, repeated)
      }
      return concat(...parts)
    })
    // Request: each ProcedureCall as field 1 (repeated)
    return concat(...callParts.map(b => fBytes(1, b)))
  }

  /** Helper: single call that expects exactly one result. */
  async callOne(spec: CallSpec): Promise<Uint8Array> {
    const [result] = await this.call(spec)
    return result
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.handshakeDone = false
  }
}

export { hex }
