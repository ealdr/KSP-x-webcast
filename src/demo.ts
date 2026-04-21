/**
 * Demo mode — simulates a Kerbin LKO launch so the HUD is fully visible
 * without KSP running. Activated when kRPC connection fails.
 *
 * Returns a `run()` function. Call it (e.g. from the START button handler)
 * to begin the simulation loop.
 */

import { SpeedDial }    from './hud/SpeedDial'
import { AltitudeDial } from './hud/AltitudeDial'
import { MetClock }     from './hud/MetClock'
import { TimelineArc }  from './hud/TimelineArc'
import { MissionState } from './mission/state'
import type { MissionProfile } from './mission/profiles'

/** Cubic ease-in-out between a and b over [0,1]. */
function ease(t: number, a: number, b: number): number {
  const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  return a + (b - a) * e
}

/**
 * Prepare demo mode: show badge, set dot color.
 * Returns a `run()` function to start the simulation (call on START press).
 */
export function startDemo(
  _profile: MissionProfile,
  speedDial: SpeedDial,
  altDial: AltitudeDial,
  metClock: MetClock,
  timeline: TimelineArc,
  missionState: MissionState,
  stageEl: HTMLElement,
  dot: HTMLElement,
): () => void {
  dot.className = 'conn-dot demo'

  const badge = document.createElement('div')
  badge.textContent = 'DEMO MODE — NO KSP CONNECTION'
  badge.style.cssText = `
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(192,40,42,0.85); color: #fff;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 11px; font-weight: 500; letter-spacing: 0.14em;
    padding: 5px 14px; border-radius: 3px; z-index: 50;
    text-transform: uppercase;
  `
  document.body.appendChild(badge)

  // ── Simulated launch timeline ──────────────────────────────────────────
  const LOOP_DURATION = 660
  const REAL_SECONDS_PER_SIM_SECOND = 0.4

  function simMet(startReal: number, realMs: number): number {
    const elapsed    = (realMs - startReal) / 1000
    const simElapsed = elapsed / REAL_SECONDS_PER_SIM_SECOND
    const looped     = simElapsed % LOOP_DURATION
    return looped - 10
  }

  function simSpeed(met: number): number {
    if (met < 0)   return 0
    if (met < 155) return ease(met / 155, 0, 2200)
    if (met < 540) return ease((met - 155) / 385, 2200, 80)
    return 80
  }

  function simAlt(met: number): number {
    if (met < 0)   return 0.07
    if (met < 155) return ease(met / 155, 0.07, 80)
    if (met < 540) return ease((met - 155) / 385, 80, 185)
    return 185
  }

  return function run(): void {
    const startReal = performance.now()
    let prevSimMet  = -999
    let liftoffRecorded = false

    function tick(): void {
      const now = performance.now()
      const met = simMet(startReal, now)

      // Detect loop reset
      if (met < prevSimMet - 5) {
        liftoffRecorded = false
        missionState.reset()
        metClock.liftoffUT = null
        timeline.setProfile(_profile)  // back to preview between loops
      }
      prevSimMet = met

      // Liftoff
      if (!liftoffRecorded && met >= 0) {
        liftoffRecorded = true
        metClock.liftoffUT = 0
        missionState.trigger('LIFTOFF', 0)
        if (!timeline.isStarted) timeline.start()
      }

      missionState.tick(met)

      if (met >= 62 && !missionState.isTriggered('MAXQ'))  missionState.trigger('MAXQ', 62)
      if (met >= 155 && !missionState.isTriggered('MECO')) { missionState.trigger('MECO', 155); stageEl.textContent = '0' }
      if (met >= 540 && !missionState.isTriggered('SECO')) missionState.trigger('SECO', 540)

      const fakeLiftoffUT = 1_000_000
      const fakeUT = fakeLiftoffUT + Math.max(met, 0)
      if (liftoffRecorded && metClock.liftoffUT === 0) metClock.liftoffUT = fakeLiftoffUT
      metClock.update(fakeUT)

      speedDial.update(simSpeed(met))
      altDial.update(simAlt(met))
      timeline.update(met, missionState.triggeredIds)

      if (met < 0) stageEl.textContent = '1'

      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }
}
