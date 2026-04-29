import { lazy, Suspense, useState } from 'react'
import type { WorkspaceCalibrationStore } from '../lib/workspaceCalibration'
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
  calibrations: WorkspaceCalibrationStore
  calibrationTargetScreenId: string | null
  cameraStatus: string
  currentScreenId: string | null
  currentScreenLabel: string
  distanceCalibrationLabel: string
  layout: WorkspaceLayoutConfig
  onBack: () => void
  onCalibrateScreen: (screenId: string) => void
  onChange: (nextLayout: WorkspaceLayoutConfig) => void
  postureCalibrationLabel: string
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
      label: '部分校准',
      status: 'partial' as const,
    }
  }

  return {
    className: 'is-empty',
    label: '未校准',
    status: 'empty' as const,
  }
}

export function WorkspaceConfigPage({
  calibrations,
  calibrationTargetScreenId,
  cameraStatus,
  currentScreenId,
  currentScreenLabel,
  distanceCalibrationLabel,
  layout,
  onBack,
  onCalibrateScreen,
  onChange,
  postureCalibrationLabel,
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
  const cameraScreen =
    layout.screens.find((screen) => screen.kind === 'camera') ?? layout.screens[0] ?? null
  const selectedCalibration =
    selectedScreen ? calibrations.screens[selectedScreen.id] ?? null : null
  const selectedCalibrationState = selectedScreen
    ? getCalibrationState(selectedScreen.id, calibrations, calibrationTargetScreenId)
    : null
  const selectedCalibrationTime = formatTime(selectedCalibration?.updatedAt)
  const selectedCalibrationLabel =
    selectedCalibrationState?.status === 'sampling'
      ? '校准中'
      : selectedCalibrationState?.status === 'ready'
        ? `已校准${selectedCalibrationTime ? ` · ${selectedCalibrationTime}` : ''}`
        : selectedCalibrationState?.status === 'partial'
          ? '部分校准'
          : '未校准'
  const selectedCalibrationDetails =
    selectedCalibrationState?.status === 'sampling'
      ? [`视距：${distanceCalibrationLabel}`, `姿态：${postureCalibrationLabel}`]
      : []
  const selectedCalibrationHint =
    selectedCalibrationState?.status === 'sampling'
      ? '看向这块屏 3 到 5 秒'
      : selectedCalibrationState?.status === 'ready'
        ? '位置变化后重新校准'
        : selectedCalibrationState?.status === 'partial'
          ? '建议重新校准'
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

  const updateScreen = (
    screenId: string,
    patch: Partial<WorkspaceLayoutConfig['screens'][number]>,
  ) => {
    commitScreens(
      layout.screens.map((screen) =>
        screen.id === screenId ? { ...screen, ...normalizeWorkspaceScreenPatch(screen, patch) } : screen,
      ),
    )
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

    const remainingScreens = layout.screens.filter((screen) => screen.id !== screenId)
    const normalizedScreens =
      remainingScreens.some((screen) => screen.kind === 'camera') || remainingScreens.length === 0
        ? remainingScreens
        : setCameraWorkspaceScreen(remainingScreens, remainingScreens[0].id)

    commitScreens(normalizedScreens)

    if (selectedScreenId === screenId) {
      setSelectedScreenId(normalizedScreens[0]?.id ?? '')
    }
  }

  const handleSetCameraScreen = (screenId: string) => {
    commitScreens(setCameraWorkspaceScreen(layout.screens, screenId))
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
              canAddScreen={canAddScreen}
              layout={layout}
              onAddScreen={handleAddScreen}
              onCalibrateScreen={onCalibrateScreen}
              onDeleteScreen={handleDeleteScreen}
              onResetView={() => setSceneView({ pitch: 0, yaw: 0 })}
              onSelectScreen={setSelectedScreenId}
              onSetCameraScreen={handleSetCameraScreen}
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

        {selectedScreen && selectedCalibrationState && (
          <aside className="workspace-config-inspector">
            <section className="workspace-config-panel workspace-config-panel-compact">
              <div className="workspace-config-panel-header">
                <strong>当前屏幕</strong>
              </div>
              <div className="workspace-config-summary workspace-config-summary-compact">
                <div className="workspace-summary-row">
                  <span>摄像头</span>
                  <strong>{cameraStatus}</strong>
                </div>
                {cameraScreen && (
                  <div className="workspace-summary-row">
                    <span>摄像头屏</span>
                    <strong>{cameraScreen.name}</strong>
                  </div>
                )}
                <div className="workspace-summary-row">
                  <span>工作屏</span>
                  <strong>{currentScreenLabel}</strong>
                </div>
              </div>
              <div className="workspace-screen-list workspace-screen-list-compact">
                {layout.screens.map((screen) => {
                  const calibrationState = getCalibrationState(
                    screen.id,
                    calibrations,
                    calibrationTargetScreenId,
                  )

                  return (
                    <button
                      key={screen.id}
                      className={`workspace-screen-item ${
                        effectiveSelectedScreenId === screen.id ? 'is-selected' : ''
                      }`}
                      onClick={() => setSelectedScreenId(screen.id)}
                      type="button"
                    >
                      <strong>{screen.name}</strong>
                      <span className="workspace-screen-item-badges">
                        {currentScreenId === screen.id && (
                          <span className="workspace-calibration-badge is-current">当前</span>
                        )}
                        <span className={`workspace-calibration-badge ${calibrationState.className}`}>
                          {calibrationState.label}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}
