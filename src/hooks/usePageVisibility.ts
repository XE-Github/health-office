import { useEffect, useState } from 'react'

export function usePageVisibility() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')

  useEffect(() => {
    const handleVisibilityChange = () => {
      setVisible(document.visibilityState !== 'hidden')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return visible
}
