import { useEffect, useRef, useState } from 'react'
import type {
  ReminderCandidate,
  ReminderInstance,
} from '../types'

export function useReminderScheduler({
  candidates,
  globalQuietMs,
}: {
  candidates: ReminderCandidate[]
  globalQuietMs: number
}) {
  const [activeReminder, setActiveReminder] = useState<ReminderInstance | null>(null)
  const quietUntilRef = useRef(0)
  const suppressionRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (activeReminder) {
      const stillActive = candidates.some(
        (candidate) =>
          candidate.id === activeReminder.id && candidate.group === activeReminder.group,
      )

      if (!stillActive) {
        const timerId = window.setTimeout(() => {
          setActiveReminder(null)
        }, 0)

        return () => {
          window.clearTimeout(timerId)
        }
      }
    }

    if (activeReminder) {
      return
    }

    const now = Date.now()

    if (quietUntilRef.current > now) {
      return
    }

    const eligible = [...candidates]
      .filter((candidate) => (suppressionRef.current[candidate.group] ?? 0) <= now)
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return right.priority - left.priority
        }

        return left.dueSince - right.dueSince
      })

    if (eligible.length > 0) {
      setActiveReminder({
        ...eligible[0],
        activatedAt: now,
      })
    }
  }, [activeReminder, candidates])

  const resolveReminder = () => {
    setActiveReminder((current) => {
      if (!current) {
        return null
      }

      const now = Date.now()

      suppressionRef.current[current.group] = now + current.cooldownMs
      quietUntilRef.current = now + globalQuietMs
      current.resolve('complete')

      return null
    })
  }

  return {
    activeReminder,
    resolveReminder,
  }
}
