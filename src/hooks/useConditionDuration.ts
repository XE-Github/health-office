import { useEffect, useRef } from 'react'

export function useConditionDuration(active: boolean, now: number) {
  const sinceRef = useRef<number | null>(active ? Date.now() : null)

  useEffect(() => {
    if (active) {
      sinceRef.current ??= Date.now()
      return
    }

    sinceRef.current = null
  }, [active])

  return active && sinceRef.current ? now - sinceRef.current : 0
}
