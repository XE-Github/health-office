import type { Ref } from 'react'
import { ToggleChip } from './ui/AppPrimitives'
import type {
  CameraStatus,
  DemoFlags,
  ScreenMode,
} from '../types'

type OfficeHeroPanelProps = {
  calibrationSamplingHint: string
  cameraStatus: CameraStatus
  canStartOffice: boolean
  clearDemoStates: () => void
  currentAction: string
  demoFlags: DemoFlags
  demoMode: boolean
  distanceCalibrationEntryLabel: string
  hasDistanceCalibration: boolean
  hasPostureCalibration: boolean
  heroCopyRef: Ref<HTMLDivElement>
  modeSubtitle: string
  modeTitle: string
  onBeginCalibration: () => void
  onOpenSettings: () => void
  onOpenWorkspaceConfig: () => void
  onRequestCamera: () => void
  onSelectScreenMode: (mode: ScreenMode) => void
  onToggleDemoMode: () => void
  onToggleSession: () => void
  postureCalibrationEntryLabel: string
  primaryReminderLabel: string
  screenMode: ScreenMode | null
  screenModeReadyLabel: string
  sessionStarted: boolean
  toggleDemoFlag: (key: keyof DemoFlags) => void
  triggerEyeDemo: () => void
  workspaceAllScreensCalibrated: boolean
  workspaceCalibrationMissingLabel: string
  workspaceCalibrationProgressLabel: string
}

