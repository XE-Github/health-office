import type {
  AlignmentBaselineMetrics,
  BaselineMetrics,
  DistanceCalibrationMetrics,
  FaceScreenAlignment,
  FaceScreenAlignmentStatus,
  MonitorMetrics,
} from './poseMonitorTypes'

export interface AlignmentAdaptationMetrics {
  horizontalDelta: number
  horizontalStrength: number
  pitchAbsDeg: number
  pitchDeltaDeg: number
  targetFit: number
  targetSideStrength: number
  verticalDelta: number
  verticalStrength: number
  yawAbsDeg: number
  yawDeltaDeg: number
}

export interface AlignmentRiskAdjustment {
  distanceRelaxation: number
  distanceSlack: number
  forwardHeadHorizontalSlack: number
  forwardHeadYawSlackDeg: number
  moderateAlignmentDeviation: boolean
  sideTargetFit: number
  strongAlignmentDeviation: boolean
  tiltHorizontalSlack: number
  tiltPitchSlackDeg: number
  tiltVerticalSlack: number
  tiltYawSlackDeg: number
}

export function distanceBetween(
  first: { x: number; y: number },
  second: { x: number; y: number },
) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export function averageValues(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function averageNullableValues(values: Array<number | null>) {
  const validValues = values.filter((value): value is number => value !== null)

  return validValues.length > 0 ? averageValues(validValues) : null
}

export function averageMetrics(samples: MonitorMetrics[]): BaselineMetrics {
  const total = samples.reduce(
    (accumulator, sample) => ({
      faceRatio: accumulator.faceRatio + sample.faceRatio,
      eyeSpanRatio: accumulator.eyeSpanRatio + sample.eyeSpanRatio,
      faceToShoulderRatio:
        accumulator.faceToShoulderRatio + sample.faceToShoulderRatio,
      noseShoulderRatio:
        accumulator.noseShoulderRatio + sample.noseShoulderRatio,
      eyeShoulderRatio: accumulator.eyeShoulderRatio + sample.eyeShoulderRatio,
      chinShoulderRatio:
        accumulator.chinShoulderRatio + sample.chinShoulderRatio,
      mouthShoulderRatio:
        accumulator.mouthShoulderRatio + sample.mouthShoulderRatio,
      shoulderWidthRatio:
        accumulator.shoulderWidthRatio + sample.shoulderWidthRatio,
      shoulderTiltDeg: accumulator.shoulderTiltDeg + sample.shoulderTiltDeg,
      headRollDeg: accumulator.headRollDeg + sample.headRollDeg,
    }),
    {
      faceRatio: 0,
      eyeSpanRatio: 0,
      faceToShoulderRatio: 0,
      noseShoulderRatio: 0,
      eyeShoulderRatio: 0,
      chinShoulderRatio: 0,
      mouthShoulderRatio: 0,
      shoulderWidthRatio: 0,
      shoulderTiltDeg: 0,
      headRollDeg: 0,
    },
  )

  return {
    faceRatio: total.faceRatio / samples.length,
    eyeSpanRatio: total.eyeSpanRatio / samples.length,
    faceToShoulderRatio: total.faceToShoulderRatio / samples.length,
    noseShoulderRatio: total.noseShoulderRatio / samples.length,
    eyeShoulderRatio: total.eyeShoulderRatio / samples.length,
    chinShoulderRatio: total.chinShoulderRatio / samples.length,
    mouthShoulderRatio: total.mouthShoulderRatio / samples.length,
    shoulderWidthRatio: total.shoulderWidthRatio / samples.length,
    shoulderTiltDeg: total.shoulderTiltDeg / samples.length,
    headRollDeg: total.headRollDeg / samples.length,
  }
}

export function averageDistanceCalibrationMetrics(
  samples: DistanceCalibrationMetrics[],
): DistanceCalibrationMetrics {
  const total = samples.reduce(
    (accumulator, sample) => ({
      centerX: accumulator.centerX + sample.centerX,
      centerY: accumulator.centerY + sample.centerY,
      eyeSpanRatio: accumulator.eyeSpanRatio + sample.eyeSpanRatio,
      faceRatio: accumulator.faceRatio + sample.faceRatio,
      signalRatio: accumulator.signalRatio + sample.signalRatio,
      faceWidth: accumulator.faceWidth + sample.faceWidth,
    }),
    {
      centerX: 0,
      centerY: 0,
      eyeSpanRatio: 0,
      faceRatio: 0,
      signalRatio: 0,
      faceWidth: 0,
    },
  )

  return {
    centerX: total.centerX / samples.length,
    centerY: total.centerY / samples.length,
    eyeSpanRatio: total.eyeSpanRatio / samples.length,
    irisRatio: averageNullableValues(samples.map((sample) => sample.irisRatio)),
    faceRatio: total.faceRatio / samples.length,
    signalRatio: total.signalRatio / samples.length,
    faceWidth: total.faceWidth / samples.length,
  }
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeAngleDeg(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

export function getAngleDeltaDeg(current: number, baseline: number) {
  return Math.abs(normalizeAngleDeg(current - baseline))
}

export function blendNullableValue(current: number | null, next: number | null, factor: number) {
  if (current === null) {
    return next
  }

  if (next === null) {
    return current
  }

  return current * (1 - factor) + next * factor
}

export function blendDistanceCalibrationMetrics(
  current: DistanceCalibrationMetrics,
  next: DistanceCalibrationMetrics,
  factor: number,
): DistanceCalibrationMetrics {
  return {
    centerX: current.centerX * (1 - factor) + next.centerX * factor,
    centerY: current.centerY * (1 - factor) + next.centerY * factor,
    eyeSpanRatio: current.eyeSpanRatio * (1 - factor) + next.eyeSpanRatio * factor,
    irisRatio: blendNullableValue(current.irisRatio, next.irisRatio, factor),
    faceRatio: current.faceRatio * (1 - factor) + next.faceRatio * factor,
    signalRatio: current.signalRatio * (1 - factor) + next.signalRatio * factor,
    faceWidth: current.faceWidth * (1 - factor) + next.faceWidth * factor,
  }
}

export function deriveBlinkBaseline(samples: number[]) {
  const sortedSamples = [...samples].sort((left, right) => left - right)
  const openWindowStart = Math.max(0, Math.floor(sortedSamples.length * 0.6))
  const openSamples = sortedSamples.slice(openWindowStart)

  return averageValues(openSamples.length > 0 ? openSamples : sortedSamples)
}

export function averagePoint(points: Array<{ x: number; y: number }>) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

export function getAlignmentAngles(alignment: FaceScreenAlignment) {
  return {
    pitchDeg:
      alignment.pitchDeg === null
        ? alignment.verticalOffset * Math.max(alignment.pitchProxy * 56, 0)
        : alignment.pitchDeg,
    rollDeg: alignment.rollDeg,
    yawDeg:
      alignment.yawDeg === null
        ? alignment.horizontalOffset * Math.max(alignment.yawProxy * 72, 0)
        : alignment.yawDeg,
  }
}

export function createAlignmentBaselineMetrics(
  alignment: FaceScreenAlignment,
): AlignmentBaselineMetrics | null {
  if (alignment.status === 'out-of-range' || alignment.status === 'undetected') {
    return null
  }

  const angles = getAlignmentAngles(alignment)

  return {
    horizontalOffset: alignment.horizontalOffset,
    pitchDeg: angles.pitchDeg,
    rollDeg: angles.rollDeg,
    verticalOffset: alignment.verticalOffset,
    yawDeg: angles.yawDeg,
  }
}

export function averageAlignmentBaselineMetrics(
  samples: AlignmentBaselineMetrics[],
): AlignmentBaselineMetrics {
  return {
    horizontalOffset: averageValues(samples.map((sample) => sample.horizontalOffset)),
    pitchDeg: averageValues(samples.map((sample) => sample.pitchDeg)),
    rollDeg: averageValues(samples.map((sample) => sample.rollDeg)),
    verticalOffset: averageValues(samples.map((sample) => sample.verticalOffset)),
    yawDeg: averageValues(samples.map((sample) => sample.yawDeg)),
  }
}

export function blendAlignmentBaselineMetrics(
  current: AlignmentBaselineMetrics,
  next: AlignmentBaselineMetrics,
  factor: number,
): AlignmentBaselineMetrics {
  return {
    horizontalOffset: current.horizontalOffset * (1 - factor) + next.horizontalOffset * factor,
    pitchDeg: current.pitchDeg * (1 - factor) + next.pitchDeg * factor,
    rollDeg: current.rollDeg * (1 - factor) + next.rollDeg * factor,
    verticalOffset: current.verticalOffset * (1 - factor) + next.verticalOffset * factor,
    yawDeg: current.yawDeg * (1 - factor) + next.yawDeg * factor,
  }
}

export function createAlignmentAdjustedMetrics(
  metrics: MonitorMetrics,
  alignment: FaceScreenAlignment,
  alignmentBaseline: AlignmentBaselineMetrics | null,
) {
  if (alignment.status === 'out-of-range' || alignment.status === 'undetected') {
    return metrics
  }

  const currentAngles = getAlignmentAngles(alignment)
  const useRelativeCompensation = alignmentBaseline !== null
  const yawForCompensation = useRelativeCompensation
    ? getAngleDeltaDeg(currentAngles.yawDeg, alignmentBaseline.yawDeg)
    : Math.abs(currentAngles.yawDeg)
  const pitchForCompensation = useRelativeCompensation
    ? getAngleDeltaDeg(currentAngles.pitchDeg, alignmentBaseline.pitchDeg)
    : Math.abs(currentAngles.pitchDeg)
  const horizontalOffsetForCompensation = useRelativeCompensation
    ? Math.abs(alignment.horizontalOffset - alignmentBaseline.horizontalOffset)
    : Math.abs(alignment.horizontalOffset)
  const currentYawRad =
    (Math.min(yawForCompensation, useRelativeCompensation ? 26 : 40) * Math.PI) / 180
  const currentPitchRad =
    (Math.min(pitchForCompensation, useRelativeCompensation ? 18 : 26) * Math.PI) / 180
  const currentPerspectiveCompensation =
    1 /
    Math.max(
      0.82,
      Math.cos(currentYawRad * 0.72) * Math.cos(currentPitchRad * 0.66),
    )
  const currentOffsetCompensation =
    1 + Math.min(horizontalOffsetForCompensation, 0.42) * 0.02
  const ratioCompensation = clampNumber(
    currentPerspectiveCompensation * currentOffsetCompensation,
    useRelativeCompensation ? 0.96 : 1,
    useRelativeCompensation ? 1.08 : 1.18,
  )

  return {
    ...metrics,
    eyeSpanRatio: metrics.eyeSpanRatio * ratioCompensation,
    faceRatio: metrics.faceRatio * ratioCompensation,
    irisRatio: metrics.irisRatio === null ? null : metrics.irisRatio * ratioCompensation,
  }
}

export function deriveAlignmentAdaptation(
  alignment: FaceScreenAlignment,
  alignmentBaseline: AlignmentBaselineMetrics | null,
): AlignmentAdaptationMetrics {
  const angles = getAlignmentAngles(alignment)
  const yawAbsDeg = Math.abs(angles.yawDeg)
  const pitchAbsDeg = Math.abs(angles.pitchDeg)
  const horizontalDelta =
    alignmentBaseline === null
      ? Math.abs(alignment.horizontalOffset)
      : Math.abs(alignment.horizontalOffset - alignmentBaseline.horizontalOffset)
  const verticalDelta =
    alignmentBaseline === null
      ? Math.abs(alignment.verticalOffset)
      : Math.abs(alignment.verticalOffset - alignmentBaseline.verticalOffset)
  const yawDeltaDeg =
    alignmentBaseline === null ? yawAbsDeg : getAngleDeltaDeg(angles.yawDeg, alignmentBaseline.yawDeg)
  const pitchDeltaDeg =
    alignmentBaseline === null
      ? pitchAbsDeg
      : getAngleDeltaDeg(angles.pitchDeg, alignmentBaseline.pitchDeg)
  const horizontalStrength = clampNumber(
    Math.max(horizontalDelta / 0.24, yawDeltaDeg / 16),
    0,
    1,
  )
  const verticalStrength = clampNumber(
    Math.max(verticalDelta / 0.2, pitchDeltaDeg / 14),
    0,
    1,
  )
  const targetSideStrength =
    alignmentBaseline === null
      ? 0
      : clampNumber(
          Math.max(
            Math.abs(alignmentBaseline.horizontalOffset) / 0.28,
            Math.abs(alignmentBaseline.yawDeg) / 24,
          ),
          0,
          1,
        )
  const targetFit =
    alignmentBaseline === null
      ? 0
      : clampNumber(
          1 -
            Math.max(
              horizontalDelta / 0.32,
              yawDeltaDeg / 34,
              verticalDelta / 0.28,
              pitchDeltaDeg / 26,
            ),
          0,
          1,
        )

  return {
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
  }
}

export function deriveAlignmentRiskAdjustment(
  alignmentStatus: FaceScreenAlignmentStatus,
  adaptation: AlignmentAdaptationMetrics,
): AlignmentRiskAdjustment {
  const sideTargetFit = adaptation.targetFit * adaptation.targetSideStrength
  const moderateAlignmentDeviation =
    adaptation.horizontalStrength >= 0.58 ||
    adaptation.yawDeltaDeg >= 18 ||
    adaptation.horizontalDelta >= 0.18
  const strongAlignmentDeviation =
    adaptation.horizontalStrength >= 0.86 ||
    adaptation.yawDeltaDeg >= 30 ||
    adaptation.horizontalDelta >= 0.3 ||
    alignmentStatus === 'edge'

  return {
    distanceRelaxation: clampNumber(
      (strongAlignmentDeviation ? 0.2 : moderateAlignmentDeviation ? 0.08 : 0) +
        sideTargetFit * 0.12,
      0,
      0.24,
    ),
    distanceSlack:
      (strongAlignmentDeviation ? 0.018 : moderateAlignmentDeviation ? 0.01 : 0) +
      sideTargetFit * 0.014,
    forwardHeadHorizontalSlack: sideTargetFit * 0.1,
    forwardHeadYawSlackDeg: sideTargetFit * 10,
    moderateAlignmentDeviation,
    sideTargetFit,
    strongAlignmentDeviation,
    tiltHorizontalSlack: sideTargetFit * 0.1,
    tiltPitchSlackDeg: sideTargetFit * 6,
    tiltVerticalSlack: sideTargetFit * 0.08,
    tiltYawSlackDeg: sideTargetFit * 8,
  }
}
