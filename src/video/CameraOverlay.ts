/**
 * CameraOverlay — camera grid display + top-left control panel.
 *
 * Grid modes: 1 (full-screen), 2 (side-by-side), 4 (2×2), 6 (3×2).
 * Connect flow: user enters JRTI base URL → we fetch the JRTI homepage
 * via the Vite proxy, extract /camera/<id> paths, then embed them as
 * <img> tags (MJPEG streams, no CORS restriction on img).
 */

import { discoverCameras } from './JrtiStream'
import type { VideoState } from './JrtiStream'

type GridMode = 1 | 2 | 4 | 6
const GRID_MODES: GridMode[] = [1, 2, 4, 6]
const LS_BASE_URL = 'jrti-base-url'

export class CameraOverlay {
  private state: VideoState = { baseUrl: '', cameras: [], mainIdx: 0, pipIdx: null }
  private gridMode: GridMode = 1

  private container!: HTMLDivElement
  private feeds: HTMLIFrameElement[] = []

  private panel!:       HTMLElement
  private setupEl!:     HTMLElement
  private activeEl!:    HTMLElement
  private statusEl!:    HTMLElement
  private camLabelEl!:  HTMLElement
  private baseUrlInput!: HTMLInputElement
  private modeBtns:     Partial<Record<GridMode, HTMLButtonElement>> = {}

  constructor() {
    this.buildContainer()
    this.buildPanel()
  }

  // ── Feed container ───────────────────────────────────────────────────────

  private buildContainer(): void {
    this.container = document.createElement('div')
    this.container.className = 'cam-grid mode-1'
    document.body.prepend(this.container)

    for (let i = 0; i < 6; i++) {
      const frame = document.createElement('iframe')
      frame.style.display = 'none'
      frame.style.border = 'none'
      frame.style.width = '100%'
      frame.style.height = '100%'
      frame.setAttribute('allowfullscreen', '')
      this.container.appendChild(frame)
      this.feeds.push(frame)
    }
  }

  // ── Control panel ────────────────────────────────────────────────────────

  private buildPanel(): void {
    this.panel = document.createElement('div')
    this.panel.className = 'cam-panel'

    // Setup view — list of camera URLs
    this.setupEl = document.createElement('div')
    this.setupEl.className = 'cam-setup'
    this.setupEl.innerHTML = `
      <label>Camera URLs</label>
      <div class="cam-url-list"></div>
      <div class="cam-setup-actions">
        <button class="add-cam-btn">+ Add</button>
        <button class="connect-btn">Connect</button>
      </div>
      <div class="cam-status">Not connected</div>
    `
    this.statusEl  = this.setupEl.querySelector('.cam-status')!
    // baseUrlInput kept for TS type — not used in multi-cam mode
    this.baseUrlInput = document.createElement('input')

    const urlList = this.setupEl.querySelector('.cam-url-list')!
    const addRow = (val = '') => {
      const row = document.createElement('div')
      row.className = 'cam-url-row'
      row.innerHTML = `<input type="text" spellcheck="false" placeholder="http://localhost:8080/camera/..." /><button class="remove-cam-btn">✕</button>`
      const inp = row.querySelector('input')!
      inp.value = val
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') this.connect() })
      row.querySelector('.remove-cam-btn')!.addEventListener('click', () => {
        if (urlList.children.length > 1) row.remove()
      })
      urlList.appendChild(row)
    }
    addRow()

    this.setupEl.querySelector('.add-cam-btn')!
      .addEventListener('click', () => addRow())
    this.setupEl.querySelector('.connect-btn')!
      .addEventListener('click', () => this.connect())

    // Active view
    this.activeEl = document.createElement('div')
    this.activeEl.className = 'cam-active'
    this.activeEl.style.display = 'none'
    this.activeEl.innerHTML = `
      <button class="cam-arrow-btn" id="cam-prev">&#8592;</button>
      <span class="cam-label" id="cam-label">CAM 1</span>
      <button class="cam-arrow-btn" id="cam-next">&#8594;</button>
      <span class="cam-mode-divider">|</span>
      <button class="cam-mode-btn" data-mode="1">1</button>
      <button class="cam-mode-btn" data-mode="2">2</button>
      <button class="cam-mode-btn" data-mode="4">4</button>
      <button class="cam-mode-btn" data-mode="6">6</button>
      <button class="cam-settings-btn" title="Settings">&#9881;</button>
    `
    this.camLabelEl = this.activeEl.querySelector('#cam-label')!

    this.activeEl.querySelector('#cam-prev')!
      .addEventListener('click', () => this.cycleMain(-1))
    this.activeEl.querySelector('#cam-next')!
      .addEventListener('click', () => this.cycleMain(+1))
    this.activeEl.querySelector('.cam-settings-btn')!
      .addEventListener('click', () => this.showSetup())

    for (const mode of GRID_MODES) {
      const btn = this.activeEl.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!
      this.modeBtns[mode] = btn
      btn.addEventListener('click', () => this.setMode(mode))
    }

    this.panel.appendChild(this.setupEl)
    this.panel.appendChild(this.activeEl)
    document.body.appendChild(this.panel)
  }

  // ── Connection ───────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    const inputs = Array.from(
      this.setupEl.querySelectorAll<HTMLInputElement>('.cam-url-list input')
    ).map(i => i.value.trim()).filter(Boolean)

    if (inputs.length === 0) { this.setStatus('Enter at least one URL'); return }

    // Store full URLs — iframes navigate directly, no proxy needed.
    this.state.cameras = inputs
    this.state.mainIdx = 0
    this.state.pipIdx  = inputs.length > 1 ? 1 : null

    this.applyFeeds()
    this.setStatus(`Connected — ${inputs.length} camera${inputs.length > 1 ? 's' : ''}`)
    this.showActive()
  }

  // ── Feed rendering ───────────────────────────────────────────────────────

  private applyFeeds(): void {
    const { cameras, mainIdx } = this.state
    const count = this.gridMode

    this.container.className = `cam-grid mode-${count}`

    for (let i = 0; i < 6; i++) {
      const feed = this.feeds[i]
      if (i < count && cameras.length > 0) {
        const camIdx = (mainIdx + i) % cameras.length
        const url = cameras[camIdx]
        if (feed.dataset.src !== url) {
          feed.dataset.src = url
          feed.src = url  // iframe navigates directly to the stream URL
        }
        feed.style.display = ''
      } else {
        feed.style.display = 'none'
      }
    }

    if (count === 1) {
      this.camLabelEl.textContent = cameras.length
        ? `CAM ${mainIdx + 1} / ${cameras.length}`
        : 'CAM --'
    } else {
      this.camLabelEl.textContent = `${count} CAM`
    }
  }

  private cycleMain(dir: 1 | -1): void {
    const { cameras } = this.state
    if (!cameras.length) return
    this.state.mainIdx = (this.state.mainIdx + dir + cameras.length) % cameras.length
    this.applyFeeds()
  }

  private setMode(mode: GridMode): void {
    this.gridMode = mode
    for (const m of GRID_MODES) {
      this.modeBtns[m]?.classList.toggle('active', m === mode)
    }
    this.applyFeeds()
  }

  // ── Panel helpers ────────────────────────────────────────────────────────

  private showSetup(): void {
    this.setupEl.style.display  = ''
    this.activeEl.style.display = 'none'
  }

  private showActive(): void {
    this.setupEl.style.display  = 'none'
    this.activeEl.style.display = ''
    this.modeBtns[this.gridMode]?.classList.add('active')
  }

  private setStatus(msg: string): void {
    this.statusEl.textContent = msg
  }
}
