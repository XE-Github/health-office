import { useEffect, useState } from 'react'
import type { BlinkState, ReminderInstance } from '../types'

interface ReminderToastProps {
  blinkCountToday: number
  blinkState: BlinkState
  onResolve: () => void
  reminder: ReminderInstance
}

export function ReminderToast({
  blinkCountToday,
  blinkState,
  reminder,
  onResolve,
}: ReminderToastProps) {
  const [blinkBaseline] = useState(() => blinkCountToday)
  const blinkCompleteProgress =
    blinkState === 'undetected'
      ? 0
      : Math.min(3, Math.max(0, blinkCountToday - blinkBaseline))

  useEffect(() => {
    if (blinkState === 'undetected' || blinkCompleteProgress < 3) {
      return
    }

    onResolve()
  }, [blinkCompleteProgress, blinkCountToday, blinkState, onResolve])

  const blinkHint =
    blinkState === 'undetected'
      ? '双眼稳定后，眨眼 3 次可关闭'
      : `也可眨眼关闭 · ${blinkCompleteProgress}/3`

  return (
    <div className="reminder-toast-layer" data-smoke="reminder-toast-layer">
      <div
        className={`reminder-toast ${reminder.severity === 'strong' ? 'reminder-toast-strong' : ''}`}
        data-smoke="reminder-toast"
      >
        <div className="reminder-toast-content">
          <strong>{reminder.title}</strong>
          <small>{reminder.message}</small>
        </div>
        <div className="reminder-toast-actions">
          <button
            className="button button-primary reminder-complete-button"
            data-smoke="reminder-complete"
            onClick={onResolve}
          >
            完成
          </button>
          <span className="reminder-blink-hint" data-smoke="reminder-blink-hint">
            {blinkHint}
          </span>
        </div>
      </div>
    </div>
  )
}
