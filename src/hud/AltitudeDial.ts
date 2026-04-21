import { arcPath } from './arcPath'

const CX = 50, CY = 52, R = 40, START = 145, SPAN = 250
const TRACK_PATH = arcPath(CX, CY, R, START, SPAN)

export class AltitudeDial {
  private fill: SVGPathElement
  private numEl: HTMLElement
  private maxKm: number

  constructor(mount: HTMLElement, maxKm = 200) {
    this.maxKm = maxKm

    mount.innerHTML = `
      <div class="dial-label">ALTITUDE</div>
      <div class="dial-wrap">
        <svg class="dial-svg" viewBox="0 0 100 90" aria-hidden="true">
          <path class="dial-track" d="${TRACK_PATH}"/>
          <path class="dial-fill"  d=""/>
        </svg>
        <div class="dial-overlay">
          <span class="dial-number" id="alt-n">0.0</span>
          <span class="dial-unit">km</span>
        </div>
      </div>
    `

    this.fill  = mount.querySelector('.dial-fill')!
    this.numEl = mount.querySelector('#alt-n')!
  }

  update(altKm: number): void {
    const v = Math.max(0, altKm)
    const frac = Math.min(v / this.maxKm, 1)
    this.fill.setAttribute('d', frac > 0 ? arcPath(CX, CY, R, START, frac * SPAN) : '')
    this.numEl.textContent = v.toFixed(1)
  }

  setMax(maxKm: number): void {
    this.maxKm = maxKm
  }
}
