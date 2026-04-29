export const DISTANCE_NORMAL_MIN_PERCENT = 8
export const DISTANCE_NORMAL_MAX_PERCENT = 32
export const DISTANCE_TOO_CLOSE_MAX_PERCENT = 38
export const DISTANCE_TOO_FAR_MIN_PERCENT = 5
export const DISTANCE_THRESHOLD_GAP_PERCENT = 0.8

export type DistancePreset = {
  distanceTooClosePercent: number
  distanceNormalPercent: number
  distanceTooFarPercent: number
}

export function roundToTenth(value: number) {
  return Math.round(value * 10) / 10
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function normalizeDistancePreset(
  tooClosePercent: number,
  normalPercent: number,
  tooFarPercent: number,
): DistancePreset {
  const nextNormalPercent = roundToTenth(
    clampNumber(normalPercent, DISTANCE_NORMAL_MIN_PERCENT, DISTANCE_NORMAL_MAX_PERCENT),
  )
  const nextTooClosePercent = roundToTenth(
    clampNumber(
      tooClosePercent,
      nextNormalPercent + DISTANCE_THRESHOLD_GAP_PERCENT,
      DISTANCE_TOO_CLOSE_MAX_PERCENT,
    ),
  )
  const nextTooFarPercent = roundToTenth(
    clampNumber(
      tooFarPercent,
      DISTANCE_TOO_FAR_MIN_PERCENT,
      nextNormalPercent - DISTANCE_THRESHOLD_GAP_PERCENT,
    ),
  )

  return {
    distanceTooClosePercent: nextTooClosePercent,
    distanceNormalPercent: nextNormalPercent,
    distanceTooFarPercent: nextTooFarPercent,
  }
}

export function deriveDistancePresetFromBaseline(normalRatio: number) {
  return normalizeDistancePreset(
    Math.max(0.18, normalRatio * 1.09) * 100,
    normalRatio * 100,
    Math.max(0.105, normalRatio * 0.9) * 100,
  )
}

export function getDistancePresetOffsets(preset: DistancePreset) {
  return {
    closeDeltaPercent: roundToTenth(
      preset.distanceTooClosePercent - preset.distanceNormalPercent,
    ),
    farDeltaPercent: roundToTenth(
      preset.distanceTooFarPercent - preset.distanceNormalPercent,
    ),
  }
}

export function applyDistancePresetOffsets(
  baselinePercent: number,
  offsets: {
    closeDeltaPercent: number
    farDeltaPercent: number
  },
) {
  return normalizeDistancePreset(
    baselinePercent + offsets.closeDeltaPercent,
    baselinePercent,
    baselinePercent + offsets.farDeltaPercent,
  )
}
