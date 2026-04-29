import type * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'
import type * as poseDetection from '@tensorflow-models/pose-detection'

export interface MonitorMetrics {
  confidence: number
  faceConfidence: number
  poseConfidence: number
  faceRatio: number
  eyeSpanRatio: number
  irisRatio: number | null
  faceToShoulderRatio: number
  noseShoulderRatio: number
  eyeShoulderRatio: number
  chinShoulderRatio: number
  mouthShoulderRatio: number
  shoulderWidthRatio: number
  shoulderTiltDeg: number
  headRollDeg: number
}

export interface BaselineMetrics {
  faceRatio: number
  eyeSpanRatio: number
  faceToShoulderRatio: number
  noseShoulderRatio: number
  eyeShoulderRatio: number
  chinShoulderRatio: number
  mouthShoulderRatio: number
  shoulderWidthRatio: number
  shoulderTiltDeg: number
  headRollDeg: number
}

export interface KeypointSnapshot {
  name: string
  score: number
  x: number
  y: number
}

export interface BlinkMetrics {
  averageEar: number
  baselineEar: number | null
  blinksInWindow: number
  leftEar: number
  observationMs: number
  ratePerMin: number
  rightEar: number
}

export interface BlinkFrameAnalysis {
  averageEar: number
  centerX: number
  centerY: number
  faceWidth: number
  leftEar: number
  rightEar: number
}

export interface BlinkFaceSnapshot {
  centerX: number
  centerY: number
  faceWidth: number
}

export interface DistanceCalibrationSnapshotFrame {
  centerX: number
  centerY: number
  faceWidth: number
}

export interface DistanceCalibrationSnapshot {
  baselineSignalRatio: number | null
  blockingReason: DistanceCalibrationBlockingReason
  sampleCount: number
  sampleTarget: number
  status: 'idle' | 'sampling' | 'ready'
  updatedAt: number | null
}

export type DistanceCalibrationBlockingReason =
  | 'none'
  | 'too-close'
  | 'too-far'
  | 'face'
  | 'detecting'
  | 'unstable'
  | 'restart'
  | 'alignment'

export type PostureCalibrationBlockingReason =
  | 'none'
  | 'face'
  | 'pose'
  | 'detecting'
  | 'unstable'
  | 'restart'
  | 'alignment'

export interface DistanceCalibrationMetrics {
  centerX: number
  centerY: number
  eyeSpanRatio: number
  irisRatio: number | null
  faceRatio: number
  signalRatio: number
  faceWidth: number
}

export interface AlignmentBaselineMetrics {
  horizontalOffset: number
  pitchDeg: number
  rollDeg: number
  verticalOffset: number
  yawDeg: number
}

export interface PostureCalibrationSnapshotFrame {
  centerX: number
  centerY: number
  eyeShoulderRatio: number
  faceToShoulderRatio: number
  faceWidth: number
  noseShoulderRatio: number
  shoulderWidthRatio: number
}

export interface PostureCalibrationSnapshot {
  blockingReason: PostureCalibrationBlockingReason
  sampleCount: number
  sampleTarget: number
  status: 'idle' | 'sampling' | 'ready'
  updatedAt: number | null
}

export interface DistanceThresholds {
  closeRatio: number
  normalRatio: number
  farRatio: number
}

export type FaceScreenAlignmentStatus = 'in-range' | 'edge' | 'out-of-range' | 'undetected'
export type FaceScreenHorizontal = 'left' | 'center' | 'right'
export type FaceScreenVertical = 'up' | 'level' | 'down'

export interface FaceScreenAlignment {
  detector: 'face-landmarker' | 'face-mesh'
  horizontal: FaceScreenHorizontal
  horizontalOffset: number
  pitchDeg: number | null
  pitchProxy: number
  quality: number
  reason: 'none' | 'face-off-center' | 'face-angle' | 'face-roll' | 'face-missing'
  rollDeg: number
  status: FaceScreenAlignmentStatus
  vertical: FaceScreenVertical
  verticalOffset: number
  yawDeg: number | null
  yawProxy: number
}

export type FaceLandmarkerWorkerRequest = {
  bitmap: ImageBitmap
  id: number
  timestampMs: number
  type: 'detect'
}

export type FaceLandmarkerWorkerResponse =
  | {
      alignment: FaceScreenAlignment | null
      id: number
      ok: true
    }
  | {
      error: string
      id: number
      ok: false
    }

export interface PersistedDistanceCalibrationPayload {
  metrics: Pick<
    DistanceCalibrationMetrics,
    'eyeSpanRatio' | 'irisRatio' | 'faceRatio' | 'signalRatio'
  >
  updatedAt: number
  version: 1
}

export interface PersistedPostureCalibrationPayload {
  alignment: AlignmentBaselineMetrics | null
  metrics: BaselineMetrics
  updatedAt: number
  version: 1 | 2
}

export interface PersistedBlinkDailyCountPayload {
  count: number
  date: string
  version: 1
}

export type DistanceSignalSource = 'iris' | 'face'

export type StableState<T extends string> = {
  count: number
  pending: T | null
  stable: T
}

export type FaceContourName =
  | 'faceOval'
  | 'leftEye'
  | 'rightEye'
  | 'leftEyebrow'
  | 'rightEyebrow'
  | 'lips'
  | 'leftIris'
  | 'rightIris'

export type FaceContourMap = Partial<Record<FaceContourName, number[]>>

export type DualDetectors = {
  faceContours: FaceContourMap
  faceDetector: faceLandmarksDetection.FaceLandmarksDetector
  poseDetector: poseDetection.PoseDetector
  posePairs: Array<[number, number]>
  runtimeLabel: string
}

export interface PoseMonitorOptions {
  blinkLowRateThreshold?: number
  distanceThresholds?: DistanceThresholds
  workspaceAlignmentBaseline?: {
    horizontalOffset: number
    pitchDeg: number
    rollDeg: number
    verticalOffset: number
    yawDeg: number
  } | null
  workspaceDistanceBaseline?: {
    eyeSpanRatio: number
    faceRatio: number
    irisRatio: number | null
    signalRatio: number
  } | null
  workspacePostureBaseline?: {
    chinShoulderRatio: number
    eyeShoulderRatio: number
    eyeSpanRatio: number
    faceRatio: number
    faceToShoulderRatio: number
    headRollDeg: number
    mouthShoulderRatio: number
    noseShoulderRatio: number
    shoulderTiltDeg: number
    shoulderWidthRatio: number
  } | null
  workspacePostureBaselineLocked?: boolean
}
