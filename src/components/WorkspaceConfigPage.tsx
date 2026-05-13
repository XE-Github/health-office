import { lazy, Suspense, useState } from 'react'
import type { WorkspaceCalibrationStore } from '../lib/workspaceCalibration'
import type {
  WorkspaceLayoutProfile,
} from '../lib/workspaceLayoutProfiles'
import type { WorkspaceLayoutConfig } from '../lib/workspaceConfig'
import {
  createWorkspaceScreenConfig,
  normalizeWorkspaceScreenPatch,
  normalizeWorkspaceScreens,
  setCameraWorkspaceScreen,
  workspaceScreenCountLimit,
} from '../lib/workspaceConfig'
import type {
  WorkspaceSceneView,
  WorkspaceScreenCalibrationVisual,
} from './WorkspaceThreeBoard'

const WorkspaceThreeBoard = lazy(() =>
  import('./WorkspaceThreeBoard').then((module) => ({
    default: module.WorkspaceThreeBoard,
  })),
)

type WorkspaceConfigPageProps = {
  activeLayoutProfileId: string | null
  canUpdateLayoutProfile: boolean
  calibrations: WorkspaceCalibrationStore
  calibrationTargetScreenId: string | null
  currentScreenLabel: string
  distanceCalibrationLabel: string
  isLayoutProfileDirty: boolean
  layout: WorkspaceLayoutConfig
  layoutProfileCreateLabel: string
  layoutProfiles: WorkspaceLayoutProfile[]
  layoutProfileUpdateLabel: string
  onApplyLayoutProfile: (profileId: string) => void
  onBack: () => void
  onCalibrateScreen: (screenId: string) => void
  onChange: (nextLayout: WorkspaceLayoutConfig) => void
  onCreateLayoutProfile: () => void
  onDeleteLayoutProfile: (profileId: string) => void
  onExportLayoutProfile: (profileId: string) => void
  onImportLayoutProfile: (file: File) => void
  onInvalidateCalibration: (screenId: string, scope: 'all' | 'screen') => void
  postureCalibrationLabel: string
  onUpdateLayoutProfile: () => void
}

