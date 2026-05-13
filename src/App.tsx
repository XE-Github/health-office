import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import { CameraPanel } from './components/CameraPanel'
import { OfficeHeroPanel } from './components/OfficeHeroPanel'
import { ReminderToast } from './components/ReminderToast'
import { SettingsPanel } from './components/SettingsPanel'
import {
  blinkStateMeta,
  cameraStatusMeta,
  distanceStateMeta,
  postureStateMeta,
} from './content'
import { useAccumulatedTimer } from './hooks/useAccumulatedTimer'
import { useConditionDuration } from './hooks/useConditionDuration'
import { useNow } from './hooks/useNow'
import { usePersistentState } from './hooks/usePersistentState'
import { usePoseMonitor } from './hooks/usePoseMonitor'
import { useReminderScheduler } from './hooks/useReminderScheduler'
import {
  buildReminderCandidate,
} from './lib/reminderDefinitions'
import { formatTimer } from './lib/time'
import {
  createDefaultWorkspaceLayoutConfig,
  normalizeWorkspaceLayoutConfig,
  type WorkspaceLayoutConfig,
} from './lib/workspaceConfig'
import {
  activateWorkspaceLayoutProfile,
  createWorkspaceLayoutProfileExportFile,
  createWorkspaceLayoutProfile,
  createEmptyWorkspaceLayoutProfileStore,
  deleteWorkspaceLayoutProfile,
  getWorkspaceLayoutProfileFilename,
  getActiveWorkspaceLayoutProfile,
  importWorkspaceLayoutProfile,
  isWorkspaceLayoutProfileDirty,
  normalizeWorkspaceLayoutProfileStore,
  updateWorkspaceLayoutProfile,
  workspaceLayoutProfileStorageKey,
  type WorkspaceLayoutProfile,
  type WorkspaceLayoutProfileStore,
} from './lib/workspaceLayoutProfiles'
import { loadPresetWorkspaceLayoutProfiles } from './lib/presetWorkspaceLayoutProfiles'
import {
  createEmptyWorkspaceCalibrationStore,
  formatWorkspaceScreenMatchLabel,
  getWorkspaceScreenTarget,
  inferActiveWorkspaceScreen,
  normalizeWorkspaceCalibrationStore,
  pruneWorkspaceCalibrationStore,
  resetAllWorkspaceCalibrations,
  resetWorkspaceScreenCalibration,
  upsertWorkspaceScreenCalibration,
  type WorkspaceCalibrationStore,
} from './lib/workspaceCalibration'
import {
  applyDistancePresetOffsets,
  deriveDistancePresetFromBaseline,
  getDistancePresetOffsets,
  normalizeDistancePreset,
  roundToTenth,
} from './lib/distance'
import {
  formatCalibrationStatus,
  formatCalibrationTime,
  formatUnifiedCalibrationHint,
} from './lib/calibrationDisplay'
import {
  createProfile,
  formatDistancePresetLabel,
  formatSignedPercentDelta,
  normalizeTuning,
  recommendedTuning,
  type StoredUserTuning,
  type UserTuning,
} from './lib/userTuning'
import type {
  DemoFlags,
  DistanceState,
  PostureState,
  ReminderCandidate,
  ScreenMode,
} from './types'

const WorkspaceConfigPage = lazy(() =>
  import('./components/WorkspaceConfigPage').then((module) => ({
    default: module.WorkspaceConfigPage,
  })),
)

const defaultDemoFlags: DemoFlags = {
  tooClose: false,
  headDown: false,
  forwardHead: false,
  headTilt: false,
  shoulderTilt: false,
  lowBlink: false,
}

type FullscreenCapableDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenElement?: Element | null
}

type FullscreenCapableElement = HTMLDivElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

type HudPosition = {
  x: number
  y: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', 'true')
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  textArea.style.top = '0'
  document.body.append(textArea)
  textArea.select()
  document.execCommand('copy')
  textArea.remove()
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{
      accept: Record<string, string[]>
      description: string
    }>
  }) => Promise<{
    createWritable: () => Promise<{
      close: () => Promise<void> | void
      truncate?: (size: number) => Promise<void> | void
      write: (
        data:
          | Blob
          | BufferSource
          | string
          | {
              data: Blob | BufferSource | string
              position?: number
              type: 'write'
            },
      ) => Promise<void> | void
    }>
    getFile?: () => Promise<File>
  }>
}

function triggerTextFileDownload(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  )

  window.setTimeout(() => {
    anchor.remove()
    window.URL.revokeObjectURL(url)
  }, 60_000)
}

async function saveTextFile(filename: string, content: string, type = 'application/json') {
  const encodedContent = new TextEncoder().encode(content)
  const pickerWindow = window as SaveFilePickerWindow

  if (!content.trim() || encodedContent.byteLength === 0) {
    throw new Error('Export content is empty.')
  }

  if (pickerWindow.showSaveFilePicker) {
    try {
      const fileHandle = await pickerWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            accept: {
              [type]: ['.json'],
            },
            description: 'JSON layout file',
          },
          ],
        })
      const writable = await fileHandle.createWritable()
      await writable.truncate?.(0)
      await writable.write({
        data: encodedContent,
        position: 0,
        type: 'write',
      })
      await writable.truncate?.(encodedContent.byteLength)
      await writable.close()

      if (fileHandle.getFile) {
        const savedFile = await fileHandle.getFile()

        if (savedFile.size === 0) {
          throw new Error('Saved file is empty after native picker write.')
        }
      }

      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      console.error('Failed to use save file picker.', error)
    }
  }

  triggerTextFileDownload(filename, content, type)
}

const defaultHudPosition: HudPosition = {
  x: 24,
  y: 24,
}

