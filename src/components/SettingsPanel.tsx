import { PanelCard, SettingField, SettingSwitch } from './ui/AppPrimitives'
import {
  DISTANCE_NORMAL_MAX_PERCENT,
  DISTANCE_NORMAL_MIN_PERCENT,
  DISTANCE_TOO_CLOSE_MAX_PERCENT,
  DISTANCE_TOO_FAR_MIN_PERCENT,
} from '../lib/distance'
import type { UserTuning } from '../lib/userTuning'

type UpdateTuning = <TKey extends keyof UserTuning>(
  key: TKey,
  nextValue: UserTuning[TKey],
) => void

type SettingsPanelProps = {
  onDistanceNormalChange: (value: number) => void
  onDistanceTooCloseChange: (value: number) => void
  onDistanceTooFarChange: (value: number) => void
  onUpdateTuning: UpdateTuning
  tuning: UserTuning
}

export function SettingsPanel({
  onDistanceNormalChange,
  onDistanceTooCloseChange,
  onDistanceTooFarChange,
  onUpdateTuning,
  tuning,
}: SettingsPanelProps) {
  return (
    <div className="workspace-grid settings-grid settings-grid-single">
      <PanelCard
        title=""
        eyebrow="设置"
        accent="neutral"
        showAccent={false}
        smokeId="personal-baseline-panel"
      >
        <div className="settings-inline-card">
          <div className="settings-inline-header">
            <strong>提醒基准</strong>
            <small>控制用眼节奏和低眨眼提醒的触发边界。</small>
          </div>
          <div className="settings-grid-card settings-grid-card-core">
            <SettingField
              label="连续用眼提醒"
              helper="建议 20 分钟。"
              unit="分钟"
              value={tuning.eyeFocusMinutes}
              min={10}
              max={40}
              step={1}
              onChange={(value) => onUpdateTuning('eyeFocusMinutes', value)}
            />
            <SettingField
              label="低眨眼提醒阈值"
              helper="建议 8 次/分钟。"
              unit="次/分钟"
              value={tuning.blinkLowRateThreshold}
              min={4}
              max={16}
              step={1}
              onChange={(value) => onUpdateTuning('blinkLowRateThreshold', value)}
            />
          </div>
        </div>
        <div className="settings-inline-card" data-smoke="posture-reminder-settings">
          <div className="settings-inline-header">
            <strong>姿态提醒设置</strong>
            <small>控制哪些姿态异常需要主动提醒。</small>
          </div>
          <div className="settings-grid-card settings-grid-card-posture">
            <SettingSwitch
              checked={tuning.postureHeadDownReminderEnabled}
              helper="低头持续时提醒。"
              label="低头"
              smokeId="posture-head-down-toggle"
              onChange={(checked) =>
                onUpdateTuning('postureHeadDownReminderEnabled', checked)
              }
            />
            <SettingSwitch
              checked={tuning.postureForwardHeadReminderEnabled}
              helper="前倾持续时提醒。"
              label="前倾"
              smokeId="posture-forward-head-toggle"
              onChange={(checked) =>
                onUpdateTuning('postureForwardHeadReminderEnabled', checked)
              }
            />
            <SettingSwitch
              checked={tuning.postureHeadTiltReminderEnabled}
              helper="歪头持续时提醒。"
              label="歪头"
              smokeId="posture-head-tilt-toggle"
              onChange={(checked) =>
                onUpdateTuning('postureHeadTiltReminderEnabled', checked)
              }
            />
            <SettingSwitch
              checked={tuning.postureShoulderTiltReminderEnabled}
              helper="肩线倾斜时提醒。"
              label="肩线倾斜"
              smokeId="posture-shoulder-tilt-toggle"
              onChange={(checked) =>
                onUpdateTuning('postureShoulderTiltReminderEnabled', checked)
              }
            />
          </div>
        </div>
        <div
          className="settings-inline-card"
          data-smoke="distance-settings-card"
        >
          <div className="settings-inline-header">
            <strong>视距阈值</strong>
          </div>
          <div className="settings-grid-card settings-grid-card-distance">
            <SettingField
              label="过近阈值"
              helper="高于则判过近。"
              unit="%"
              value={tuning.distanceTooClosePercent}
              smokeId="distance-too-close"
              min={12}
              max={DISTANCE_TOO_CLOSE_MAX_PERCENT}
              step={0.1}
              onChange={onDistanceTooCloseChange}
            />
            <SettingField
              label="正常基线"
              helper="当前舒适视距。"
              unit="%"
              value={tuning.distanceNormalPercent}
              smokeId="distance-normal"
              min={DISTANCE_NORMAL_MIN_PERCENT}
              max={DISTANCE_NORMAL_MAX_PERCENT}
              step={0.1}
              onChange={onDistanceNormalChange}
            />
            <SettingField
              label="过远阈值"
              helper="低于则判偏远。"
              unit="%"
              value={tuning.distanceTooFarPercent}
              smokeId="distance-too-far"
              min={DISTANCE_TOO_FAR_MIN_PERCENT}
              max={20}
              step={0.1}
              onChange={onDistanceTooFarChange}
            />
          </div>
        </div>
      </PanelCard>
    </div>
  )
}