function formatTime(timestamp: number | null | undefined) {
  if (!timestamp) {
    return null
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function getCalibrationState(
  screenId: string,
  calibrations: WorkspaceCalibrationStore,
  calibrationTargetScreenId: string | null,
) {
  const calibration = calibrations.screens[screenId] ?? null
  const hasDistance = Boolean(calibration?.distance)
  const hasPosture = Boolean(calibration?.posture)

  if (calibrationTargetScreenId === screenId) {
    return {
      className: 'is-sampling',
      label: '校准中',
      status: 'sampling' as const,
    }
  }

  if (hasDistance && hasPosture) {
    return {
      className: 'is-ready',
      label: '已校准',
      status: 'ready' as const,
    }
  }

  if (hasDistance || hasPosture) {
    return {
      className: 'is-partial',
      label: '需重校准',
      status: 'partial' as const,
    }
  }

  return {
    className: 'is-empty',
    label: '未校准',
    status: 'empty' as const,
  }
}

function getSamplingProgressLabel(distanceLabel: string, postureLabel: string) {
  const samplingLabel = [distanceLabel, postureLabel].find(
    (label) =>
      label.includes('采样中') ||
      label.includes('等待稳定') ||
      label.includes('准备中'),
  )

  return samplingLabel ?? '校准中'
}

export function WorkspaceConfigPage({
  activeLayoutProfileId,
  canUpdateLayoutProfile,
  calibrations,
  calibrationTargetScreenId,
  currentScreenLabel,
  distanceCalibrationLabel,
  isLayoutProfileDirty,
  layout,
  layoutProfileCreateLabel,
  layoutProfiles,
  layoutProfileUpdateLabel,
  onApplyLayoutProfile,
  onBack,
  onCalibrateScreen,
  onChange,
  onCreateLayoutProfile,
  onDeleteLayoutProfile,
  onExportLayoutProfile,
  onImportLayoutProfile,
  onInvalidateCalibration,
  postureCalibrationLabel,
  onUpdateLayoutProfile,
}: WorkspaceConfigPageProps) {
  const [selectedScreenId, setSelectedScreenId] = useState(layout.screens[0]?.id ?? '')
  const [sceneView, setSceneView] = useState<WorkspaceSceneView>({
    pitch: 0,
    yaw: 0,
  })

  const effectiveSelectedScreenId =
    layout.screens.find((screen) => screen.id === selectedScreenId)?.id ?? layout.screens[0]?.id ?? ''
  const selectedScreen =
    layout.screens.find((screen) => screen.id === effectiveSelectedScreenId) ?? layout.screens[0] ?? null
  const selectedCalibration =
    selectedScreen ? calibrations.screens[selectedScreen.id] ?? null : null
  const selectedCalibrationState = selectedScreen
    ? getCalibrationState(selectedScreen.id, calibrations, calibrationTargetScreenId)
    : null
  const selectedCalibrationTime = formatTime(selectedCalibration?.updatedAt)
  const selectedCalibrationLabel =
    selectedCalibrationState?.status === 'sampling'
      ? `校准中 · ${getSamplingProgressLabel(distanceCalibrationLabel, postureCalibrationLabel)}`
      : selectedCalibrationState?.status === 'ready'
        ? `已校准${selectedCalibrationTime ? ` · ${selectedCalibrationTime}` : ''}`
        : selectedCalibrationState?.status === 'partial'
          ? '需重校准'
          : '未校准'
  const selectedCalibrationDetails =
    selectedCalibrationState?.status === 'sampling'
      ? [`看向${selectedScreen?.name ?? '这块屏'}`, '保持 3 到 5 秒']
      : []
  const selectedCalibrationHint =
    selectedCalibrationState?.status === 'sampling'
      ? '完成后会保存到当前布局'
      : selectedCalibrationState?.status === 'ready'
        ? '位置变化后重新校准'
        : selectedCalibrationState?.status === 'partial'
          ? '请重新校准这块屏幕'
          : '看向这块屏 3 到 5 秒'
  const screenStates = Object.fromEntries(
    layout.screens.map((screen) => [
      screen.id,
      getCalibrationState(screen.id, calibrations, calibrationTargetScreenId),
    ]),
  ) as Record<string, WorkspaceScreenCalibrationVisual>
  const canAddScreen = layout.screens.length < workspaceScreenCountLimit

  const commitScreens = (screens: WorkspaceLayoutConfig['screens']) => {
    onChange({
      ...layout,
      screens: normalizeWorkspaceScreens(screens),
    })
  }

  const invalidatingScreenFields = [
    'depth',
    'diagonalInches',
    'height',
    'pitchDeg',
    'width',
    'x',
    'y',
    'yawDeg',
  ] as const

  const updateScreen = (
    screenId: string,
    patch: Partial<WorkspaceLayoutConfig['screens'][number]>,
  ) => {
    const currentScreen = layout.screens.find((screen) => screen.id === screenId)

    if (!currentScreen) {
      return
    }

    const normalizedPatch = normalizeWorkspaceScreenPatch(currentScreen, patch)
    const nextScreen = { ...currentScreen, ...normalizedPatch }
    const shouldInvalidateCalibration = invalidatingScreenFields.some(
      (field) => nextScreen[field] !== currentScreen[field],
    )

    commitScreens(
      layout.screens.map((screen) =>
        screen.id === screenId ? nextScreen : screen,
      ),
    )

    if (shouldInvalidateCalibration) {
      onInvalidateCalibration(screenId, currentScreen.kind === 'camera' ? 'all' : 'screen')
    }
  }

  const handleAddScreen = () => {
    if (!canAddScreen) {
      return
    }

    const nextScreen = createWorkspaceScreenConfig(selectedScreen, layout.screens.length)
    commitScreens([...layout.screens, nextScreen])
    setSelectedScreenId(nextScreen.id)
  }

  const handleDeleteScreen = (screenId: string) => {
    if (layout.screens.length <= 1) {
      return
    }

    const deletedScreen = layout.screens.find((screen) => screen.id === screenId)
    const remainingScreens = layout.screens.filter((screen) => screen.id !== screenId)
    const normalizedScreens =
      remainingScreens.some((screen) => screen.kind === 'camera') || remainingScreens.length === 0
        ? remainingScreens
        : setCameraWorkspaceScreen(remainingScreens, remainingScreens[0].id)

    commitScreens(normalizedScreens)

    if (selectedScreenId === screenId) {
      setSelectedScreenId(normalizedScreens[0]?.id ?? '')
    }

    onInvalidateCalibration(screenId, deletedScreen?.kind === 'camera' ? 'all' : 'screen')
  }

  const handleSetCameraScreen = (screenId: string) => {
    commitScreens(setCameraWorkspaceScreen(layout.screens, screenId))
    onInvalidateCalibration(screenId, 'all')
  }

  return (
    <div className="workspace-config-page workspace-config-page-compact" data-smoke="workspace-config-page">
      <button
        aria-label="关闭多屏配置"
        className="workspace-config-floating-close"
        data-smoke="workspace-config-close"
        onClick={onBack}
        type="button"
      >
        关闭
      </button>

      <div className="workspace-config-layout workspace-config-layout-compact">
        <section className="workspace-config-board-shell workspace-config-board-shell-primary">
          <div className="workspace-config-panel-header workspace-config-board-heading">
            <span className="panel-eyebrow">多屏配置</span>
          </div>
          <Suspense
            fallback={
              <div className="workspace-three-board workspace-three-board-loading" data-smoke="workspace-rotatable-board">
                正在加载 3D 画布...
              </div>
            }
          >
            <WorkspaceThreeBoard
              activeLayoutProfileId={activeLayoutProfileId}
              canAddScreen={canAddScreen}
              canUpdateLayoutProfile={canUpdateLayoutProfile}
              currentWorkspaceStatusLabel={currentScreenLabel}
              isLayoutProfileDirty={isLayoutProfileDirty}
              layout={layout}
              layoutProfileCreateLabel={layoutProfileCreateLabel}
              layoutProfiles={layoutProfiles}
              layoutProfileUpdateLabel={layoutProfileUpdateLabel}
              onAddScreen={handleAddScreen}
              onApplyLayoutProfile={onApplyLayoutProfile}
              onCalibrateScreen={onCalibrateScreen}
              onCreateLayoutProfile={onCreateLayoutProfile}
              onDeleteLayoutProfile={onDeleteLayoutProfile}
              onExportLayoutProfile={onExportLayoutProfile}
              onImportLayoutProfile={onImportLayoutProfile}
              onDeleteScreen={handleDeleteScreen}
              onResetView={() => setSceneView({ pitch: 0, yaw: 0 })}
              onSelectScreen={setSelectedScreenId}
              onSetCameraScreen={handleSetCameraScreen}
              onUpdateLayoutProfile={onUpdateLayoutProfile}
              onUpdateScreen={updateScreen}
              onViewChange={setSceneView}
              screenStates={screenStates}
              selectedScreenCalibrationDetails={selectedCalibrationDetails}
              selectedScreenCalibrationHint={selectedCalibrationHint}
              selectedScreenCalibrationLabel={selectedCalibrationLabel}
              selectedScreenId={effectiveSelectedScreenId}
              view={sceneView}
            />
          </Suspense>
        </section>
      </div>
    </div>
  )
}
