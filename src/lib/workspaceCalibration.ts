import type { WorkspaceLayoutConfig, WorkspaceScreenConfig } from './workspaceConfig'

export interface WorkspaceDistanceBaseline {
  eyeSpanRatio: number
  faceRatio: number
  irisRatio: number | null
  signalRatio: number
  updatedAt: number
}

export interface WorkspaceAlignmentBaseline {
  horizontalOffset: number
  pitchDeg: number
  rollDeg: number
  verticalOffset: number
  yawDeg: number
}

export interface WorkspacePostureBaseline {
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
  updatedAt: number
}

export interface WorkspaceScreenCalibrationProfile {
  alignment: WorkspaceAlignmentBaseline | null
  distance: WorkspaceDistanceBaseline | null
  posture: WorkspacePostureBaseline | null
  updatedAt: number | null
}

export interface WorkspaceCalibrationStore {
  screens: Record<string, WorkspaceScreenCalibrationProfile>
  version: 1
}

export interface WorkspaceAlignmentInput {
  horizontal: 'left' | 'center' | 'right'
  horizontalOffset: number
  pitchDeg: number | null
  pitchProxy: number
  quality: number
  rollDeg: number
  status: 'in-range' | 'edge' | 'out-of-range' | 'undetected'
  vertical: 'up' | 'level' | 'down'
  verticalOffset: number
  yawDeg: number | null
  yawProxy: number
}

export interface WorkspaceScreenMatch {
  confidence: number
  reason: 'calibrated' | 'layout' | 'mixed' | 'switching' | 'unmatched' | 'unavailable'
  screen: WorkspaceScreenConfig | null
  score: number | null
  status: 'matched' | 'switching' | 'unmatched' | 'unavailable'
  target: WorkspaceAlignmentBaseline | null
}

