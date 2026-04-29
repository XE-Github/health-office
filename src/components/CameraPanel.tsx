import type {
  CSSProperties,
  Ref,
} from 'react'
import { StatusPill, type AccentTone } from './ui/AppPrimitives'
import type { CameraStatus } from '../types'

type CameraPanelProps = {
  cameraAssistText: string
  cameraCardRef: Ref<HTMLDivElement>
  cameraCardStyle?: CSSProperties
  cameraFullscreen: boolean
  cameraHudVisible: boolean
  cameraMeta: {
    label: string
    tone: AccentTone
  }
  cameraStageStyle?: CSSProperties
  cameraStatus: CameraStatus
  calibrationToastLabel: string
  calibrationToastVisible: boolean
  demoMode: boolean
  onToggleCameraFullscreen: () => void
  onToggleCameraHud: () => void
  overlayRef: Ref<HTMLCanvasElement>
  videoRef: Ref<HTMLVideoElement>
}

export function CameraPanel({
  cameraAssistText,
  cameraCardRef,
  cameraCardStyle,
  cameraFullscreen,
  cameraHudVisible,
  cameraMeta,
  cameraStageStyle,
  cameraStatus,
  calibrationToastLabel,
  calibrationToastVisible,
  demoMode,
  onToggleCameraFullscreen,
  onToggleCameraHud,
  overlayRef,
  videoRef,
}: CameraPanelProps) {
  return (
    <div ref={cameraCardRef} className="camera-card" style={cameraCardStyle}>
      <div className="section-heading">
        <div className="section-copy">
          <span>实时感知窗口</span>
          <p className="section-subtitle">{cameraAssistText}</p>
        </div>
        <div className="section-actions">
          <button
            className={`button ${cameraHudVisible ? 'button-ghost-active' : 'button-ghost'} button-compact`}
            data-smoke="camera-hud-toggle"
            aria-pressed={cameraHudVisible}
            onClick={onToggleCameraHud}
          >
            {cameraHudVisible ? '隐藏 HUD' : '显示 HUD'}
          </button>
          <button
            className="button button-ghost button-compact"
            data-smoke="camera-fullscreen-toggle"
            onClick={onToggleCameraFullscreen}
          >
            {cameraFullscreen ? '退出全屏' : '全屏'}
          </button>
          <StatusPill label={cameraMeta.label} tone={cameraMeta.tone} />
        </div>
      </div>
      <div
        className={`camera-stage ${cameraFullscreen ? 'is-fullscreen' : 'is-windowed'}`}
        style={cameraStageStyle}
      >
        <video
          ref={videoRef}
          className="camera-video"
          data-smoke="camera-video"
          autoPlay
          muted
          playsInline
        />
        <canvas ref={overlayRef} className="camera-overlay" />
        {cameraFullscreen && (
          <div className="camera-stage-controls">
            <StatusPill label={cameraMeta.label} tone={cameraMeta.tone} />
            <button
              className={`button ${cameraHudVisible ? 'button-ghost-active' : 'button-ghost'} button-compact`}
              data-smoke="camera-hud-toggle-fullscreen"
              aria-pressed={cameraHudVisible}
              onClick={onToggleCameraHud}
            >
              {cameraHudVisible ? '隐藏 HUD' : '显示 HUD'}
            </button>
            <button
              className="button button-ghost button-compact"
              data-smoke="camera-fullscreen-exit"
              onClick={onToggleCameraFullscreen}
            >
              退出全屏
            </button>
          </div>
        )}
        {cameraStatus === 'detecting' && !cameraFullscreen && (
          <div className="camera-hint">
            <strong>{cameraMeta.label}</strong>
            <span>{cameraAssistText}</span>
          </div>
        )}
        {calibrationToastVisible && (
          <div className="camera-calibration-toast">
            <strong>校准完成</strong>
            <span>{calibrationToastLabel}</span>
          </div>
        )}
        {(cameraStatus === 'idle' ||
          cameraStatus === 'requesting' ||
          cameraStatus === 'denied' ||
          cameraStatus === 'unavailable') && (
          <div className="camera-placeholder">
            <strong>{cameraMeta.label}</strong>
            <span>{cameraAssistText}</span>
            {demoMode && <em>没有摄像头时，也可以通过 Demo 快捷触发完成演示。</em>}
          </div>
        )}
      </div>
    </div>
  )
}
