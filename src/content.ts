import type {
  BlinkState,
  CameraStatus,
  DistanceState,
  PostureState,
} from './types'

type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

export const blinkStateMeta: Record<
  BlinkState,
  { label: string; helper: string; tone: Tone }
> = {
  normal: {
    label: '正常',
    helper: '当前眨眼频率基本稳定，可以继续工作。',
    tone: 'ok',
  },
  'low-rate': {
    label: '偏低',
    helper: '最近 1 分钟眨眼偏少，建议先轻眨几次。',
    tone: 'warn',
  },
  tracking: {
    label: '统计中',
    helper: '正在沿用最近一次有效频率，并继续补采新的眼部样本。',
    tone: 'neutral',
  },
  undetected: {
    label: '未检测',
    helper: '双眼关键点暂未稳定，可能已离屏或距离较远。',
    tone: 'neutral',
  },
}

export const distanceStateMeta: Record<
  DistanceState,
  { label: string; helper: string; tone: Tone }
> = {
  'too-close': {
    label: '过近',
    helper: '请拉开视距并坐直，避免持续贴近屏幕。',
    tone: 'danger',
  },
  normal: {
    label: '正常',
    helper: '当前视距稳定，适合继续工作。',
    tone: 'ok',
  },
  'too-far': {
    label: '偏远',
    helper: '你离屏幕稍远，可微调到更清晰舒适的位置。',
    tone: 'neutral',
  },
  unavailable: {
    label: '未检测',
    helper: '完成视距校准后，系统才会开始三档视距判断。',
    tone: 'neutral',
  },
}

export const postureStateMeta: Record<
  PostureState,
  { label: string; helper: string; tone: Tone }
> = {
  normal: {
    label: '正常',
    helper: '当前姿态稳定，继续保持即可。',
    tone: 'ok',
  },
  'head-down': {
    label: '低头',
    helper: '请抬头，把视线抬回屏幕中上部。',
    tone: 'danger',
  },
  'forward-head': {
    label: '前倾',
    helper: '请后移并坐正，让头肩重新对齐。',
    tone: 'danger',
  },
  'head-tilt': {
    label: '歪头',
    helper: '头部持续偏向一侧，请轻轻扶正并放松颈部。',
    tone: 'warn',
  },
  'shoulder-tilt': {
    label: '肩线倾斜',
    helper: '一侧肩膀明显更高，请放平肩线并放松肩颈。',
    tone: 'warn',
  },
  undetected: {
    label: '未校准',
    helper: '完成姿态校准后，系统才会开始姿态判断。',
    tone: 'neutral',
  },
}

export const cameraStatusMeta: Record<
  CameraStatus,
  { label: string; helper: string; tone: Tone }
> = {
  idle: {
    label: '摄像头未授权',
    helper: '点击“允许摄像头”后开始实时识别。',
    tone: 'neutral',
  },
  requesting: {
    label: '等待授权',
    helper: '正在请求摄像头权限。',
    tone: 'warn',
  },
  denied: {
    label: '摄像头未授权',
    helper: '摄像头访问被拒绝，请重新授权。',
    tone: 'danger',
  },
  unavailable: {
    label: '摄像头不可用',
    helper: '当前设备没有可用摄像头，或系统未正确提供访问能力。',
    tone: 'danger',
  },
  detecting: {
    label: '检测中',
    helper: '已经连上摄像头，正在提取关键点。',
    tone: 'warn',
  },
  ready: {
    label: '检测正常',
    helper: '摄像头工作正常，正在评估视距、姿态和眨眼信号。',
    tone: 'ok',
  },
}
