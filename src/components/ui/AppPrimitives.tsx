import type { ReactNode } from 'react'

export type AccentTone = 'ok' | 'warn' | 'danger' | 'neutral'

export function PanelCard({
  title,
  eyebrow,
  children,
  accent,
  showAccent = true,
  smokeId,
}: {
  title: string
  eyebrow: string
  children: ReactNode
  accent: AccentTone
  showAccent?: boolean
  smokeId?: string
}) {
  return (
    <article className={`panel-card ${showAccent ? `accent-${accent}` : 'panel-plain'}`} data-smoke={smokeId}>
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">{eyebrow}</span>
          {title ? <h3>{title}</h3> : null}
        </div>
      </div>
      <div className="panel-body">{children}</div>
    </article>
  )
}

export function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: AccentTone
}) {
  return <span className={`status-pill tone-${tone}`}>{label}</span>
}

export function ToggleChip({
  active,
  label,
  onClick,
  smokeId,
}: {
  active: boolean
  label: string
  onClick: () => void
  smokeId?: string
}) {
  return (
    <button
      className={`toggle-chip ${active ? 'active' : ''}`}
      data-smoke={smokeId}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function SettingField({
  label,
  helper,
  max,
  min,
  onChange,
  smokeId,
  step,
  unit,
  value,
}: {
  label: string
  helper: string
  max: number
  min: number
  onChange: (value: number) => void
  smokeId?: string
  step: number
  unit: string
  value: number
}) {
  return (
    <label className="setting-field" data-smoke={smokeId ? `${smokeId}-field` : undefined}>
      <span className="setting-label">{label}</span>
      <div className="setting-input-row">
        <input
          className="setting-input"
          data-smoke={smokeId}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const nextValue = Number(event.target.value)

            if (!Number.isFinite(nextValue)) {
              return
            }

            onChange(Math.min(max, Math.max(min, nextValue)))
          }}
        />
        <strong>{unit}</strong>
      </div>
      <small>{helper}</small>
    </label>
  )
}

export function SettingSwitch({
  checked,
  helper,
  label,
  onChange,
  smokeId,
}: {
  checked: boolean
  helper: string
  label: string
  onChange: (checked: boolean) => void
  smokeId?: string
}) {
  return (
    <div className="setting-switch" data-smoke={smokeId ? `${smokeId}-field` : undefined}>
      <div>
        <span className="setting-label">{label}</span>
        <small>{helper}</small>
      </div>
      <button
        aria-checked={checked}
        className={`setting-switch-control${checked ? ' active' : ''}`}
        data-smoke={smokeId}
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span>{checked ? '开启' : '关闭'}</span>
        <i aria-hidden="true" />
      </button>
    </div>
  )
}
