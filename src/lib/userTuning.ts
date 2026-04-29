import {
  clampNumber,
  normalizeDistancePreset,
  roundToTenth,
} from './distance'

export type UserTuning = {
  blinkLowRateThreshold: number
  eyeFocusMinutes: number
  distanceTooClosePercent: number
  distanceNormalPercent: number
  distanceTooFarPercent: number
  postureForwardHeadReminderEnabled: boolean
  postureHeadDownReminderEnabled: boolean
  postureHeadTiltReminderEnabled: boolean
  postureShoulderTiltReminderEnabled: boolean
  sampledDistanceTooClosePercent: number | null
  sampledDistanceNormalPercent: number | null
  sampledDistanceTooFarPercent: number | null
}

export type StoredUserTuning = Partial<UserTuning>

export const recommendedDistancePreset = {
  distanceTooClosePercent: 18,
  distanceNormalPercent: 14,
  distanceTooFarPercent: 9.5,
} as const

export const recommendedTuning: UserTuning = {
  blinkLowRateThreshold: 8,
  eyeFocusMinutes: 20,
  ...recommendedDistancePreset,
  postureForwardHeadReminderEnabled: true,
  postureHeadDownReminderEnabled: true,
  postureHeadTiltReminderEnabled: true,
  postureShoulderTiltReminderEnabled: true,
  sampledDistanceTooClosePercent: null,
  sampledDistanceNormalPercent: null,
  sampledDistanceTooFarPercent: null,
}

const liveProfileBase = {
  eyePresenceAcquireMs: 2500,
  blinkLowRateHoldMs: 25 * 1000,
  distanceHoldMs: 90 * 1000,
  postureHoldMs: 75 * 1000,
  reminderCooldownMs: 6 * 60 * 1000,
  globalQuietMs: 75 * 1000,
}

const demoProfileBase = {
  eyePresenceAcquireMs: 1000,
  blinkLowRateHoldMs: 8 * 1000,
  distanceHoldMs: 8 * 1000,
  postureHoldMs: 8 * 1000,
  reminderCooldownMs: 16 * 1000,
  globalQuietMs: 8 * 1000,
}

export function normalizeTuning(raw: StoredUserTuning): UserTuning {
  const normalizedDistancePreset = normalizeDistancePreset(
    raw.distanceTooClosePercent ?? recommendedDistancePreset.distanceTooClosePercent,
    raw.distanceNormalPercent ?? recommendedDistancePreset.distanceNormalPercent,
    raw.distanceTooFarPercent ?? recommendedDistancePreset.distanceTooFarPercent,
  )

  return {
    blinkLowRateThreshold: roundToTenth(
      clampNumber(raw.blinkLowRateThreshold ?? recommendedTuning.blinkLowRateThreshold, 4, 16),
    ),
    eyeFocusMinutes: roundToTenth(
      clampNumber(raw.eyeFocusMinutes ?? recommendedTuning.eyeFocusMinutes, 10, 40),
    ),
    postureForwardHeadReminderEnabled:
      raw.postureForwardHeadReminderEnabled ??
      recommendedTuning.postureForwardHeadReminderEnabled,
    postureHeadDownReminderEnabled:
      raw.postureHeadDownReminderEnabled ??
      recommendedTuning.postureHeadDownReminderEnabled,
    postureHeadTiltReminderEnabled:
      raw.postureHeadTiltReminderEnabled ??
      recommendedTuning.postureHeadTiltReminderEnabled,
    postureShoulderTiltReminderEnabled:
      raw.postureShoulderTiltReminderEnabled ??
      recommendedTuning.postureShoulderTiltReminderEnabled,
    ...normalizedDistancePreset,
    sampledDistanceTooClosePercent:
      raw.sampledDistanceTooClosePercent === null || raw.sampledDistanceTooClosePercent === undefined
        ? null
        : roundToTenth(raw.sampledDistanceTooClosePercent),
    sampledDistanceNormalPercent:
      raw.sampledDistanceNormalPercent === null || raw.sampledDistanceNormalPercent === undefined
        ? null
        : roundToTenth(raw.sampledDistanceNormalPercent),
    sampledDistanceTooFarPercent:
      raw.sampledDistanceTooFarPercent === null || raw.sampledDistanceTooFarPercent === undefined
        ? null
        : roundToTenth(raw.sampledDistanceTooFarPercent),
  }
}

export function formatDistancePresetLabel(values: {
  distanceTooClosePercent: number
  distanceNormalPercent: number
  distanceTooFarPercent: number
}) {
  return `过近 ${values.distanceTooClosePercent.toFixed(1)}% · 正常 ${values.distanceNormalPercent.toFixed(1)}% · 过远 ${values.distanceTooFarPercent.toFixed(1)}%`
}

export function formatSignedPercentDelta(value: number | null) {
  if (value === null) {
    return '--'
  }

  const percent = value * 100
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent.toFixed(1)}%`
}

export function createProfile(tuning: UserTuning, demoMode: boolean) {
  const hasDistanceCalibration =
    tuning.sampledDistanceNormalPercent !== null &&
    tuning.sampledDistanceTooClosePercent !== null &&
    tuning.sampledDistanceTooFarPercent !== null

  if (demoMode) {
    return {
      ...demoProfileBase,
      blinkLowRateThreshold: tuning.blinkLowRateThreshold,
      distanceThresholds: hasDistanceCalibration
        ? {
            closeRatio: tuning.distanceTooClosePercent / 100,
            normalRatio: tuning.distanceNormalPercent / 100,
            farRatio: tuning.distanceTooFarPercent / 100,
          }
        : undefined,
      eyeFocusMs: Math.max(8, tuning.eyeFocusMinutes) * 1000,
    }
  }

  return {
    ...liveProfileBase,
    blinkLowRateThreshold: tuning.blinkLowRateThreshold,
    distanceThresholds: hasDistanceCalibration
      ? {
          closeRatio: tuning.distanceTooClosePercent / 100,
          normalRatio: tuning.distanceNormalPercent / 100,
          farRatio: tuning.distanceTooFarPercent / 100,
        }
      : undefined,
    eyeFocusMs: tuning.eyeFocusMinutes * 60 * 1000,
  }
}
