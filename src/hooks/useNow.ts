import { useEffect, useState } from 'react'

export function useNow(tickMs: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, tickMs)

    return () => {
      window.clearInterval(timerId)
    }
  }, [tickMs])

  return now
}
