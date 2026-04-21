/**
 * Real-time milestone detectors driven by kRPC telemetry.
 *
 * MAX-Q: track running peak dynamic pressure; latch when Q drops below
 *        95 % of max for more than 1 second.
 *
 * MECO:  fire when the active stage decrements AND vessel thrust drops to 0
 *        within the same poll frame.
 *
 * STARTUP / LIFTOFF are handled by MissionState (auto + liftoff detection).
 */

export interface TelemetrySnapshot {
  met: number            // current MET in seconds (positive after liftoff)
  dynamicPressure: number // Pa
  thrust: number          // N
  stage: number           // current_stage from kRPC
}

export type DetectedEvent = { id: string; met: number }

export class MilestoneDetector {
  // MAX-Q tracking
  private peakQ = 0
  private peakQMet = 0
  private maxQTriggered = false

  // MECO tracking
  private prevStage: number | null = null
  private mecoTriggered = false

  // SECO tracking (second stage cutoff — subsequent stage drop + thrust=0)
  private mecoCount = 0
  private secoTriggered = false

  /**
   * Feed each poll snapshot in. Returns any newly detected events.
   * Only emits each event once.
   */
  tick(snap: TelemetrySnapshot): DetectedEvent[] {
    const events: DetectedEvent[] = []

    if (snap.met < 0) {
      // Before liftoff — reset state, don't track
      this.prevStage = snap.stage
      return events
    }

    // ── MAX-Q ─────────────────────────────────────────────────────────────
    if (!this.maxQTriggered) {
      if (snap.dynamicPressure > this.peakQ) {
        this.peakQ    = snap.dynamicPressure
        this.peakQMet = snap.met
      }
      // Q has dropped > 5 % from peak for more than 1 s
      if (
        this.peakQ > 0 &&
        snap.dynamicPressure < this.peakQ * 0.95 &&
        snap.met - this.peakQMet > 1.0
      ) {
        this.maxQTriggered = true
        events.push({ id: 'MAXQ', met: this.peakQMet })
      }
    }

    // ── MECO / SECO (stage separation + thrust cutoff) ─────────────────────
    if (this.prevStage !== null && snap.stage < this.prevStage && snap.thrust === 0) {
      this.mecoCount++
      if (!this.mecoTriggered) {
        this.mecoTriggered = true
        events.push({ id: 'MECO', met: snap.met })
      } else if (!this.secoTriggered) {
        this.secoTriggered = true
        events.push({ id: 'SECO', met: snap.met })
      }
    }
    this.prevStage = snap.stage

    return events
  }

  reset(): void {
    this.peakQ = 0
    this.peakQMet = 0
    this.maxQTriggered = false
    this.prevStage = null
    this.mecoTriggered = false
    this.secoTriggered = false
    this.mecoCount = 0
  }
}
