/**
 * TimelineArc — mission timeline with two modes:
 *
 * PREVIEW (before start):
 *   All milestones spread across the full arc proportionally by MET.
 *   "Now" dot sits at the left edge (T+0). Used to review the mission plan.
 *
 * LIVE (after start):
 *   Scrolling arc. "Now" dot fixed at 1/3 of width. Milestones slide left
 *   as MET advances — reaching the dot when met == milestone.met.
 *
 *   Visible time window = WINDOW seconds total.
 *     Left edge  = displayMet − WINDOW/3    (recent past)
 *     Now dot    = displayMet               (always at f = 1/3)
 *     Right edge = displayMet + WINDOW*2/3  (upcoming events)
 *
 * Draggable milestones (type='detected'):
 *   Drag left/right to reposition the expected MET. A T+HH:MM:SS tooltip
 *   follows the marker. Locked once the milestone is triggered.
 */

import type { MissionProfile, Milestone } from '../mission/profiles'

const NS       = 'http://www.w3.org/2000/svg'
const NOW_FRAC = 1 / 3
const WINDOW   = 240

function svgEl<T extends SVGElement>(tag: string, attrs: Record<string, string | number> = {}): T {
  const e = document.createElementNS(NS, tag) as T
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function formatMET(secs: number): string {
  const s    = Math.abs(Math.round(secs))
  const h    = Math.floor(s / 3600)
  const m    = Math.floor((s % 3600) / 60)
  const ss   = s % 60
  const sign = secs < 0 ? '-' : '+'
  return `T${sign}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
}

interface MarkerEls {
  circle:    SVGCircleElement
  label:     SVGTextElement
  sublabel:  SVGTextElement | null
  tick:      SVGLineElement
  hitTarget: SVGCircleElement
}

export class TimelineArc {
  private svg: SVGSVGElement
  private trackEl!:    SVGPathElement
  private progressEl!: SVGPathElement
  private dotEl!:      SVGCircleElement
  private markerEls = new Map<string, MarkerEls>()

  private tooltipGroup!: SVGGElement
  private tooltipBg!:    SVGRectElement
  private tooltipText!:  SVGTextElement

  private milestones: Milestone[]
  private fMin: number

  private w = 0
  private h = 0

  private lastMet       = -999
  private lastTriggered = new Set<string>()

  private dragId:  string | null = null
  private started  = false   // false = preview mode, true = live scrolling

  // The right-hand boundary of the preview arc's time domain.
  // Only ever increases — dragging the last milestone left does not shrink it,
  // so you can always drag back right to undo.
  private previewDomainMax: number = 0

  constructor(mount: HTMLElement, profile: MissionProfile) {
    this.milestones = profile.milestones
    const mets = this.milestones.map(m => m.met)
    this.fMin           = Math.min(...mets)
    this.previewDomainMax = Math.max(...mets)

    this.svg = svgEl<SVGSVGElement>('svg', { class: 'timeline-svg', 'aria-hidden': 'true' })
    this.buildElements()
    mount.appendChild(this.svg)

    const ro = new ResizeObserver(() => {
      const r = this.svg.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        this.w = r.width
        this.h = r.height
        this.redraw()
      }
    })
    ro.observe(this.svg)
  }

  // ── Geometry ────────────────────────────────────────────────────────────────

  private get xLeft()  { return this.w * 0.27 }
  private get xRight() { return this.w * 0.73 }
  private get xCtrl()  { return this.w * 0.50 }
  private get yBot()   { return this.h * 0.84 }
  private get yCtrl()  { return this.h * 0.06 }

  private mx(f: number) { return this.xLeft + (this.xRight - this.xLeft) * f }
  private my(f: number) { return this.yBot - 2 * (this.yBot - this.yCtrl) * f * (1 - f) }

  /** Fraction on arc for a milestone met in LIVE mode. */
  private metToFrac(mMet: number, displayMet: number): number {
    return NOW_FRAC + (mMet - displayMet) / WINDOW
  }

  /** Preview-mode position for a milestone. */
  private previewFrac(mMet: number): number {
    const minMet = this.fMin
    const range  = this.previewDomainMax - minMet || 1
    return (mMet - minMet) / range
  }

  /** Convert drag client-X back to a MET value (mode-aware). */
  private clientXToMet(clientX: number): number {
    const rect = this.svg.getBoundingClientRect()
    const svgX = clientX - rect.left
    const f    = clamp((svgX - this.xLeft) / (this.xRight - this.xLeft), 0, 1)

    if (!this.started) {
      const range = this.previewDomainMax - this.fMin || 1
      return this.fMin + f * range
    }

    const displayMet = Math.max(this.lastMet, this.fMin)
    return displayMet + (f - NOW_FRAC) * WINDOW
  }

  /** Current (x, y) of a milestone on the arc, mode-aware. */
  private milestoneXY(m: Milestone): { x: number, y: number } {
    const f = this.started
      ? clamp(this.metToFrac(m.met, Math.max(this.lastMet, this.fMin)), 0, 1)
      : clamp(this.previewFrac(m.met), 0, 1)
    return { x: this.mx(f), y: this.my(f) }
  }

  // ── Build SVG elements ───────────────────────────────────────────────────────

  private buildElements(): void {
    const defs = svgEl<SVGDefsElement>('defs')
    defs.innerHTML = `
      <filter id="tl-glow" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="3.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="tl-arc-glow" x="-4%" y="-120%" width="108%" height="340%">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`
    this.svg.appendChild(defs)

    this.trackEl = svgEl<SVGPathElement>('path', {
      fill: 'none',
      stroke: 'rgba(255,255,255,0.10)',
      'stroke-width': '1.5',
    })
    this.svg.appendChild(this.trackEl)

    this.progressEl = svgEl<SVGPathElement>('path', {
      d: '',
      fill: 'none',
      stroke: 'rgba(255,255,255,0.72)',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      filter: 'url(#tl-arc-glow)',
    })
    this.svg.appendChild(this.progressEl)

    for (const m of this.milestones) this.createMarkerEls(m)

    this.dotEl = svgEl<SVGCircleElement>('circle', {
      r: '6',
      fill: '#ffffff',
      'fill-opacity': '0.92',
      filter: 'url(#tl-glow)',
    })
    this.svg.appendChild(this.dotEl)

    this.tooltipGroup = svgEl<SVGGElement>('g')
    this.tooltipGroup.style.display      = 'none'
    this.tooltipGroup.style.pointerEvents = 'none'
    this.tooltipBg   = svgEl<SVGRectElement>('rect', {
      rx: '2', ry: '2',
      fill: 'rgba(2,4,8,0.90)',
      stroke: 'rgba(255,255,255,0.18)',
      'stroke-width': '1',
    })
    this.tooltipText = svgEl<SVGTextElement>('text', {
      'text-anchor': 'middle',
      'font-size': '12',
      'font-family': 'IBM Plex Mono, Consolas, monospace',
      'font-weight': '600',
      fill: '#f0f2f5',
    })
    this.tooltipGroup.appendChild(this.tooltipBg)
    this.tooltipGroup.appendChild(this.tooltipText)
    this.svg.appendChild(this.tooltipGroup)
  }

  private createMarkerEls(m: Milestone): void {
    const tick      = svgEl<SVGLineElement>('line', { 'stroke-width': '1' })
    const circle    = svgEl<SVGCircleElement>('circle', { r: '5', 'stroke-width': '1.5' })
    const label     = svgEl<SVGTextElement>('text', {
      'text-anchor': 'middle',
      'font-size': '11',
      'font-family': 'IBM Plex Sans, Inter, system-ui, sans-serif',
      'font-weight': '500',
      'letter-spacing': '0.08em',
    })
    label.textContent = m.label

    let sublabel: SVGTextElement | null = null
    if (m.sublabel) {
      sublabel = svgEl<SVGTextElement>('text', {
        'text-anchor': 'middle',
        'font-size': '8',
        'font-family': 'IBM Plex Sans, Inter, system-ui, sans-serif',
        'font-weight': '400',
        'letter-spacing': '0.04em',
      })
      sublabel.textContent = m.sublabel
    }

    const hitTarget = svgEl<SVGCircleElement>('circle', { r: '14', fill: 'transparent', stroke: 'none', 'pointer-events': 'all' })
    // All milestones are draggable in preview mode; drag handler checks this.started
    hitTarget.style.cursor = 'ew-resize'
    this.attachDragHandlers(hitTarget, m)

    const before = this.dotEl ?? null
    if (before) {
      this.svg.insertBefore(tick,      before)
      this.svg.insertBefore(circle,    before)
      this.svg.insertBefore(label,     before)
      if (sublabel) this.svg.insertBefore(sublabel, before)
      this.svg.insertBefore(hitTarget, before)
    } else {
      this.svg.appendChild(tick)
      this.svg.appendChild(circle)
      this.svg.appendChild(label)
      if (sublabel) this.svg.appendChild(sublabel)
      this.svg.appendChild(hitTarget)
    }
    this.markerEls.set(m.id, { circle, label, sublabel, tick, hitTarget })
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  private attachDragHandlers(hitTarget: SVGCircleElement, m: Milestone): void {
    hitTarget.addEventListener('pointerdown', (e) => {
      if (this.started) return  // locked once mission is live
      e.preventDefault()
      this.dragId = m.id
      hitTarget.setPointerCapture(e.pointerId)
      this.showTooltip(m)
    })
    hitTarget.addEventListener('pointermove', (e) => {
      if (this.dragId !== m.id) return
      e.preventDefault()
      m.met = Math.round(this.clientXToMet(e.clientX))
      // If this is the last milestone, extend the domain ceiling (never shrink it).
      const lastMs = this.milestones[this.milestones.length - 1]
      if (m === lastMs && m.met > this.previewDomainMax) {
        this.previewDomainMax = m.met
      }
      this.redraw()
      this.showTooltip(m)
    })
    const end = () => { if (this.dragId === m.id) { this.dragId = null; this.hideTooltip() } }
    hitTarget.addEventListener('pointerup',     end)
    hitTarget.addEventListener('pointercancel', end)
  }

  private showTooltip(m: Milestone): void {
    const { x, y } = this.milestoneXY(m)
    const label = formatMET(m.met)
    this.tooltipText.textContent = label

    const padX = 8, padY = 5, textW = label.length * 7.5, textH = 14
    const bgW  = textW + padX * 2, bgH = textH + padY * 2
    const tipY = y - 36
    this.tooltipBg.setAttribute('x',      (x - bgW / 2).toFixed(1))
    this.tooltipBg.setAttribute('y',      (tipY - bgH / 2).toFixed(1))
    this.tooltipBg.setAttribute('width',  bgW.toFixed(1))
    this.tooltipBg.setAttribute('height', bgH.toFixed(1))
    this.tooltipText.setAttribute('x', x.toFixed(1))
    this.tooltipText.setAttribute('y', (tipY + textH / 2 - 2).toFixed(1))
    this.tooltipGroup.style.display = ''
  }

  private hideTooltip(): void { this.tooltipGroup.style.display = 'none' }

  // ── Draw ─────────────────────────────────────────────────────────────────────

  private redraw(): void {
    if (this.w === 0) return
    if (!this.started) { this.redrawPreview(); return }
    this.redrawLive()
  }

  private redrawPreview(): void {
    const { xLeft, xRight, xCtrl, yBot, yCtrl } = this

    // Full arc track
    this.trackEl.setAttribute('d',
      `M ${xLeft.toFixed(1)} ${yBot.toFixed(1)} Q ${xCtrl.toFixed(1)} ${yCtrl.toFixed(1)} ${xRight.toFixed(1)} ${yBot.toFixed(1)}`)

    // No progress segment
    this.progressEl.setAttribute('d', '')

    // Milestones spread proportionally
    for (const m of this.milestones) {
      const els = this.markerEls.get(m.id)!
      const f   = clamp(this.previewFrac(m.met), 0, 1)
      const x   = this.mx(f)
      const y   = this.my(f)

      els.circle.style.display    = ''
      els.label.style.display     = ''
      els.tick.style.display      = ''
      els.hitTarget.style.display = ''

      els.circle.setAttribute('cx', x.toFixed(1))
      els.circle.setAttribute('cy', y.toFixed(1))
      els.tick.setAttribute('x1', x.toFixed(1)); els.tick.setAttribute('y1', (y - 7).toFixed(1))
      els.tick.setAttribute('x2', x.toFixed(1)); els.tick.setAttribute('y2', (y - 20).toFixed(1))
      els.label.setAttribute('x', x.toFixed(1))
      els.label.setAttribute('y', (y - 24).toFixed(1))
      if (els.sublabel) {
        els.sublabel.setAttribute('x', x.toFixed(1))
        els.sublabel.setAttribute('y', (y - 36).toFixed(1))
        els.sublabel.setAttribute('fill', 'rgba(200,210,220,0.38)')
      }
      els.hitTarget.setAttribute('cx', x.toFixed(1))
      els.hitTarget.setAttribute('cy', y.toFixed(1))

      // All dim in preview — none triggered yet
      els.circle.setAttribute('fill',   'none')
      els.circle.setAttribute('stroke', 'rgba(255,255,255,0.35)')
      els.label.setAttribute('fill',    'rgba(200,210,220,0.70)')
      els.tick.setAttribute('stroke',   'rgba(255,255,255,0.25)')
      els.hitTarget.style.cursor = 'ew-resize'
    }

    // Now dot at left edge (T+0 start position, f=0)
    this.dotEl.setAttribute('cx', this.mx(0).toFixed(1))
    this.dotEl.setAttribute('cy', this.my(0).toFixed(1))
  }

  private redrawLive(): void {
    const { xLeft, xRight, xCtrl, yBot, yCtrl } = this

    this.trackEl.setAttribute('d',
      `M ${xLeft.toFixed(1)} ${yBot.toFixed(1)} Q ${xCtrl.toFixed(1)} ${yCtrl.toFixed(1)} ${xRight.toFixed(1)} ${yBot.toFixed(1)}`)

    const nowX = this.mx(NOW_FRAC)
    const nowY = this.my(NOW_FRAC)
    const cpx  = (1 - NOW_FRAC) * xLeft + NOW_FRAC * xCtrl
    const cpy  = (1 - NOW_FRAC) * yBot  + NOW_FRAC * yCtrl
    this.progressEl.setAttribute('d',
      `M ${xLeft.toFixed(1)} ${yBot.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${nowX.toFixed(1)} ${nowY.toFixed(1)}`)

    this.dotEl.setAttribute('cx', nowX.toFixed(1))
    this.dotEl.setAttribute('cy', nowY.toFixed(1))

    const displayMet = Math.max(this.lastMet, this.fMin)

    for (const m of this.milestones) {
      const els = this.markerEls.get(m.id)!
      const f   = this.metToFrac(m.met, displayMet)
      const visible = f >= -0.02 && f <= 1.02

      const hide = (v: boolean) => {
        els.circle.style.display    = v ? 'none' : ''
        els.label.style.display     = v ? 'none' : ''
        els.tick.style.display      = v ? 'none' : ''
        els.hitTarget.style.display = v ? 'none' : ''
        if (els.sublabel) els.sublabel.style.display = v ? 'none' : ''
      }

      if (!visible) { hide(true); continue }
      hide(false)

      const cf = clamp(f, 0, 1)
      const x  = this.mx(cf)
      const y  = this.my(cf)

      els.circle.setAttribute('cx', x.toFixed(1))
      els.circle.setAttribute('cy', y.toFixed(1))
      els.tick.setAttribute('x1', x.toFixed(1)); els.tick.setAttribute('y1', (y - 7).toFixed(1))
      els.tick.setAttribute('x2', x.toFixed(1)); els.tick.setAttribute('y2', (y - 20).toFixed(1))
      els.label.setAttribute('x', x.toFixed(1))
      els.label.setAttribute('y', (y - 24).toFixed(1))
      if (els.sublabel) {
        els.sublabel.setAttribute('x', x.toFixed(1))
        els.sublabel.setAttribute('y', (y - 36).toFixed(1))
      }
      els.hitTarget.setAttribute('cx', x.toFixed(1))
      els.hitTarget.setAttribute('cy', y.toFixed(1))

      const triggered = this.lastTriggered.has(m.id)
      if (triggered) {
        els.circle.setAttribute('fill',   'rgba(255,255,255,0.92)')
        els.circle.setAttribute('stroke', 'rgba(255,255,255,0.35)')
        els.label.setAttribute('fill',    'rgba(240,242,245,0.90)')
        els.tick.setAttribute('stroke',   'rgba(255,255,255,0.28)')
        if (els.sublabel) els.sublabel.setAttribute('fill', 'rgba(240,242,245,0.45)')
        els.hitTarget.style.cursor = 'default'
      } else {
        els.circle.setAttribute('fill',   'none')
        els.circle.setAttribute('stroke', 'rgba(255,255,255,0.22)')
        els.label.setAttribute('fill',    'rgba(200,210,220,0.38)')
        els.tick.setAttribute('stroke',   'rgba(255,255,255,0.18)')
        if (els.sublabel) els.sublabel.setAttribute('fill', 'rgba(200,210,220,0.25)')
        els.hitTarget.style.cursor = 'default'
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Switch from preview to live scrolling mode. */
  start(): void {
    this.started = true
    this.redraw()
  }

  get isStarted(): boolean { return this.started }

  update(met: number, triggeredIds: Set<string>): void {
    this.lastMet       = met
    this.lastTriggered = triggeredIds
    this.redraw()
  }

  setProfile(profile: MissionProfile): void {
    for (const els of this.markerEls.values()) {
      els.tick.remove()
      els.circle.remove()
      els.label.remove()
      els.sublabel?.remove()
      els.hitTarget.remove()
    }
    this.markerEls.clear()

    this.milestones = profile.milestones
    const mets = this.milestones.map(m => m.met)
    this.fMin           = Math.min(...mets)
    this.previewDomainMax = Math.max(...mets)

    for (const m of this.milestones) this.createMarkerEls(m)

    this.started      = false   // back to preview for new profile
    this.lastMet      = -999
    this.lastTriggered = new Set()
    this.redraw()
  }
}
