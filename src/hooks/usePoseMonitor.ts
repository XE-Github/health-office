import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type {
  BlinkState,
  CameraStatus,
  DistanceState,
  ModelStatus,
  PoseFlags,
  PostureState,
} from '../types'
import { getDetectors, resetDetectors } from '../lib/poseMonitorDetectors'
import {
  baselineSampleTarget,
  blinkBaselineMinEar,
  blinkBaselineSampleCount,
  blinkCloseThresholdFloor,
  blinkCloseFaceRatio,
  blinkCloseMotionThresholdFactor,
  blinkEyeImbalanceThreshold,
  blinkEyeIndices,
  blinkFrameIntervalMs,
  blinkHardMotionThreshold,
  blinkHardScaleDeltaThreshold,
  blinkLongClosureMs,
  blinkLostTrackMs,
  blinkMaxDurationMs,
  blinkMinDurationMs,
  blinkMinFaceRatio,
  blinkMinObservationMs,
  blinkMotionSuppressMs,
  blinkMotionThreshold,
  blinkOpenThresholdFloor,
  blinkRateWindowMs,
  blinkScaleDeltaThreshold,
  calibrationFrameIntervalMs,
  calibrationMaxFaceRatio,
  calibrationMinFaceRatio,
  calibrationMotionThreshold,
  calibrationScaleDeltaThreshold,
  calibrationStableFrameTarget,
  defaultFaceScreenAlignment,
  defaultFlags,
  faceLandmarkerFrameIntervalMs,
  faceLandmarkerRetryDelayMs,
  faceMetricIndices,
  frameIntervalMs,
  irisDiameterBalanceThreshold,
  irisIndices,
  poseKeypointThreshold,
  postureCalibrationMotionThreshold,
  postureCalibrationRatioDeltaThreshold,
  postureCalibrationScaleDeltaThreshold,
  postureCalibrationStableFrameTarget,
  totalFaceKeypoints,
} from '../lib/poseMonitorConstants'
import {
  getLocalDateKey,
  persistBlinkDailyCount,
  persistDistanceCalibration,
  persistPostureCalibration,
  readPersistedBlinkDailyCount,
  readPersistedDistanceCalibration,
  readPersistedPostureCalibration,
} from '../lib/poseMonitorStorage'
import { drawDetectionOverlay } from '../lib/poseMonitorOverlay'
import {
  averageAlignmentBaselineMetrics,
  averageDistanceCalibrationMetrics,
  averageMetrics,
  averagePoint,
  blendAlignmentBaselineMetrics,
  blendDistanceCalibrationMetrics,
  clampNumber,
  createAlignmentAdjustedMetrics,
  createAlignmentBaselineMetrics,
  deriveAlignmentAdaptation,
  deriveAlignmentRiskAdjustment,
  deriveBlinkBaseline,
  distanceBetween,
  getAngleDeltaDeg,
} from '../lib/poseMonitorMath'
import type {
  AlignmentBaselineMetrics,
  BaselineMetrics,
  BlinkFaceSnapshot,
  BlinkFrameAnalysis,
  BlinkMetrics,
  DistanceCalibrationBlockingReason,
  DistanceCalibrationMetrics,
  DistanceCalibrationSnapshot,
  DistanceCalibrationSnapshotFrame,
  DistanceSignalSource,
  DistanceThresholds,
  FaceLandmarkerWorkerRequest,
  FaceLandmarkerWorkerResponse,
  FaceScreenAlignment,
  FaceScreenAlignmentStatus,
  KeypointSnapshot,
  MonitorMetrics,
  PoseMonitorOptions,
  PostureCalibrationBlockingReason,
  PostureCalibrationSnapshot,
  PostureCalibrationSnapshotFrame,
  StableState,
} from '../lib/poseMonitorTypes'
import type * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'
import type * as poseDetection from '@tensorflow-models/pose-detection'

function measureIris(
  face: faceLandmarksDetection.Face,
  indices: readonly number[],
) {
  const points = indices
    .map((index) => getFaceKeypoint(face, index))
    .filter((point): point is NonNullable<typeof point> => point !== null)

  if (points.length < indices.length) {
    return null
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)

  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    center: averagePoint(points),
    diameter: (width + height) / 2,
  }
}

function extractIrisRatio(
  face: faceLandmarksDetection.Face,
  frameWidth: number,
) {
  const leftIris = measureIris(face, irisIndices.left)
  const rightIris = measureIris(face, irisIndices.right)

  if (!leftIris || !rightIris || !frameWidth) {
    return null
  }

  const balanceDelta =
    Math.abs(leftIris.diameter - rightIris.diameter) /
    Math.max(leftIris.diameter, rightIris.diameter, 1)

  if (balanceDelta > irisDiameterBalanceThreshold) {
    return null
  }

  return (leftIris.diameter + rightIris.diameter) / 2 / frameWidth
}

function estimateFaceScreenAlignment(
  face: faceLandmarksDetection.Face | null,
  frameWidth: number,
  frameHeight: number,
): FaceScreenAlignment {
  if (!face || !frameWidth || !frameHeight) {
    return defaultFaceScreenAlignment
  }

  const rightEyeOuter = getFaceKeypoint(face, faceMetricIndices.rightEyeOuter)
  const leftEyeOuter = getFaceKeypoint(face, faceMetricIndices.leftEyeOuter)
  const noseTip = getFaceKeypoint(face, faceMetricIndices.noseTip)
  const forehead = getFaceKeypoint(face, faceMetricIndices.forehead)
  const chin = getFaceKeypoint(face, faceMetricIndices.chin)

  if (
    !rightEyeOuter ||
    !leftEyeOuter ||
    !noseTip ||
    !forehead ||
    !chin ||
    !face.box.width ||
    !face.box.height
  ) {
    return defaultFaceScreenAlignment
  }

  const faceCenterX = (face.box.xMin ?? noseTip.x - face.box.width / 2) + face.box.width / 2
  const faceCenterY = (face.box.yMin ?? noseTip.y - face.box.height / 2) + face.box.height / 2
  const eyeCenter = averagePoint([rightEyeOuter, leftEyeOuter])
  const eyeSpan = distanceBetween(leftEyeOuter, rightEyeOuter)
  const faceHeight = Math.max(face.box.height, distanceBetween(forehead, chin))

  if (!eyeSpan || !faceHeight) {
    return defaultFaceScreenAlignment
  }

  const horizontalOffset = (faceCenterX / frameWidth - 0.5) * 2
  const verticalOffset = (faceCenterY / frameHeight - 0.5) * 2
  const rollDeg =
    Math.atan2(leftEyeOuter.y - rightEyeOuter.y, leftEyeOuter.x - rightEyeOuter.x) *
    (180 / Math.PI)
  const noseCenterOffset = (noseTip.x - eyeCenter.x) / eyeSpan
  const noseToLeftEye = distanceBetween(noseTip, leftEyeOuter)
  const noseToRightEye = distanceBetween(noseTip, rightEyeOuter)
  const yawProxy = Math.abs(noseCenterOffset) * 0.7 +
    Math.abs(noseToLeftEye - noseToRightEye) / eyeSpan * 0.3
  const nosePitchRatio = (noseTip.y - eyeCenter.y) / faceHeight
  const pitchProxy = Math.abs(nosePitchRatio - 0.18)
  const offsetScore = Math.max(Math.abs(horizontalOffset), Math.abs(verticalOffset))
  const rollAbs = Math.abs(rollDeg)
  const status: FaceScreenAlignmentStatus =
    offsetScore > 0.7 || yawProxy > 0.52 || pitchProxy > 0.3 || rollAbs > 42
      ? 'out-of-range'
      : offsetScore > 0.48 || yawProxy > 0.36 || pitchProxy > 0.22 || rollAbs > 32
        ? 'edge'
        : 'in-range'
  const reason: FaceScreenAlignment['reason'] =
    status === 'out-of-range' || status === 'edge'
      ? offsetScore > 0.48
        ? 'face-off-center'
        : yawProxy > 0.36 || pitchProxy > 0.22
          ? 'face-angle'
          : rollAbs > 32
            ? 'face-roll'
            : 'none'
      : 'none'

  return {
    detector: 'face-mesh',
    horizontal:
      horizontalOffset < -0.18 ? 'left' : horizontalOffset > 0.18 ? 'right' : 'center',
    horizontalOffset,
    pitchDeg: null,
    pitchProxy,
    quality: clampNumber(
      1 -
        Math.max(
          offsetScore / 0.7,
          yawProxy / 0.52,
          pitchProxy / 0.3,
          rollAbs / 42,
        ),
      0,
      1,
    ),
    reason,
    rollDeg,
    status,
    vertical: verticalOffset < -0.18 ? 'up' : verticalOffset > 0.18 ? 'down' : 'level',
    verticalOffset,
    yawDeg: null,
    yawProxy,
  }
}

function getPoseKeypoint(pose: poseDetection.Pose, name: string) {
  const found = pose.keypoints.find(
    (point) => point.name === name && (point.score ?? 0) >= poseKeypointThreshold,
  )

  return found ?? null
}

function getFaceKeypoint(
  face: faceLandmarksDetection.Face,
  index: number,
) {
  return face.keypoints[index] ?? null
}

function getEyeAspectRatio(
  face: faceLandmarksDetection.Face,
  indices: readonly [number, number, number, number, number, number],
) {
  const [p1Index, p2Index, p3Index, p4Index, p5Index, p6Index] = indices
  const p1 = getFaceKeypoint(face, p1Index)
  const p2 = getFaceKeypoint(face, p2Index)
  const p3 = getFaceKeypoint(face, p3Index)
  const p4 = getFaceKeypoint(face, p4Index)
  const p5 = getFaceKeypoint(face, p5Index)
  const p6 = getFaceKeypoint(face, p6Index)

  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) {
    return null
  }

  const horizontal = distanceBetween(p1, p4)

  if (!horizontal) {
    return null
  }

  return (
    (distanceBetween(p2, p6) + distanceBetween(p3, p5)) /
    (2 * horizontal)
  )
}

