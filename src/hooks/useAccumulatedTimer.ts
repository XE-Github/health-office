import { useCallback, useEffect, useRef, useState } from 'react'

export function useAccumulatedTimer({
  active,
  tickMs,
}: {
  active: boolean
  tickMs: number
}) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const lastTickRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      lastTickRef.current = null
      return
    }

    lastTickRef.current = Date.now()

    const timerId = window.setInterval(() => {
      const now = Date.now()
      const lastTick = lastTickRef.current ?? now
      setElapsedMs((current) => current + (now - lastTick))
      lastTickRef.current = now
    }, tickMs)

    return () => {
      window.clearInterval(timerId)
    }
  }, [active, tickMs])

  const reset = useCallback(() => {
    setElapsedMs(0)
    lastTickRef.current = active ? Date.now() : null
  }, [active])

  const setElapsed = useCallback(
    (nextElapsedMs: number) => {
      setElapsedMs(nextElapsedMs)
      lastTickRef.current = active ? Date.now() : null
    },
    [active],
  )

  return {
    elapsedMs,
    reset,
    setElapsed,
  }
}
