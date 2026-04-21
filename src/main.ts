/**
 * Main entry point — wires Telemachus telemetry to the HUD.
 *
 * Rendering is decoupled from data: Telemachus data arrives at ~2 Hz and
 * updates shared state; a requestAnimationFrame loop renders at 60 fps.
 */

import './hud/hud.css'
import { TelemachusClient } from './krpc/telemachus'
import { SpeedDial }        from './hud/SpeedDial'
import { AltitudeDial }     from './hud/AltitudeDial'
import { MetClock }         from './hud/MetClock'
import { TimelineArc }      from './hud/TimelineArc'
import { MissionState }     from './mission/state'
import { LKO_PROFILE, ALL_PROFILES } from './mission/profiles'
import type { MissionProfile }       from './mission/profiles'
import { startDemo }        from './demo'
import { CameraOverlay }    from './video/CameraOverlay'

const LIFTOFF_ALT = 50   // metres above sea level

// ── Kerbin atmosphere model ────────────────────────────────────────────────────
// Exponential fit to KSP stock Kerbin: ρ₀ = 1.223 kg/m³, H = 5842 m, ceil 70 km.
function kerbalDensity(altM: number): number {
  if (altM >= 70_000) return 0
  return 1.2230948554874 * Math.exp(-altM / 5841.6)
}

/** Dynamic pressure  Q = ½ρv²  (Pa). */
function computeQ(altM: number, speedMs: number): number {
  return 0.5 * kerbalDensity(altM) * speedMs * speedMs
}

// ── DOM construction ───────────────────────────────────────────────────────────

