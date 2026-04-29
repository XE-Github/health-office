import type {
  AlignmentBaselineMetrics,
  BaselineMetrics,
  DistanceCalibrationMetrics,
  PersistedBlinkDailyCountPayload,
  PersistedDistanceCalibrationPayload,
  PersistedPostureCalibrationPayload,
} from './poseMonitorTypes'

const distanceCalibrationStorageKey = 'health-office-demo-distance-calibration-v1'
const postureCalibrationStorageKey = 'health-office-demo-posture-calibration-v1'
const blinkDailyCountStorageKey = 'health-office-demo-blink-daily-count-v1'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function createDistanceCalibrationMetricsFromPersisted(
  metrics: PersistedDistanceCalibrationPayload['metrics'],
): DistanceCalibrationMetrics {
  return {
    centerX: 0,
    centerY: 0,
    eyeSpanRatio: metrics.eyeSpanRatio,
    irisRatio: metrics.irisRatio,
    faceRatio: metrics.faceRatio,
    signalRatio: metrics.signalRatio,
    faceWidth: metrics.faceRatio,
  }
}

export function readPersistedDistanceCalibration(sampleTarget: number) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const storedValue = window.localStorage.getItem(distanceCalibrationStorageKey)

    if (!storedValue) {
      return null
    }

    const parsedValue = JSON.parse(storedValue) as PersistedDistanceCalibrationPayload
    const metrics = parsedValue.metrics

    if (
      parsedValue.version !== 1 ||
      !isFiniteNumber(parsedValue.updatedAt) ||
      !metrics ||
      !isFiniteNumber(metrics.eyeSpanRatio) ||
      !isFiniteNumber(metrics.faceRatio) ||
      !isFiniteNumber(metrics.signalRatio) ||
      !(metrics.irisRatio === null || isFiniteNumber(metrics.irisRatio))
    ) {
      return null
    }

    return {
      baseline: createDistanceCalibrationMetricsFromPersisted(metrics),
      snapshot: {
        baselineSignalRatio: Number(metrics.signalRatio.toFixed(4)),
        blockingReason: 'none' as const,
        sampleCount: sampleTarget,
        sampleTarget,
        status: 'ready' as const,
        updatedAt: parsedValue.updatedAt,
      },
    }
  } catch {
    return null
  }
}

export function persistDistanceCalibration(
  baseline: DistanceCalibrationMetrics,
  updatedAt: number,
) {
  if (typeof window === 'undefined') {
    return
  }

  const { eyeSpanRatio, irisRatio, faceRatio, signalRatio } = baseline
  const payload: PersistedDistanceCalibrationPayload = {
    metrics: {
      eyeSpanRatio: Number(eyeSpanRatio.toFixed(6)),
      irisRatio: irisRatio === null ? null : Number(irisRatio.toFixed(6)),
      faceRatio: Number(faceRatio.toFixed(6)),
      signalRatio: Number(signalRatio.toFixed(6)),
    },
    updatedAt,
    version: 1,
  }

  try {
    window.localStorage.setItem(distanceCalibrationStorageKey, JSON.stringify(payload))
  } catch {
    // Ignore persistence failures in restricted browser environments.
  }
}

export function readPersistedPostureCalibration(sampleTarget: number) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const storedValue = window.localStorage.getItem(postureCalibrationStorageKey)

    if (!storedValue) {
      return null
    }

    const parsedValue = JSON.parse(storedValue) as PersistedPostureCalibrationPayload
    const metrics = parsedValue.metrics
    const alignment = parsedValue.alignment

    if (
      (parsedValue.version !== 1 && parsedValue.version !== 2) ||
      !isFiniteNumber(parsedValue.updatedAt) ||
      !metrics ||
      !isFiniteNumber(metrics.faceRatio) ||
      !isFiniteNumber(metrics.eyeSpanRatio) ||
      !isFiniteNumber(metrics.faceToShoulderRatio) ||
      !isFiniteNumber(metrics.noseShoulderRatio) ||
      !isFiniteNumber(metrics.eyeShoulderRatio) ||
      !isFiniteNumber(metrics.chinShoulderRatio) ||
      !isFiniteNumber(metrics.mouthShoulderRatio) ||
      !isFiniteNumber(metrics.shoulderWidthRatio)
    ) {
      return null
    }

    return {
      alignmentBaseline:
        parsedValue.version === 2 &&
        alignment &&
        isFiniteNumber(alignment.horizontalOffset) &&
        isFiniteNumber(alignment.verticalOffset) &&
        isFiniteNumber(alignment.yawDeg) &&
        isFiniteNumber(alignment.pitchDeg) &&
        isFiniteNumber(alignment.rollDeg)
          ? {
              horizontalOffset: alignment.horizontalOffset,
              pitchDeg: alignment.pitchDeg,
              rollDeg: alignment.rollDeg,
              verticalOffset: alignment.verticalOffset,
              yawDeg: alignment.yawDeg,
            }
          : null,
      baseline: {
        ...metrics,
        shoulderTiltDeg:
          isFiniteNumber((metrics as Partial<BaselineMetrics>).shoulderTiltDeg)
            ? (metrics as Partial<BaselineMetrics>).shoulderTiltDeg!
            : 0,
        headRollDeg:
          isFiniteNumber((metrics as Partial<BaselineMetrics>).headRollDeg)
            ? (metrics as Partial<BaselineMetrics>).headRollDeg!
            : 0,
      },
      snapshot: {
        blockingReason: 'none' as const,
        sampleCount: sampleTarget,
        sampleTarget,
        status: 'ready' as const,
        updatedAt: parsedValue.updatedAt,
      },
    }
  } catch {
    return null
  }
}

