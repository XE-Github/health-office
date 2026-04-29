import type { PoseFlags } from '../types'
import type {
  FaceContourName,
  FaceScreenAlignment,
} from './poseMonitorTypes'

export const totalFaceKeypoints = 478
export const poseKeypointThreshold = 0.4
export const frameIntervalMs = 750
export const calibrationFrameIntervalMs = 260
export const blinkFrameIntervalMs = 90
export const faceLandmarkerFrameIntervalMs = 950
export const faceLandmarkerRetryDelayMs = 15 * 1000
export const blinkLostTrackMs = 1400
export const blinkRateWindowMs = 60 * 1000
export const blinkMinFaceRatio = 0.07
export const blinkMinObservationMs = 20 * 1000
export const blinkLongClosureMs = 1400
export const blinkBaselineMinEar = 0.11
export const blinkBaselineSampleCount = 8
export const blinkCloseThresholdFloor = 0.12
export const blinkMinDurationMs = 38
export const blinkMaxDurationMs = 900
export const blinkMotionThreshold = 0.24
export const blinkHardMotionThreshold = 0.12
export const blinkOpenThresholdFloor = 0.14
export const blinkScaleDeltaThreshold = 0.22
export const blinkHardScaleDeltaThreshold = 0.1
export const blinkMotionSuppressMs = 900
export const blinkCloseFaceRatio = 0.24
export const blinkCloseMotionThresholdFactor = 0.72
export const blinkEyeImbalanceThreshold = 0.42
export const calibrationMinFaceRatio = 0.078
export const calibrationMaxFaceRatio = 0.32
export const calibrationMotionThreshold = 0.12
export const calibrationScaleDeltaThreshold = 0.1
export const irisDiameterBalanceThreshold = 0.35
export const calibrationStableFrameTarget = 2
export const postureCalibrationStableFrameTarget = 2
export const postureCalibrationMotionThreshold = 0.08
export const postureCalibrationScaleDeltaThreshold = 0.08
export const postureCalibrationRatioDeltaThreshold = 0.035
export const baselineSampleTarget = 6

export const faceMetricIndices = {
  forehead: 10,
  leftCheek: 454,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  lowerLip: 14,
  noseTip: 1,
  rightCheek: 234,
  rightEyeInner: 133,
  rightEyeOuter: 33,
  chin: 152,
  upperLip: 13,
} as const

export const blinkEyeIndices = {
  left: [362, 380, 374, 263, 386, 385],
  right: [33, 159, 158, 133, 153, 145],
} as const

export const irisIndices = {
  left: [468, 469, 470, 471, 472],
  right: [473, 474, 475, 476, 477],
} as const

export const faceContourNames = [
  'faceOval',
  'leftEye',
  'rightEye',
  'leftEyebrow',
  'rightEyebrow',
  'lips',
  'leftIris',
  'rightIris',
] as const satisfies readonly FaceContourName[]

export const faceContourColors: Record<FaceContourName, string> = {
  faceOval: 'rgba(255, 214, 143, 0.92)',
  leftEye: 'rgba(121, 203, 255, 0.92)',
  rightEye: 'rgba(121, 203, 255, 0.92)',
  leftEyebrow: 'rgba(161, 228, 182, 0.92)',
  rightEyebrow: 'rgba(161, 228, 182, 0.92)',
  lips: 'rgba(255, 161, 176, 0.94)',
  leftIris: 'rgba(255, 244, 133, 0.98)',
  rightIris: 'rgba(255, 244, 133, 0.98)',
}

export const defaultFaceScreenAlignment: FaceScreenAlignment = {
  detector: 'face-mesh',
  horizontal: 'center',
  horizontalOffset: 0,
  pitchDeg: null,
  pitchProxy: 0,
  quality: 0,
  reason: 'face-missing',
  rollDeg: 0,
  status: 'undetected',
  vertical: 'level',
  verticalOffset: 0,
  yawDeg: null,
  yawProxy: 0,
}

export const labelledPosePoints = new Set([
  'nose',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
])

export const defaultFlags: PoseFlags = {
  tooClose: false,
  headDown: false,
  forwardHead: false,
  headTilt: false,
  shoulderTilt: false,
}
