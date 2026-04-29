import type { CameraStatus } from '../types'

export type CalibrationSnapshotStatus = 'idle' | 'sampling' | 'ready'

export type CalibrationDisplayState = {
  cameraStatus: CameraStatus
  calibrated: boolean
  sampleCount: number
  sampleTarget: number
  status: CalibrationSnapshotStatus
  updatedAt: number | null
  waiting: boolean
}

const calibrationTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
})

export function formatCalibrationTime(updatedAt: number) {
  return calibrationTimeFormatter.format(updatedAt)
}

export function formatCalibrationStatus({
  calibrated,
  cameraStatus,
  sampleCount,
  sampleTarget,
  status,
  updatedAt,
  waiting,
}: CalibrationDisplayState) {
  if (status === 'sampling') {
    return `${waiting ? '等待稳定' : '采样中'} ${sampleCount}/${sampleTarget}`
  }

  if (calibrated && updatedAt !== null) {
    return `已校准 · ${formatCalibrationTime(updatedAt)}`
  }

  if (cameraStatus === 'requesting' || cameraStatus === 'detecting') {
    return '准备中'
  }

  return '未校准'
}

export function formatUnifiedCalibrationHint({
  cameraStatus,
  distanceBlockingReason,
  distanceStatus,
  hasDistanceCalibration,
  hasPostureCalibration,
  postureBlockingReason,
  postureStatus,
}: {
  cameraStatus: CameraStatus
  distanceBlockingReason: string
  distanceStatus: CalibrationSnapshotStatus
  hasDistanceCalibration: boolean
  hasPostureCalibration: boolean
  postureBlockingReason: string
  postureStatus: CalibrationSnapshotStatus
}) {
  const activeBlockingReason =
    distanceStatus === 'sampling' && distanceBlockingReason !== 'none'
      ? distanceBlockingReason
      : postureStatus === 'sampling' && postureBlockingReason !== 'none'
        ? postureBlockingReason
        : 'none'

  if (activeBlockingReason === 'restart') {
    return '检测到快速移动，已清零并重新采样'
  }

  if (activeBlockingReason === 'unstable') {
    return '请保持姿态和距离稳定 3 到 5 秒'
  }

  if (activeBlockingReason === 'too-close') {
    return '请先后移一点，再继续采样'
  }

  if (activeBlockingReason === 'too-far') {
    return '请稍微靠近一点，再继续采样'
  }

  if (activeBlockingReason === 'alignment') {
    return '请回到屏幕正前方后再校准'
  }

  if (activeBlockingReason === 'face' || activeBlockingReason === 'pose') {
    return '请让脸部和上半身稳定入镜'
  }

  if (activeBlockingReason === 'detecting') {
    return '正在等待摄像头与关键点稳定'
  }

  if (distanceStatus === 'sampling' || postureStatus === 'sampling') {
    return '保持自然工作姿态和舒适视距 3 到 5 秒'
  }

  if (cameraStatus === 'requesting' || cameraStatus === 'detecting') {
    return '正在准备摄像头与关键点'
  }

  if (!hasDistanceCalibration || !hasPostureCalibration) {
    return '完成一次校准后，再开始视距和姿态提醒'
  }

  return '已保存本地校准，允许摄像头后会自动沿用'
}