function extractBlinkFrame(face: faceLandmarksDetection.Face): BlinkFrameAnalysis | null {
  const leftEar = getEyeAspectRatio(face, blinkEyeIndices.left)
  const rightEar = getEyeAspectRatio(face, blinkEyeIndices.right)
  const rightEyeOuter = getFaceKeypoint(face, faceMetricIndices.rightEyeOuter)
  const rightEyeInner = getFaceKeypoint(face, faceMetricIndices.rightEyeInner)
  const leftEyeInner = getFaceKeypoint(face, faceMetricIndices.leftEyeInner)
  const leftEyeOuter = getFaceKeypoint(face, faceMetricIndices.leftEyeOuter)
  if (
    leftEar === null ||
    rightEar === null ||
    !rightEyeOuter ||
    !rightEyeInner ||
    !leftEyeInner ||
    !leftEyeOuter
  ) {
    return null
  }

  const center = averagePoint([
    rightEyeOuter,
    rightEyeInner,
    leftEyeInner,
    leftEyeOuter,
  ])
  const eyeSpan = distanceBetween(leftEyeOuter, rightEyeOuter)
  const faceWidth = Math.max(face.box.width ?? 0, eyeSpan * 2.2)

  if (!faceWidth) {
    return null
  }

  return {
    averageEar: (leftEar + rightEar) / 2,
    centerX: center.x,
    centerY: center.y,
    faceWidth,
    leftEar,
    rightEar,
  }
}

function filterPoseKeypoints(pose: poseDetection.Pose | null): KeypointSnapshot[] {
  if (!pose) {
    return []
  }

  return pose.keypoints
    .filter(
      (point): point is typeof point & { name: string } =>
        Boolean(point.name) && (point.score ?? 0) >= poseKeypointThreshold,
    )
    .map((point) => ({
      name: point.name,
      score: point.score ?? 0,
      x: point.x,
      y: point.y,
    }))
}

function extractMetrics(
  face: faceLandmarksDetection.Face,
  pose: poseDetection.Pose,
  frameWidth: number,
  frameHeight: number,
): MonitorMetrics | null {
  const leftShoulder = getPoseKeypoint(pose, 'left_shoulder')
  const rightShoulder = getPoseKeypoint(pose, 'right_shoulder')
  const nose = getPoseKeypoint(pose, 'nose')
  const rightEyeOuter = getFaceKeypoint(face, faceMetricIndices.rightEyeOuter)
  const rightEyeInner = getFaceKeypoint(face, faceMetricIndices.rightEyeInner)
  const leftEyeInner = getFaceKeypoint(face, faceMetricIndices.leftEyeInner)
  const leftEyeOuter = getFaceKeypoint(face, faceMetricIndices.leftEyeOuter)
  const upperLip = getFaceKeypoint(face, faceMetricIndices.upperLip)
  const lowerLip = getFaceKeypoint(face, faceMetricIndices.lowerLip)
  const chin = getFaceKeypoint(face, faceMetricIndices.chin)

  if (
    !leftShoulder ||
    !rightShoulder ||
    !nose ||
    !rightEyeOuter ||
    !rightEyeInner ||
    !leftEyeInner ||
    !leftEyeOuter ||
    !upperLip ||
    !lowerLip ||
    !chin ||
    !face.box.width ||
    !face.box.height
  ) {
    return null
  }

  const eyeCenter = averagePoint([
    rightEyeOuter,
    rightEyeInner,
    leftEyeInner,
    leftEyeOuter,
  ])
  const mouthCenter = averagePoint([upperLip, lowerLip])
  const shoulderWidth = distanceBetween(leftShoulder, rightShoulder)
  const eyeSpan = distanceBetween(leftEyeOuter, rightEyeOuter)
  const faceWidth = Math.max(face.box.width, eyeSpan * 2.2)
  const irisRatio = extractIrisRatio(face, frameWidth)
  const headRollDeg =
    Math.atan2(leftEyeOuter.y - rightEyeOuter.y, leftEyeOuter.x - rightEyeOuter.x) *
    (180 / Math.PI)
  const shoulderTiltDeg =
    Math.atan2(leftShoulder.y - rightShoulder.y, leftShoulder.x - rightShoulder.x) *
    (180 / Math.PI)

  if (!shoulderWidth || !eyeSpan || !faceWidth) {
    return null
  }

  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2
  const poseConfidenceSamples = [
    nose,
    leftShoulder,
    rightShoulder,
    getPoseKeypoint(pose, 'left_ear'),
    getPoseKeypoint(pose, 'right_ear'),
    getPoseKeypoint(pose, 'left_hip'),
    getPoseKeypoint(pose, 'right_hip'),
  ]
    .filter(
      (
        point,
      ): point is NonNullable<ReturnType<typeof getPoseKeypoint>> => point !== null,
    )
    .map((point) => point.score ?? 0)

  const poseConfidence =
    poseConfidenceSamples.length > 0
      ? poseConfidenceSamples.reduce((sum, score) => sum + score, 0) /
        poseConfidenceSamples.length
      : 0
  const faceConfidence = Math.min(1, face.keypoints.length / totalFaceKeypoints)

  return {
    confidence: poseConfidence * 0.58 + faceConfidence * 0.42,
    faceConfidence,
    poseConfidence,
    faceRatio: faceWidth / frameWidth,
    eyeSpanRatio: eyeSpan / frameWidth,
    irisRatio,
    faceToShoulderRatio: faceWidth / shoulderWidth,
    noseShoulderRatio: (shoulderMidY - nose.y) / frameHeight,
    eyeShoulderRatio: (shoulderMidY - eyeCenter.y) / frameHeight,
    chinShoulderRatio: (shoulderMidY - chin.y) / frameHeight,
    mouthShoulderRatio: (shoulderMidY - mouthCenter.y) / frameHeight,
    shoulderWidthRatio: shoulderWidth / frameWidth,
    shoulderTiltDeg,
    headRollDeg,
  }
}

function extractDistanceCalibrationMetrics(
  face: faceLandmarksDetection.Face,
  frameWidth: number,
): DistanceCalibrationMetrics | null {
  const rightEyeInner = getFaceKeypoint(face, faceMetricIndices.rightEyeInner)
  const rightEyeOuter = getFaceKeypoint(face, faceMetricIndices.rightEyeOuter)
  const leftEyeInner = getFaceKeypoint(face, faceMetricIndices.leftEyeInner)
  const leftEyeOuter = getFaceKeypoint(face, faceMetricIndices.leftEyeOuter)

  if (
    !rightEyeInner ||
    !rightEyeOuter ||
    !leftEyeInner ||
    !leftEyeOuter ||
    !face.box.width ||
    !frameWidth
  ) {
    return null
  }

  const eyeSpan = distanceBetween(leftEyeOuter, rightEyeOuter)
  const faceWidth = Math.max(face.box.width, eyeSpan * 2.2)
  const irisRatio = extractIrisRatio(face, frameWidth)
  const center = averagePoint([
    rightEyeOuter,
    rightEyeInner,
    leftEyeInner,
    leftEyeOuter,
  ])

  if (!eyeSpan || !faceWidth) {
    return null
  }

  return {
    centerX: center.x,
    centerY: center.y,
    eyeSpanRatio: eyeSpan / frameWidth,
    irisRatio,
    faceRatio: faceWidth / frameWidth,
    signalRatio: faceWidth / frameWidth,
    faceWidth,
  }
}

function deriveDistanceSignal(
  metrics: Pick<MonitorMetrics, 'faceRatio' | 'irisRatio'>,
  distanceBaseline: DistanceCalibrationMetrics | null,
  preferredNormalRatio: number,
  allowIrisSignal: boolean,
): {
  source: DistanceSignalSource
  value: number
} {
  const baselineIrisRatio = distanceBaseline?.irisRatio ?? null

  if (
    allowIrisSignal &&
    metrics.irisRatio !== null &&
    baselineIrisRatio !== null &&
    baselineIrisRatio > 0.001
  ) {
    const irisEquivalent = preferredNormalRatio * (metrics.irisRatio / baselineIrisRatio)
    const blendedSignal = irisEquivalent * 0.78 + metrics.faceRatio * 0.22
    const minSignal = Math.max(0.06, Math.min(metrics.faceRatio, preferredNormalRatio) * 0.72)
    const maxSignal = Math.min(0.38, Math.max(metrics.faceRatio, preferredNormalRatio) * 1.45)

    return {
      source: 'iris',
      value: clampNumber(blendedSignal, minSignal, maxSignal),
    }
  }

  return {
    source: 'face',
    value: metrics.faceRatio,
  }
}

