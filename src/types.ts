export type DistanceState = 'too-close' | 'normal' | 'too-far' | 'unavailable'

export type BlinkState =
  | 'normal'
  | 'low-rate'
  | 'tracking'
  | 'undetected'

export type PostureState =
  | 'normal'
  | 'head-down'
  | 'forward-head'
  | 'head-tilt'
  | 'shoulder-tilt'
  | 'undetected'

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'denied'
  | 'unavailable'
  | 'detecting'
  | 'ready'

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export type ScreenMode = 'single' | 'multi'

export type ReminderAction = 'complete'

export type ReminderId =
  | 'camera-combo'
  | 'distance-close'
  | 'blink-rate-low'
  | 'posture-head-down'
  | 'posture-forward-head'
  | 'posture-head-tilt'
  | 'posture-shoulder-tilt'
  | 'eye-duration'

export type ReminderGroup =
  | 'combo-risk'
  | 'distance-risk'
  | 'posture-risk'
  | 'eye-care'
  | 'blink-care'

export interface ReminderCandidate {
  id: ReminderId
  group: ReminderGroup
  priority: number
  severity: 'gentle' | 'strong'
  title: string
  message: string
  guidance: string[]
  dueSince: number
  cooldownMs: number
  resolve: (action: ReminderAction) => void
}

export interface ReminderInstance extends ReminderCandidate {
  activatedAt: number
}

export interface PoseFlags {
  tooClose: boolean
  headDown: boolean
  forwardHead: boolean
  headTilt: boolean
  shoulderTilt: boolean
}

export interface DemoFlags extends PoseFlags {
  lowBlink: boolean
}