const defaultProfile: WorkspaceScreenCalibrationProfile = {
  alignment: null,
  distance: null,
  posture: null,
  updatedAt: null,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeDistance(
  raw: Partial<WorkspaceDistanceBaseline> | null | undefined,
): WorkspaceDistanceBaseline | null {
  if (
    !raw ||
    !isFiniteNumber(raw.eyeSpanRatio) ||
    !isFiniteNumber(raw.faceRatio) ||
    !isFiniteNumber(raw.signalRatio) ||
    !(raw.irisRatio === null || raw.irisRatio === undefined || isFiniteNumber(raw.irisRatio)) ||
    !isFiniteNumber(raw.updatedAt)
  ) {
    return null
  }

  return {
    eyeSpanRatio: raw.eyeSpanRatio,
    faceRatio: raw.faceRatio,
    irisRatio: raw.irisRatio ?? null,
    signalRatio: raw.signalRatio,
    updatedAt: raw.updatedAt,
  }
}

function normalizeAlignment(
  raw: Partial<WorkspaceAlignmentBaseline> | null | undefined,
): WorkspaceAlignmentBaseline | null {
  if (
    !raw ||
    !isFiniteNumber(raw.horizontalOffset) ||
    !isFiniteNumber(raw.verticalOffset) ||
    !isFiniteNumber(raw.yawDeg) ||
    !isFiniteNumber(raw.pitchDeg) ||
    !isFiniteNumber(raw.rollDeg)
  ) {
    return null
  }

  return {
    horizontalOffset: raw.horizontalOffset,
    pitchDeg: raw.pitchDeg,
    rollDeg: raw.rollDeg,
    verticalOffset: raw.verticalOffset,
    yawDeg: raw.yawDeg,
  }
}

function normalizePosture(
  raw: Partial<WorkspacePostureBaseline> | null | undefined,
): WorkspacePostureBaseline | null {
  if (
    !raw ||
    !isFiniteNumber(raw.chinShoulderRatio) ||
    !isFiniteNumber(raw.eyeShoulderRatio) ||
    !isFiniteNumber(raw.eyeSpanRatio) ||
    !isFiniteNumber(raw.faceRatio) ||
    !isFiniteNumber(raw.faceToShoulderRatio) ||
    !isFiniteNumber(raw.headRollDeg) ||
    !isFiniteNumber(raw.mouthShoulderRatio) ||
    !isFiniteNumber(raw.noseShoulderRatio) ||
    !isFiniteNumber(raw.shoulderTiltDeg) ||
    !isFiniteNumber(raw.shoulderWidthRatio) ||
    !isFiniteNumber(raw.updatedAt)
  ) {
    return null
  }

  return {
    chinShoulderRatio: raw.chinShoulderRatio,
    eyeShoulderRatio: raw.eyeShoulderRatio,
    eyeSpanRatio: raw.eyeSpanRatio,
    faceRatio: raw.faceRatio,
    faceToShoulderRatio: raw.faceToShoulderRatio,
    headRollDeg: raw.headRollDeg,
    mouthShoulderRatio: raw.mouthShoulderRatio,
    noseShoulderRatio: raw.noseShoulderRatio,
    shoulderTiltDeg: raw.shoulderTiltDeg,
    shoulderWidthRatio: raw.shoulderWidthRatio,
    updatedAt: raw.updatedAt,
  }
}

function normalizeProfile(
  raw: Partial<WorkspaceScreenCalibrationProfile> | null | undefined,
): WorkspaceScreenCalibrationProfile {
  const alignment = normalizeAlignment(raw?.alignment)
  const distance = normalizeDistance(raw?.distance)
  const posture = normalizePosture(raw?.posture)
  const updatedAtCandidates = [
    distance?.updatedAt ?? 0,
    posture?.updatedAt ?? 0,
    isFiniteNumber(raw?.updatedAt) ? Number(raw?.updatedAt) : 0,
  ]
  const updatedAt =
    alignment || distance || posture ? Math.max(...updatedAtCandidates) || null : null

  return {
    alignment,
    distance,
    posture,
    updatedAt,
  }
}

export function createEmptyWorkspaceCalibrationStore(): WorkspaceCalibrationStore {
  return {
    screens: {},
    version: 1,
  }
}

export function normalizeWorkspaceCalibrationStore(
  raw: Partial<WorkspaceCalibrationStore> | null | undefined,
  layout?: WorkspaceLayoutConfig | null,
): WorkspaceCalibrationStore {
  const fallback = createEmptyWorkspaceCalibrationStore()

  if (!raw || raw.version !== 1 || !raw.screens || typeof raw.screens !== 'object') {
    return fallback
  }

  const screens = Object.fromEntries(
    Object.entries(raw.screens).map(([screenId, profile]) => [screenId, normalizeProfile(profile)]),
  )

  if (!layout) {
    return {
      screens,
      version: 1,
    }
  }

  const allowedIds = new Set(layout.screens.map((screen) => screen.id))
  const filteredScreens = Object.fromEntries(
    Object.entries(screens).filter(([screenId]) => allowedIds.has(screenId)),
  )

  return {
    screens: filteredScreens,
    version: 1,
  }
}

export function upsertWorkspaceScreenCalibration(
  store: WorkspaceCalibrationStore,
  screenId: string,
  patch: Partial<WorkspaceScreenCalibrationProfile>,
): WorkspaceCalibrationStore {
  return {
    version: 1,
    screens: {
      ...store.screens,
      [screenId]: normalizeProfile({
        ...defaultProfile,
        ...store.screens[screenId],
        ...patch,
        updatedAt: patch.updatedAt ?? Date.now(),
      }),
    },
  }
}

export function resetWorkspaceScreenCalibration(
  store: WorkspaceCalibrationStore,
  screenId: string,
): WorkspaceCalibrationStore {
  const remainingScreens = { ...store.screens }
  delete remainingScreens[screenId]

  return {
    screens: remainingScreens,
    version: 1,
  }
}

export function resetAllWorkspaceCalibrations(): WorkspaceCalibrationStore {
  return createEmptyWorkspaceCalibrationStore()
}

export function pruneWorkspaceCalibrationStore(
  store: WorkspaceCalibrationStore,
  layout: WorkspaceLayoutConfig,
): WorkspaceCalibrationStore {
  return normalizeWorkspaceCalibrationStore(store, layout)
}

function getCameraScreen(layout: WorkspaceLayoutConfig) {
  return layout.screens.find((screen) => screen.kind === 'camera') ?? layout.screens[0] ?? null
}

export function createLayoutDerivedAlignmentBaseline(
  layout: WorkspaceLayoutConfig,
  screenId: string,
): WorkspaceAlignmentBaseline | null {
  const cameraScreen = getCameraScreen(layout)
  const targetScreen = layout.screens.find((screen) => screen.id === screenId)

  if (!cameraScreen || !targetScreen) {
    return null
  }

  const cameraCenterX = cameraScreen.x + cameraScreen.width / 2
  const cameraCenterY = cameraScreen.y + cameraScreen.height / 2
  const targetCenterX = targetScreen.x + targetScreen.width / 2
  const targetCenterY = targetScreen.y + targetScreen.height / 2
  const depthDelta = targetScreen.depth - cameraScreen.depth
  const effectiveDepth = clamp(cameraScreen.width * 1.75 + depthDelta * 0.7, 240, 760)
  const positionYawDeg = clamp(
    (Math.atan2(targetCenterX - cameraCenterX, effectiveDepth) * 180) / Math.PI,
    -42,
    42,
  )
  const positionPitchDeg = clamp(
    (Math.atan2(targetCenterY - cameraCenterY, effectiveDepth * 0.82) * 180) / Math.PI,
    -26,
    26,
  )
  const orientationYawDeg = clamp(targetScreen.yawDeg - cameraScreen.yawDeg, -45, 45)
  const orientationPitchDeg = clamp(targetScreen.pitchDeg - cameraScreen.pitchDeg, -28, 28)
  const targetYawDeg = clamp(positionYawDeg * 0.66 + orientationYawDeg * 0.34, -42, 42)
  const targetPitchDeg = clamp(positionPitchDeg * 0.7 + orientationPitchDeg * 0.3, -26, 26)
  const horizontalOffset = clamp(
    targetYawDeg / 38,
    -1,
    1,
  )
  const verticalOffset = clamp(
    targetPitchDeg / 26,
    -1,
    1,
  )

  return {
    horizontalOffset,
    pitchDeg: targetPitchDeg,
    rollDeg: 0,
    verticalOffset,
    yawDeg: targetYawDeg,
  }
}

function getSignedYawDeg(alignment: WorkspaceAlignmentInput) {
  if (alignment.yawDeg !== null) {
    return alignment.yawDeg
  }

  const sign = alignment.horizontal === 'left' ? -1 : alignment.horizontal === 'right' ? 1 : 0
  return sign * alignment.yawProxy * 38
}

function getSignedPitchDeg(alignment: WorkspaceAlignmentInput) {
  if (alignment.pitchDeg !== null) {
    return alignment.pitchDeg
  }

  const sign = alignment.vertical === 'up' ? -1 : alignment.vertical === 'down' ? 1 : 0
  return sign * alignment.pitchProxy * 26
}

export function getWorkspaceScreenTarget(
  layout: WorkspaceLayoutConfig,
  calibrations: WorkspaceCalibrationStore,
  screenId: string,
): { mode: 'calibrated' | 'layout'; target: WorkspaceAlignmentBaseline | null } {
  const calibration = calibrations.screens[screenId]

  if (calibration?.alignment) {
    return {
      mode: 'calibrated',
      target: calibration.alignment,
    }
  }

  return {
    mode: 'layout',
    target: createLayoutDerivedAlignmentBaseline(layout, screenId),
  }
}

export function inferActiveWorkspaceScreen(
  layout: WorkspaceLayoutConfig,
  calibrations: WorkspaceCalibrationStore,
  alignment: WorkspaceAlignmentInput,
): WorkspaceScreenMatch {
  if (alignment.status === 'undetected' || alignment.status === 'out-of-range') {
    return {
      confidence: 0,
      reason: 'unavailable',
      score: null,
      screen: null,
      status: 'unavailable',
      target: null,
    }
  }

  const scores = layout.screens
    .map((screen) => {
      const { mode, target } = getWorkspaceScreenTarget(layout, calibrations, screen.id)

      if (!target) {
        return null
      }

      const horizontalDelta = Math.abs(alignment.horizontalOffset - target.horizontalOffset)
      const verticalDelta = Math.abs(alignment.verticalOffset - target.verticalOffset)
      const yawDelta = Math.abs(getSignedYawDeg(alignment) - target.yawDeg)
      const pitchDelta = Math.abs(getSignedPitchDeg(alignment) - target.pitchDeg)
      const score =
        horizontalDelta * 0.46 +
        verticalDelta * 0.24 +
        clamp(yawDelta / 42, 0, 1.6) * 0.22 +
        clamp(pitchDelta / 28, 0, 1.4) * 0.08 +
        (mode === 'layout' ? 0.05 : 0)

      return {
        mode,
        score,
        screen,
        target,
      }
    })
    .filter(
      (
        candidate,
      ): candidate is {
        mode: 'calibrated' | 'layout'
        score: number
        screen: WorkspaceScreenConfig
        target: WorkspaceAlignmentBaseline
      } => candidate !== null,
    )
    .sort((left, right) => left.score - right.score)

  if (scores.length === 0) {
    return {
      confidence: 0,
      reason: 'unmatched',
      score: null,
      screen: null,
      status: 'unmatched',
      target: null,
    }
  }

  const [best, second] = scores
  const scoreGap = second ? second.score - best.score : 1
  const bestConfidence = clamp(
    alignment.quality * 0.52 +
      clamp(1 - best.score / 0.8, 0, 1) * 0.38 +
      clamp(scoreGap / 0.18, 0, 1) * 0.1,
    0,
    1,
  )

  if (best.score > 0.86) {
    return {
      confidence: bestConfidence * 0.4,
      reason: 'unmatched',
      score: best.score,
      screen: null,
      status: 'unmatched',
      target: null,
    }
  }

  if (second && scoreGap < 0.08) {
    return {
      confidence: bestConfidence * 0.75,
      reason: 'switching',
      score: best.score,
      screen: best.screen,
      status: 'switching',
      target: best.target,
    }
  }

  return {
    confidence: bestConfidence,
    reason:
      best.mode === 'calibrated'
        ? second?.mode === 'layout'
          ? 'mixed'
          : 'calibrated'
        : 'layout',
    score: best.score,
    screen: best.screen,
    status: 'matched',
    target: best.target,
  }
}

export function formatWorkspaceScreenMatchLabel(match: WorkspaceScreenMatch) {
  if (match.status === 'unavailable') {
    return '未进入可靠范围'
  }

  if (match.status === 'unmatched' || !match.screen) {
    return '未识别到工作屏'
  }

  if (match.status === 'switching') {
    return `正在切换 · ${match.screen.name}`
  }

  return `${match.screen.name} · ${Math.round(match.confidence * 100)}%`
}