function buildHud(profileName: string) {
  const hud = document.createElement('div')
  hud.className = 'hud'
  hud.innerHTML = `
    <div class="timeline-row">
      <div id="timeline-mount"></div>
    </div>
    <div class="telemetry-row">
      <div class="hud-section hud-left">
        <select id="profile-select" class="profile-select"></select>
        <div id="speed-mount"></div>
        <div class="stage-label">STAGE <span id="hud-stage">--</span> TELEMETRY</div>
      </div>
      <div class="hud-divider"></div>
      <div class="hud-section hud-center">
        <div id="met-mount"></div>
        <div class="mission-name">${profileName}</div>
        <button id="start-btn" class="start-btn">START</button>
        <div class="hud-note">NOTE &mdash; MAX-Q WILL BE CALCULATED AUTOMATICALLY</div>
      </div>
      <div class="hud-divider"></div>
      <div class="hud-section hud-right">
        <div id="alt-mount"></div>
      </div>
    </div>
  `
  document.body.appendChild(hud)

  const dot = document.createElement('div')
  dot.className = 'conn-dot connecting'
  document.body.appendChild(dot)

  return {
    timelineMount:  hud.querySelector<HTMLElement>('#timeline-mount')!,
    speedMount:     hud.querySelector<HTMLElement>('#speed-mount')!,
    altMount:       hud.querySelector<HTMLElement>('#alt-mount')!,
    metMount:       hud.querySelector<HTMLElement>('#met-mount')!,
    stageEl:        hud.querySelector<HTMLElement>('#hud-stage')!,
    profileSelect:  hud.querySelector<HTMLSelectElement>('#profile-select')!,
    startBtn:       hud.querySelector<HTMLButtonElement>('#start-btn')!,
    dot,
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  new CameraOverlay()

  let currentProfile: MissionProfile = LKO_PROFILE

  const { timelineMount, speedMount, altMount, metMount, stageEl,
          profileSelect, startBtn, dot } = buildHud(currentProfile.name)

  const speedDial    = new SpeedDial(speedMount, currentProfile.targetMaxSpeed)
  const altDial      = new AltitudeDial(altMount, currentProfile.targetMaxAltitude)
  const metClock     = new MetClock(metMount)
  const timeline     = new TimelineArc(timelineMount, currentProfile)
  const missionState = new MissionState(currentProfile)

  ALL_PROFILES.forEach((p, i) => {
    const opt = document.createElement('option')
    opt.value = String(i)
    opt.textContent = p.name
    profileSelect.appendChild(opt)
  })

  // ── MAX-Q tracking ────────────────────────────────────────────────────────────
  //
  // maxQTargetMet  = where the marker should move to (updated by onData)
  // maxQDisplayMet = actual met written to the milestone (lerped toward target)
  //
  // While Q is rising:   target = met + buffer, where buffer shrinks as Q
  //                       builds (~20 s at low Q, ~3 s near the peak).
  //                       This keeps the marker AHEAD of the now dot and makes
  //                       it approach faster as Q builds ("quicker depending on
  //                       the calculations").
  //
  // When Q drops (peak detected): target snaps to the confirmed past MET so
  //                       the marker animates backward past the now dot to where
  //                       the peak actually was.
  //
  let maxQ          = 0
  let maxQMet       = 0   // MET at which running-peak Q was observed
  let maxQDropSince: number | null = null
  let maxQTargetMet  = currentProfile.milestones.find(m => m.id === 'MAXQ')?.met ?? 65
  let maxQDisplayMet = maxQTargetMet

  function resetMaxQ() {
    maxQ = 0
    maxQMet = 0
    maxQDropSince = null
    const ms = currentProfile.milestones.find(m => m.id === 'MAXQ')
    maxQTargetMet  = ms ? ms.met : 65
    maxQDisplayMet = maxQTargetMet
  }

  profileSelect.addEventListener('change', () => {
    const p = ALL_PROFILES[Number(profileSelect.value)]
    if (!p) return
    currentProfile = p
    speedDial.setMax(p.targetMaxSpeed)
    altDial.setMax(p.targetMaxAltitude)
    timeline.setProfile(p)
    missionState.setProfile(p)
    metClock.reset()
    resetMaxQ()
    startBtn.style.display = ''
  })

  const client = new TelemachusClient()

  console.log('[Telemachus] Connecting…')
  try {
    await client.connect()
  } catch (e) {
    console.warn('[Telemachus] Connection failed — running in demo mode:', e)
    const runDemo = startDemo(currentProfile, speedDial, altDial, metClock, timeline, missionState, stageEl, dot)
    startBtn.addEventListener('click', () => {
      startBtn.style.display = 'none'
      timeline.start()
      runDemo()
    })
    return
  }

  dot.className = 'conn-dot'

  client.subscribe([
    'v.altitude',
    'v.speed',
    'v.missionTime',
    'v.stage',
    'v.situation',
  ], 500)

  // ── Shared render state (written by onData, read by rAF) ────────────────────
  let renderAltM      = 0
  let renderSpeedMs   = 0
  let renderMet       = -999
  let renderTriggered = new Set<string>()

  // ── Other tracking state ────────────────────────────────────────────────────
  let displayStage    = 1
  let prevStageVal: number | null = null
  let prevSituation = ''
  let mecoSpeedPeak   = 0
  let mecoDropSince:  number | null = null
  let mecoTriggeredMet: number | null = null
  let secoSpeedPeak   = 0
  let secoDropSince:  number | null = null
  let lastMissionTime = 0
  let lastQCalcTime   = -Infinity

  // ── rAF render loop (60 fps) ────────────────────────────────────────────────
  ;(function renderLoop() {
    // Smoothly lerp MAXQ display marker toward its target.
    // The lerp runs every frame; onData only changes the target, not the display.
    if (!missionState.isTriggered('MAXQ')) {
      const diff = maxQTargetMet - maxQDisplayMet
      if (Math.abs(diff) > 0.05) {
        maxQDisplayMet += diff * 0.08
      } else {
        maxQDisplayMet = maxQTargetMet
      }
      const maxqMs = currentProfile.milestones.find(m => m.id === 'MAXQ')
      if (maxqMs) maxqMs.met = maxQDisplayMet
    }

    speedDial.update(renderSpeedMs)
    altDial.update(renderAltM / 1000)
    timeline.update(renderMet, renderTriggered)

    requestAnimationFrame(renderLoop)
  })()

  // ── START button ─────────────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    startBtn.style.display = 'none'
    timeline.start()
    if (!metClock.hasLiftoff) {
      metClock.setLiftoffUT(lastMissionTime)
      missionState.trigger('LIFTOFF', 0)
    }
  })

  // ── Telemachus data handler ───────────────────────────────────────────────────
  // State logic only — all DOM writes happen in the rAF loop above.
  client.onData((data) => {
    const altM        = data['v.altitude']    ?? 0
    const speedMs     = data['v.speed']       ?? 0
    const missionTime = data['v.missionTime'] ?? 0
    const stage       = data['v.stage']
    const situation   = data['v.situation']   ?? ''

    lastMissionTime = missionTime
    renderAltM      = altM
    renderSpeedMs   = speedMs

    // Stage label
    if (stage != null) {
      if (prevStageVal !== null && stage < prevStageVal) displayStage++
      prevStageVal = stage
      stageEl.textContent = String(displayStage)
    }

    // Restart detection
    if (situation !== prevSituation) {
      prevSituation = situation
      if (situation === 'PRELAUNCH') {
        metClock.reset()
        missionState.reset()
        timeline.setProfile(currentProfile)
        displayStage    = 1
        prevStageVal    = null
        mecoSpeedPeak = 0
        mecoDropSince = null
        mecoTriggeredMet = null
        secoSpeedPeak = 0
        secoDropSince = null
        lastQCalcTime   = -Infinity
        resetMaxQ()
        startBtn.style.display = ''
      }
    }

    // Auto-start timeline on liftoff if START not yet pressed
    if (!timeline.isStarted && (altM > LIFTOFF_ALT || situation === 'FLYING')) {
      timeline.start()
      startBtn.style.display = 'none'
      if (!metClock.hasLiftoff) {
        metClock.setLiftoffUT(missionTime)
        missionState.trigger('LIFTOFF', 0)
      }
    }
    if (!metClock.hasLiftoff && timeline.isStarted &&
        (altM > LIFTOFF_ALT || situation === 'FLYING')) {
      metClock.setLiftoffUT(missionTime)
      missionState.trigger('LIFTOFF', 0)
    }

    metClock.update(missionTime)
    const met = metClock.hasLiftoff ? missionTime - metClock.liftoffUT! : -999

    // ── MAX-Q  Q = ½ρv², throttled to 1 Hz ──────────────────────────────────
    //
    // Target logic:
    //   Rising  → target = met + buffer
    //             buffer = max(3, 20 − q/1000)  Pa→s conversion
    //             e.g. at 5 kPa buffer ≈ 15 s ahead; at 17+ kPa buffer = 3 s ahead.
    //             As Q grows the buffer shrinks, so the marker accelerates toward
    //             the now-dot — "quicker depending on the calculations."
    //
    //   Drop detected → target = maxQMet (past, confirmed position)
    //             rAF lerp then animates marker backward through the now-dot.
    //
    if (met > 0 && !missionState.isTriggered('MAXQ') &&
        missionTime - lastQCalcTime >= 1.0) {
      lastQCalcTime = missionTime
      const q = computeQ(altM, speedMs)   // Pa

      if (q > maxQ) {
        maxQ    = q
        maxQMet = met
        maxQDropSince = null

        // Buffer in seconds: large when Q is low, shrinks to 3 s near the peak.
        // Converts Pa → s: every 1000 Pa of Q removes 1 s of buffer.
        const buffer = Math.max(3, 20 - q / 1000)
        maxQTargetMet = met + buffer

      } else if (maxQ > 0 && q < maxQ * 0.95) {
        if (maxQDropSince === null) {
          maxQDropSince = met
          // Peak has passed — immediately snap target to confirmed past position.
          // The lerp will carry the marker smoothly back through the now-dot.
          maxQTargetMet = maxQMet
        } else if (met - maxQDropSince > 1) {
          missionState.trigger('MAXQ', maxQMet)
          maxQDisplayMet = maxQMet   // ensure display arrives exactly on confirm
          console.log(
            '[Telemachus] MAX-Q @ T+', maxQMet.toFixed(1),
            's  Q =', (maxQ / 1000).toFixed(2), 'kPa',
            ' ρ =', kerbalDensity(altM).toFixed(4), 'kg/m³',
          )
        }
      }
    }

    // ── MECO — speed deceleration after liftoff ──────────────────────────────
    // v.thrust always returns 0 in Telemachus, so we detect MECO by watching
    // when the rocket's speed drops consistently after having peaked.
    // Guard: speed must be > 200 m/s so staging transients don't trigger it.
    if (metClock.hasLiftoff && !missionState.isTriggered('MECO')) {
      if (speedMs > mecoSpeedPeak) {
        mecoSpeedPeak = speedMs
        mecoDropSince = null
      } else if (speedMs < mecoSpeedPeak - 5 && mecoSpeedPeak > 200) {
        if (mecoDropSince === null) mecoDropSince = missionTime
        else if (missionTime - mecoDropSince >= 1.0) {
          missionState.trigger('MECO', met)
          mecoTriggeredMet = met
          console.log('[Telemachus] MECO @ T+', met.toFixed(1), 's, peak speed was', mecoSpeedPeak.toFixed(0), 'm/s')
          mecoDropSince = null
        }
      } else {
        // Speed recovered (e.g. next stage lit) — reset drop timer
        mecoDropSince = null
      }
    }

    // ── SECO — same principle as MECO, requires MECO first ───────────────────
    if (missionState.isTriggered('MECO') && !missionState.isTriggered('SECO') &&
        mecoTriggeredMet !== null && met - mecoTriggeredMet >= 6) {
      if (speedMs > secoSpeedPeak) {
        secoSpeedPeak = speedMs
        secoDropSince = null
      } else if (speedMs < secoSpeedPeak - 5 && secoSpeedPeak > 200) {
        if (secoDropSince === null) secoDropSince = missionTime
        else if (missionTime - secoDropSince >= 1.0) {
          missionState.trigger('SECO', met)
          console.log('[Telemachus] SECO @ T+', met.toFixed(1), 's')
          secoDropSince = null
        }
      } else {
        secoDropSince = null
      }
    }

    missionState.tick(met)

    renderMet       = met
    renderTriggered = missionState.triggeredIds
  })
}

main()
