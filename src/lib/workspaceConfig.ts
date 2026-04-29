export type WorkspaceScreenKind = 'camera' | 'work'

export interface WorkspaceScreenConfig {
  depth: number
  diagonalInches: number
  height: number
  id: string
  kind: WorkspaceScreenKind
  name: string
  note: string
  pitchDeg: number
  width: number
  x: number
  y: number
  yawDeg: number
}

export interface WorkspaceLayoutConfig {
  screens: WorkspaceScreenConfig[]
  version: 1
}

export const workspaceBoardBounds = {
  height: 760,
  width: 1180,
}

export const workspaceDepthBounds = {
  far: 420,
  near: -420,
}

export const workspaceScreenLimits = {
  maxHeight: 320,
  maxWidth: 520,
  minHeight: 90,
  minWidth: 120,
}

export const workspaceScreenCountLimit = 4

export const workspaceScreenInchLimits = {
  max: 55,
  min: 10,
}

const workspaceDefaultScreenInches = 24
const workspaceScreenAspectRatio = 16 / 9
const workspaceScreenUnitsPerInch = 10.8

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function createId() {
  return `screen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeWorkspaceScreenWidth(value: number) {
  return Math.round(
    clamp(
      Number.isFinite(value) ? value : workspaceScreenLimits.minWidth,
      workspaceScreenLimits.minWidth,
      workspaceScreenLimits.maxWidth,
    ),
  )
}

export function normalizeWorkspaceScreenHeight(value: number) {
  return Math.round(
    clamp(
      Number.isFinite(value) ? value : workspaceScreenLimits.minHeight,
      workspaceScreenLimits.minHeight,
      workspaceScreenLimits.maxHeight,
    ),
  )
}

export function normalizeWorkspaceScreenInches(value: number) {
  return Number(
    clamp(
      Number.isFinite(value) ? value : workspaceDefaultScreenInches,
      workspaceScreenInchLimits.min,
      workspaceScreenInchLimits.max,
    ).toFixed(1),
  )
}

export function getWorkspaceScreenSizeFromInches(diagonalInches: number) {
  const normalizedInches = normalizeWorkspaceScreenInches(diagonalInches)
  const diagonalUnits = normalizedInches * workspaceScreenUnitsPerInch
  const ratioBase = Math.sqrt(workspaceScreenAspectRatio ** 2 + 1)
  const width = normalizeWorkspaceScreenWidth(
    Math.round((diagonalUnits * workspaceScreenAspectRatio) / ratioBase),
  )
  const height = normalizeWorkspaceScreenHeight(Math.round(diagonalUnits / ratioBase))

  return {
    diagonalInches: normalizedInches,
    height,
    width,
  }
}

export function getWorkspaceScreenInchesFromSize(width: number, height: number) {
  return normalizeWorkspaceScreenInches(
    Math.sqrt(width ** 2 + height ** 2) / workspaceScreenUnitsPerInch,
  )
}

export function createWorkspaceScreenSizePatch(diagonalInches: number) {
  return getWorkspaceScreenSizeFromInches(diagonalInches)
}

export function createWorkspaceScreenRectPatch(width: number, height: number) {
  const normalizedWidth = normalizeWorkspaceScreenWidth(width)
  const normalizedHeight = normalizeWorkspaceScreenHeight(height)

  return {
    diagonalInches: getWorkspaceScreenInchesFromSize(normalizedWidth, normalizedHeight),
    height: normalizedHeight,
    width: normalizedWidth,
  }
}

function getScreenDisplayName(kind: WorkspaceScreenKind, workIndex: number) {
  return kind === 'camera' ? '摄像头所在屏' : `工作屏 ${workIndex}`
}

export function normalizeWorkspaceScreens(screens: WorkspaceScreenConfig[]) {
  const nextScreens = screens.slice(0, workspaceScreenCountLimit)

  if (nextScreens.length === 0) {
    return nextScreens
  }

  const firstCameraIndex = nextScreens.findIndex((screen) => screen.kind === 'camera')
  let workIndex = 1

  return nextScreens.map<WorkspaceScreenConfig>((screen, index) => {
    const width = normalizeWorkspaceScreenWidth(screen.width)
    const height = normalizeWorkspaceScreenHeight(screen.height)
    const kind: WorkspaceScreenKind =
      firstCameraIndex === -1
        ? index === 0
          ? 'camera'
          : 'work'
        : index === firstCameraIndex
          ? 'camera'
          : 'work'

    return {
      ...screen,
      diagonalInches: normalizeWorkspaceScreenInches(
        Number.isFinite(screen.diagonalInches)
          ? screen.diagonalInches
          : getWorkspaceScreenInchesFromSize(width, height),
      ),
      height,
      kind,
      name: getScreenDisplayName(kind, kind === 'work' ? workIndex++ : 0),
      pitchDeg: clamp(Number.isFinite(screen.pitchDeg) ? screen.pitchDeg : 0, -28, 28),
      width,
      x: clamp(
        Number.isFinite(screen.x) ? screen.x : 240 + index * 40,
        28,
        workspaceBoardBounds.width - width - 28,
      ),
      y: clamp(
        Number.isFinite(screen.y) ? screen.y : 220 + index * 20,
        28,
        workspaceBoardBounds.height - height - 28,
      ),
      yawDeg: clamp(Number.isFinite(screen.yawDeg) ? screen.yawDeg : 0, -45, 45),
    }
  })
}

export function normalizeWorkspaceScreenPatch(
  screen: WorkspaceScreenConfig,
  patch: Partial<WorkspaceScreenConfig>,
) {
  const width = normalizeWorkspaceScreenWidth(
    typeof patch.width === 'number' && Number.isFinite(patch.width) ? patch.width : screen.width,
  )
  const height = normalizeWorkspaceScreenHeight(
    typeof patch.height === 'number' && Number.isFinite(patch.height)
      ? patch.height
      : screen.height,
  )
  const diagonalInches =
    typeof patch.diagonalInches === 'number' && Number.isFinite(patch.diagonalInches)
      ? normalizeWorkspaceScreenInches(patch.diagonalInches)
    : getWorkspaceScreenInchesFromSize(width, height)

  return {
    ...patch,
    depth: clamp(
      typeof patch.depth === 'number' && Number.isFinite(patch.depth) ? patch.depth : screen.depth,
      workspaceDepthBounds.near,
      workspaceDepthBounds.far,
    ),
    diagonalInches,
    height,
    pitchDeg: clamp(
      typeof patch.pitchDeg === 'number' && Number.isFinite(patch.pitchDeg)
        ? patch.pitchDeg
        : screen.pitchDeg,
      -28,
      28,
    ),
    width,
    x: clamp(
      typeof patch.x === 'number' && Number.isFinite(patch.x) ? patch.x : screen.x,
      28,
      workspaceBoardBounds.width - width - 28,
    ),
    y: clamp(
      typeof patch.y === 'number' && Number.isFinite(patch.y) ? patch.y : screen.y,
      28,
      workspaceBoardBounds.height - height - 28,
    ),
    yawDeg: clamp(
      typeof patch.yawDeg === 'number' && Number.isFinite(patch.yawDeg)
        ? patch.yawDeg
        : screen.yawDeg,
      -45,
      45,
    ),
  } satisfies Partial<WorkspaceScreenConfig>
}

export function createDefaultWorkspaceLayoutConfig(): WorkspaceLayoutConfig {
  const defaultSize = getWorkspaceScreenSizeFromInches(workspaceDefaultScreenInches)

  return {
    screens: normalizeWorkspaceScreens([
      {
        depth: 0,
        diagonalInches: defaultSize.diagonalInches,
        height: defaultSize.height,
        id: 'camera-screen',
        kind: 'camera',
        name: '摄像头所在屏',
        note: '默认识别以这块屏为传感器参考系。',
        pitchDeg: 0,
        width: defaultSize.width,
        x: workspaceBoardBounds.width / 2 - defaultSize.width / 2,
        y: workspaceBoardBounds.height / 2 - defaultSize.height / 2,
        yawDeg: 0,
      },
    ]),
    version: 1,
  }
}

export function normalizeWorkspaceLayoutConfig(
  raw: Partial<WorkspaceLayoutConfig> | null | undefined,
): WorkspaceLayoutConfig {
  const fallback = createDefaultWorkspaceLayoutConfig()

  if (!raw || raw.version !== 1 || !Array.isArray(raw.screens) || raw.screens.length === 0) {
    return fallback
  }

  const screens = raw.screens
    .slice(0, workspaceScreenCountLimit)
    .map((screen, index) => {
      if (!screen || typeof screen !== 'object') {
        return null
      }

      const width = normalizeWorkspaceScreenWidth(Number(screen.width) || 220)
      const height = normalizeWorkspaceScreenHeight(Number(screen.height) || 138)

      return {
        depth: clamp(
          Number.isFinite(screen.depth) ? Number(screen.depth) : 0,
          workspaceDepthBounds.near,
          workspaceDepthBounds.far,
        ),
        diagonalInches: normalizeWorkspaceScreenInches(
          Number.isFinite(screen.diagonalInches)
            ? Number(screen.diagonalInches)
            : getWorkspaceScreenInchesFromSize(width, height),
        ),
        height,
        id: typeof screen.id === 'string' && screen.id.trim() ? screen.id : createId(),
        kind: screen.kind === 'camera' ? 'camera' : 'work',
        name:
          typeof screen.name === 'string' && screen.name.trim()
            ? screen.name.trim()
            : index === 0
              ? '摄像头所在屏'
              : `工作屏 ${index}`,
        note: typeof screen.note === 'string' ? screen.note : '',
        pitchDeg: clamp(Number.isFinite(screen.pitchDeg) ? Number(screen.pitchDeg) : 0, -28, 28),
        width,
        x: clamp(
          Number.isFinite(screen.x) ? Number(screen.x) : 240 + index * 40,
          28,
          workspaceBoardBounds.width - width - 28,
        ),
        y: clamp(
          Number.isFinite(screen.y) ? Number(screen.y) : 220 + index * 20,
          28,
          workspaceBoardBounds.height - height - 28,
        ),
        yawDeg: clamp(Number.isFinite(screen.yawDeg) ? Number(screen.yawDeg) : 0, -45, 45),
      } satisfies WorkspaceScreenConfig
    })
    .filter((screen): screen is WorkspaceScreenConfig => screen !== null)

  if (screens.length === 0) {
    return fallback
  }

  return {
    screens: normalizeWorkspaceScreens(screens),
    version: 1,
  }
}

export function createWorkspaceScreenConfig(
  reference: WorkspaceScreenConfig | null,
  count: number,
): WorkspaceScreenConfig {
  const size = getWorkspaceScreenSizeFromInches(workspaceDefaultScreenInches)
  const nextX = reference ? reference.x + reference.width + 56 : 640
  const nextY = reference ? reference.y : 240

  return {
    depth: reference
      ? clamp(reference.depth + 120, workspaceDepthBounds.near, workspaceDepthBounds.far)
      : 120,
    diagonalInches: size.diagonalInches,
    height: size.height,
    id: createId(),
    kind: 'work',
    name: `工作屏 ${count}`,
    note: '',
    pitchDeg: 0,
    width: size.width,
    x: clamp(nextX, 28, workspaceBoardBounds.width - size.width - 28),
    y: clamp(nextY, 28, workspaceBoardBounds.height - size.height - 28),
    yawDeg: 0,
  }
}

export function setCameraWorkspaceScreen(
  screens: WorkspaceScreenConfig[],
  targetId: string,
): WorkspaceScreenConfig[] {
  return normalizeWorkspaceScreens(
    screens.map((screen) => ({
      ...screen,
      kind: screen.id === targetId ? 'camera' : 'work',
    })),
  )
}