function classifyMonitor(
  metrics: MonitorMetrics,
  baseline: BaselineMetrics | null,
  distanceBaseline: DistanceCalibrationMetrics | null,
  distanceThresholds: DistanceThresholds | undefined,
  alignment: FaceScreenAlignment,
  workingAlignmentBaseline: AlignmentBaselineMetrics | null,
  manualPostureBaseline: boolean,
): {
  distanceState: DistanceState
  distanceSignalRatio: number
  distanceSignalSource: DistanceSignalSource
  postureState: PostureState
  flags: PoseFlags
} {
  if (alignment.status === 'out-of-range' || alignment.status === 'undetected') {
    return {
      distanceState: 'unavailable',
      distanceSignalRatio: metrics.faceRatio,
      distanceSignalSource: 'face',
      postureState: 'undetected',
      flags: {
        tooClose: false,
        headDown: false,
        forwardHead: false,
        headTilt: false,
        shoulderTilt: false,
      },
    }
  }

  const adjustedMetrics = createAlignmentAdjustedMetrics(
    metrics,
    alignment,
    workingAlignmentBaseline,
  )
  const {
    horizontalDelta,
    horizontalStrength,
    pitchAbsDeg,
    pitchDeltaDeg,
    targetFit,
    targetSideStrength,
    verticalDelta,
    verticalStrength,
    yawAbsDeg,
    yawDeltaDeg,
  } = deriveAlignmentAdaptation(alignment, workingAlignmentBaseline)
  const {
    distanceRelaxation,
    distanceSlack,
    forwardHeadHorizontalSlack,
    forwardHeadYawSlackDeg,
    strongAlignmentDeviation,
    tiltHorizontalSlack,
    tiltPitchSlackDeg,
    tiltVerticalSlack,
    tiltYawSlackDeg,
  } = deriveAlignmentRiskAdjustment(alignment.status, {
    horizontalDelta,
    horizontalStrength,
    pitchAbsDeg,
    pitchDeltaDeg,
    targetFit,
    targetSideStrength,
    verticalDelta,
    verticalStrength,
    yawAbsDeg,
    yawDeltaDeg,
  })
  const normalDistanceRatio =
    distanceThresholds?.normalRatio ?? distanceBaseline?.signalRatio ?? baseline?.faceRatio ?? 0.14
  const closeThreshold = distanceThresholds?.closeRatio ??
    (distanceBaseline
      ? Math.max(0.18, distanceBaseline.signalRatio * 1.15)
      : baseline
        ? Math.max(0.18, baseline.faceRatio * 1.15)
        : 0.18)
  const farThreshold = distanceThresholds?.farRatio ??
    (distanceBaseline
      ? Math.min(0.095, distanceBaseline.signalRatio * 0.82)
      : baseline
        ? Math.min(0.095, baseline.faceRatio * 0.82)
        : 0.095)
  const manualDistanceMode = distanceThresholds !== undefined
  const headDownNoseThreshold = baseline
    ? manualPostureBaseline
      ? Math.min(0.255, baseline.noseShoulderRatio * 0.97)
      : Math.min(0.2, baseline.noseShoulderRatio * 0.84)
    : 0.14
  const headDownEyeThreshold = baseline
    ? manualPostureBaseline
      ? Math.min(0.268, baseline.eyeShoulderRatio * 0.97)
      : Math.min(0.22, baseline.eyeShoulderRatio * 0.86)
    : 0.16
  const headDownChinThreshold = baseline
    ? manualPostureBaseline
      ? Math.min(0.205, baseline.chinShoulderRatio * 0.96)
      : Math.min(0.15, baseline.chinShoulderRatio * 0.83)
    : 0.1
  const forwardHeadThreshold = baseline
    ? manualPostureBaseline
      ? Math.max(0.43, baseline.faceToShoulderRatio * 1.08)
      : Math.max(0.52, baseline.faceToShoulderRatio * 1.24)
    : 0.62
  const headDownAdaptation = 1 - verticalStrength * (manualPostureBaseline ? 0.14 : 0.1)
  const adaptedHeadDownNoseThreshold = headDownNoseThreshold * headDownAdaptation
  const adaptedHeadDownEyeThreshold = headDownEyeThreshold * headDownAdaptation
  const adaptedHeadDownChinThreshold = headDownChinThreshold * headDownAdaptation
  const adaptedForwardHeadThreshold =
    forwardHeadThreshold * (1 + horizontalStrength * 0.12 + verticalStrength * 0.04)

  const headDownNoseDelta = baseline ? baseline.noseShoulderRatio - metrics.noseShoulderRatio : 0
  const headDownEyeDelta = baseline ? baseline.eyeShoulderRatio - metrics.eyeShoulderRatio : 0
  const headDownChinDelta = baseline ? baseline.chinShoulderRatio - metrics.chinShoulderRatio : 0
  const headDownSignals = [
    metrics.noseShoulderRatio < adaptedHeadDownNoseThreshold ||
      (manualPostureBaseline && headDownNoseDelta > 0.007),
    metrics.eyeShoulderRatio < adaptedHeadDownEyeThreshold ||
      (manualPostureBaseline && headDownEyeDelta > 0.007),
    metrics.chinShoulderRatio < adaptedHeadDownChinThreshold ||
      (manualPostureBaseline && headDownChinDelta > 0.006),
  ].filter(Boolean).length
  // Laptop cameras sit above the screen, so a natural screen-gazing pose can have
  // mild downward pitch. Before a local baseline exists, only obvious posture
  // deviations should be classified.
  const postureSignalTarget = !baseline || strongAlignmentDeviation ? 3 : 2
  const headDown = headDownSignals >= postureSignalTarget
  const alignmentYawProxy =
    workingAlignmentBaseline === null
      ? alignment.yawDeg === null
        ? alignment.yawProxy
        : yawAbsDeg / 90
      : clampNumber(yawDeltaDeg / 40, 0, 1)
  const forwardHeadFaceRatioThreshold = baseline
    ? manualPostureBaseline
      ? Math.max(0.13, baseline.faceRatio * 1.012)
      : Math.max(0.16, baseline.faceRatio * 1.12)
    : 0.24
  const adaptedForwardHeadFaceRatioThreshold =
    forwardHeadFaceRatioThreshold * (1 + horizontalStrength * 0.08)
  const forwardHeadEyeShoulderThreshold = baseline
    ? manualPostureBaseline
      ? Math.max(0.168, baseline.eyeShoulderRatio * 0.86)
      : Math.max(0.21, baseline.eyeShoulderRatio * 0.95)
    : 0.23
  const forwardHeadAllowedByAlignment = workingAlignmentBaseline
    ? yawDeltaDeg < (manualPostureBaseline ? 28 : 20) + forwardHeadYawSlackDeg &&
      horizontalDelta < 0.24 + forwardHeadHorizontalSlack
    : yawAbsDeg < (manualPostureBaseline ? 42 : 30)
  const forwardHeadYawLimit = manualPostureBaseline
    ? 0.62 + horizontalStrength * 0.08
    : 0.24 + horizontalStrength * 0.04
  const forwardHeadRatioDelta = baseline ? metrics.faceToShoulderRatio - baseline.faceToShoulderRatio : 0
  const forwardHeadDistanceDelta = baseline ? adjustedMetrics.faceRatio - baseline.faceRatio : 0
  const headTiltDelta = Math.abs(metrics.headRollDeg - (baseline?.headRollDeg ?? 0))
  const shoulderTiltDelta = Math.abs(metrics.shoulderTiltDeg - (baseline?.shoulderTiltDeg ?? 0))
  const headShoulderRollDelta = Math.abs(
    (metrics.headRollDeg - metrics.shoulderTiltDeg) -
      ((baseline?.headRollDeg ?? 0) - (baseline?.shoulderTiltDeg ?? 0)),
  )
  const headTiltThreshold =
    manualPostureBaseline
      ? baseline
        ? Math.max(5, Math.abs(baseline.headRollDeg) * 0.18 + 5)
        : 8
      : 11
  const shoulderTiltThreshold =
    manualPostureBaseline
      ? baseline
        ? Math.max(3, Math.abs(baseline.shoulderTiltDeg) * 0.12 + 3)
        : 5.2
      : 7.4
  const adaptedHeadTiltThreshold =
    headTiltThreshold + horizontalStrength * 5 + verticalStrength * 2 + (alignment.status === 'edge' ? 1.5 : 0)
  const adaptedShoulderTiltThreshold =
    shoulderTiltThreshold +
    horizontalStrength * 3.4 +
    verticalStrength * 1.25 +
    (alignment.status === 'edge' ? 1 : 0)

  const forwardHead =
    !headDown &&
    forwardHeadAllowedByAlignment &&
    alignmentYawProxy < forwardHeadYawLimit &&
    (
      metrics.faceToShoulderRatio > adaptedForwardHeadThreshold ||
      (manualPostureBaseline && forwardHeadRatioDelta > 0.01)
    ) &&
    (
      adjustedMetrics.faceRatio > adaptedForwardHeadFaceRatioThreshold ||
      (manualPostureBaseline && forwardHeadDistanceDelta > 0.007)
    ) &&
    metrics.eyeShoulderRatio > forwardHeadEyeShoulderThreshold

  const tiltAllowedByAlignment = workingAlignmentBaseline
    ? yawDeltaDeg < (manualPostureBaseline ? 24 : 18) + tiltYawSlackDeg &&
      horizontalDelta < 0.22 + tiltHorizontalSlack &&
      pitchDeltaDeg < 16 + tiltPitchSlackDeg &&
      verticalDelta < 0.2 + tiltVerticalSlack
    : yawAbsDeg < (manualPostureBaseline ? 40 : 32)
  const shoulderTilt =
    !headDown &&
    !forwardHead &&
    tiltAllowedByAlignment &&
    shoulderTiltDelta > adaptedShoulderTiltThreshold &&
    shoulderTiltDelta >= headTiltDelta * 0.38
  const headTilt =
    !headDown &&
    !forwardHead &&
    !shoulderTilt &&
    tiltAllowedByAlignment &&
    headTiltDelta > adaptedHeadTiltThreshold &&
    headShoulderRollDelta > Math.max(5, adaptedHeadTiltThreshold * 0.68)

  const distanceSignal = deriveDistanceSignal(
    adjustedMetrics,
    distanceBaseline,
    normalDistanceRatio,
    !headDown &&
      !forwardHead &&
      !headTilt &&
      (workingAlignmentBaseline
        ? yawDeltaDeg < 24 && pitchDeltaDeg < 18
        : yawAbsDeg < 40),
  )
  const effectiveDistanceSignalValue =
    distanceRelaxation > 0
      ? normalDistanceRatio +
        (distanceSignal.value - normalDistanceRatio) * (1 - distanceRelaxation)
      : distanceSignal.value

  let tooClose = false
  let tooFar = false

  if (manualDistanceMode) {
    tooClose = effectiveDistanceSignalValue > closeThreshold + distanceSlack
    tooFar = !tooClose && effectiveDistanceSignalValue < farThreshold - distanceSlack * 0.25
  } else {
    const closeEyeThreshold = distanceBaseline
      ? Math.max(0.05, distanceBaseline.eyeSpanRatio * 1.12)
      : baseline
        ? Math.max(0.05, baseline.eyeSpanRatio * 1.12)
        : 0.05
    const farEyeThreshold = distanceBaseline
      ? Math.min(0.028, distanceBaseline.eyeSpanRatio * 0.83)
      : baseline
        ? Math.min(0.028, baseline.eyeSpanRatio * 0.83)
        : 0.028
    const faceShoulderCloseThreshold = baseline
      ? baseline.faceToShoulderRatio * 1.08
      : 0.42
    const faceShoulderFarThreshold = baseline
      ? baseline.faceToShoulderRatio * 0.9
      : 0.28
    const tooCloseSignals = [
      effectiveDistanceSignalValue > closeThreshold,
      adjustedMetrics.eyeSpanRatio > closeEyeThreshold,
      metrics.faceToShoulderRatio > faceShoulderCloseThreshold,
    ].filter(Boolean).length
    const tooFarSignals = [
      effectiveDistanceSignalValue < farThreshold,
      adjustedMetrics.eyeSpanRatio < farEyeThreshold,
      metrics.faceToShoulderRatio < faceShoulderFarThreshold,
    ].filter(Boolean).length

    tooClose = tooCloseSignals >= 2
    tooFar = !tooClose && tooFarSignals >= 2
  }

  const distanceState: DistanceState = tooClose
    ? 'too-close'
    : tooFar
      ? 'too-far'
      : 'normal'

  const postureState: PostureState = headDown
    ? 'head-down'
    : forwardHead
      ? 'forward-head'
      : shoulderTilt
          ? 'shoulder-tilt'
          : headTilt
            ? 'head-tilt'
            : 'normal'

  return {
    distanceState,
    distanceSignalRatio: effectiveDistanceSignalValue,
    distanceSignalSource: distanceSignal.source,
    postureState,
    flags: {
      tooClose,
      headDown,
      forwardHead,
      headTilt,
      shoulderTilt,
    },
  }
}