export function persistPostureCalibration(
  baseline: BaselineMetrics,
  alignmentBaseline: AlignmentBaselineMetrics | null,
  updatedAt: number,
) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const payload: PersistedPostureCalibrationPayload = {
      alignment:
        alignmentBaseline === null
          ? null
          : {
              horizontalOffset: Number(alignmentBaseline.horizontalOffset.toFixed(6)),
              pitchDeg: Number(alignmentBaseline.pitchDeg.toFixed(6)),
              rollDeg: Number(alignmentBaseline.rollDeg.toFixed(6)),
              verticalOffset: Number(alignmentBaseline.verticalOffset.toFixed(6)),
              yawDeg: Number(alignmentBaseline.yawDeg.toFixed(6)),
            },
      metrics: {
        faceRatio: Number(baseline.faceRatio.toFixed(6)),
        eyeSpanRatio: Number(baseline.eyeSpanRatio.toFixed(6)),
        faceToShoulderRatio: Number(baseline.faceToShoulderRatio.toFixed(6)),
        noseShoulderRatio: Number(baseline.noseShoulderRatio.toFixed(6)),
        eyeShoulderRatio: Number(baseline.eyeShoulderRatio.toFixed(6)),
        chinShoulderRatio: Number(baseline.chinShoulderRatio.toFixed(6)),
        mouthShoulderRatio: Number(baseline.mouthShoulderRatio.toFixed(6)),
        shoulderWidthRatio: Number(baseline.shoulderWidthRatio.toFixed(6)),
        shoulderTiltDeg: Number(baseline.shoulderTiltDeg.toFixed(6)),
        headRollDeg: Number(baseline.headRollDeg.toFixed(6)),
      },
      updatedAt,
      version: 2,
    }

    window.localStorage.setItem(postureCalibrationStorageKey, JSON.stringify(payload))
  } catch {
    // Ignore persistence failures in restricted browser environments.
  }
}

export function getLocalDateKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function createDefaultBlinkDailyCount(): PersistedBlinkDailyCountPayload {
  return {
    count: 0,
    date: getLocalDateKey(),
    version: 1,
  }
}

export function readPersistedBlinkDailyCount(): PersistedBlinkDailyCountPayload {
  const fallback = createDefaultBlinkDailyCount()

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const storedValue = window.localStorage.getItem(blinkDailyCountStorageKey)

    if (!storedValue) {
      return fallback
    }

    const parsedValue = JSON.parse(storedValue) as PersistedBlinkDailyCountPayload

    if (
      parsedValue.version !== 1 ||
      typeof parsedValue.date !== 'string' ||
      !isFiniteNumber(parsedValue.count) ||
      parsedValue.date !== fallback.date
    ) {
      return fallback
    }

    return {
      count: Math.max(0, Math.floor(parsedValue.count)),
      date: parsedValue.date,
      version: 1,
    }
  } catch {
    return fallback
  }
}

export function persistBlinkDailyCount(date: string, count: number) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const payload: PersistedBlinkDailyCountPayload = {
      count,
      date,
      version: 1,
    }

    window.localStorage.setItem(blinkDailyCountStorageKey, JSON.stringify(payload))
  } catch {
    // Ignore persistence failures in restricted browser environments.
  }
}