export function OfficeHeroPanel({
  calibrationSamplingHint,
  cameraStatus,
  canStartOffice,
  clearDemoStates,
  currentAction,
  demoFlags,
  demoMode,
  distanceCalibrationEntryLabel,
  hasDistanceCalibration,
  hasPostureCalibration,
  heroCopyRef,
  modeSubtitle,
  modeTitle,
  onBeginCalibration,
  onOpenSettings,
  onOpenWorkspaceConfig,
  onRequestCamera,
  onSelectScreenMode,
  onToggleDemoMode,
  onToggleSession,
  postureCalibrationEntryLabel,
  primaryReminderLabel,
  screenMode,
  screenModeReadyLabel,
  sessionStarted,
  toggleDemoFlag,
  triggerEyeDemo,
  workspaceAllScreensCalibrated,
  workspaceCalibrationMissingLabel,
  workspaceCalibrationProgressLabel,
}: OfficeHeroPanelProps) {
  const isCameraReady = cameraStatus === 'ready' || cameraStatus === 'detecting'
  const cameraReadinessLabel =
    isCameraReady
      ? '摄像头已连接'
      : cameraStatus === 'requesting'
        ? '正在请求摄像头'
        : cameraStatus === 'denied'
          ? '摄像头被拒绝'
          : cameraStatus === 'unavailable'
            ? '摄像头不可用'
            : '等待授权'
  const modeReadinessLabel =
    screenMode === 'single' ? '单屏模式已选' : screenMode === 'multi' ? '多屏模式已选' : '请选择模式'
  const calibrationReady =
    screenMode === 'multi'
      ? workspaceAllScreensCalibrated
      : hasDistanceCalibration && hasPostureCalibration
  const calibrationReadinessLabel =
    screenMode === 'multi'
      ? workspaceAllScreensCalibrated
        ? '全部屏幕已校准'
        : `多屏校准 ${workspaceCalibrationProgressLabel}`
      : calibrationReady
        ? '视距和姿态已校准'
        : '等待校准'
  const startBlockReason =
    sessionStarted
      ? '办公监测中'
      : canStartOffice
        ? '已满足开始条件'
        : screenModeReadyLabel
  const calibrationFeedback =
    screenMode === 'multi'
      ? workspaceAllScreensCalibrated
        ? '全部屏幕已校准，可以开始办公'
        : '完成全部屏幕后才能开始办公'
      : calibrationReady
        ? '校准完成，可以开始办公'
        : '完成校准后会自动保存到本地'
  const readinessItems = [
    {
      label: '模式',
      tone: screenMode ? 'done' : 'todo',
      value: modeReadinessLabel,
    },
    {
      label: '摄像头',
      tone: isCameraReady
        ? 'done'
        : cameraStatus === 'requesting'
          ? 'active'
          : cameraStatus === 'denied' || cameraStatus === 'unavailable'
            ? 'blocked'
            : 'todo',
      value: cameraReadinessLabel,
    },
    {
      label: '校准',
      tone: calibrationReady ? 'done' : screenMode === null ? 'todo' : 'active',
      value: calibrationReadinessLabel,
    },
    {
      label: '开始',
      tone: sessionStarted || canStartOffice ? 'done' : 'blocked',
      value: startBlockReason,
    },
  ] as const
  const calibrationActionLabel =
    screenMode === 'multi'
      ? '打开多屏配置校准'
      : hasDistanceCalibration || hasPostureCalibration
        ? '重新校准'
        : '开始校准'
  const handleCalibrationAction =
    screenMode === 'multi' ? onOpenWorkspaceConfig : onBeginCalibration

  return (
    <div ref={heroCopyRef} className="hero-copy">
      <div className="hero-title-row">
          <span className="hero-eyebrow">健康办公</span>
        <div className="hero-mode-tabs" data-smoke="screen-mode-card">
          <button
            className={`hero-mode-tab ${screenMode === 'single' ? 'is-active' : ''}`}
            data-smoke="screen-mode-single"
            onClick={() => onSelectScreenMode('single')}
            type="button"
          >
            单屏模式
          </button>
          <button
            className={`hero-mode-tab ${screenMode === 'multi' ? 'is-active' : ''}`}
            data-smoke="screen-mode-multi"
            onClick={() => onSelectScreenMode('multi')}
            type="button"
          >
            多屏模式
          </button>
        </div>
      </div>
      <div className="hero-copy-main">
        <h1>{modeTitle}</h1>
        <p>{modeSubtitle}</p>
      </div>
      <div className="hero-actions">
        <button
          className="button button-primary"
          data-smoke="session-toggle"
          disabled={!sessionStarted && !canStartOffice}
          onClick={onToggleSession}
        >
          {sessionStarted ? '暂停办公' : '开始办公'}
        </button>
        <button
          className="button button-secondary"
          data-smoke="camera-request"
          onClick={onRequestCamera}
        >
          {cameraStatus === 'ready' ? '重新连接摄像头' : '允许摄像头'}
        </button>
        <button
          className={`button ${demoMode ? 'button-ghost-active' : 'button-ghost'}`}
          data-smoke="demo-toggle"
          onClick={onToggleDemoMode}
        >
          {demoMode ? '关闭 Demo 模式' : '开启 Demo 模式'}
        </button>
        <button
          className="button button-ghost"
          data-smoke="settings-open"
          onClick={onOpenSettings}
          type="button"
        >
          设置
        </button>
        {screenMode === 'multi' && (
          <button
            className="button button-ghost"
            data-smoke="workspace-config-open"
            onClick={onOpenWorkspaceConfig}
          >
            多屏配置
          </button>
        )}
      </div>
      <div className="hero-action-card">
        <span>当前建议</span>
        <strong>{currentAction}</strong>
        <div className="hero-action-meta">
          <small>{primaryReminderLabel} · {demoMode ? 'Demo 加速中' : '真实办公节奏'}</small>
          <small>准备状态：{screenModeReadyLabel}</small>
        </div>
      </div>
      <div className="hero-readiness-checklist" data-smoke="readiness-checklist">
        {readinessItems.map((item) => (
          <div className={`hero-readiness-item is-${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="hero-start-reason" data-smoke="start-block-reason">
        {sessionStarted || canStartOffice ? '可以开始办公' : `暂不能开始：${startBlockReason}`}
      </div>
      <div className="hero-calibration-grid">
        <div
          className={`hero-calibration-card hero-calibration-card-unified ${
            screenMode === 'multi' ? 'is-multi' : ''
          }`}
          data-smoke="calibration-card"
        >
          <div className="hero-calibration-copy">
            <span>{screenMode === 'multi' ? '多屏校准' : '视距和姿态校准'}</span>
            <small>
              {screenMode === 'multi'
                ? '在多屏配置中逐块校准，全部完成后再开始办公'
                : calibrationSamplingHint}
            </small>
          </div>
          {screenMode === 'multi' ? (
            <div className="hero-calibration-summary is-multi">
              <div className="hero-calibration-item">
                <span>校准进度</span>
                <strong>{workspaceCalibrationProgressLabel}</strong>
              </div>
              <div className="hero-calibration-item">
                <span>剩余状态</span>
                <strong>{workspaceAllScreensCalibrated ? '全部完成' : workspaceCalibrationMissingLabel}</strong>
              </div>
            </div>
          ) : (
            <div className="hero-calibration-summary">
              <div className="hero-calibration-item">
                <span>视距</span>
                <strong>{distanceCalibrationEntryLabel}</strong>
              </div>
              <div className="hero-calibration-item">
                <span>姿态</span>
                <strong data-smoke="posture-calibration-status">{postureCalibrationEntryLabel}</strong>
              </div>
            </div>
          )}
          <button
            className="button button-ghost button-compact"
            data-smoke="calibration-trigger"
            disabled={screenMode === null}
            onClick={handleCalibrationAction}
            type="button"
          >
            {calibrationActionLabel}
          </button>
          <small className="hero-calibration-feedback" data-smoke="calibration-complete-feedback">
            {calibrationFeedback}
          </small>
        </div>
      </div>
      <div className={`hero-demo-strip ${demoMode ? 'is-active' : 'is-inactive'}`}>
        <span className="hero-demo-label">Demo 快捷触发</span>
        {demoMode ? (
          <div className="hero-demo-actions">
            <button
              className="button button-ghost button-compact"
              data-smoke="demo-trigger-eye"
              onClick={triggerEyeDemo}
            >
              连续盯屏
            </button>
            <ToggleChip
              active={demoFlags.tooClose}
              label="距离过近"
              onClick={() => toggleDemoFlag('tooClose')}
            />
            <ToggleChip
              active={demoFlags.headDown}
              label="长时间低头"
              onClick={() => toggleDemoFlag('headDown')}
            />
            <ToggleChip
              active={demoFlags.forwardHead}
              label="头部前倾"
              onClick={() => toggleDemoFlag('forwardHead')}
            />
            <ToggleChip
              active={demoFlags.headTilt}
              label="歪头"
              onClick={() => toggleDemoFlag('headTilt')}
            />
            <ToggleChip
              active={demoFlags.shoulderTilt}
              label="肩线倾斜"
              onClick={() => toggleDemoFlag('shoulderTilt')}
            />
            <ToggleChip
              active={demoFlags.lowBlink}
              label="低眨眼频率"
              onClick={() => toggleDemoFlag('lowBlink')}
            />
            <button
              className="button button-ghost button-compact"
              data-smoke="demo-clear"
              onClick={clearDemoStates}
            >
              清空模拟
            </button>
          </div>
        ) : (
          <div className="hero-demo-placeholder">
            <span>开启 Demo 模式后，可在这里快速模拟距离、姿态和眨眼场景。</span>
          </div>
        )}
      </div>
    </div>
  )
}
