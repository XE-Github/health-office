export function formatTimer(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))

  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (seconds === 0) {
    return `${minutes} 分钟`
  }

  return `${minutes} 分 ${seconds} 秒`
}

export function formatDurationLabel(ms: number) {
  if (ms <= 0) {
    return '0 秒'
  }

  const totalSeconds = Math.max(1, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`
  }

  if (minutes > 0) {
    return seconds === 0 ? `${minutes} 分钟` : `${minutes} 分 ${seconds} 秒`
  }

  return `${seconds} 秒`
}

export function formatShortDuration(ms: number) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))

  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`
  }

  const minutes = Math.round(totalSeconds / 60)
  return `${minutes} 分钟`
}