function App() {
  const [sessionStarted, setSessionStarted] = useState(false)
  const [demoMode, setDemoMode] = usePersistentState('health-office-demo-mode', false)
  const [screenMode, setScreenMode] = usePersistentState<ScreenMode | null>(
    'health-office-screen-mode-v1',
    null,
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceConfigOpen, setWorkspaceConfigOpen] = useState(false)
  const [demoFlags, setDemoFlags] = useState<DemoFlags>(defaultDemoFlags)
  const [storedTuning, setStoredTuning] = usePersistentState<StoredUserTuning>(
    'health-office-demo-tuning',
    recommendedTuning,
  )
  const [workspaceLayout, setWorkspaceLayout] = usePersistentState<WorkspaceLayoutConfig>(
    'health-office-demo-workspace-layout-v1',
    createDefaultWorkspaceLayoutConfig(),
  )
  const [workspaceCalibrationStore, setWorkspaceCalibrationStore] =
    usePersistentState<WorkspaceCalibrationStore>(
      'health-office-demo-workspace-calibrations-v1',
      createEmptyWorkspaceCalibrationStore(),
    )
  const [workspaceLayoutProfileStore, setWorkspaceLayoutProfileStore] =
    usePersistentState<WorkspaceLayoutProfileStore>(
      workspaceLayoutProfileStorageKey,
      createEmptyWorkspaceLayoutProfileStore(),
    )
  const [presetWorkspaceLayoutProfiles, setPresetWorkspaceLayoutProfiles] = useState<
    WorkspaceLayoutProfile[]
  >([])
  const [activePresetWorkspaceLayoutProfileId, setActivePresetWorkspaceLayoutProfileId] =
    useState<string | null>(null)
  const [workspaceCalibrationTargetId, setWorkspaceCalibrationTargetId] = useState<string | null>(null)
  const [activeWorkspaceScreenId, setActiveWorkspaceScreenId] = useState<string | null>(null)
  const [cameraFullscreen, setCameraFullscreen] = useState(false)
  const [cameraHudVisible, setCameraHudVisible] = useState(false)
  const [diagnosticSnapshotCopied, setDiagnosticSnapshotCopied] = useState(false)
  const [appScale, setAppScale] = useState(1)
  const [layoutDensity, setLayoutDensity] = useState<'regular' | 'compact' | 'tight' | 'stacked'>('regular')
  const [cameraFrameRatio, setCameraFrameRatio] = useState<number | null>(null)
  const [heroCardHeight, setHeroCardHeight] = useState<number | null>(null)
  const appShellRef = useRef<HTMLElement | null>(null)
  const [cameraCardNode, setCameraCardNode] = useState<HTMLDivElement | null>(null)
  const cameraCardRef = useRef<HTMLDivElement | null>(null)
  const heroCopyRef = useRef<HTMLDivElement | null>(null)
  const cameraHudRef = useRef<HTMLDivElement | null>(null)
  const cameraHudPositionRef = useRef<HudPosition>(defaultHudPosition)
  const hudFrameRef = useRef<number | null>(null)
  const hudDragStateRef = useRef<{
    originX: number
    originY: number
    pendingX: number
    pendingY: number
    pointerId: number
    startX: number
    startY: number
  } | null>(null)
  const applySampledDistancePresetRef = useRef(false)
  const queueDistanceCalibrationAfterCameraRef = useRef(false)
  const workspaceCalibrationRequestRef = useRef<{
    distanceUpdatedAt: number | null
    postureUpdatedAt: number | null
    screenId: string
  } | null>(null)

  const tuning = useMemo(() => normalizeTuning(storedTuning), [storedTuning])
  const normalizedWorkspaceLayout = useMemo(
    () => normalizeWorkspaceLayoutConfig(workspaceLayout),
    [workspaceLayout],
  )
  const normalizedWorkspaceCalibrationStore = useMemo(
    () =>
      normalizeWorkspaceCalibrationStore(
        workspaceCalibrationStore,
        normalizedWorkspaceLayout,
      ),
    [workspaceCalibrationStore, normalizedWorkspaceLayout],
  )
  const normalizedWorkspaceLayoutProfileStore = useMemo(
    () => normalizeWorkspaceLayoutProfileStore(workspaceLayoutProfileStore),
    [workspaceLayoutProfileStore],
  )
  const allWorkspaceLayoutProfiles = useMemo(
    () => [
      ...presetWorkspaceLayoutProfiles,
      ...normalizedWorkspaceLayoutProfileStore.profiles,
    ],
    [normalizedWorkspaceLayoutProfileStore.profiles, presetWorkspaceLayoutProfiles],
  )
  const activeWorkspaceLayoutProfile = useMemo(
    () =>
      activePresetWorkspaceLayoutProfileId
        ? allWorkspaceLayoutProfiles.find(
            (profile) => profile.id === activePresetWorkspaceLayoutProfileId,
          ) ?? null
        : getActiveWorkspaceLayoutProfile(normalizedWorkspaceLayoutProfileStore),
    [
      activePresetWorkspaceLayoutProfileId,
      allWorkspaceLayoutProfiles,
      normalizedWorkspaceLayoutProfileStore,
    ],
  )
  const workspaceLayoutProfileDirty = useMemo(
    () =>
      isWorkspaceLayoutProfileDirty(
        activeWorkspaceLayoutProfile,
        normalizedWorkspaceLayout,
        normalizedWorkspaceCalibrationStore,
      ),
    [
      activeWorkspaceLayoutProfile,
      normalizedWorkspaceCalibrationStore,
      normalizedWorkspaceLayout,
    ],
  )

  useEffect(() => {
    let cancelled = false

    void loadPresetWorkspaceLayoutProfiles().then((profiles) => {
      if (!cancelled) {
        setPresetWorkspaceLayoutProfiles(profiles)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const cameraWorkspaceScreenId = useMemo(
    () =>
      normalizedWorkspaceLayout.screens.find((screen) => screen.kind === 'camera')?.id ??
      normalizedWorkspaceLayout.screens[0]?.id ??
      null,
    [normalizedWorkspaceLayout],
  )
  const selectedWorkspaceScreenId =
    screenMode === 'single' ? cameraWorkspaceScreenId : activeWorkspaceScreenId
  const activeWorkspaceScreenCalibration = useMemo(
    () =>
      selectedWorkspaceScreenId
        ? normalizedWorkspaceCalibrationStore.screens[selectedWorkspaceScreenId] ?? null
        : null,
    [selectedWorkspaceScreenId, normalizedWorkspaceCalibrationStore],
  )
  const activeWorkspaceScreenTarget = useMemo(
    () =>
      selectedWorkspaceScreenId
        ? getWorkspaceScreenTarget(
            normalizedWorkspaceLayout,
            normalizedWorkspaceCalibrationStore,
            selectedWorkspaceScreenId,
          ).target
        : null,
    [selectedWorkspaceScreenId, normalizedWorkspaceCalibrationStore, normalizedWorkspaceLayout],
  )
  const tunedDistanceOffsets = useMemo(
    () =>
      getDistancePresetOffsets({
        distanceTooClosePercent: tuning.distanceTooClosePercent,
        distanceNormalPercent: tuning.distanceNormalPercent,
        distanceTooFarPercent: tuning.distanceTooFarPercent,
      }),
    [
      tuning.distanceNormalPercent,
      tuning.distanceTooClosePercent,
      tuning.distanceTooFarPercent,
    ],
  )
  const activeWorkspaceDistancePreset = useMemo(() => {
    const workspaceDistanceBaselinePercent = activeWorkspaceScreenCalibration?.distance
      ? roundToTenth(activeWorkspaceScreenCalibration.distance.signalRatio * 100)
      : null

    if (workspaceDistanceBaselinePercent === null) {
      return null
    }

    const calibratedPreset =
      tuning.sampledDistanceNormalPercent === null
        ? deriveDistancePresetFromBaseline(workspaceDistanceBaselinePercent / 100)
        : applyDistancePresetOffsets(workspaceDistanceBaselinePercent, tunedDistanceOffsets)

    return normalizeDistancePreset(
      calibratedPreset.distanceTooClosePercent,
      calibratedPreset.distanceNormalPercent,
      calibratedPreset.distanceTooFarPercent,
    )
  }, [
    activeWorkspaceScreenCalibration,
    tunedDistanceOffsets,
    tuning.sampledDistanceNormalPercent,
  ])
  const workspaceCalibrationProgress = useMemo(() => {
    const screens = normalizedWorkspaceLayout.screens
    const readyScreens = screens.filter((screen) => {
      const calibration = normalizedWorkspaceCalibrationStore.screens[screen.id]
      return Boolean(calibration?.distance && calibration?.posture)
    })
    const missingScreens = screens.filter((screen) => {
      const calibration = normalizedWorkspaceCalibrationStore.screens[screen.id]
      return !calibration?.distance || !calibration?.posture
    })

    return {
      missingLabels: missingScreens.map((screen) => screen.name),
      ready: screens.length > 0 && readyScreens.length === screens.length,
      readyCount: readyScreens.length,
      totalCount: screens.length,
    }
  }, [normalizedWorkspaceCalibrationStore, normalizedWorkspaceLayout])
  const profile = useMemo(() => createProfile(tuning, demoMode), [demoMode, tuning])
  const activeDistanceThresholds = useMemo(
    () =>
      activeWorkspaceDistancePreset
        ? {
            closeRatio: activeWorkspaceDistancePreset.distanceTooClosePercent / 100,
            normalRatio: activeWorkspaceDistancePreset.distanceNormalPercent / 100,
            farRatio: activeWorkspaceDistancePreset.distanceTooFarPercent / 100,
          }
        : profile.distanceThresholds,
    [activeWorkspaceDistancePreset, profile.distanceThresholds],
  )
  const now = useNow(demoMode ? 400 : 1000)
  const {
    blinkCountToday,
    cameraStatus,
    blinkMetrics,
    blinkRatePerMin: detectedBlinkRatePerMin,
    blinkState: detectedBlinkState,
    distanceCalibration,
    distanceCalibrationBaseline,
    distanceSignalRatio,
    distanceState: detectedDistanceState,
    errorText: cameraErrorText,
    faceScreenAlignment,
    faceLandmarksCount,
    keypoints,
    metrics: poseMetrics,
    modelStatus,
    overlayRef,
    postureState: detectedPostureState,
    postureCalibration,
    postureCalibrationBaseline,
    postureAlignmentBaseline,
    recalibrate,
    recalibratePosture,
    requestCamera,
    videoRef,
  } = usePoseMonitor({
    blinkLowRateThreshold: profile.blinkLowRateThreshold,
    distanceThresholds: activeDistanceThresholds,
    workspaceAlignmentBaseline: activeWorkspaceScreenTarget,
    workspaceDistanceBaseline: activeWorkspaceScreenCalibration?.distance
      ? {
          eyeSpanRatio: activeWorkspaceScreenCalibration.distance.eyeSpanRatio,
          faceRatio: activeWorkspaceScreenCalibration.distance.faceRatio,
          irisRatio: activeWorkspaceScreenCalibration.distance.irisRatio,
          signalRatio: activeWorkspaceScreenCalibration.distance.signalRatio,
        }
      : null,
    workspacePostureBaseline: activeWorkspaceScreenCalibration?.posture
      ? {
          chinShoulderRatio: activeWorkspaceScreenCalibration.posture.chinShoulderRatio,
          eyeShoulderRatio: activeWorkspaceScreenCalibration.posture.eyeShoulderRatio,
          eyeSpanRatio: activeWorkspaceScreenCalibration.posture.eyeSpanRatio,
          faceRatio: activeWorkspaceScreenCalibration.posture.faceRatio,
          faceToShoulderRatio: activeWorkspaceScreenCalibration.posture.faceToShoulderRatio,
          headRollDeg: activeWorkspaceScreenCalibration.posture.headRollDeg,
          mouthShoulderRatio: activeWorkspaceScreenCalibration.posture.mouthShoulderRatio,
          noseShoulderRatio: activeWorkspaceScreenCalibration.posture.noseShoulderRatio,
          shoulderTiltDeg: activeWorkspaceScreenCalibration.posture.shoulderTiltDeg,
          shoulderWidthRatio: activeWorkspaceScreenCalibration.posture.shoulderWidthRatio,
        }
      : null,
    workspacePostureBaselineLocked: activeWorkspaceScreenCalibration?.posture ? true : undefined,
  })
  const workspaceScreenMatch = useMemo(
    () =>
      inferActiveWorkspaceScreen(
        normalizedWorkspaceLayout,
        normalizedWorkspaceCalibrationStore,
        faceScreenAlignment,
      ),
    [faceScreenAlignment, normalizedWorkspaceCalibrationStore, normalizedWorkspaceLayout],
  )
  const syncActiveWorkspaceScreen = useEffectEvent((nextId: string | null) => {
    setActiveWorkspaceScreenId((current) => (current === nextId ? current : nextId))
  })
  const effectiveWorkspaceScreenId =
    screenMode === 'single'
      ? cameraWorkspaceScreenId
      : workspaceScreenMatch.status === 'matched'
        ? workspaceScreenMatch.screen?.id ?? activeWorkspaceScreenId
        : workspaceScreenMatch.status === 'switching'
          ? activeWorkspaceScreenId ?? workspaceScreenMatch.screen?.id ?? null
          : activeWorkspaceScreenId
  const effectiveWorkspaceScreen =
    normalizedWorkspaceLayout.screens.find((screen) => screen.id === effectiveWorkspaceScreenId) ?? null
  const effectiveWorkspaceCalibration =
    effectiveWorkspaceScreenId === null
      ? null
      : normalizedWorkspaceCalibrationStore.screens[effectiveWorkspaceScreenId] ?? null
  const hasDistanceCalibration = activeWorkspaceDistancePreset !== null
  const hasPostureCalibration = Boolean(activeWorkspaceScreenCalibration?.posture)
  const multiScreenConfigured = normalizedWorkspaceLayout.screens.length >= 2
  const allWorkspaceScreensCalibrated =
    multiScreenConfigured && workspaceCalibrationProgress.ready
  const workspaceCalibrationProgressLabel =
    screenMode === 'multi'
      ? `${workspaceCalibrationProgress.readyCount}/${workspaceCalibrationProgress.totalCount} 已完成`
      : hasDistanceCalibration && hasPostureCalibration
        ? '已完成'
        : '未完成'
  const workspaceCalibrationMissingLabel =
    workspaceCalibrationProgress.missingLabels.length === 0
      ? '全部屏幕已校准'
      : `待校准：${workspaceCalibrationProgress.missingLabels.slice(0, 3).join('、')}${
          workspaceCalibrationProgress.missingLabels.length > 3 ? ' 等' : ''
        }`
  const screenModeReadyLabel =
    screenMode === null
      ? '请选择单屏或多屏模式'
      : screenMode === 'multi' && !multiScreenConfigured
        ? '请先添加并配置工作屏'
        : screenMode === 'multi' && !allWorkspaceScreensCalibrated
          ? workspaceCalibrationMissingLabel
          : screenMode === 'multi'
            ? '可开始'
            : !hasDistanceCalibration || !hasPostureCalibration
              ? '请完成视距和姿态校准'
              : '可开始'
  const canStartOffice =
    (screenMode === 'single' && (demoMode || (hasDistanceCalibration && hasPostureCalibration))) ||
    (screenMode === 'multi' && allWorkspaceScreensCalibrated)
  const modeTitle =
    screenMode === 'single'
      ? '单屏模式'
      : screenMode === 'multi'
        ? '多屏模式'
        : '选择屏幕模式'
  const modeSubtitle =
    screenMode === 'single'
      ? '以摄像头所在屏为唯一工作屏，完成校准后开始视距、姿态和眨眼监测。'
      : screenMode === 'multi'
        ? '面向外接显示器或侧屏办公，先配置屏幕位置，再按当前工作屏做校准。'
        : '先选择单屏或多屏模式；不同模式会使用不同的屏幕适配和校准逻辑。'

  useEffect(() => {
    if (screenMode === 'single' && cameraWorkspaceScreenId !== null) {
      syncActiveWorkspaceScreen(cameraWorkspaceScreenId)
    }
  }, [cameraWorkspaceScreenId, screenMode])

  useEffect(() => {
    if (screenMode !== 'multi') {
      return
    }

    if (workspaceScreenMatch.status === 'matched' && workspaceScreenMatch.screen) {
      syncActiveWorkspaceScreen(workspaceScreenMatch.screen.id)
    }
  }, [screenMode, workspaceScreenMatch.screen, workspaceScreenMatch.status])

  useEffect(() => {
    if (
      activeWorkspaceScreenId !== null &&
      !normalizedWorkspaceLayout.screens.some((screen) => screen.id === activeWorkspaceScreenId)
    ) {
      syncActiveWorkspaceScreen(null)
    }
  }, [activeWorkspaceScreenId, normalizedWorkspaceLayout])

  const applyCameraHudPosition = useCallback((position: HudPosition) => {
    const hudElement = cameraHudRef.current

    if (!hudElement) {
      return
    }

    const hudWidth = hudElement.offsetWidth || 420
    const hudHeight = hudElement.offsetHeight || 320
    const padding = 16
    const nextPosition = {
      x: clamp(position.x, padding, Math.max(padding, window.innerWidth - hudWidth - padding)),
      y: clamp(position.y, padding, Math.max(padding, window.innerHeight - hudHeight - padding)),
    }

    cameraHudPositionRef.current = nextPosition
    hudElement.style.left = '0px'
    hudElement.style.top = '0px'
    hudElement.style.transform = `translate3d(${nextPosition.x}px, ${nextPosition.y}px, 0)`
  }, [])

  const updateAppScale = useEffectEvent(() => {
    const viewportWidth = Math.max(320, window.innerWidth - 20)
    const viewportHeight = Math.max(320, window.innerHeight - 20)
    const nextDensity =
      viewportWidth <= 1100 || viewportHeight <= 680
        ? 'stacked'
        : viewportWidth <= 1220 || viewportHeight <= 760
        ? 'tight'
        : viewportWidth <= 1420 || viewportHeight <= 860
          ? 'compact'
          : 'regular'

    setLayoutDensity(nextDensity)

    window.requestAnimationFrame(() => {
      const shell = appShellRef.current

      if (!shell) {
        return
      }

      if (nextDensity === 'stacked') {
        setAppScale(1)
        return
      }

      const naturalWidth = shell.offsetWidth || 1
      const naturalHeight = shell.offsetHeight || 1
      const widthScale = viewportWidth / naturalWidth
      const heightScale = viewportHeight / naturalHeight
      const minScale = nextDensity === 'tight' ? 0.3 : nextDensity === 'compact' ? 0.5 : 0.68
      const nextScale = clamp(Math.min(widthScale, heightScale), minScale, 1)

      setAppScale(Number(nextScale.toFixed(3)))
    })
  })

  useEffect(() => {
    updateAppScale()
    window.addEventListener('resize', updateAppScale)

    return () => {
      window.removeEventListener('resize', updateAppScale)
    }
  }, [])

  useEffect(() => {
    updateAppScale()
  }, [
    cameraStatus,
    cameraFullscreen,
    demoMode,
    hasDistanceCalibration,
    hasPostureCalibration,
  ])

  useEffect(() => {
    setWorkspaceCalibrationStore((currentStore) =>
      pruneWorkspaceCalibrationStore(currentStore, normalizedWorkspaceLayout),
    )
  }, [normalizedWorkspaceLayout, setWorkspaceCalibrationStore])

  useEffect(() => {
    const videoElement = videoRef.current

    if (!videoElement) {
      return
    }

    const syncCameraFrameRatio = () => {
      if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        const nextRatio = Number((videoElement.videoWidth / videoElement.videoHeight).toFixed(2))
        setCameraFrameRatio((currentRatio) => {
          if (currentRatio !== null && Math.abs(currentRatio - nextRatio) < 0.02) {
            return currentRatio
          }

          return nextRatio
        })
      }
    }

    syncCameraFrameRatio()
    videoElement.addEventListener('loadedmetadata', syncCameraFrameRatio)
    videoElement.addEventListener('resize', syncCameraFrameRatio)

    return () => {
      videoElement.removeEventListener('loadedmetadata', syncCameraFrameRatio)
      videoElement.removeEventListener('resize', syncCameraFrameRatio)
    }
  }, [cameraStatus, videoRef])

  useEffect(() => {
    const heroElement = heroCopyRef.current

    if (!heroElement || typeof ResizeObserver === 'undefined') {
      return
    }

    const syncHeroHeight = () => {
      const nextHeight = heroElement.offsetHeight || heroElement.getBoundingClientRect().height
      setHeroCardHeight(nextHeight)
    }

    syncHeroHeight()
    const observer = new ResizeObserver(() => {
      syncHeroHeight()
    })
    observer.observe(heroElement)

    return () => {
      observer.disconnect()
    }
  }, [demoMode, cameraStatus])

  useEffect(() => {
    const updateFullscreenState = () => {
      const fullscreenDocument = document as FullscreenCapableDocument
      const fullscreenElement =
        document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null

      const isFullscreen = fullscreenElement === cameraCardRef.current

      setCameraFullscreen(isFullscreen)

      window.requestAnimationFrame(() => {
        applyCameraHudPosition(cameraHudPositionRef.current)
      })
    }

    document.addEventListener('fullscreenchange', updateFullscreenState)
    document.addEventListener('webkitfullscreenchange', updateFullscreenState)

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState)
      document.removeEventListener('webkitfullscreenchange', updateFullscreenState)
    }
  }, [applyCameraHudPosition])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragging = hudDragStateRef.current

      if (!dragging || dragging.pointerId !== event.pointerId) {
        return
      }

      const hudElement = cameraHudRef.current

      if (!hudElement) {
        return
      }

      const hudWidth = hudElement.offsetWidth || 420
      const hudHeight = hudElement.offsetHeight || 320
      const padding = 16

      dragging.pendingX = clamp(
        dragging.originX + (event.clientX - dragging.startX),
        padding,
        Math.max(padding, window.innerWidth - hudWidth - padding),
      )
      dragging.pendingY = clamp(
        dragging.originY + (event.clientY - dragging.startY),
        padding,
        Math.max(padding, window.innerHeight - hudHeight - padding),
      )

      if (hudFrameRef.current !== null) {
        return
      }

      hudFrameRef.current = window.requestAnimationFrame(() => {
        hudFrameRef.current = null

        if (!hudDragStateRef.current) {
          return
        }

        applyCameraHudPosition({
          x: hudDragStateRef.current.pendingX,
          y: hudDragStateRef.current.pendingY,
        })
      })
    }

    const stopDragging = (event: PointerEvent) => {
      if (hudDragStateRef.current?.pointerId !== event.pointerId) {
        return
      }

      hudDragStateRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)

    const handleResize = () => {
      window.requestAnimationFrame(() => {
        applyCameraHudPosition(cameraHudPositionRef.current)
      })
    }

    window.addEventListener('resize', handleResize)

    return () => {
      if (hudFrameRef.current !== null) {
        window.cancelAnimationFrame(hudFrameRef.current)
        hudFrameRef.current = null
      }

      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
      window.removeEventListener('resize', handleResize)
    }
  }, [applyCameraHudPosition])

  useEffect(() => {
    if (cameraStatus !== 'detecting' && cameraStatus !== 'ready') {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      applyCameraHudPosition(cameraHudPositionRef.current)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [cameraFullscreen, cameraHudVisible, cameraStatus, applyCameraHudPosition])

  const simulatedPostureState: PostureState = demoFlags.headDown
    ? 'head-down'
    : demoFlags.forwardHead
      ? 'forward-head'
      : demoFlags.shoulderTilt
          ? 'shoulder-tilt'
          : demoFlags.headTilt
            ? 'head-tilt'
            : 'normal'

  const distanceState: DistanceState =
    demoFlags.tooClose
      ? 'too-close'
      : !hasDistanceCalibration
        ? demoMode && cameraStatus !== 'ready'
          ? 'normal'
          : 'unavailable'
        : demoMode && cameraStatus !== 'ready' && detectedDistanceState === 'unavailable'
          ? 'normal'
          : detectedDistanceState

  const postureState: PostureState =
    simulatedPostureState !== 'normal'
      ? simulatedPostureState
      : !hasPostureCalibration
        ? demoMode && cameraStatus !== 'ready'
          ? 'normal'
          : 'undetected'
        : demoMode && cameraStatus !== 'ready' && detectedPostureState === 'undetected'
          ? 'normal'
          : detectedPostureState

  const blinkState =
    demoFlags.lowBlink
      ? 'low-rate'
      : demoMode && cameraStatus !== 'ready' && detectedBlinkState === 'undetected'
        ? 'normal'
        : detectedBlinkState
  const blinkRatePerMin = demoFlags.lowBlink ? 4 : detectedBlinkRatePerMin
  const facePresent =
    demoMode && cameraStatus !== 'ready'
      ? true
      : cameraStatus === 'ready' && faceLandmarksCount >= 420
  const blinkTracked = blinkMetrics !== null && blinkState !== 'undetected'
  const postureTracked =
    postureState !== 'undetected' || (poseMetrics?.poseConfidence ?? 0) >= 0.44
  const eyeFocusCandidate =
    facePresent && (blinkTracked || (hasPostureCalibration && postureTracked))

  const tooCloseDuration = useConditionDuration(distanceState === 'too-close', now)
  const lowBlinkDuration = useConditionDuration(facePresent && blinkState === 'low-rate', now)
  const headDownDuration = useConditionDuration(postureState === 'head-down', now)
  const forwardHeadDuration = useConditionDuration(
    postureState === 'forward-head',
    now,
  )
  const headTiltDuration = useConditionDuration(postureState === 'head-tilt', now)
  const shoulderTiltDuration = useConditionDuration(postureState === 'shoulder-tilt', now)
  const eyeFocusCandidateDuration = useConditionDuration(
    sessionStarted && eyeFocusCandidate,
    now,
  )
  const eyeFocusTracked =
    sessionStarted &&
    ((demoMode && cameraStatus !== 'ready') ||
      eyeFocusCandidateDuration >= profile.eyePresenceAcquireMs)

  const eyeTimer = useAccumulatedTimer({
    active: sessionStarted && eyeFocusTracked,
    tickMs: demoMode ? 250 : 1000,
  })

  const combinedRisk =
    distanceState === 'too-close' &&
    tooCloseDuration >= profile.distanceHoldMs &&
    ((tuning.postureHeadDownReminderEnabled &&
      postureState === 'head-down' &&
      headDownDuration >= profile.postureHoldMs) ||
      (tuning.postureForwardHeadReminderEnabled &&
        postureState === 'forward-head' &&
        forwardHeadDuration >= profile.postureHoldMs))
  const resetSessionSignals = () => {
    eyeTimer.reset()
  }

  const updateTuning = <TKey extends keyof UserTuning>(
    key: TKey,
    nextValue: UserTuning[TKey],
  ) => {
    setStoredTuning((current) => ({
      ...normalizeTuning(current),
      [key]: nextValue,
    }))
  }

  const updateDistanceTooClose = (value: number) => {
    const nextPreset = normalizeDistancePreset(
      value,
      tuning.distanceNormalPercent,
      tuning.distanceTooFarPercent,
    )
    setStoredTuning((current) => ({
      ...normalizeTuning(current),
      ...nextPreset,
    }))
  }

  const updateDistanceNormal = (value: number) => {
    const nextPreset = normalizeDistancePreset(
      tuning.distanceTooClosePercent,
      value,
      tuning.distanceTooFarPercent,
    )
    setStoredTuning((current) => ({
      ...normalizeTuning(current),
      ...nextPreset,
    }))
  }

  const updateDistanceTooFar = (value: number) => {
    const nextPreset = normalizeDistancePreset(
      tuning.distanceTooClosePercent,
      tuning.distanceNormalPercent,
      value,
    )
    setStoredTuning((current) => ({
      ...normalizeTuning(current),
      ...nextPreset,
    }))
  }

  useEffect(() => {
    if (
      !applySampledDistancePresetRef.current ||
      distanceCalibration.status !== 'ready' ||
      distanceCalibration.baselineSignalRatio === null
    ) {
      return
    }

    const sampledPreset = deriveDistancePresetFromBaseline(distanceCalibration.baselineSignalRatio)
    applySampledDistancePresetRef.current = false

    setStoredTuning((current) => ({
      ...normalizeTuning(current),
      ...sampledPreset,
      sampledDistanceTooClosePercent: sampledPreset.distanceTooClosePercent,
      sampledDistanceNormalPercent: sampledPreset.distanceNormalPercent,
      sampledDistanceTooFarPercent: sampledPreset.distanceTooFarPercent,
    }))
  }, [
    distanceCalibration.baselineSignalRatio,
    distanceCalibration.status,
    setStoredTuning,
  ])

  const beginUnifiedCalibration = useCallback((screenId?: string) => {
    const fallbackScreenId =
      screenId ??
      effectiveWorkspaceScreenId ??
      normalizedWorkspaceLayout.screens.find((screen) => screen.kind === 'camera')?.id ??
      normalizedWorkspaceLayout.screens[0]?.id ??
      null

    if (fallbackScreenId) {
      setActiveWorkspaceScreenId(fallbackScreenId)
      setWorkspaceCalibrationTargetId(fallbackScreenId)
      workspaceCalibrationRequestRef.current = {
        distanceUpdatedAt: distanceCalibration.updatedAt,
        postureUpdatedAt: postureCalibration.updatedAt,
        screenId: fallbackScreenId,
      }
    }

    applySampledDistancePresetRef.current = true
    recalibratePosture()

    if (
      cameraStatus === 'ready' ||
      cameraStatus === 'detecting' ||
      cameraStatus === 'requesting'
    ) {
      recalibrate()
      return
    }

    queueDistanceCalibrationAfterCameraRef.current = true
    void requestCamera()
  }, [
    cameraStatus,
    distanceCalibration.updatedAt,
    effectiveWorkspaceScreenId,
    normalizedWorkspaceLayout,
    postureCalibration.updatedAt,
    recalibrate,
    recalibratePosture,
    requestCamera,
    setWorkspaceCalibrationTargetId,
  ])

  const clearQueuedDistanceCalibration = useEffectEvent(() => {
    queueDistanceCalibrationAfterCameraRef.current = false
  })

  const startQueuedDistanceCalibration = useEffectEvent(() => {
    queueDistanceCalibrationAfterCameraRef.current = false
    beginUnifiedCalibration()
  })

  useEffect(() => {
    if (!queueDistanceCalibrationAfterCameraRef.current) {
      return
    }

    if (cameraStatus === 'ready') {
      startQueuedDistanceCalibration()
      return
    }

    if (
      cameraStatus === 'denied' ||
      cameraStatus === 'unavailable' ||
      cameraStatus === 'idle'
    ) {
      clearQueuedDistanceCalibration()
    }
  }, [cameraStatus])

  useEffect(() => {
    const request = workspaceCalibrationRequestRef.current

    if (!request) {
      return
    }

    if (
      distanceCalibration.status !== 'ready' ||
      postureCalibration.status !== 'ready' ||
      distanceCalibration.updatedAt === null ||
      postureCalibration.updatedAt === null ||
      distanceCalibrationBaseline === null ||
      postureCalibrationBaseline === null ||
      postureAlignmentBaseline === null
    ) {
      return
    }

    const nextDistanceUpdatedAt = distanceCalibration.updatedAt
    const nextPostureUpdatedAt = postureCalibration.updatedAt

    const distanceReady =
      request.distanceUpdatedAt === null ||
      nextDistanceUpdatedAt > request.distanceUpdatedAt
    const postureReady =
      request.postureUpdatedAt === null ||
      nextPostureUpdatedAt > request.postureUpdatedAt

    if (!distanceReady || !postureReady) {
      return
    }

    setWorkspaceCalibrationStore((currentStore) =>
      upsertWorkspaceScreenCalibration(currentStore, request.screenId, {
        alignment: {
          horizontalOffset: postureAlignmentBaseline.horizontalOffset,
          pitchDeg: postureAlignmentBaseline.pitchDeg,
          rollDeg: postureAlignmentBaseline.rollDeg,
          verticalOffset: postureAlignmentBaseline.verticalOffset,
          yawDeg: postureAlignmentBaseline.yawDeg,
        },
        distance: {
          eyeSpanRatio: distanceCalibrationBaseline.eyeSpanRatio,
          faceRatio: distanceCalibrationBaseline.faceRatio,
          irisRatio: distanceCalibrationBaseline.irisRatio,
          signalRatio: distanceCalibrationBaseline.signalRatio,
          updatedAt: nextDistanceUpdatedAt,
        },
        posture: {
          chinShoulderRatio: postureCalibrationBaseline.chinShoulderRatio,
          eyeShoulderRatio: postureCalibrationBaseline.eyeShoulderRatio,
          eyeSpanRatio: postureCalibrationBaseline.eyeSpanRatio,
          faceRatio: postureCalibrationBaseline.faceRatio,
          faceToShoulderRatio: postureCalibrationBaseline.faceToShoulderRatio,
          headRollDeg: postureCalibrationBaseline.headRollDeg,
          mouthShoulderRatio: postureCalibrationBaseline.mouthShoulderRatio,
          noseShoulderRatio: postureCalibrationBaseline.noseShoulderRatio,
          shoulderTiltDeg: postureCalibrationBaseline.shoulderTiltDeg,
          shoulderWidthRatio: postureCalibrationBaseline.shoulderWidthRatio,
          updatedAt: nextPostureUpdatedAt,
        },
        updatedAt: Math.max(nextDistanceUpdatedAt, nextPostureUpdatedAt),
      }),
    )
    workspaceCalibrationRequestRef.current = null
  }, [
    distanceCalibration.status,
    distanceCalibration.updatedAt,
    distanceCalibrationBaseline,
    postureAlignmentBaseline,
    postureCalibration.status,
    postureCalibration.updatedAt,
    postureCalibrationBaseline,
    setWorkspaceCalibrationStore,
  ])

  const handleCreateWorkspaceLayoutProfile = useCallback(() => {
    setActivePresetWorkspaceLayoutProfileId(null)
    setWorkspaceLayoutProfileStore((currentStore) =>
      createWorkspaceLayoutProfile(
        currentStore,
        normalizedWorkspaceLayout,
        normalizedWorkspaceCalibrationStore,
      ),
    )
  }, [
    normalizedWorkspaceCalibrationStore,
    normalizedWorkspaceLayout,
    setWorkspaceLayoutProfileStore,
  ])

  const handleUpdateWorkspaceLayoutProfile = useCallback(() => {
    if (!activeWorkspaceLayoutProfile || activeWorkspaceLayoutProfile.source === 'preset') {
      return
    }

    setWorkspaceLayoutProfileStore((currentStore) =>
      updateWorkspaceLayoutProfile(
        currentStore,
        activeWorkspaceLayoutProfile.id,
        normalizedWorkspaceLayout,
        normalizedWorkspaceCalibrationStore,
      ),
    )
  }, [
    activeWorkspaceLayoutProfile,
    normalizedWorkspaceCalibrationStore,
    normalizedWorkspaceLayout,
    setWorkspaceLayoutProfileStore,
  ])

  const handleExportWorkspaceLayoutProfile = useCallback(async (profileId?: string) => {
    const profileToExport = profileId
      ? normalizedWorkspaceLayoutProfileStore.profiles.find((profile) => profile.id === profileId)
      : null

    if (profileId && !profileToExport) {
      const presetProfile = allWorkspaceLayoutProfiles.find((profile) => profile.id === profileId)

      window.alert(
        presetProfile?.source === 'preset'
          ? '预置布局不可导出，请先另存为新布局。'
          : '导出失败：没有找到这份布局。',
      )
      return
    }

    const exportName = profileToExport?.name ?? activeWorkspaceLayoutProfile?.name ?? '当前布局'
    const exportLayout = profileToExport?.layout ?? normalizedWorkspaceLayout
    const exportCalibrations = profileToExport?.calibrations ?? normalizedWorkspaceCalibrationStore
    const exportFile = createWorkspaceLayoutProfileExportFile(
      exportName,
      exportLayout,
      exportCalibrations,
    )

    try {
      await saveTextFile(
        getWorkspaceLayoutProfileFilename(exportName),
        JSON.stringify(exportFile, null, 2),
      )
    } catch (error) {
      console.error('Failed to export workspace layout profile.', error)
      window.alert('导出失败：布局文件没有成功写入。')
    }
  }, [
    activeWorkspaceLayoutProfile,
    allWorkspaceLayoutProfiles,
    normalizedWorkspaceCalibrationStore,
    normalizedWorkspaceLayoutProfileStore,
    normalizedWorkspaceLayout,
  ])

  const handleImportWorkspaceLayoutProfile = useCallback(async (file: File) => {
    try {
      const rawFile = JSON.parse(await file.text()) as unknown
      const result = importWorkspaceLayoutProfile(
        normalizedWorkspaceLayoutProfileStore,
        rawFile,
      )

      if (!result) {
        window.alert('导入失败：请选择健康办公布局 JSON 文件。')
        return
      }

      startTransition(() => {
        setActivePresetWorkspaceLayoutProfileId(null)
        setWorkspaceLayoutProfileStore(result.store)
        setWorkspaceLayout(result.profile.layout)
        setWorkspaceCalibrationStore(result.profile.calibrations)
        setWorkspaceCalibrationTargetId(null)
        setActiveWorkspaceScreenId(result.profile.layout.screens[0]?.id ?? null)
      })
    } catch (error) {
      console.error('Failed to import workspace layout profile.', error)
      window.alert('导入失败：文件不是有效的 JSON 布局文件。')
    }
  }, [
    normalizedWorkspaceLayoutProfileStore,
    setWorkspaceCalibrationStore,
    setWorkspaceLayout,
    setWorkspaceLayoutProfileStore,
  ])

  const handleApplyWorkspaceLayoutProfile = useCallback((profileId: string) => {
    const profile = allWorkspaceLayoutProfiles.find(
      (item) => item.id === profileId,
    )

    if (!profile) {
      return
    }

    startTransition(() => {
      setWorkspaceLayout(profile.layout)
      setWorkspaceCalibrationStore(profile.calibrations)
      if (profile.source === 'preset') {
        setActivePresetWorkspaceLayoutProfileId(profile.id)
      } else {
        setActivePresetWorkspaceLayoutProfileId(null)
        setWorkspaceLayoutProfileStore((currentStore) =>
          activateWorkspaceLayoutProfile(currentStore, profileId),
        )
      }
      setWorkspaceCalibrationTargetId(null)
      setActiveWorkspaceScreenId(profile.layout.screens[0]?.id ?? null)
    })
  }, [
    allWorkspaceLayoutProfiles,
    setWorkspaceCalibrationStore,
    setWorkspaceLayout,
    setWorkspaceLayoutProfileStore,
  ])

  const handleDeleteWorkspaceLayoutProfile = useCallback((profileId: string) => {
    if (allWorkspaceLayoutProfiles.some((profile) => profile.id === profileId && profile.source === 'preset')) {
      return
    }

    setWorkspaceLayoutProfileStore((currentStore) =>
      deleteWorkspaceLayoutProfile(currentStore, profileId),
    )
  }, [allWorkspaceLayoutProfiles, setWorkspaceLayoutProfileStore])

  const handleInvalidateWorkspaceCalibration = useCallback(
    (screenId: string, scope: 'all' | 'screen') => {
      setWorkspaceCalibrationTargetId((currentTargetId) => {
        if (scope === 'all' || currentTargetId === screenId) {
          return null
        }

        return currentTargetId
      })
      setWorkspaceCalibrationStore((currentStore) =>
        scope === 'all'
          ? resetAllWorkspaceCalibrations()
          : resetWorkspaceScreenCalibration(currentStore, screenId),
      )
    },
    [setWorkspaceCalibrationStore],
  )

  const toggleDemoFlag = (key: keyof DemoFlags) => {
    setDemoFlags((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const clearDemoStates = () => {
    startTransition(() => {
      setDemoFlags(defaultDemoFlags)
      resetSessionSignals()
    })
  }

  const triggerEyeDemo = () => {
    if (!sessionStarted) {
      setSessionStarted(true)
    }
    eyeTimer.setElapsed(profile.eyeFocusMs + 1000)
  }

  const reminderCandidates = useMemo<ReminderCandidate[]>(() => {
    if (!sessionStarted) {
      return []
    }

    const candidates: ReminderCandidate[] = []

    if (combinedRisk) {
      candidates.push(buildReminderCandidate('camera-combo', {
        dueSince:
          now -
          Math.max(
            0,
            Math.min(tooCloseDuration, Math.max(headDownDuration, forwardHeadDuration)) -
              profile.distanceHoldMs,
          ),
        cooldownMs: profile.reminderCooldownMs,
        resolve: (action) => {
          if (action === 'complete') {
            setDemoFlags((current) => ({
              ...current,
              tooClose: false,
              headDown: false,
              forwardHead: false,
            }))
          }
        },
      }))
    } else {
      if (distanceState === 'too-close' && tooCloseDuration >= profile.distanceHoldMs) {
        candidates.push(buildReminderCandidate('distance-close', {
          dueSince: now - Math.max(0, tooCloseDuration - profile.distanceHoldMs),
          cooldownMs: profile.reminderCooldownMs,
          resolve: (action) => {
            if (action === 'complete') {
              setDemoFlags((current) => ({
                ...current,
                tooClose: false,
              }))
            }
          },
        }))
      }

      if (
        tuning.postureHeadDownReminderEnabled &&
        postureState === 'head-down' &&
        headDownDuration >= profile.postureHoldMs
      ) {
        candidates.push(buildReminderCandidate('posture-head-down', {
          dueSince: now - Math.max(0, headDownDuration - profile.postureHoldMs),
          cooldownMs: profile.reminderCooldownMs,
          resolve: (action) => {
            if (action === 'complete') {
              setDemoFlags((current) => ({
                ...current,
                headDown: false,
              }))
            }
          },
        }))
      }

      if (
        postureState === 'forward-head' &&
        forwardHeadDuration >= profile.postureHoldMs &&
        tuning.postureForwardHeadReminderEnabled
      ) {
        candidates.push(buildReminderCandidate('posture-forward-head', {
          dueSince:
            now - Math.max(0, forwardHeadDuration - profile.postureHoldMs),
          cooldownMs: profile.reminderCooldownMs,
          resolve: (action) => {
            if (action === 'complete') {
              setDemoFlags((current) => ({
                ...current,
                forwardHead: false,
              }))
            }
          },
        }))
      }

      if (
        tuning.postureShoulderTiltReminderEnabled &&
        postureState === 'shoulder-tilt' &&
        shoulderTiltDuration >= profile.postureHoldMs
      ) {
        candidates.push(buildReminderCandidate('posture-shoulder-tilt', {
          dueSince: now - Math.max(0, shoulderTiltDuration - profile.postureHoldMs),
          cooldownMs: profile.reminderCooldownMs,
          resolve: (action) => {
            if (action === 'complete') {
              setDemoFlags((current) => ({
                ...current,
                shoulderTilt: false,
              }))
            }
          },
        }))
      }

      if (
        tuning.postureHeadTiltReminderEnabled &&
        postureState === 'head-tilt' &&
        headTiltDuration >= profile.postureHoldMs
      ) {
        candidates.push(buildReminderCandidate('posture-head-tilt', {
          dueSince: now - Math.max(0, headTiltDuration - profile.postureHoldMs),
          cooldownMs: profile.reminderCooldownMs,
          resolve: (action) => {
            if (action === 'complete') {
              setDemoFlags((current) => ({
                ...current,
                headTilt: false,
              }))
            }
          },
        }))
      }
    }

    if (
      facePresent &&
      blinkState === 'low-rate' &&
      lowBlinkDuration >= profile.blinkLowRateHoldMs
    ) {
      candidates.push(buildReminderCandidate('blink-rate-low', {
        dueSince: now - Math.max(0, lowBlinkDuration - profile.blinkLowRateHoldMs),
        cooldownMs: profile.reminderCooldownMs,
        resolve: (action) => {
          if (action === 'complete') {
            setDemoFlags((current) => ({
              ...current,
              lowBlink: false,
            }))
          }
        },
      }))
    }

    if (eyeTimer.elapsedMs >= profile.eyeFocusMs) {
      candidates.push(buildReminderCandidate('eye-duration', {
        dueSince: now - Math.max(0, eyeTimer.elapsedMs - profile.eyeFocusMs),
        cooldownMs: profile.reminderCooldownMs,
        resolve: (action) => {
          if (action === 'complete') {
            eyeTimer.reset()
          }
        },
      }))
    }

    return candidates
  }, [
    blinkState,
    combinedRisk,
    distanceState,
    eyeTimer,
    facePresent,
    forwardHeadDuration,
    headDownDuration,
    lowBlinkDuration,
    now,
    postureState,
    profile.blinkLowRateHoldMs,
    profile.distanceHoldMs,
    profile.eyeFocusMs,
    profile.postureHoldMs,
    profile.reminderCooldownMs,
    sessionStarted,
    shoulderTiltDuration,
    tuning.postureForwardHeadReminderEnabled,
    tuning.postureHeadDownReminderEnabled,
    tuning.postureHeadTiltReminderEnabled,
    tuning.postureShoulderTiltReminderEnabled,
    tooCloseDuration,
    headTiltDuration,
  ])

  const { activeReminder, resolveReminder } = useReminderScheduler({
    candidates: reminderCandidates,
    globalQuietMs: profile.globalQuietMs,
  })

  const blinkMeta = blinkStateMeta[blinkState]
  const distanceMeta = distanceStateMeta[distanceState]
  const postureMeta = postureStateMeta[postureState]
  const cameraMeta = cameraStatusMeta[cameraStatus]
  const faceCoverage = faceLandmarksCount / 478
  const poseCoverage = keypoints.length / 33
  const detectionQuality =
    poseMetrics?.confidence ??
    (faceLandmarksCount > 0 || keypoints.length > 0
      ? Math.min(1, faceCoverage * 0.55 + poseCoverage * 0.45)
      : 0)
  const detectionQualityLabel =
    poseMetrics || faceLandmarksCount > 0 || keypoints.length > 0
      ? `${(detectionQuality * 100).toFixed(0)}%`
      : cameraStatus === 'detecting'
        ? '初始化中'
        : '--'
  const blinkRateLabel =
    blinkState === 'undetected'
      ? '--'
      : blinkRatePerMin > 0
        ? `${blinkRatePerMin.toFixed(1)} 次/分钟`
        : blinkState === 'tracking'
          ? '统计中'
          : '--'
  const hudBlinkLabel = `${blinkMeta.label} / ${blinkRateLabel}`
  const modelStatusLabel =
    modelStatus === 'ready'
      ? '模型已就绪'
      : modelStatus === 'loading'
        ? '模型加载中'
        : modelStatus === 'error'
          ? '模型异常'
          : '等待启动'
  const faceMeshStatusLabel =
    faceLandmarksCount > 0
      ? `${faceLandmarksCount}/478`
      : cameraStatus === 'detecting'
        ? '等待人脸入镜'
        : '--'
  const blazePoseStatusLabel =
    keypoints.length > 0
      ? `${keypoints.length}/33`
      : cameraStatus === 'detecting'
        ? '等待上半身入镜'
        : '--'
  const faceAlignmentHorizontalLabel =
    faceScreenAlignment.horizontal === 'left'
      ? '偏左'
      : faceScreenAlignment.horizontal === 'right'
        ? '偏右'
        : '居中'
  const faceAlignmentVerticalLabel =
    faceScreenAlignment.vertical === 'up'
      ? '偏上'
      : faceScreenAlignment.vertical === 'down'
        ? '偏下'
        : '平视'
  const faceAlignmentStatusLabel =
    faceScreenAlignment.status === 'out-of-range'
      ? '超出范围'
      : faceScreenAlignment.status === 'edge'
        ? '边缘适配'
        : faceScreenAlignment.status === 'in-range'
          ? '自动适配'
          : '未检测'
  const faceAlignmentLabel =
    faceScreenAlignment.status === 'undetected'
      ? '未检测'
      : `${faceAlignmentStatusLabel} · ${faceAlignmentHorizontalLabel}/${faceAlignmentVerticalLabel}`
  const workspaceActiveScreenLabel =
    workspaceScreenMatch.status === 'matched'
      ? formatWorkspaceScreenMatchLabel(workspaceScreenMatch)
      : workspaceScreenMatch.status === 'switching' && effectiveWorkspaceScreen
        ? `正在切换 · ${effectiveWorkspaceScreen.name}`
        : effectiveWorkspaceScreen
          ? `${effectiveWorkspaceScreen.name} · 保持中`
          : formatWorkspaceScreenMatchLabel(workspaceScreenMatch)
  const workspaceScreenConfidenceLabel =
    screenMode === 'multi'
      ? workspaceScreenMatch.status === 'unavailable' || workspaceScreenMatch.status === 'unmatched'
        ? '暂不可用'
        : `${Math.round(workspaceScreenMatch.confidence * 100)}%`
      : screenMode === 'single'
        ? '单屏无需匹配'
        : '未选择模式'
  const workspaceScreenReasonLabel =
    screenMode !== 'multi'
      ? screenMode === 'single'
        ? '单屏模式'
        : '暂不可用'
      : workspaceScreenMatch.status === 'switching'
        ? '正在切换'
        : workspaceScreenMatch.status === 'unavailable' || workspaceScreenMatch.status === 'unmatched'
          ? '暂不可用'
          : workspaceScreenMatch.reason === 'calibrated'
            ? '逐屏校准'
            : workspaceScreenMatch.reason === 'layout'
              ? '3D 布局'
              : workspaceScreenMatch.reason === 'mixed'
                ? '混合判断'
                : '暂不可用'
  const hasEffectiveDistanceCalibration =
    screenMode === 'multi'
      ? Boolean(effectiveWorkspaceCalibration?.distance)
      : hasDistanceCalibration
  const hasEffectivePostureCalibration =
    screenMode === 'multi'
      ? Boolean(effectiveWorkspaceCalibration?.posture)
      : hasPostureCalibration
  const workspaceCalibrationQualityLabel =
    !hasEffectiveDistanceCalibration && !hasEffectivePostureCalibration
      ? '待校准'
      : !hasEffectiveDistanceCalibration || !hasEffectivePostureCalibration
        ? '需重校准'
        : screenMode === 'multi' &&
            (workspaceScreenMatch.status === 'switching' || workspaceScreenMatch.confidence < 0.7)
          ? '一般'
          : '稳定'
  const workspaceLayoutProfileCreateLabel = activeWorkspaceLayoutProfile
    ? '另存为新布局'
    : '保存当前布局'
  const workspaceLayoutProfileUpdateLabel = activeWorkspaceLayoutProfile
    ? activeWorkspaceLayoutProfile.source === 'preset'
      ? '预置布局不可更新'
      : workspaceLayoutProfileDirty
      ? '更新当前布局'
      : '当前布局已最新'
    : '先选择一个布局'
  const screenModeHudLabel =
    screenMode === 'single'
      ? '单屏模式'
      : screenMode === 'multi'
        ? '多屏模式'
        : '未选择'
  const workspaceConfigHudLabel =
    screenMode === 'multi'
      ? `${normalizedWorkspaceLayout.screens.length} 屏 · ${multiScreenConfigured ? '3D 布局' : '待添加工作屏'}`
      : screenMode === 'single'
        ? '摄像头屏 · 单屏参考'
        : '待选择'
  const workspaceGeometryLabel = effectiveWorkspaceScreen
    ? `x ${Math.round(effectiveWorkspaceScreen.x)} · y ${Math.round(effectiveWorkspaceScreen.y)} · z ${Math.round(effectiveWorkspaceScreen.depth)} · yaw ${effectiveWorkspaceScreen.yawDeg}° · pitch ${effectiveWorkspaceScreen.pitchDeg}°`
    : '--'
  const faceAlignmentPoseLabel =
    faceScreenAlignment.yawDeg === null || faceScreenAlignment.pitchDeg === null
      ? '2D 代理'
      : `左右 ${faceScreenAlignment.yawDeg.toFixed(0)}° · 俯仰 ${faceScreenAlignment.pitchDeg.toFixed(0)}° · 倾斜 ${faceScreenAlignment.rollDeg.toFixed(0)}°`
  const faceAlignmentDetectorLabel =
    faceScreenAlignment.detector === 'face-landmarker' ? '3D 头姿' : '2D 兜底'
  const faceAlignmentHelper =
    faceScreenAlignment.status === 'out-of-range'
      ? '脸部与屏幕角度超出可靠检测范围，请回到屏幕中央并尽量正对摄像头。'
      : faceScreenAlignment.status === 'edge'
        ? `${faceAlignmentDetectorLabel}处于边缘范围，系统会优先做脸屏适配并放宽姿态误报。`
        : faceScreenAlignment.status === 'in-range'
          ? `${faceAlignmentDetectorLabel}在可靠范围内，系统会按脸屏相对位置自动适配视距与姿态。`
          : '等待脸部稳定入镜后启用自动适配。'
  const eyeFocusSignalLabel = !sessionStarted
    ? '未开始'
    : demoMode && cameraStatus !== 'ready'
      ? 'Demo 注入中'
      : eyeFocusTracked
        ? '稳定在岗'
        : eyeFocusCandidate
          ? '正在确认'
          : '未稳定在岗'

  const calibrationReady = distanceCalibration.status === 'ready'
  const activeDistanceNormalRatio = activeWorkspaceDistancePreset
    ? activeWorkspaceDistancePreset.distanceNormalPercent / 100
    : null
  const calibrationBaselineLabel = activeWorkspaceDistancePreset
    ? `${activeWorkspaceDistancePreset.distanceNormalPercent.toFixed(1)}%`
    : '--'
  const calibrationSignedGap =
    distanceSignalRatio !== null && activeDistanceNormalRatio !== null
      ? distanceSignalRatio - activeDistanceNormalRatio
      : null
  const calibrationCloseThreshold = activeWorkspaceDistancePreset
    ? activeWorkspaceDistancePreset.distanceTooClosePercent / 100
    : null
  const calibrationFarThreshold = activeWorkspaceDistancePreset
    ? activeWorkspaceDistancePreset.distanceTooFarPercent / 100
    : null
  const calibrationCloseGap =
    calibrationCloseThreshold !== null && activeDistanceNormalRatio !== null
      ? calibrationCloseThreshold - activeDistanceNormalRatio
      : null
  const calibrationFarGap =
    calibrationFarThreshold !== null && activeDistanceNormalRatio !== null
      ? calibrationFarThreshold - activeDistanceNormalRatio
      : null
  const calibrationSignedGapLabel = formatSignedPercentDelta(calibrationSignedGap)
  const calibrationCloseGapLabel = formatSignedPercentDelta(calibrationCloseGap)
  const calibrationFarGapLabel = formatSignedPercentDelta(calibrationFarGap)
  const sampledDistancePreset =
    activeWorkspaceDistancePreset ??
    (tuning.sampledDistanceNormalPercent === null ||
    tuning.sampledDistanceTooClosePercent === null ||
    tuning.sampledDistanceTooFarPercent === null
      ? distanceCalibration.baselineSignalRatio === null
        ? null
        : deriveDistancePresetFromBaseline(distanceCalibration.baselineSignalRatio)
      : {
          distanceTooClosePercent: tuning.sampledDistanceTooClosePercent,
          distanceNormalPercent: tuning.sampledDistanceNormalPercent,
          distanceTooFarPercent: tuning.sampledDistanceTooFarPercent,
        })
  const sampledDistancePresetLabel =
    sampledDistancePreset === null
      ? '尚未完成视距校准'
      : formatDistancePresetLabel(sampledDistancePreset)
  const calibrationToastVisible =
    calibrationReady &&
    distanceCalibration.updatedAt !== null &&
    now - distanceCalibration.updatedAt <= 4800
  const calibrationSamplingHint = formatUnifiedCalibrationHint({
    cameraStatus,
    distanceBlockingReason: distanceCalibration.blockingReason,
    distanceStatus: distanceCalibration.status,
    hasDistanceCalibration,
    hasPostureCalibration,
    postureBlockingReason: postureCalibration.blockingReason,
    postureStatus: postureCalibration.status,
  })
  const effectiveDistanceCalibrationUpdatedAt =
    effectiveWorkspaceCalibration?.distance?.updatedAt ?? distanceCalibration.updatedAt
  const effectivePostureCalibrationUpdatedAt =
    effectiveWorkspaceCalibration?.posture?.updatedAt ?? postureCalibration.updatedAt
  const calibrationStatusLabel =
    distanceCalibration.status === 'sampling'
      ? formatCalibrationStatus({
          cameraStatus,
          calibrated: hasDistanceCalibration,
          sampleCount: distanceCalibration.sampleCount,
          sampleTarget: distanceCalibration.sampleTarget,
          status: distanceCalibration.status,
          updatedAt: effectiveDistanceCalibrationUpdatedAt,
          waiting: distanceCalibration.blockingReason !== 'none',
        })
      : hasDistanceCalibration && effectiveDistanceCalibrationUpdatedAt !== null
        ? `已校准 · ${formatCalibrationTime(effectiveDistanceCalibrationUpdatedAt)}`
        : '未校准'
  const calibrationToastLabel =
    sampledDistancePreset === null
      ? `视距设定已更新 · 正常 ${calibrationBaselineLabel}`
      : `视距设定已回填 · ${sampledDistancePresetLabel}`
  const distanceCalibrationEntryLabel = calibrationStatusLabel
  const postureCalibrationEntryLabel =
    postureCalibration.status === 'sampling'
      ? formatCalibrationStatus({
          cameraStatus,
          calibrated: hasPostureCalibration,
          sampleCount: postureCalibration.sampleCount,
          sampleTarget: postureCalibration.sampleTarget,
          status: postureCalibration.status,
          updatedAt: effectivePostureCalibrationUpdatedAt,
          waiting: postureCalibration.blockingReason !== 'none',
        })
      : hasPostureCalibration && effectivePostureCalibrationUpdatedAt !== null
        ? `已校准 · ${formatCalibrationTime(effectivePostureCalibrationUpdatedAt)}`
        : '未校准'
  const calibrationCurrentSignalLabel =
    distanceSignalRatio === null
      ? cameraStatus === 'requesting' || cameraStatus === 'detecting'
        ? '读取中'
        : '--'
      : `${(distanceSignalRatio * 100).toFixed(1)}%`
  const hudDistanceSignalBaselineLabel = `${calibrationCurrentSignalLabel} / ${calibrationBaselineLabel}`
  const hudDistanceThresholdLabel = `${calibrationCloseGapLabel} / ${calibrationFarGapLabel}`
  const singleCalibrationIncomplete =
    screenMode !== 'multi' &&
    (!hasDistanceCalibration || !hasPostureCalibration) &&
    distanceCalibration.status !== 'sampling' &&
    postureCalibration.status !== 'sampling'
  const currentAction =
    activeReminder?.guidance[0] ??
    (screenMode === null
      ? '先选择屏幕模式'
      : screenMode === 'multi' && !multiScreenConfigured
        ? '先完成多屏布局配置'
        : screenMode === 'multi' && !allWorkspaceScreensCalibrated
          ? '在多屏配置中完成全部屏幕校准'
          : singleCalibrationIncomplete
            ? '先完成视距和姿态校准'
            : distanceState === 'too-close'
              ? '后移一点并坐直'
              : blinkState === 'low-rate'
                ? '连续轻眨 6 次'
                : postureState === 'head-down'
                  ? '抬头看向屏幕上沿'
                  : postureState === 'forward-head'
                    ? '轻收下巴并后移'
                    : postureState === 'shoulder-tilt'
                      ? '放平肩线并放松肩颈'
                      : postureState === 'head-tilt'
                        ? '把头轻轻扶正'
                        : eyeTimer.elapsedMs >= profile.eyeFocusMs
                          ? '看向远处 20 秒'
                          : '当前无需干预')

  const primaryReminderLabel = activeReminder
    ? `${activeReminder.severity === 'strong' ? '当前主提醒' : '当前轻提醒'} · ${activeReminder.title}`
    : '当前无主提醒'
  const hudCalibrationLabel =
    calibrationStatusLabel.startsWith('已校准')
      ? '已校准'
      : distanceCalibration.status === 'sampling'
        ? formatCalibrationStatus({
            cameraStatus,
            calibrated: hasDistanceCalibration,
            sampleCount: distanceCalibration.sampleCount,
            sampleTarget: distanceCalibration.sampleTarget,
            status: distanceCalibration.status,
            updatedAt: distanceCalibration.updatedAt,
            waiting: distanceCalibration.blockingReason !== 'none',
          })
        : '未校准'
  const hudPostureCalibrationLabel =
    postureCalibrationEntryLabel.startsWith('已校准')
      ? '已校准'
      : postureCalibration.status === 'sampling'
        ? formatCalibrationStatus({
            cameraStatus,
            calibrated: hasPostureCalibration,
            sampleCount: postureCalibration.sampleCount,
            sampleTarget: postureCalibration.sampleTarget,
            status: postureCalibration.status,
            updatedAt: postureCalibration.updatedAt,
            waiting: postureCalibration.blockingReason !== 'none',
          })
        : '未校准'
  const hudReadStatusLabel =
    cameraStatus === 'ready'
      ? '稳定读取'
      : cameraStatus === 'detecting'
        ? '读取中'
        : '未读取'
  const cameraHudSections = [
    {
      title: '设备与模型',
      rows: [
        { label: '模型状态', value: modelStatusLabel },
        { label: '摄像头状态', value: cameraMeta.label },
        { label: 'Face / Pose', value: `${faceMeshStatusLabel} / ${blazePoseStatusLabel}` },
        { label: '检测质量', value: detectionQualityLabel },
        { label: '读取状态', value: hudReadStatusLabel },
      ],
    },
    {
      title: '视距与适配',
      rows: [
        { label: '屏幕模式', value: screenModeHudLabel },
        { label: '空间配置', value: workspaceConfigHudLabel },
        { label: '脸屏适配', value: faceAlignmentLabel },
        { label: '工作屏 3D', value: workspaceGeometryLabel },
        { label: '头姿角度', value: faceAlignmentPoseLabel },
        { label: '视距校准', value: cameraFullscreen ? hudCalibrationLabel : calibrationStatusLabel },
        { label: '姿态校准', value: hudPostureCalibrationLabel },
        { label: '视距信号/基线', value: hudDistanceSignalBaselineLabel },
        { label: '视距基线差值', value: calibrationSignedGapLabel },
        { label: '过近/偏远阈值', value: hudDistanceThresholdLabel },
        { label: '视距状态', value: hasDistanceCalibration ? distanceMeta.label : '未校准' },
      ],
    },
    {
      title: '多屏识别',
      rows: [
        { label: '当前工作屏', value: workspaceActiveScreenLabel },
        { label: '匹配置信度', value: workspaceScreenConfidenceLabel },
        { label: '匹配依据', value: workspaceScreenReasonLabel },
        { label: '校准质量', value: workspaceCalibrationQualityLabel },
      ],
    },
    {
      title: '姿态与眨眼',
      rows: [
        { label: '姿态状态', value: hasPostureCalibration ? postureMeta.label : '未校准' },
        { label: '眨眼状态', value: hudBlinkLabel },
        { label: '今日眨眼', value: `${blinkCountToday} 次` },
      ],
    },
    {
      title: '办公节奏',
      rows: [
        {
          label: '连续用眼',
          value: sessionStarted
            ? `${formatTimer(eyeTimer.elapsedMs)} / ${formatTimer(profile.eyeFocusMs)}`
            : '未开始',
        },
        { label: '用眼在岗', value: eyeFocusSignalLabel },
      ],
    },
  ]
  const showCameraHud =
    cameraHudVisible && (cameraStatus === 'detecting' || cameraStatus === 'ready')
  const cameraHudPortalTarget =
    typeof document === 'undefined'
      ? null
      : cameraFullscreen
        ? cameraCardNode
        : document.body
  const cameraAssistText = cameraErrorText ??
    (screenMode === null
      ? '先选择单屏或多屏模式，再进行校准。'
      : screenMode === 'multi' && !multiScreenConfigured
        ? '请先进入多屏配置，添加并确认工作屏位置。'
        : screenMode === 'multi' && !allWorkspaceScreensCalibrated
          ? '请在多屏配置中完成全部屏幕校准。'
          : screenMode !== 'multi' && (!hasDistanceCalibration || !hasPostureCalibration)
            ? '先完成视距和姿态校准，再开始相关提醒。'
            : cameraStatus === 'ready'
              ? faceAlignmentHelper
              : cameraMeta.helper)
  const handleSessionToggle = () => {
    if (!sessionStarted && !canStartOffice) {
      return
    }

    if (!sessionStarted) {
      resetSessionSignals()
    }
    setSessionStarted((current) => !current)
  }

  const handleSelectScreenMode = (mode: ScreenMode) => {
    startTransition(() => {
      setScreenMode(mode)
      setSessionStarted(false)

      if (mode === 'single' && cameraWorkspaceScreenId !== null) {
        setActiveWorkspaceScreenId(cameraWorkspaceScreenId)
      }
    })
  }

  const toggleCameraFullscreen = async () => {
    const element = cameraCardRef.current as FullscreenCapableElement | null
    const fullscreenDocument = document as FullscreenCapableDocument
    const fullscreenElement =
      document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null

    try {
      if (fullscreenElement === element) {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else {
          await fullscreenDocument.webkitExitFullscreen?.()
        }
        return
      }

      if (element?.requestFullscreen) {
        await element.requestFullscreen()
      } else {
        await element?.webkitRequestFullscreen?.()
      }
    } catch (error) {
      console.error('Failed to toggle camera fullscreen.', error)
    }
  }

  const handleHudPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)

    hudDragStateRef.current = {
      originX: cameraHudPositionRef.current.x,
      originY: cameraHudPositionRef.current.y,
      pendingX: cameraHudPositionRef.current.x,
      pendingY: cameraHudPositionRef.current.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const handleCameraCardRef = useCallback((node: HTMLDivElement | null) => {
    cameraCardRef.current = node
    setCameraCardNode(node)
  }, [])

  const appShellStyle = useMemo(
    () =>
      ({
        '--app-scale': String(appScale),
      }) as CSSProperties,
    [appScale],
  )

  const appShellClassName = useMemo(
    () => `app-shell layout-${layoutDensity}`,
    [layoutDensity],
  )
  const appViewportClassName = useMemo(
    () => `app-viewport${layoutDensity === 'stacked' ? ' is-scrollable' : ''}`,
    [layoutDensity],
  )

  const cameraStageStyle = useMemo(
    () =>
      !cameraFullscreen && cameraFrameRatio
        ? ({
            '--camera-frame-ratio': String(cameraFrameRatio),
          }) as CSSProperties
        : undefined,
    [cameraFrameRatio, cameraFullscreen],
  )

  const cameraCardStyle = useMemo(
    () =>
      !cameraFullscreen && layoutDensity !== 'stacked' && heroCardHeight
        ? ({
            height: `${Math.round(heroCardHeight)}px`,
          } as CSSProperties)
        : undefined,
    [cameraFullscreen, heroCardHeight, layoutDensity],
  )

  const buildDiagnosticSnapshotText = () => {
    const lines = [
      '# 健康办公调试快照',
      `时间: ${new Date().toLocaleString('zh-CN')}`,
      `模式: ${demoMode ? 'Demo' : '真实'}`,
      `会话: ${sessionStarted ? '已开始' : '未开始'}`,
      '',
      '## 设备与模型',
      `摄像头: ${cameraMeta.label}`,
      `模型: ${modelStatusLabel}`,
      `Face / Pose: ${faceMeshStatusLabel} / ${blazePoseStatusLabel}`,
      `检测质量: ${detectionQualityLabel}`,
      `读取状态: ${hudReadStatusLabel}`,
      '',
      '## 脸屏适配',
      `屏幕模式: ${screenModeHudLabel}`,
      `空间配置: ${workspaceConfigHudLabel}`,
      `当前工作屏: ${workspaceActiveScreenLabel}`,
      `匹配置信度: ${workspaceScreenConfidenceLabel}`,
      `匹配依据: ${workspaceScreenReasonLabel}`,
      `校准质量: ${workspaceCalibrationQualityLabel}`,
      `工作屏 3D: ${workspaceGeometryLabel}`,
      `脸屏适配: ${faceAlignmentLabel}`,
      `头姿角度: ${faceAlignmentPoseLabel}`,
      `原始适配: status=${faceScreenAlignment.status}, detector=${faceScreenAlignment.detector}, horizontalOffset=${faceScreenAlignment.horizontalOffset.toFixed(3)}, verticalOffset=${faceScreenAlignment.verticalOffset.toFixed(3)}, yaw=${faceScreenAlignment.yawDeg?.toFixed(1) ?? 'null'}, pitch=${faceScreenAlignment.pitchDeg?.toFixed(1) ?? 'null'}, roll=${faceScreenAlignment.rollDeg.toFixed(1)}, quality=${faceScreenAlignment.quality.toFixed(2)}`,
      `屏幕匹配: status=${workspaceScreenMatch.status}, reason=${workspaceScreenMatch.reason}, confidence=${workspaceScreenMatch.confidence.toFixed(2)}, score=${workspaceScreenMatch.score?.toFixed(3) ?? 'null'}`,
      '',
      '## 视距与姿态',
      `视距校准: ${calibrationStatusLabel}`,
      `姿态校准: ${postureCalibrationEntryLabel}`,
      `视距状态: ${hasDistanceCalibration ? distanceMeta.label : '未校准'}`,
      `视距信号/基线: ${hudDistanceSignalBaselineLabel}`,
      `视距基线差值: ${calibrationSignedGapLabel}`,
      `过近/偏远阈值: ${hudDistanceThresholdLabel}`,
      `姿态状态: ${hasPostureCalibration ? postureMeta.label : '未校准'}`,
      '',
      '## 眨眼与办公节奏',
      `眨眼状态: ${hudBlinkLabel}`,
      `今日眨眼: ${blinkCountToday} 次`,
      `连续用眼: ${sessionStarted ? `${formatTimer(eyeTimer.elapsedMs)} / ${formatTimer(profile.eyeFocusMs)}` : '未开始'}`,
      `用眼在岗: ${eyeFocusSignalLabel}`,
      '',
      '## 当前建议',
      currentAction,
    ]

    return lines.join('\n')
  }

  const handleCopyDiagnosticSnapshot = () => {
    void copyTextToClipboard(buildDiagnosticSnapshotText())
      .then(() => {
        setDiagnosticSnapshotCopied(true)
        window.setTimeout(() => setDiagnosticSnapshotCopied(false), 1800)
      })
      .catch((error: unknown) => {
        console.error('Failed to copy diagnostic snapshot.', error)
      })
  }

  const cameraHudNode = showCameraHud ? (
    <div
      ref={cameraHudRef}
      className="camera-debug-hud is-draggable is-floating"
      data-smoke="camera-hud"
    >
      <div
        className="camera-debug-header"
        onPointerDown={handleHudPointerDown}
      >
        <strong>调试 HUD</strong>
        <div className="camera-debug-header-actions">
          <button
            className="camera-debug-copy"
            data-smoke="camera-hud-copy"
            onClick={handleCopyDiagnosticSnapshot}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            {diagnosticSnapshotCopied ? '已复制' : '复制快照'}
          </button>
          <span>拖动以调整位置</span>
        </div>
      </div>
      <div className="camera-debug-sections">
        {cameraHudSections.map((section) => (
          <section key={section.title} className="camera-debug-section">
            <div className="camera-debug-section-title">{section.title}</div>
            <div className="camera-debug-grid">
              {section.rows.map((item) => (
                <div key={`${section.title}-${item.label}`} className="camera-debug-row">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  ) : null
  const settingsDialogNode = settingsOpen ? (
    <div
      className="settings-modal-layer"
      data-smoke="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setSettingsOpen(false)
        }
      }}
    >
      <div className="settings-modal-card">
        <div className="settings-modal-header">
          <div>
            <span className="panel-eyebrow">设置</span>
            <h2>通用提醒设置</h2>
          </div>
          <button
            className="button button-ghost button-compact"
            data-smoke="settings-close"
            onClick={() => setSettingsOpen(false)}
            type="button"
          >
            关闭
          </button>
        </div>
        <SettingsPanel
          onDistanceNormalChange={updateDistanceNormal}
          onDistanceTooCloseChange={updateDistanceTooClose}
          onDistanceTooFarChange={updateDistanceTooFar}
          onUpdateTuning={updateTuning}
          tuning={tuning}
        />
      </div>
    </div>
  ) : null
  const workspaceConfigDialogNode = workspaceConfigOpen ? (
    <div
      className="workspace-config-modal-layer"
      data-smoke="workspace-config-modal"
      role="dialog"
      aria-modal="true"
      aria-label="多屏适配配置"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setWorkspaceConfigOpen(false)
        }
      }}
    >
      <div className="workspace-config-modal-card">
        <Suspense fallback={<div className="workspace-config-loading">正在加载多屏配置...</div>}>
          <WorkspaceConfigPage
            activeLayoutProfileId={activeWorkspaceLayoutProfile?.id ?? null}
            canUpdateLayoutProfile={Boolean(
              activeWorkspaceLayoutProfile && activeWorkspaceLayoutProfile.source !== 'preset',
            )}
            calibrations={normalizedWorkspaceCalibrationStore}
            calibrationTargetScreenId={
              distanceCalibration.status === 'sampling' || postureCalibration.status === 'sampling'
                ? workspaceCalibrationTargetId
                : null
            }
            currentScreenLabel={workspaceActiveScreenLabel}
            distanceCalibrationLabel={distanceCalibrationEntryLabel}
            isLayoutProfileDirty={workspaceLayoutProfileDirty}
            layout={normalizedWorkspaceLayout}
            layoutProfileCreateLabel={workspaceLayoutProfileCreateLabel}
            layoutProfiles={allWorkspaceLayoutProfiles}
            layoutProfileUpdateLabel={workspaceLayoutProfileUpdateLabel}
            onApplyLayoutProfile={handleApplyWorkspaceLayoutProfile}
            onBack={() => setWorkspaceConfigOpen(false)}
            onCalibrateScreen={beginUnifiedCalibration}
            onChange={setWorkspaceLayout}
            onCreateLayoutProfile={handleCreateWorkspaceLayoutProfile}
            onDeleteLayoutProfile={handleDeleteWorkspaceLayoutProfile}
            onExportLayoutProfile={handleExportWorkspaceLayoutProfile}
            onImportLayoutProfile={handleImportWorkspaceLayoutProfile}
            onInvalidateCalibration={handleInvalidateWorkspaceCalibration}
            postureCalibrationLabel={postureCalibrationEntryLabel}
            onUpdateLayoutProfile={handleUpdateWorkspaceLayoutProfile}
          />
        </Suspense>
      </div>
    </div>
  ) : null

  return (
    <>
      <div className={appViewportClassName}>
      <main ref={appShellRef} className={appShellClassName} data-smoke="app-shell" style={appShellStyle}>
        <section className="hero-panel">
          <OfficeHeroPanel
            calibrationSamplingHint={calibrationSamplingHint}
            cameraStatus={cameraStatus}
            canStartOffice={canStartOffice}
            clearDemoStates={clearDemoStates}
            currentAction={currentAction}
            demoFlags={demoFlags}
            demoMode={demoMode}
            distanceCalibrationEntryLabel={distanceCalibrationEntryLabel}
            hasDistanceCalibration={hasDistanceCalibration}
            hasPostureCalibration={hasPostureCalibration}
            heroCopyRef={heroCopyRef}
            modeSubtitle={modeSubtitle}
            modeTitle={modeTitle}
            onBeginCalibration={() => beginUnifiedCalibration()}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenWorkspaceConfig={() => setWorkspaceConfigOpen(true)}
            onRequestCamera={() => void requestCamera()}
            onSelectScreenMode={handleSelectScreenMode}
            onToggleDemoMode={() =>
              startTransition(() => {
                setDemoMode(!demoMode)
              })
            }
            onToggleSession={handleSessionToggle}
            postureCalibrationEntryLabel={postureCalibrationEntryLabel}
            primaryReminderLabel={primaryReminderLabel}
            screenMode={screenMode}
            screenModeReadyLabel={screenModeReadyLabel}
            sessionStarted={sessionStarted}
            toggleDemoFlag={toggleDemoFlag}
            triggerEyeDemo={triggerEyeDemo}
            workspaceAllScreensCalibrated={allWorkspaceScreensCalibrated}
            workspaceCalibrationMissingLabel={workspaceCalibrationMissingLabel}
            workspaceCalibrationProgressLabel={workspaceCalibrationProgressLabel}
          />

          <div className="hero-visual">
            <CameraPanel
              cameraAssistText={cameraAssistText}
              cameraCardRef={handleCameraCardRef}
              cameraCardStyle={cameraCardStyle}
              cameraFullscreen={cameraFullscreen}
              cameraHudVisible={cameraHudVisible}
              cameraMeta={cameraMeta}
              cameraStageStyle={cameraStageStyle}
              cameraStatus={cameraStatus}
              calibrationToastLabel={calibrationToastLabel}
              calibrationToastVisible={calibrationToastVisible}
              demoMode={demoMode}
              onToggleCameraFullscreen={() => void toggleCameraFullscreen()}
              onToggleCameraHud={() => setCameraHudVisible((visible) => !visible)}
              overlayRef={overlayRef}
              videoRef={videoRef}
            />
          </div>
        </section>

        {cameraHudNode && cameraHudPortalTarget
          ? createPortal(cameraHudNode, cameraHudPortalTarget)
          : null}

      </main>

      {settingsDialogNode ? createPortal(settingsDialogNode, document.body) : null}
      {workspaceConfigDialogNode ? createPortal(workspaceConfigDialogNode, document.body) : null}

      {activeReminder && (
        <ReminderToast
          key={`${activeReminder.id}-${activeReminder.activatedAt}`}
          blinkCountToday={blinkCountToday}
          blinkState={blinkState}
          reminder={activeReminder}
          onResolve={resolveReminder}
        />
      )}
      </div>
    </>
  )
}

export default App