function getCalibrationBlockingReason(
  metrics: DistanceCalibrationMetrics | null,
  faceConfidence: number,
  previousFrame: DistanceCalibrationSnapshotFrame | null,
  alignment: FaceScreenAlignment,
): DistanceCalibrationBlockingReason {
  if (faceConfidence < 0.9 || !metrics) {
    return 'face'
  }

  if (alignment.status === 'out-of-range' || alignment.status === 'undetected') {
    return 'alignment'
  }

  if (metrics.faceRatio < calibrationMinFaceRatio) {
    return 'too-far'
  }

  // During user-triggered calibration, current distance should become the new baseline.
  // Only block when the face is so close that framing quality becomes unreliable.
  if (metrics.faceRatio > calibrationMaxFaceRatio) {
    return 'too-close'
  }

  if (previousFrame) {
    const motionScore =
      Math.hypot(metrics.centerX - previousFrame.centerX, metrics.centerY - previousFrame.centerY) /
      Math.max(previousFrame.faceWidth, metrics.faceWidth, 1)
    const scaleDelta =
      Math.abs(metrics.faceWidth - previousFrame.faceWidth) /
      Math.max(previousFrame.faceWidth, 1)

    if (motionScore > calibrationMotionThreshold || scaleDelta > calibrationScaleDeltaThreshold) {
      return 'unstable'
    }
  }

  return 'none'
}

function getPostureCalibrationBlockingReason(
  metrics: MonitorMetrics | null,
  frame: PostureCalibrationSnapshotFrame | null,
  previousFrame: PostureCalibrationSnapshotFrame | null,
  alignment: FaceScreenAlignment,
): PostureCalibrationBlockingReason {
  if (!metrics || !frame) {
    return 'detecting'
  }

  if (metrics.faceConfidence < 0.9) {
    return 'face'
  }

  if (metrics.poseConfidence < 0.48 || metrics.shoulderWidthRatio < 0.12) {
    return 'pose'
  }

  if (alignment.status === 'out-of-range' || alignment.status === 'undetected') {
    return 'alignment'
  }

  if (previousFrame) {
    const motionScore =
      Math.hypot(frame.centerX - previousFrame.centerX, frame.centerY - previousFrame.centerY) /
      Math.max(previousFrame.faceWidth, frame.faceWidth, 1)
    const scaleDelta =
      Math.abs(frame.faceWidth - previousFrame.faceWidth) /
      Math.max(previousFrame.faceWidth, 1)
    const ratioDelta = Math.max(
      Math.abs(frame.faceToShoulderRatio - previousFrame.faceToShoulderRatio),
      Math.abs(frame.noseShoulderRatio - previousFrame.noseShoulderRatio),
      Math.abs(frame.eyeShoulderRatio - previousFrame.eyeShoulderRatio),
      Math.abs(frame.shoulderWidthRatio - previousFrame.shoulderWidthRatio),
    )

    if (
      motionScore > postureCalibrationMotionThreshold ||
      scaleDelta > postureCalibrationScaleDeltaThreshold ||
      ratioDelta > postureCalibrationRatioDeltaThreshold
    ) {
      return 'unstable'
    }
  }

  return 'none'
}

function updateStableState<T extends string>(
  stableRef: MutableRefObject<StableState<T>>,
  incoming: T,
  setState: (nextState: T) => void,
) {
  if (stableRef.current.stable === incoming) {
    stableRef.current.pending = incoming
    stableRef.current.count = 0
    return
  }

  if (stableRef.current.pending === incoming) {
    stableRef.current.count += 1
  } else {
    stableRef.current.pending = incoming
    stableRef.current.count = 1
  }

  if (stableRef.current.count >= 2) {
    stableRef.current.stable = incoming
    stableRef.current.pending = incoming
    stableRef.current.count = 0
    setState(incoming)
  }
}

function resetStableRef<T extends string>(
  stableRef: MutableRefObject<StableState<T>>,
  nextStable: T,
) {
  stableRef.current = {
    stable: nextStable,
    pending: null,
    count: 0,
  }
}

