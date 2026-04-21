import { arcPath } from './arcPath'

// Arc geometry — 250° sweep, 145° start (lower-left), clockwise
const CX = 50, CY = 52, R = 40, START = 145, SPAN = 250
const TRACK_PATH = arcPath(CX, CY, R, START, SPAN)

export class SpeedDial {
  private fill: SVGPathElement
  private numEl: HTMLElement
  private maxMs: number

  constructor(mount: HTMLElement, maxMs = 2500) {
    this.maxMs = maxMs

    mount.innerHTML = `
      <div class="dial-label">SPEED</div>
      <div class="dial-wrap">
        <svg class="dial-svg" viewBox="0 0 100 90" aria-hidden="true">
          <path class="dial-track" d="${TRACK_PATH}"/>
          <path class="dial-fill"  d=""/>
        </svg>
        <div class="dial-overlay">
          <span class="dial-number" id="spd-n">0</span>
          <span class="dial-unit">m/s</span>
        </div>
      </div>
    `

    this.fill  = mount.querySelector('.dial-fill')!
    this.numEl = mount.querySelector('#spd-n')!
  }

  update(speedMs: number): void {
    const v = Math.max(0, speedMs)
    const frac = Math.min(v / this.maxMs, 1)
    this.fill.setAttribute('d', frac > 0 ? arcPath(CX, CY, R, START, frac * SPAN) : '')
    this.numEl.textContent = Math.round(v).toLocaleString()
  }

  setMax(maxMs: number): void {
    this.maxMs = maxMs
  }
}
