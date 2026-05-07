import {
  createEmptyWorkspaceCalibrationStore,
  normalizeWorkspaceCalibrationStore,
  type WorkspaceCalibrationStore,
} from './workspaceCalibration'
import {
  createDefaultWorkspaceLayoutConfig,
  normalizeWorkspaceLayoutConfig,
  type WorkspaceLayoutConfig,
} from './workspaceConfig'

export interface WorkspaceLayoutProfile {
  calibrations: WorkspaceCalibrationStore
  createdAt: number
  id: string
  layout: WorkspaceLayoutConfig
  name: string
  source?: 'preset' | 'user'
  updatedAt: number
}

export interface WorkspaceLayoutProfileStore {
  activeProfileId: string | null
  nextProfileNumber: number
  profiles: WorkspaceLayoutProfile[]
  version: 1
}

export interface WorkspaceLayoutProfileExportFile {
  app: 'health-office'
  exportedAt: number
  kind: 'workspace-layout-profile'
  profile: {
    calibrations: WorkspaceCalibrationStore
    layout: WorkspaceLayoutConfig
    name: string
  }
  version: 1
}

export const workspaceLayoutProfileStorageKey = 'health-office-layout-profiles-v1'

function createId() {
  return `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createAutoName(index: number) {
  return `布局 ${index}`
}

function normalizeProfileName(name: string, fallbackIndex: number) {
  const trimmedName = name.trim()
  const autoNameMatch = trimmedName.match(/^布局\s+(\d+)(?:\s*·.*)?$/)

  if (autoNameMatch) {
    return createAutoName(Number(autoNameMatch[1]))
  }

  return trimmedName || createAutoName(fallbackIndex)
}

function normalizeProfile(
  raw: Partial<WorkspaceLayoutProfile> | null | undefined,
): WorkspaceLayoutProfile | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const layout = normalizeWorkspaceLayoutConfig(raw.layout)
  const calibrations = normalizeWorkspaceCalibrationStore(raw.calibrations, layout)
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt

  return {
    calibrations,
    createdAt,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createId(),
    layout,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? normalizeProfileName(raw.name, 1)
        : createAutoName(1),
    source: 'user',
    updatedAt,
  }
}

function createProfileRecord(
  index: number,
  layout: WorkspaceLayoutConfig,
  calibrations: WorkspaceCalibrationStore,
  now = Date.now(),
): WorkspaceLayoutProfile {
  return {
    calibrations,
    createdAt: now,
    id: createId(),
    layout,
    name: createAutoName(index),
    source: 'user',
    updatedAt: now,
  }
}

function hasLayoutShape(value: unknown): value is Partial<WorkspaceLayoutConfig> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'screens' in value &&
      Array.isArray((value as Partial<WorkspaceLayoutConfig>).screens),
  )
}

function getImportCandidate(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw as {
    calibrations?: unknown
    kind?: unknown
    layout?: unknown
    profile?: {
      calibrations?: unknown
      layout?: unknown
      name?: unknown
    }
    version?: unknown
  }

  if (
    record.kind === 'workspace-layout-profile' &&
    record.version === 1 &&
    hasLayoutShape(record.profile?.layout)
  ) {
    return {
      calibrations: record.profile?.calibrations,
      layout: record.profile.layout,
    }
  }

  if (hasLayoutShape(record.layout)) {
    return {
      calibrations: record.calibrations,
      layout: record.layout,
    }
  }

  return null
}

function createImportedWorkspaceLayoutProfile(
  raw: unknown,
  options: {
    id?: string
    name?: string
    source?: WorkspaceLayoutProfile['source']
    timestamp?: number
  } = {},
): WorkspaceLayoutProfile | null {
  const candidate = getImportCandidate(raw)

  if (!candidate) {
    return null
  }

  const normalizedLayout = normalizeWorkspaceLayoutConfig(candidate.layout)
  const normalizedCalibrations = normalizeWorkspaceCalibrationStore(
    candidate.calibrations as Partial<WorkspaceCalibrationStore> | null | undefined,
    normalizedLayout,
  )
  const timestamp =
    typeof options.timestamp === 'number' && Number.isFinite(options.timestamp)
      ? options.timestamp
      : Date.now()

  return {
    calibrations: normalizedCalibrations,
    createdAt: timestamp,
    id: options.id && options.id.trim() ? options.id.trim() : createId(),
    layout: normalizedLayout,
    name: normalizeProfileName(options.name ?? '', 1),
    source: options.source ?? 'user',
    updatedAt: timestamp,
  } satisfies WorkspaceLayoutProfile
}

export function createEmptyWorkspaceLayoutProfileStore(): WorkspaceLayoutProfileStore {
  return {
    activeProfileId: null,
    nextProfileNumber: 1,
    profiles: [],
    version: 1,
  }
}

export function normalizeWorkspaceLayoutProfileStore(
  raw: Partial<WorkspaceLayoutProfileStore> | null | undefined,
): WorkspaceLayoutProfileStore {
  const fallback = createEmptyWorkspaceLayoutProfileStore()

  if (!raw || raw.version !== 1 || !Array.isArray(raw.profiles)) {
    return fallback
  }

  const profiles = raw.profiles
    .map((profile) => normalizeProfile(profile))
    .filter((profile): profile is WorkspaceLayoutProfile => profile !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)

  const knownIds = new Set(profiles.map((profile) => profile.id))
  const activeProfileId =
    typeof raw.activeProfileId === 'string' && knownIds.has(raw.activeProfileId)
      ? raw.activeProfileId
      : null

  return {
    activeProfileId,
    nextProfileNumber:
      typeof raw.nextProfileNumber === 'number' && Number.isFinite(raw.nextProfileNumber)
        ? Math.max(1, Math.round(raw.nextProfileNumber))
        : profiles.length + 1,
    profiles,
    version: 1,
  }
}

export function getActiveWorkspaceLayoutProfile(store: WorkspaceLayoutProfileStore) {
  if (!store.activeProfileId) {
    return null
  }

  return store.profiles.find((profile) => profile.id === store.activeProfileId) ?? null
}

export function createWorkspaceLayoutProfile(
  store: WorkspaceLayoutProfileStore,
  layout: WorkspaceLayoutConfig,
  calibrations: WorkspaceCalibrationStore,
) {
  const normalizedStore = normalizeWorkspaceLayoutProfileStore(store)
  const normalizedLayout = normalizeWorkspaceLayoutConfig(layout)
  const normalizedCalibrations = normalizeWorkspaceCalibrationStore(calibrations, normalizedLayout)
  const nextProfile = createProfileRecord(
    normalizedStore.nextProfileNumber,
    normalizedLayout,
    normalizedCalibrations,
  )

  return {
    activeProfileId: nextProfile.id,
    nextProfileNumber: normalizedStore.nextProfileNumber + 1,
    profiles: [nextProfile, ...normalizedStore.profiles],
    version: 1,
  } satisfies WorkspaceLayoutProfileStore
}

export function createWorkspaceLayoutProfileExportFile(
  name: string,
  layout: WorkspaceLayoutConfig,
  calibrations: WorkspaceCalibrationStore,
): WorkspaceLayoutProfileExportFile {
  const normalizedLayout = normalizeWorkspaceLayoutConfig(layout)

  return {
    app: 'health-office',
    exportedAt: Date.now(),
    kind: 'workspace-layout-profile',
    profile: {
      calibrations: normalizeWorkspaceCalibrationStore(calibrations, normalizedLayout),
      layout: normalizedLayout,
      name: normalizeProfileName(name, 1),
    },
    version: 1,
  }
}

export function importWorkspaceLayoutProfile(
  store: WorkspaceLayoutProfileStore,
  raw: unknown,
) {
  const candidate = getImportCandidate(raw)

  if (!candidate) {
    return null
  }

  const normalizedStore = normalizeWorkspaceLayoutProfileStore(store)
  const nextProfile = createImportedWorkspaceLayoutProfile(candidate, {
    name: createAutoName(normalizedStore.nextProfileNumber),
    source: 'user',
  })

  if (!nextProfile) {
    return null
  }

  return {
    profile: nextProfile,
    store: {
      activeProfileId: nextProfile.id,
      nextProfileNumber: normalizedStore.nextProfileNumber + 1,
      profiles: [nextProfile, ...normalizedStore.profiles],
      version: 1,
    } satisfies WorkspaceLayoutProfileStore,
  }
}

export function createPresetWorkspaceLayoutProfile(
  raw: unknown,
  options: {
    id: string
    name: string
    updatedAt?: number
  },
) {
  return createImportedWorkspaceLayoutProfile(raw, {
    id: options.id,
    name: options.name,
    source: 'preset',
    timestamp: options.updatedAt,
  })
}

export function getWorkspaceLayoutProfileFilename(name: string) {
  const safeName = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 40)

  return `健康办公-${safeName || '布局'}-${new Date().toISOString().slice(0, 10)}.json`
}

export function updateWorkspaceLayoutProfile(
  store: WorkspaceLayoutProfileStore,
  profileId: string,
  layout: WorkspaceLayoutConfig,
  calibrations: WorkspaceCalibrationStore,
) {
  const normalizedStore = normalizeWorkspaceLayoutProfileStore(store)

  if (!normalizedStore.profiles.some((profile) => profile.id === profileId)) {
    return normalizedStore
  }

  const normalizedLayout = normalizeWorkspaceLayoutConfig(layout)
  const normalizedCalibrations = normalizeWorkspaceCalibrationStore(calibrations, normalizedLayout)
  const now = Date.now()

  return {
    ...normalizedStore,
    activeProfileId: profileId,
    profiles: normalizedStore.profiles
      .map((profile) =>
        profile.id === profileId
          ? {
              ...profile,
              calibrations: normalizedCalibrations,
              layout: normalizedLayout,
              updatedAt: now,
            }
          : profile,
      )
      .sort((left, right) => right.updatedAt - left.updatedAt),
  } satisfies WorkspaceLayoutProfileStore
}

export function activateWorkspaceLayoutProfile(
  store: WorkspaceLayoutProfileStore,
  profileId: string,
) {
  const normalizedStore = normalizeWorkspaceLayoutProfileStore(store)

  if (!normalizedStore.profiles.some((profile) => profile.id === profileId)) {
    return normalizedStore
  }

  return {
    ...normalizedStore,
    activeProfileId: profileId,
  } satisfies WorkspaceLayoutProfileStore
}

export function deleteWorkspaceLayoutProfile(
  store: WorkspaceLayoutProfileStore,
  profileId: string,
) {
  const normalizedStore = normalizeWorkspaceLayoutProfileStore(store)
  const profiles = normalizedStore.profiles.filter((profile) => profile.id !== profileId)

  return {
    ...normalizedStore,
    activeProfileId:
      normalizedStore.activeProfileId === profileId ? null : normalizedStore.activeProfileId,
    profiles,
  } satisfies WorkspaceLayoutProfileStore
}

export function countWorkspaceProfileReadyScreens(profile: WorkspaceLayoutProfile) {
  return profile.layout.screens.reduce((count, screen) => {
    const calibration = profile.calibrations.screens[screen.id]

    if (calibration?.distance && calibration?.posture) {
      return count + 1
    }

    return count
  }, 0)
}

export function formatWorkspaceLayoutProfileSummary(profile: WorkspaceLayoutProfile) {
  const readyCount = countWorkspaceProfileReadyScreens(profile)

  return `${profile.layout.screens.length}屏 · ${readyCount}/${profile.layout.screens.length} 已校准`
}

export function isWorkspaceLayoutProfileDirty(
  profile: WorkspaceLayoutProfile | null,
  layout: WorkspaceLayoutConfig,
  calibrations: WorkspaceCalibrationStore,
) {
  if (!profile) {
    return true
  }

  const normalizedLayout = normalizeWorkspaceLayoutConfig(layout)
  const normalizedCalibrations = normalizeWorkspaceCalibrationStore(calibrations, normalizedLayout)

  return (
    JSON.stringify(profile.layout) !== JSON.stringify(normalizedLayout) ||
    JSON.stringify(profile.calibrations) !== JSON.stringify(normalizedCalibrations)
  )
}

export function createWorkspaceLayoutProfileSnapshot(
  layout: WorkspaceLayoutConfig,
  calibrations: WorkspaceCalibrationStore,
) {
  const normalizedLayout = normalizeWorkspaceLayoutConfig(layout)

  return {
    calibrations: normalizeWorkspaceCalibrationStore(calibrations, normalizedLayout),
    layout: normalizedLayout,
  }
}

export const emptyWorkspaceLayoutProfileSnapshot = {
  calibrations: createEmptyWorkspaceCalibrationStore(),
  layout: createDefaultWorkspaceLayoutConfig(),
}