export function usePoseMonitor({
  blinkLowRateThreshold = 8,
  distanceThresholds,
  workspaceAlignmentBaseline = null,
  workspaceDistanceBaseline = null,
  workspacePostureBaseline = null,
  workspacePostureBaselineLocked,
}: PoseMonitorOptions = {}) {
  const persistedDistanceCalibration = useRef(
    readPersistedDistanceCalibration(baselineSampleTarget),
  ).current
  const persistedPostureCalibration = useRef(
    readPersistedPostureCalibration(baselineSampleTarget),
  ).current
  const persistedBlinkDailyCount = useRef(readPersistedBlinkDailyCount()).current
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const baselineRef = useRef<BaselineMetrics | null>(persistedPostureCalibration?.baseline ?? null)
  const workingAlignmentBaselineRef = useRef<AlignmentBaselineMetrics | null>(
    persistedPostureCalibration?.alignmentBaseline ?? null,
  )
  const distanceBaselineRef = useRef<DistanceCalibrationMetrics | null>(
    persistedDistanceCalibration?.baseline ?? null,
  )
  const distanceCalibrationFrameRef = useRef<DistanceCalibrationSnapshotFrame | null>(null)
  const distanceCalibrationStableCountRef = useRef(0)
  const distanceSampleRef = useRef<DistanceCalibrationMetrics[]>([])
  const postureCalibrationLockedRef = useRef(Boolean(persistedPostureCalibration))
  const postureCalibrationFrameRef = useRef<PostureCalibrationSnapshotFrame | null>(null)
  const postureCalibrationAlignmentSampleRef = useRef<AlignmentBaselineMetrics[]>([])
  const postureCalibrationStableCountRef = useRef(0)
  const postureCalibrationSampleRef = useRef<MonitorMetrics[]>([])
  const faceLandmarkerFailedRef = useRef(false)
  const faceLandmarkerLastRunAtRef = useRef(0)
  const faceLandmarkerAlignmentRef = useRef<FaceScreenAlignment | null>(null)
  const faceLandmarkerNextRetryAtRef = useRef(0)
  const faceLandmarkerPendingRef = useRef<{
    id: number
    resolve: (response: { alignment: FaceScreenAlignment | null; failed: boolean }) => void
    timeoutId: number
  } | null>(null)
  const faceLandmarkerProcessingRef = useRef(false)
  const faceLandmarkerRequestIdRef = useRef(0)
  const faceLandmarkerWorkerRef = useRef<Worker | null>(null)
  const sampleRef = useRef<MonitorMetrics[]>([])
  const blinkBaselineRef = useRef<number | null>(null)
  const blinkClosedRef = useRef(false)
  const blinkCloseStartedAtRef = useRef<number | null>(null)
  const blinkFaceSnapshotRef = useRef<BlinkFaceSnapshot | null>(null)
  const blinkLastSeenAtRef = useRef<number | null>(null)
  const blinkLastFrameAtRef = useRef<number | null>(null)
  const blinkObservedTimelineMsRef = useRef(0)
  const blinkProcessingRef = useRef(false)
  const blinkSignalRef = useRef<number | null>(null)
  const blinkSamplesRef = useRef<number[]>([])
  const blinkStateRef = useRef<BlinkState>('undetected')
  const blinkMotionSuppressUntilRef = useRef(0)
  const blinkTimestampsRef = useRef<number[]>([])
  const blinkRateRef = useRef(0)
  const blinkDailyCountRef = useRef(persistedBlinkDailyCount.count)
  const blinkDailyDateRef = useRef(persistedBlinkDailyCount.date)
  const processingRef = useRef(false)
  const missCountRef = useRef(0)
  const detectionErrorCountRef = useRef(0)
  const distanceStableRef = useRef<StableState<DistanceState>>({
    stable: 'unavailable',
    pending: null,
    count: 0,
  })
  const postureStableRef = useRef<StableState<PostureState>>({
    stable: 'undetected',
    pending: null,
    count: 0,
  })

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [runtimeLabel, setRuntimeLabel] = useState<string>('未初始化')
  const [distanceState, setDistanceState] = useState<DistanceState>('unavailable')
  const [postureState, setPostureState] = useState<PostureState>('undetected')
  const [keypoints, setKeypoints] = useState<KeypointSnapshot[]>([])
  const [faceLandmarksCount, setFaceLandmarksCount] = useState(0)
  const [blinkCountToday, setBlinkCountToday] = useState(persistedBlinkDailyCount.count)
  const [blinkCountWindow, setBlinkCountWindow] = useState(0)
  const [blinkMetrics, setBlinkMetrics] = useState<BlinkMetrics | null>(null)
  const [blinkRatePerMin, setBlinkRatePerMin] = useState(0)
  const [blinkState, setBlinkState] = useState<BlinkState>('undetected')
  const [distanceSignalRatio, setDistanceSignalRatio] = useState<number | null>(null)
  const [distanceSignalSource, setDistanceSignalSource] = useState<DistanceSignalSource>('face')
  const [faceScreenAlignment, setFaceScreenAlignment] = useState<FaceScreenAlignment>(
    defaultFaceScreenAlignment,
  )
  const [distanceCalibration, setDistanceCalibration] = useState<DistanceCalibrationSnapshot>(
    () =>
      persistedDistanceCalibration?.snapshot ?? {
        baselineSignalRatio: null,
        blockingReason: 'none',
        sampleCount: 0,
        sampleTarget: baselineSampleTarget,
        status: 'idle',
        updatedAt: null,
      },
  )
  const [postureCalibration, setPostureCalibration] = useState<PostureCalibrationSnapshot>(
    () =>
      persistedPostureCalibration?.snapshot ?? {
        blockingReason: 'none',
        sampleCount: 0,
        sampleTarget: baselineSampleTarget,
        status: 'idle',
        updatedAt: null,
      },
  )
  const [metrics, setMetrics] = useState<MonitorMetrics | null>(null)
  const [flags, setFlags] = useState<PoseFlags>(defaultFlags)
  const [errorText, setErrorText] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop()
    })
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }, [])

  const recalibrate = useCallback(() => {
    distanceCalibrationFrameRef.current = null
    distanceCalibrationStableCountRef.current = 0
    distanceSampleRef.current = []
    setDistanceCalibration({
      baselineSignalRatio:
        distanceBaselineRef.current !== null
          ? Number(distanceBaselineRef.current.signalRatio.toFixed(4))
          : null,
      blockingReason: 'none',
      sampleCount: 0,
      sampleTarget: baselineSampleTarget,
      status: 'sampling',
      updatedAt: null,
    })
  }, [])

  const recalibratePosture = useCallback(() => {
    postureCalibrationFrameRef.current = null
    postureCalibrationAlignmentSampleRef.current = []
    postureCalibrationStableCountRef.current = 0
    postureCalibrationSampleRef.current = []
    setPostureCalibration({
      blockingReason: 'none',
      sampleCount: 0,
      sampleTarget: baselineSampleTarget,
      status: 'sampling',
      updatedAt: null,
    })
  }, [])

  const resetBlinkDailyCountIfNeeded = useCallback(() => {
    const today = getLocalDateKey()

    if (blinkDailyDateRef.current !== today) {
      blinkDailyDateRef.current = today
      blinkDailyCountRef.current = 0
      setBlinkCountToday(0)
      persistBlinkDailyCount(today, 0)
    }

    return today
  }, [])

  const recordDailyBlink = useCallback(() => {
    const today = resetBlinkDailyCountIfNeeded()
    const nextCount = blinkDailyCountRef.current + 1

    blinkDailyCountRef.current = nextCount
    setBlinkCountToday(nextCount)
    persistBlinkDailyCount(today, nextCount)
  }, [resetBlinkDailyCountIfNeeded])

  const resolveFaceLandmarkerPending = useCallback(
    (response: { alignment: FaceScreenAlignment | null; failed: boolean }) => {
      const pending = faceLandmarkerPendingRef.current

      if (!pending) {
        return
      }

      window.clearTimeout(pending.timeoutId)
      faceLandmarkerPendingRef.current = null
      pending.resolve(response)
    },
    [],
  )

  const getFaceLandmarkerWorker = useCallback(() => {
    if (!faceLandmarkerWorkerRef.current) {
      const worker = new Worker(new URL('../workers/faceLandmarker.worker.ts', import.meta.url), {
        type: 'module',
      })

      worker.onmessage = (event: MessageEvent<FaceLandmarkerWorkerResponse>) => {
        const pending = faceLandmarkerPendingRef.current

        if (!pending || event.data.id !== pending.id) {
          return
        }

        if (event.data.ok) {
          resolveFaceLandmarkerPending({
            alignment: event.data.alignment,
            failed: false,
          })
          return
        }

        console.warn(
          'Face Landmarker worker is unavailable; falling back to Face Mesh.',
          event.data.error,
        )
        resolveFaceLandmarkerPending({
          alignment: null,
          failed: true,
        })
      }

      worker.onerror = (event) => {
        console.warn('Face Landmarker worker failed; falling back to Face Mesh.', event.message)
        resolveFaceLandmarkerPending({
          alignment: null,
          failed: true,
        })
      }

      faceLandmarkerWorkerRef.current = worker
    }

    return faceLandmarkerWorkerRef.current
  }, [resolveFaceLandmarkerPending])

  const runFaceLandmarkerInWorker = useCallback(
    async (video: HTMLVideoElement, timestampMs: number) => {
      if (typeof createImageBitmap === 'undefined') {
        return {
          alignment: null,
          failed: true,
        }
      }

      let bitmap: ImageBitmap | null = null

      try {
        bitmap = await createImageBitmap(video)
        const worker = getFaceLandmarkerWorker()

        return await new Promise<{ alignment: FaceScreenAlignment | null; failed: boolean }>(
          (resolve) => {
            const id = ++faceLandmarkerRequestIdRef.current
            const timeoutId = window.setTimeout(() => {
              if (faceLandmarkerPendingRef.current?.id === id) {
                faceLandmarkerPendingRef.current = null
              }

              resolve({
                alignment: null,
                failed: true,
              })
            }, 3500)

            faceLandmarkerPendingRef.current = {
              id,
              resolve,
              timeoutId,
            }

            const requestBitmap = bitmap

            if (!requestBitmap) {
              window.clearTimeout(timeoutId)
              faceLandmarkerPendingRef.current = null
              resolve({
                alignment: null,
                failed: true,
              })
              return
            }

            const request: FaceLandmarkerWorkerRequest = {
              bitmap: requestBitmap,
              id,
              timestampMs,
              type: 'detect',
            }

            bitmap = null
            worker.postMessage(request, [request.bitmap])
          },
        )
      } catch (error) {
        bitmap?.close()
        console.warn('Face Landmarker worker request failed; falling back to Face Mesh.', error)
        return {
          alignment: null,
          failed: true,
        }
      }
    },
    [getFaceLandmarkerWorker],
  )

  useEffect(() => {
    const timerId = window.setInterval(resetBlinkDailyCountIfNeeded, 60 * 1000)

    resetBlinkDailyCountIfNeeded()

    return () => window.clearInterval(timerId)
  }, [resetBlinkDailyCountIfNeeded])

  useEffect(() => {
    return () => {
      const pending = faceLandmarkerPendingRef.current

      if (pending) {
        window.clearTimeout(pending.timeoutId)
        faceLandmarkerPendingRef.current = null
      }

      faceLandmarkerWorkerRef.current?.terminate()
      faceLandmarkerWorkerRef.current = null
    }
  }, [])

  const resetBlinkState = useCallback(() => {
    blinkBaselineRef.current = null
    blinkClosedRef.current = false
    blinkCloseStartedAtRef.current = null
    blinkFaceSnapshotRef.current = null
    blinkLastFrameAtRef.current = null
    blinkLastSeenAtRef.current = null
    blinkObservedTimelineMsRef.current = 0
    blinkProcessingRef.current = false
    blinkSignalRef.current = null
    blinkSamplesRef.current = []
    blinkStateRef.current = 'undetected'
    blinkMotionSuppressUntilRef.current = 0
    blinkTimestampsRef.current = []
    blinkRateRef.current = 0
    setBlinkCountWindow(0)
    setBlinkMetrics(null)
    setBlinkRatePerMin(0)
    setBlinkState('undetected')
  }, [])

  const markBlinkTrackingGap = useCallback((nextState: BlinkState = 'tracking') => {
    blinkClosedRef.current = false
    blinkCloseStartedAtRef.current = null
    blinkFaceSnapshotRef.current = null
    blinkSignalRef.current = null
    setBlinkCountWindow(blinkTimestampsRef.current.length)
    setBlinkRatePerMin(blinkRateRef.current)
    setBlinkState(nextState)
    blinkStateRef.current = nextState
  }, [])

  const resetDetectionState = useCallback(() => {
    detectionErrorCountRef.current = 0
    resetStableRef(distanceStableRef, 'unavailable')
    resetStableRef(postureStableRef, 'undetected')
    missCountRef.current = 0
    distanceCalibrationFrameRef.current = null
    distanceCalibrationStableCountRef.current = 0
    postureCalibrationFrameRef.current = null
    postureCalibrationStableCountRef.current = 0
    faceLandmarkerFailedRef.current = false
    faceLandmarkerLastRunAtRef.current = 0
    faceLandmarkerAlignmentRef.current = null
    faceLandmarkerNextRetryAtRef.current = 0
    faceLandmarkerProcessingRef.current = false
    setRuntimeLabel('未初始化')
    setDistanceState('unavailable')
    setPostureState('undetected')
    setKeypoints([])
    setFaceLandmarksCount(0)
    setDistanceSignalRatio(null)
    setDistanceSignalSource('face')
    setFaceScreenAlignment(defaultFaceScreenAlignment)
    resetBlinkState()
    setMetrics(null)
    setFlags(defaultFlags)
  }, [resetBlinkState])

  const resetAssessmentState = useCallback(() => {
    resetStableRef(distanceStableRef, 'unavailable')
    resetStableRef(postureStableRef, 'undetected')
    distanceCalibrationFrameRef.current = null
    distanceCalibrationStableCountRef.current = 0
    postureCalibrationFrameRef.current = null
    postureCalibrationStableCountRef.current = 0
    faceLandmarkerAlignmentRef.current = null
    setDistanceState('unavailable')
    setPostureState('undetected')
    setDistanceSignalRatio(null)
    setDistanceSignalSource('face')
    setFaceScreenAlignment(defaultFaceScreenAlignment)
    setMetrics(null)
    setFlags(defaultFlags)
  }, [])

  const updateCalibrationFeedback = useCallback(
    (
      blockingReason: DistanceCalibrationSnapshot['blockingReason'],
      sampleCount?: number,
    ) => {
      const baselineSignalRatio =
        distanceBaselineRef.current !== null
          ? Number(distanceBaselineRef.current.signalRatio.toFixed(4))
          : null

      setDistanceCalibration((current) => {
        const nextSampleCount = sampleCount ?? current.sampleCount

        if (
          current.status === 'sampling' &&
          current.blockingReason === blockingReason &&
          current.sampleCount === nextSampleCount &&
          current.baselineSignalRatio === baselineSignalRatio
        ) {
          return current
        }

        return {
          baselineSignalRatio,
          blockingReason,
          sampleCount: nextSampleCount,
          sampleTarget: baselineSampleTarget,
          status: 'sampling',
          updatedAt: current.updatedAt,
        }
      })
    },
    [],
  )

  const updatePostureCalibrationFeedback = useCallback(
    (
      blockingReason: PostureCalibrationBlockingReason,
      sampleCount?: number,
    ) => {
      setPostureCalibration((current) => {
        const nextSampleCount = sampleCount ?? current.sampleCount

        if (
          current.status === 'sampling' &&
          current.blockingReason === blockingReason &&
          current.sampleCount === nextSampleCount
        ) {
          return current
        }

        return {
          blockingReason,
          sampleCount: nextSampleCount,
          sampleTarget: baselineSampleTarget,
          status: 'sampling',
          updatedAt: current.updatedAt,
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (
      distanceCalibration.status !== 'ready' ||
      distanceCalibration.updatedAt === null ||
      distanceBaselineRef.current === null
    ) {
      return
    }

    persistDistanceCalibration(
      distanceBaselineRef.current,
      distanceCalibration.updatedAt,
    )
  }, [
    distanceCalibration.baselineSignalRatio,
    distanceCalibration.status,
    distanceCalibration.updatedAt,
  ])

  useEffect(() => {
    if (postureCalibration.status !== 'ready' || postureCalibration.updatedAt === null) {
      return
    }

    if (!baselineRef.current) {
      return
    }

    persistPostureCalibration(
      baselineRef.current,
      workingAlignmentBaselineRef.current,
      postureCalibration.updatedAt,
    )
  }, [postureCalibration.status, postureCalibration.updatedAt])

  const requestCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unavailable')
      setModelStatus('error')
      setErrorText('当前浏览器不支持摄像头调用。')
      return
    }

    resetDetectors()
    setCameraStatus('requesting')
    setModelStatus('idle')
    setRuntimeLabel('准备初始化')
    setErrorText(null)

    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 960 },
          height: { ideal: 540 },
        },
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      resetDetectionState()
      setCameraStatus('detecting')
      setModelStatus('loading')
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
          setCameraStatus('denied')
          setModelStatus('idle')
          setErrorText('摄像头权限被拒绝，请允许访问后重试。')
          return
        }

        if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
          setCameraStatus('unavailable')
          setModelStatus('error')
          setErrorText('未找到可用的摄像头设备。')
          return
        }
      }

      setCameraStatus('unavailable')
      setModelStatus('error')
      setErrorText('摄像头初始化失败。')
    }
  }, [resetDetectionState, stopCamera])

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current

    if (!video || !stream || (cameraStatus !== 'detecting' && cameraStatus !== 'ready')) {
      return
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }

    if (video.paused) {
      void video.play().catch((error: unknown) => {
        console.warn('Camera stream reattach failed.', error)
      })
    }
  })

  const runBlinkDetection = useEffectEvent(async () => {
    const video = videoRef.current

    if (
      !video ||
      cameraStatus !== 'ready' ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return
    }

    if (processingRef.current || blinkProcessingRef.current) {
      return
    }

    blinkProcessingRef.current = true

    try {
      if (modelStatus !== 'ready') {
        setModelStatus('loading')
      }
      const { faceDetector, runtimeLabel: nextRuntimeLabel } = await getDetectors()
      setRuntimeLabel(nextRuntimeLabel)
      const faces = await faceDetector.estimateFaces(video, {
        flipHorizontal: false,
        staticImageMode: false,
      })
      const face = faces[0] ?? null
      const now = Date.now()
      const previousFrameAt = blinkLastFrameAtRef.current
      const frameGapMs = previousFrameAt === null ? 0 : now - previousFrameAt
      const hasLongFrameGap = previousFrameAt !== null && frameGapMs > blinkLostTrackMs

      if (!face) {
        if (
          blinkLastSeenAtRef.current &&
          now - blinkLastSeenAtRef.current > blinkLostTrackMs
        ) {
          markBlinkTrackingGap(blinkBaselineRef.current ? 'tracking' : 'undetected')
        }

        return
      }

      const alignment =
        faceLandmarkerAlignmentRef.current ??
        estimateFaceScreenAlignment(face, video.videoWidth, video.videoHeight)

      if (alignment.status === 'out-of-range' || alignment.status === 'undetected') {
        setFaceScreenAlignment(alignment)
        markBlinkTrackingGap(blinkBaselineRef.current ? 'tracking' : 'undetected')
        return
      }

      const blinkFrame = extractBlinkFrame(face)

      if (!blinkFrame) {
        if (
          blinkLastSeenAtRef.current &&
          now - blinkLastSeenAtRef.current > blinkLostTrackMs
        ) {
          markBlinkTrackingGap(blinkBaselineRef.current ? 'tracking' : 'undetected')
        }

        return
      }

      const blinkFaceRatio = blinkFrame.faceWidth / Math.max(video.videoWidth, 1)

      if (blinkFaceRatio < blinkMinFaceRatio) {
        if (
          blinkLastSeenAtRef.current &&
          now - blinkLastSeenAtRef.current > blinkLostTrackMs
        ) {
          markBlinkTrackingGap(blinkBaselineRef.current ? 'tracking' : 'undetected')
        }

        return
      }

      blinkLastSeenAtRef.current = now
      blinkLastFrameAtRef.current = now
      setModelStatus('ready')

      const observedDeltaMs =
        previousFrameAt === null
          ? blinkFrameIntervalMs
          : Math.min(Math.max(frameGapMs, Math.floor(blinkFrameIntervalMs * 0.7)), blinkLostTrackMs)
      blinkObservedTimelineMsRef.current += observedDeltaMs

      if (hasLongFrameGap) {
        blinkClosedRef.current = false
        blinkCloseStartedAtRef.current = null
      }

      const previousFaceSnapshot = blinkFaceSnapshotRef.current
      const motionScore = previousFaceSnapshot
        ? Math.hypot(
            blinkFrame.centerX - previousFaceSnapshot.centerX,
            blinkFrame.centerY - previousFaceSnapshot.centerY,
          ) / Math.max(previousFaceSnapshot.faceWidth, blinkFrame.faceWidth, 1)
        : 0
      const scaleDelta = previousFaceSnapshot
        ? Math.abs(blinkFrame.faceWidth - previousFaceSnapshot.faceWidth) /
          Math.max(previousFaceSnapshot.faceWidth, 1)
        : 0
      const closeFaceMotionFactor =
        blinkFaceRatio >= blinkCloseFaceRatio ? blinkCloseMotionThresholdFactor : 1
      const eyeImbalance =
        Math.abs(blinkFrame.leftEar - blinkFrame.rightEar) /
        Math.max(blinkFrame.averageEar, blinkBaselineMinEar)
      const unstableMotion =
        motionScore > blinkMotionThreshold * closeFaceMotionFactor ||
        scaleDelta > blinkScaleDeltaThreshold * closeFaceMotionFactor ||
        eyeImbalance > blinkEyeImbalanceThreshold
      const hardMotion =
        motionScore > blinkHardMotionThreshold * closeFaceMotionFactor ||
        scaleDelta > blinkHardScaleDeltaThreshold * closeFaceMotionFactor

      if (hardMotion || hasLongFrameGap) {
        blinkMotionSuppressUntilRef.current = now + blinkMotionSuppressMs
        blinkClosedRef.current = false
        blinkCloseStartedAtRef.current = null
      }

      const motionSuppressed = now < blinkMotionSuppressUntilRef.current

      blinkFaceSnapshotRef.current = {
        centerX: blinkFrame.centerX,
        centerY: blinkFrame.centerY,
        faceWidth: blinkFrame.faceWidth,
      }

      const boundedAverageEar = clampNumber(
        blinkFrame.averageEar,
        blinkBaselineRef.current ? Math.max(0.08, blinkBaselineRef.current * 0.48) : 0.08,
        blinkBaselineRef.current ? Math.min(0.42, blinkBaselineRef.current * 1.18) : 0.42,
      )
      const filteredEar = unstableMotion || motionSuppressed
        ? blinkSignalRef.current ?? boundedAverageEar
        : blinkSignalRef.current === null
          ? boundedAverageEar
          : blinkSignalRef.current * 0.2 + boundedAverageEar * 0.8

      blinkSignalRef.current = filteredEar

      if (!unstableMotion && !motionSuppressed && filteredEar >= blinkBaselineMinEar && !blinkClosedRef.current) {
        blinkSamplesRef.current = [...blinkSamplesRef.current.slice(-23), filteredEar]

        if (blinkSamplesRef.current.length >= blinkBaselineSampleCount) {
          const sampleBaseline = deriveBlinkBaseline(blinkSamplesRef.current)

          blinkBaselineRef.current =
            blinkBaselineRef.current === null
              ? sampleBaseline
              : blinkBaselineRef.current * 0.9 + sampleBaseline * 0.1
        }
      }

      const effectiveBaselineEar = blinkBaselineRef.current ?? filteredEar
      const baselineReady =
        blinkBaselineRef.current !== null &&
        blinkSamplesRef.current.length >= blinkBaselineSampleCount
      const closeThreshold = Math.max(blinkCloseThresholdFloor, effectiveBaselineEar * 0.78)
      const openThreshold = Math.max(
        blinkOpenThresholdFloor,
        closeThreshold + 0.02,
        effectiveBaselineEar * 0.88,
      )

      if (!baselineReady) {
        blinkClosedRef.current = false
        blinkCloseStartedAtRef.current = null
      } else if (unstableMotion || hasLongFrameGap || motionSuppressed) {
        if (blinkClosedRef.current && blinkCloseStartedAtRef.current !== null) {
          blinkClosedRef.current = false
          blinkCloseStartedAtRef.current = null
        }
      } else {
        if (!blinkClosedRef.current && filteredEar < closeThreshold) {
          blinkClosedRef.current = true
          blinkCloseStartedAtRef.current = now
        } else if (blinkClosedRef.current && filteredEar > openThreshold) {
          const closedForMs = now - (blinkCloseStartedAtRef.current ?? now)
          const observedNowMs = blinkObservedTimelineMsRef.current

          if (closedForMs >= blinkMinDurationMs && closedForMs <= blinkMaxDurationMs) {
            blinkTimestampsRef.current = [
              ...blinkTimestampsRef.current.filter(
                (timestamp) => observedNowMs - timestamp <= blinkRateWindowMs,
              ),
              observedNowMs,
            ]
            recordDailyBlink()
          }

          blinkClosedRef.current = false
          blinkCloseStartedAtRef.current = null
        }
      }

      blinkTimestampsRef.current = blinkTimestampsRef.current.filter(
        (timestamp) => blinkObservedTimelineMsRef.current - timestamp <= blinkRateWindowMs,
      )

      const observationMs = blinkObservedTimelineMsRef.current
      const effectiveWindowMs = Math.min(blinkRateWindowMs, Math.max(observationMs, 1))
      const ratePerMin =
        blinkTimestampsRef.current.length * (60 * 1000 / effectiveWindowMs)
      const longClosureDetected =
        baselineReady &&
        blinkClosedRef.current &&
        blinkCloseStartedAtRef.current !== null &&
        !unstableMotion &&
        !motionSuppressed &&
        !hasLongFrameGap &&
        now - blinkCloseStartedAtRef.current >= blinkLongClosureMs

      if (longClosureDetected) {
        blinkClosedRef.current = false
        blinkCloseStartedAtRef.current = null
      }

      let nextBlinkState: BlinkState = 'tracking'

      if (
        motionSuppressed ||
        longClosureDetected ||
        observationMs < blinkMinObservationMs ||
        !baselineReady ||
        blinkBaselineRef.current === null
      ) {
        nextBlinkState = 'tracking'
      } else if (ratePerMin < blinkLowRateThreshold) {
        nextBlinkState = 'low-rate'
      } else {
        nextBlinkState = 'normal'
      }

      blinkStateRef.current = nextBlinkState
      blinkRateRef.current = ratePerMin

      setBlinkCountWindow(blinkTimestampsRef.current.length)
      setBlinkMetrics({
        averageEar: filteredEar,
        baselineEar: blinkBaselineRef.current,
        blinksInWindow: blinkTimestampsRef.current.length,
        leftEar: blinkFrame.leftEar,
        observationMs,
        ratePerMin,
        rightEar: blinkFrame.rightEar,
      })
      setBlinkRatePerMin(ratePerMin)
      setBlinkState(nextBlinkState)
    } catch (error) {
      console.error('Blink monitor failed.', error)
      resetDetectors()
      setModelStatus(cameraStatus === 'ready' ? 'loading' : 'error')
      setBlinkMetrics(null)
      setBlinkState('undetected')
      setBlinkRatePerMin(0)
      setBlinkCountWindow(0)
      if (cameraStatus === 'ready') {
        setErrorText('眨眼检测暂时不可用，正在等待稳定的眼部跟踪。')
      }
      blinkStateRef.current = 'undetected'
      blinkRateRef.current = 0
    } finally {
      blinkProcessingRef.current = false
    }
  })

  const runDetection = useEffectEvent(async () => {
    const video = videoRef.current

    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return
    }

    if (processingRef.current || blinkProcessingRef.current) {
      return
    }

    processingRef.current = true

    try {
      if (modelStatus !== 'ready') {
        setModelStatus('loading')
      }
      const {
        faceContours,
        faceDetector,
        poseDetector,
        posePairs,
        runtimeLabel: nextRuntimeLabel,
      } = await getDetectors()
      detectionErrorCountRef.current = 0
      setRuntimeLabel(nextRuntimeLabel)
      const faces = await faceDetector.estimateFaces(video, {
        flipHorizontal: false,
        staticImageMode: false,
      })
      const poses = await poseDetector.estimatePoses(video, {
        flipHorizontal: false,
      })

      const face = faces[0] ?? null
      const pose = poses[0] ?? null
      const now = Date.now()
      if (
        (!faceLandmarkerFailedRef.current || now >= faceLandmarkerNextRetryAtRef.current) &&
        !faceLandmarkerProcessingRef.current &&
        now - faceLandmarkerLastRunAtRef.current >= faceLandmarkerFrameIntervalMs
      ) {
        faceLandmarkerProcessingRef.current = true
        faceLandmarkerLastRunAtRef.current = now

        const landmarkerResponse = await runFaceLandmarkerInWorker(video, now)
        faceLandmarkerProcessingRef.current = false
        faceLandmarkerFailedRef.current = landmarkerResponse.failed
        faceLandmarkerNextRetryAtRef.current = landmarkerResponse.failed
          ? now + faceLandmarkerRetryDelayMs
          : 0

        faceLandmarkerAlignmentRef.current = landmarkerResponse.alignment
      }

      const alignment =
        faceLandmarkerAlignmentRef.current ??
        estimateFaceScreenAlignment(face, video.videoWidth, video.videoHeight)
      const calibrationMetrics = face
        ? extractDistanceCalibrationMetrics(face, video.videoWidth)
        : null
      const shouldCollectDistanceCalibration = distanceCalibration.status === 'sampling'
      const shouldCollectPostureCalibration = postureCalibration.status === 'sampling'
      const previousCalibrationFrame = distanceCalibrationFrameRef.current
      const calibrationBlockingReason = getCalibrationBlockingReason(
        calibrationMetrics,
        face ? Math.min(1, face.keypoints.length / totalFaceKeypoints) : 0,
        previousCalibrationFrame,
        alignment,
      )
      if (shouldCollectDistanceCalibration) {
        if (calibrationBlockingReason === 'none') {
          distanceCalibrationStableCountRef.current += 1
        } else {
          distanceCalibrationStableCountRef.current = 0
        }
      }
      if (calibrationMetrics) {
        distanceCalibrationFrameRef.current = {
          centerX: calibrationMetrics.centerX,
          centerY: calibrationMetrics.centerY,
          faceWidth: calibrationMetrics.faceWidth,
        }
      } else if (!face) {
        distanceCalibrationFrameRef.current = null
      }
      const visiblePoseKeypoints = filterPoseKeypoints(pose)
      const hasAnyDetection = Boolean(face) || Boolean(pose)

      setKeypoints(visiblePoseKeypoints)
      setFaceLandmarksCount(face?.keypoints.length ?? 0)
      setFaceScreenAlignment(alignment)
      setDistanceSignalRatio(calibrationMetrics?.signalRatio ?? null)
      setDistanceSignalSource(calibrationMetrics?.irisRatio !== null ? 'iris' : 'face')
      setCameraStatus(hasAnyDetection ? 'ready' : 'detecting')
      setModelStatus(hasAnyDetection ? 'ready' : 'loading')
      if (hasAnyDetection) {
        setErrorText(
          alignment.status === 'out-of-range'
            ? '脸部与屏幕角度超出可靠检测范围，请回到屏幕中央并尽量正对摄像头。'
            : null,
        )
      }
      drawDetectionOverlay(
        overlayRef.current,
        video,
        face,
        faceContours,
        pose,
        posePairs,
        postureStableRef.current.stable,
        distanceStableRef.current.stable,
      )

      if (!face || !pose) {
        missCountRef.current += 1
        setMetrics(null)
        distanceCalibrationStableCountRef.current = 0
        postureCalibrationStableCountRef.current = 0
        postureCalibrationFrameRef.current = null

        if (shouldCollectDistanceCalibration) {
          updateCalibrationFeedback(
            face ? calibrationBlockingReason : 'detecting',
            distanceSampleRef.current.length,
          )
        }

        if (shouldCollectPostureCalibration) {
          updatePostureCalibrationFeedback(
            !face ? 'face' : !pose ? 'pose' : 'detecting',
            postureCalibrationSampleRef.current.length,
          )
        }

        if (missCountRef.current >= 3) {
          missCountRef.current = 0
          resetAssessmentState()
        }

        return
      }

      const extractedMetrics = extractMetrics(
        face,
        pose,
        video.videoWidth,
        video.videoHeight,
      )

      if (!extractedMetrics) {
        missCountRef.current += 1
        setMetrics(null)
        distanceCalibrationStableCountRef.current = 0
        postureCalibrationStableCountRef.current = 0
        postureCalibrationFrameRef.current = null
        if (shouldCollectDistanceCalibration) {
          updateCalibrationFeedback(
            face ? calibrationBlockingReason : 'detecting',
            distanceSampleRef.current.length,
          )
        }

        if (shouldCollectPostureCalibration) {
          updatePostureCalibrationFeedback('detecting', postureCalibrationSampleRef.current.length)
        }

        if (missCountRef.current >= 3) {
          missCountRef.current = 0
          resetAssessmentState()
        }

        return
      }

      missCountRef.current = 0
      const activePostureBaseline = workspacePostureBaseline ?? baselineRef.current
      const activeDistanceBaseline =
        workspaceDistanceBaseline === null
          ? distanceBaselineRef.current
          : {
              centerX: 0,
              centerY: 0,
              eyeSpanRatio: workspaceDistanceBaseline.eyeSpanRatio,
              irisRatio: workspaceDistanceBaseline.irisRatio,
              faceRatio: workspaceDistanceBaseline.faceRatio,
              signalRatio: workspaceDistanceBaseline.signalRatio,
              faceWidth: workspaceDistanceBaseline.faceRatio,
            }
      const activeAlignmentBaseline =
        workspaceAlignmentBaseline ?? workingAlignmentBaselineRef.current
      const activePostureBaselineLocked =
        workspacePostureBaselineLocked ?? postureCalibrationLockedRef.current

      const classified = classifyMonitor(
        extractedMetrics,
        activePostureBaseline,
        activeDistanceBaseline,
        distanceThresholds,
        alignment,
        activeAlignmentBaseline,
        activePostureBaselineLocked,
      )
      const postureCalibrationFrame =
        calibrationMetrics === null
          ? null
          : {
              centerX: calibrationMetrics.centerX,
              centerY: calibrationMetrics.centerY,
              eyeShoulderRatio: extractedMetrics.eyeShoulderRatio,
              faceToShoulderRatio: extractedMetrics.faceToShoulderRatio,
              faceWidth: calibrationMetrics.faceWidth,
              noseShoulderRatio: extractedMetrics.noseShoulderRatio,
              shoulderWidthRatio: extractedMetrics.shoulderWidthRatio,
            }
      const postureAlignmentSample = createAlignmentBaselineMetrics(alignment)
      const runtimeCalibrationMetrics =
        calibrationMetrics === null
          ? null
          : {
              ...calibrationMetrics,
              signalRatio: classified.distanceSignalRatio,
            }
      const previousPostureCalibrationFrame = postureCalibrationFrameRef.current
      const postureCalibrationBlockingReason = getPostureCalibrationBlockingReason(
        extractedMetrics,
        postureCalibrationFrame,
        previousPostureCalibrationFrame,
        alignment,
      )
      if (shouldCollectPostureCalibration) {
        if (postureCalibrationBlockingReason === 'none') {
          postureCalibrationStableCountRef.current += 1
        } else {
          postureCalibrationStableCountRef.current = 0
        }
      }
      if (postureCalibrationFrame) {
        postureCalibrationFrameRef.current = postureCalibrationFrame
      }
      setDistanceSignalRatio(classified.distanceSignalRatio)
      setDistanceSignalSource(classified.distanceSignalSource)

      if (shouldCollectDistanceCalibration) {
        const readyForStableSample =
          calibrationBlockingReason === 'none' &&
          runtimeCalibrationMetrics !== null &&
          distanceCalibrationStableCountRef.current >= calibrationStableFrameTarget

        if (readyForStableSample) {
          distanceSampleRef.current = [
            ...distanceSampleRef.current.slice(-17),
            runtimeCalibrationMetrics,
          ]
          const nextSampleCount = distanceSampleRef.current.length

          if (nextSampleCount >= baselineSampleTarget) {
            distanceBaselineRef.current = averageDistanceCalibrationMetrics(distanceSampleRef.current)
            const nextBaselineSignalRatio = Number(distanceBaselineRef.current.signalRatio.toFixed(4))

            setDistanceCalibration((current) => {
              if (
                current.status === 'ready' &&
                current.sampleCount === nextSampleCount &&
                current.updatedAt !== null &&
                current.baselineSignalRatio !== null &&
                Math.abs(current.baselineSignalRatio - nextBaselineSignalRatio) < 0.0001
              ) {
                return current
              }

              return {
                baselineSignalRatio: nextBaselineSignalRatio,
                blockingReason: 'none',
                sampleCount: nextSampleCount,
                sampleTarget: baselineSampleTarget,
                status: 'ready',
                updatedAt: Date.now(),
              }
            })
          } else {
            updateCalibrationFeedback('none', nextSampleCount)
          }
        } else {
          if (
            calibrationBlockingReason === 'unstable' &&
            distanceSampleRef.current.length > 0
          ) {
            distanceSampleRef.current = []
            distanceCalibrationStableCountRef.current = 0
            updateCalibrationFeedback('restart', 0)
            return
          }

          updateCalibrationFeedback(
            calibrationBlockingReason === 'none' ? 'unstable' : calibrationBlockingReason,
            distanceSampleRef.current.length,
          )
        }
      } else if (
        distanceBaselineRef.current &&
        alignment.status === 'in-range' &&
        classified.distanceState === 'normal' &&
        runtimeCalibrationMetrics !== null
      ) {
        distanceBaselineRef.current = blendDistanceCalibrationMetrics(
          distanceBaselineRef.current,
          runtimeCalibrationMetrics,
          0.04,
        )
        const blendedFaceRatio = Number(distanceBaselineRef.current.signalRatio.toFixed(4))

        setDistanceCalibration((current) => {
          if (
            current.status === 'ready' &&
            current.baselineSignalRatio !== null &&
            Math.abs(current.baselineSignalRatio - blendedFaceRatio) < 0.002
          ) {
            return current
          }

          return {
            baselineSignalRatio: blendedFaceRatio,
            blockingReason: 'none',
            sampleCount: Math.max(current.sampleCount, baselineSampleTarget),
            sampleTarget: baselineSampleTarget,
            status: 'ready',
            updatedAt: current.updatedAt,
          }
        })
      }

      if (shouldCollectPostureCalibration) {
        const readyForStablePostureSample =
          postureCalibrationBlockingReason === 'none' &&
          postureAlignmentSample !== null &&
          postureCalibrationStableCountRef.current >= postureCalibrationStableFrameTarget

        if (readyForStablePostureSample) {
          postureCalibrationSampleRef.current = [
            ...postureCalibrationSampleRef.current.slice(-17),
            extractedMetrics,
          ]
          postureCalibrationAlignmentSampleRef.current = [
            ...postureCalibrationAlignmentSampleRef.current.slice(-17),
            postureAlignmentSample,
          ]
          const nextSampleCount = postureCalibrationSampleRef.current.length

          if (nextSampleCount >= baselineSampleTarget) {
            const nextBaseline = averageMetrics(postureCalibrationSampleRef.current)
            const nextAlignmentBaseline = averageAlignmentBaselineMetrics(
              postureCalibrationAlignmentSampleRef.current,
            )
            baselineRef.current = nextBaseline
            workingAlignmentBaselineRef.current = nextAlignmentBaseline
            sampleRef.current = [...postureCalibrationSampleRef.current]
            postureCalibrationLockedRef.current = true

            setPostureCalibration((current) => ({
              blockingReason: 'none',
              sampleCount: nextSampleCount,
              sampleTarget: baselineSampleTarget,
              status: 'ready',
              updatedAt:
                current.status === 'ready' &&
                current.sampleCount === nextSampleCount &&
                current.updatedAt !== null
                  ? current.updatedAt
                  : Date.now(),
            }))
          } else {
            updatePostureCalibrationFeedback('none', nextSampleCount)
          }
        } else {
          if (
            postureCalibrationBlockingReason === 'unstable' &&
            postureCalibrationSampleRef.current.length > 0
          ) {
            postureCalibrationSampleRef.current = []
            postureCalibrationAlignmentSampleRef.current = []
            postureCalibrationStableCountRef.current = 0
            updatePostureCalibrationFeedback('restart', 0)
          } else {
            updatePostureCalibrationFeedback(
              postureCalibrationBlockingReason === 'none'
                ? 'unstable'
                : postureCalibrationBlockingReason,
              postureCalibrationSampleRef.current.length,
            )
          }
        }
      }

      const canAdaptWorkingAlignment =
        postureAlignmentSample !== null &&
        !shouldCollectPostureCalibration &&
        alignment.status !== 'out-of-range' &&
        alignment.status !== 'undetected' &&
        alignment.quality >= 0.24 &&
        classified.distanceState !== 'too-close' &&
        classified.postureState === 'normal'

      if (canAdaptWorkingAlignment) {
        if (!workingAlignmentBaselineRef.current) {
          workingAlignmentBaselineRef.current = postureAlignmentSample
        } else {
          const currentAlignmentBaseline = workingAlignmentBaselineRef.current
          const yawDelta = getAngleDeltaDeg(
            postureAlignmentSample.yawDeg,
            currentAlignmentBaseline.yawDeg,
          )
          const pitchDelta = getAngleDeltaDeg(
            postureAlignmentSample.pitchDeg,
            currentAlignmentBaseline.pitchDeg,
          )
          const horizontalDelta = Math.abs(
            postureAlignmentSample.horizontalOffset - currentAlignmentBaseline.horizontalOffset,
          )
          const verticalDelta = Math.abs(
            postureAlignmentSample.verticalOffset - currentAlignmentBaseline.verticalOffset,
          )
          const blendFactor =
            yawDelta > 10 || pitchDelta > 8 || horizontalDelta > 0.12 || verticalDelta > 0.1
              ? 0.16
              : 0.05

          workingAlignmentBaselineRef.current = blendAlignmentBaselineMetrics(
            currentAlignmentBaseline,
            postureAlignmentSample,
            blendFactor,
          )
        }
      }

      setMetrics(extractedMetrics)
      setFlags(classified.flags)
      updateStableState(distanceStableRef, classified.distanceState, setDistanceState)
      updateStableState(postureStableRef, classified.postureState, setPostureState)
      drawDetectionOverlay(
        overlayRef.current,
        video,
        face,
        faceContours,
        pose,
        posePairs,
        postureStableRef.current.stable,
        distanceStableRef.current.stable,
      )
    } catch (error) {
      console.error('Pose monitor initialization failed.', error)
      detectionErrorCountRef.current += 1
      resetDetectors()

      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : '未知错误'

      if (detectionErrorCountRef.current < 3) {
        setCameraStatus('detecting')
        setModelStatus('loading')
        setErrorText(`初始化受阻，正在切换兼容模式重试：${errorMessage}`)
      } else {
        setCameraStatus('unavailable')
        setModelStatus('error')
        setErrorText(`Face Mesh / BlazePose 初始化失败。已尝试兼容模式：${errorMessage}`)
      }
    } finally {
      processingRef.current = false
    }
  })

  useEffect(() => {
    if (cameraStatus !== 'detecting' && cameraStatus !== 'ready') {
      return
    }

    const activeFrameIntervalMs =
      distanceCalibration.status === 'sampling' ? calibrationFrameIntervalMs : frameIntervalMs

    let blinkTimerId: number | null = null
    if (cameraStatus === 'ready') {
      blinkTimerId = window.setInterval(() => {
        void runBlinkDetection()
      }, blinkFrameIntervalMs)
    }
    const timerId = window.setInterval(() => {
      void runDetection()
    }, activeFrameIntervalMs)

    return () => {
      if (blinkTimerId !== null) {
        window.clearInterval(blinkTimerId)
      }
      window.clearInterval(timerId)
    }
  }, [cameraStatus, distanceCalibration.status])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [resetAssessmentState, stopCamera])

  return {
    videoRef,
    overlayRef,
    cameraStatus,
    modelStatus,
    runtimeLabel,
    distanceState,
    distanceSignalSource,
    faceScreenAlignment,
    postureState,
    flags,
    keypoints,
    faceLandmarksCount,
    blinkCountToday,
    blinkCountWindow,
    blinkMetrics,
    blinkRatePerMin,
    blinkState,
    distanceSignalRatio,
    distanceCalibration,
    distanceCalibrationBaseline:
      distanceBaselineRef.current === null
        ? null
        : {
            eyeSpanRatio: distanceBaselineRef.current.eyeSpanRatio,
            faceRatio: distanceBaselineRef.current.faceRatio,
            irisRatio: distanceBaselineRef.current.irisRatio,
            signalRatio: distanceBaselineRef.current.signalRatio,
          },
    postureCalibration,
    postureCalibrationBaseline: baselineRef.current,
    postureAlignmentBaseline: workingAlignmentBaselineRef.current,
    metrics,
    errorText,
    requestCamera,
    recalibrate,
    recalibratePosture,
  }
}
