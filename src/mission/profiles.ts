export interface Milestone {
  id: string
  label: string
  sublabel?: string
  met: number
  type: 'auto' | 'detected'
}

export interface MissionProfile {
  name: string
  vehicle: string
  targetMaxSpeed: number    // m/s
  targetMaxAltitude: number // km
  milestones: Milestone[]
  launchEpoch?: number
}

export const LKO_PROFILE: MissionProfile = {
  name: 'ORBITAL',
  vehicle: 'STAGE 1',
  targetMaxSpeed: 2500,
  targetMaxAltitude: 200,
  milestones: [
    { id: 'LIFTOFF', label: 'LIFTOFF', met: 0,   type: 'auto' },
    { id: 'MAXQ',    label: 'MAX-Q',   met: 65,  type: 'detected' },
    { id: 'MECO',    label: 'MECO',    met: 155, type: 'detected' },
    { id: 'SECO',    label: 'SECO',    met: 540, type: 'detected' },
  ],
}

export const BOOSTER_LANDING_PROFILE: MissionProfile = {
  name: 'BOOSTER LANDING',
  vehicle: 'BOOSTER',
  targetMaxSpeed: 1800,
  targetMaxAltitude: 80,
  milestones: [
    { id: 'LIFTOFF',   label: 'LIFTOFF',   met: 0,   type: 'auto' },
    { id: 'MAXQ',      label: 'MAX-Q',     met: 65,  type: 'detected' },
    { id: 'MECO',      label: 'MECO',      met: 155, type: 'detected' },
    { id: 'BOOSTBACK', label: 'BOOSTBACK', met: 195, type: 'auto' },
    { id: 'COAST',     label: 'COAST',     met: 380, type: 'auto' },
    { id: 'REENTRY',   label: 'RE-ENTRY',  met: 420, type: 'auto' },
    { id: 'AERODESC',  label: 'AERO DESC', met: 480, type: 'auto' },
    { id: 'LANDING',   label: 'LANDING',   met: 530, type: 'auto' },
  ],
}

export const PAYLOAD_DEPLOY_PROFILE: MissionProfile = {
  name: 'PAYLOAD DEPLOY',
  vehicle: 'UPPER STAGE',
  targetMaxSpeed: 2500,
  targetMaxAltitude: 400,
  milestones: [
    { id: 'LIFTOFF', label: 'LIFTOFF', met: 0,   type: 'auto' },
    { id: 'MAXQ',    label: 'MAX-Q',   met: 65,  type: 'detected' },
    { id: 'MECO',    label: 'MECO',    met: 155, type: 'detected' },
    { id: 'COAST',   label: 'COAST',   met: 300, type: 'auto' },
    { id: 'SECO1',   label: 'SECO-1',  met: 540, type: 'detected' },
    { id: 'SECO2',   label: 'SECO-2',  met: 780, type: 'detected' },
    { id: 'DEPLOY',  label: 'DEPLOY',  met: 900, type: 'auto' },
  ],
}

export const RE_ENTRY_PROFILE: MissionProfile = {
  name: 'RE-ENTRY',
  vehicle: 'CAPSULE',
  targetMaxSpeed: 3000,
  targetMaxAltitude: 200,
  milestones: [
    { id: 'DEORBIT', label: 'DEORBIT', met: 0,   type: 'auto' },
    { id: 'ENTRY',   label: 'ENTRY',   met: 180, type: 'auto' },
    { id: 'CHUTE',   label: 'DROGUE',  met: 360, type: 'auto' },
    { id: 'MAIN',    label: 'MAIN',    met: 420, type: 'auto' },
    { id: 'LANDING', label: 'LANDING', met: 480, type: 'auto' },
  ],
}

export const ALL_PROFILES: MissionProfile[] = [
  LKO_PROFILE,
  BOOSTER_LANDING_PROFILE,
  PAYLOAD_DEPLOY_PROFILE,
  RE_ENTRY_PROFILE,
]
