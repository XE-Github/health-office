import type { ReminderCandidate, ReminderId } from '../types'

type ReminderDefinition = Pick<
  ReminderCandidate,
  'cooldownMs' | 'group' | 'guidance' | 'message' | 'priority' | 'severity' | 'title'
>

export const reminderDefinitions: Record<ReminderId, Omit<ReminderDefinition, 'cooldownMs'>> = {
  'camera-combo': {
    group: 'combo-risk',
    priority: 100,
    severity: 'strong',
    title: '后移一点并坐正',
    message: '因为离屏幕过近，而且姿态也偏了。',
    guidance: ['身体向后移一点', '抬头看向屏幕上沿 10 秒', '做 6 次轻眨眼'],
  },
  'distance-close': {
    group: 'distance-risk',
    priority: 90,
    severity: 'strong',
    title: '后移一点并坐直',
    message: '因为离屏幕太近了。',
    guidance: ['身体向后移一点', '让手肘自然落在桌面', '看向远处 20 秒'],
  },
  'posture-head-down': {
    group: 'posture-risk',
    priority: 92,
    severity: 'strong',
    title: '抬头看向屏幕上沿',
    message: '因为低头时间已经有点久了。',
    guidance: ['把视线抬回屏幕中上部', '后脑勺轻轻向上提', '保持 15 秒自然呼吸'],
  },
  'posture-forward-head': {
    group: 'posture-risk',
    priority: 89,
    severity: 'strong',
    title: '轻收下巴并后移',
    message: '因为头部前倾了。',
    guidance: ['上身微微后移', '下巴轻收 10 秒', '肩膀向后打开'],
  },
  'posture-shoulder-tilt': {
    group: 'posture-risk',
    priority: 84,
    severity: 'gentle',
    title: '放平肩线并放松肩颈',
    message: '因为一侧肩膀明显更高。',
    guidance: ['肩膀轻轻下沉并放松', '让左右肩重新放平 10 秒', '做一次缓慢耸肩再放下'],
  },
  'posture-head-tilt': {
    group: 'posture-risk',
    priority: 82,
    severity: 'gentle',
    title: '把头轻轻扶正',
    message: '因为头部持续偏向一侧。',
    guidance: ['头轻轻回正', '让双耳重新回到同一水平', '放松颈侧 10 秒'],
  },
  'blink-rate-low': {
    group: 'blink-care',
    priority: 76,
    severity: 'gentle',
    title: '连续轻眨几次',
    message: '因为最近眨眼明显偏少。',
    guidance: ['连续轻眨 6 次', '看向远处 10 秒', '放松眉眼和肩颈'],
  },
  'eye-duration': {
    group: 'eye-care',
    priority: 74,
    severity: 'gentle',
    title: '看向远处 20 秒',
    message: '因为连续盯屏时间有点久了。',
    guidance: ['看向远处 20 秒', '做 8 次轻眨眼', '短暂离屏放松'],
  },
}

export function buildReminderCandidate(
  id: ReminderId,
  options: Pick<ReminderCandidate, 'cooldownMs' | 'dueSince' | 'resolve'>,
): ReminderCandidate {
  const definition = reminderDefinitions[id]

  return {
    id,
    ...definition,
    ...options,
  }
}
