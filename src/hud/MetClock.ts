function pad(n: number, digits = 2): string {
  return Math.floor(Math.abs(n)).toString().padStart(digits, '0')
}

function formatMET(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '+'
  const abs  = Math.abs(totalSeconds)
  const h    = Math.floor(abs / 3600)
  const m    = Math.floor((abs % 3600) / 60)
  const s    = Math.floor(abs % 60)
  return `T${sign}${pad(h)}:${pad(m)}:${pad(s)}`
}

export class MetClock {
  private clockEl: HTMLElement
  liftoffUT: number | null = null

  constructor(mount: HTMLElement) {
    mount.innerHTML = `<div class="met-clock pre-launch">T+00:00:00</div>`
    this.clockEl = mount.querySelector('.met-clock')!
  }

  setLiftoffUT(ut: number): void {
    this.liftoffUT = ut
    this.clockEl.classList.remove('pre-launch')
  }

  reset(): void {
    this.liftoffUT = null
    this.clockEl.classList.add('pre-launch')
    this.clockEl.textContent = 'T+00:00:00'
  }

  update(currentUT: number): void {
    if (this.liftoffUT === null) return
    this.clockEl.textContent = formatMET(currentUT - this.liftoffUT)
  }

  get hasLiftoff(): boolean {
    return this.liftoffUT !== null
  }
}
