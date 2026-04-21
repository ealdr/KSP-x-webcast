/**
 * MissionState — tracks which milestones have triggered and when.
 *
 * - 'auto' milestones fire automatically when MET reaches their estimated met.
 * - 'detected' milestones are triggered externally (from MilestoneDetector).
 * - LIFTOFF (id='LIFTOFF') is triggered by the main loop when liftoff is
 *   detected; calling setLiftoff() records it.
 */

import type { MissionProfile, Milestone } from './profiles'

export interface TriggeredMilestone {
  id: string
  met: number  // actual MET when it fired
}

export class MissionState {
  private profile: MissionProfile
  private triggered = new Map<string, TriggeredMilestone>()

  constructor(profile: MissionProfile) {
    this.profile = profile
  }

  get milestones(): Milestone[] {
    return this.profile.milestones
  }

  get triggeredIds(): Set<string> {
    return new Set(this.triggered.keys())
  }

  /** Call every poll frame. Fires any 'auto' milestones whose MET has passed. */
  tick(met: number): void {
    for (const m of this.profile.milestones) {
      if (m.type === 'auto' && !this.triggered.has(m.id) && met >= m.met) {
        this.trigger(m.id, m.met)
      }
    }
  }

  /** Explicitly trigger a milestone (for 'detected' events from MilestoneDetector). */
  trigger(id: string, met: number): void {
    if (!this.triggered.has(id)) {
      this.triggered.set(id, { id, met })
      console.log(`[Mission] ${id} @ T+${met.toFixed(1)}s`)
    }
  }

  isTriggered(id: string): boolean {
    return this.triggered.has(id)
  }

  getTriggered(id: string): TriggeredMilestone | undefined {
    return this.triggered.get(id)
  }

  setProfile(profile: MissionProfile): void {
    this.profile = profile
    this.triggered.clear()
  }

  reset(): void {
    this.triggered.clear()
  }
}
