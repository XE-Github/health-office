import type * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'
import type * as poseDetection from '@tensorflow-models/pose-detection'
import type {
  DistanceState,
  PostureState,
} from '../types'
import {
  faceContourColors,
  faceContourNames,
  labelledPosePoints,
  poseKeypointThreshold,
  totalFaceKeypoints,
} from './poseMonitorConstants'
import type {
  FaceContourMap,
  FaceContourName,
} from './poseMonitorTypes'

function createVisiblePoseMap(pose: poseDetection.Pose | null) {
  if (!pose) {
    return new Map<string, poseDetection.Keypoint>()
  }

  return pose.keypoints.reduce((map, keypoint) => {
    if (keypoint.name && (keypoint.score ?? 0) >= poseKeypointThreshold) {
      map.set(keypoint.name, keypoint)
    }

    return map
  }, new Map<string, poseDetection.Keypoint>())
}

function drawFaceContour(
  context: CanvasRenderingContext2D,
  face: faceLandmarksDetection.Face,
  contourMap: FaceContourMap,
  contourName: FaceContourName,
  frameWidth: number,
) {
  const indices = contourMap[contourName] ?? []
  const validPoints = indices
    .map((index) => face.keypoints[index] ?? null)
    .filter((point): point is NonNullable<typeof point> => point !== null)

  if (validPoints.length < 2) {
    return
  }

  context.beginPath()
  context.moveTo(frameWidth - validPoints[0].x, validPoints[0].y)

  validPoints.slice(1).forEach((point) => {
    context.lineTo(frameWidth - point.x, point.y)
  })

  if (
    contourName === 'faceOval' ||
    contourName === 'leftEye' ||
    contourName === 'rightEye' ||
    contourName === 'lips' ||
    contourName === 'leftIris' ||
    contourName === 'rightIris'
  ) {
    context.closePath()
  }

  context.strokeStyle = faceContourColors[contourName]
  context.lineWidth =
    contourName === 'faceOval'
      ? 2.3
      : contourName.includes('Iris')
        ? 1.8
        : 1.5
  context.stroke()
}

export function drawDetectionOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  face: faceLandmarksDetection.Face | null,
  faceContours: FaceContourMap,
  pose: poseDetection.Pose | null,
  posePairs: Array<[number, number]>,
  postureState: PostureState,
  distanceState: DistanceState,
) {
  if (!canvas || !video) {
    return
  }

  const width = video.videoWidth
  const height = video.videoHeight

  if (!width || !height) {
    return
  }

  if (canvas.width !== width) {
    canvas.width = width
  }

  if (canvas.height !== height) {
    canvas.height = height
  }

  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  context.clearRect(0, 0, width, height)

  if (!face && !pose) {
    return
  }

  const alertState =
    (distanceState !== 'normal' && distanceState !== 'unavailable') ||
    (postureState !== 'normal' && postureState !== 'undetected')
  const activeColor = alertState ? '#d96f4b' : '#6fb28d'
  const fillColor = alertState
    ? 'rgba(217, 111, 75, 0.18)'
    : 'rgba(111, 178, 141, 0.2)'
  const mirrorX = (x: number) => width - x

  if (face) {
    context.fillStyle = 'rgba(255, 246, 212, 0.62)'
    face.keypoints.forEach((point, index) => {
      const radius =
        index >= totalFaceKeypoints - 8 ? 2.6 : index >= totalFaceKeypoints - 16 ? 2.1 : 1.35
      context.beginPath()
      context.arc(mirrorX(point.x), point.y, radius, 0, Math.PI * 2)
      context.fill()
    })

    faceContourNames.forEach((contourName) => {
      drawFaceContour(context, face, faceContours, contourName, width)
    })
  }

  if (pose) {
    const visiblePoseMap = createVisiblePoseMap(pose)

    context.strokeStyle = activeColor
    context.lineWidth = 2.4
    context.lineCap = 'round'

    posePairs.forEach(([fromIndex, toIndex]) => {
      const fromPoint = pose.keypoints[fromIndex]
      const toPoint = pose.keypoints[toIndex]

      if (
        !fromPoint?.name ||
        !toPoint?.name ||
        (fromPoint.score ?? 0) < poseKeypointThreshold ||
        (toPoint.score ?? 0) < poseKeypointThreshold
      ) {
        return
      }

      context.beginPath()
      context.moveTo(mirrorX(fromPoint.x), fromPoint.y)
      context.lineTo(mirrorX(toPoint.x), toPoint.y)
      context.stroke()
    })

    visiblePoseMap.forEach((point, name) => {
      const mirroredX = mirrorX(point.x)

      context.beginPath()
      context.fillStyle = labelledPosePoints.has(name) ? activeColor : fillColor
      context.arc(mirroredX, point.y, labelledPosePoints.has(name) ? 5.8 : 4.1, 0, Math.PI * 2)
      context.fill()

      context.lineWidth = 1
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      context.stroke()

      if (labelledPosePoints.has(name)) {
        context.font = '600 10px Aptos, "IBM Plex Sans", sans-serif'
        context.lineWidth = 3
        context.strokeStyle = 'rgba(12, 18, 26, 0.88)'
        context.strokeText(name, mirroredX + 8, point.y - 8)
        context.fillStyle = '#f3f8fd'
        context.fillText(name, mirroredX + 8, point.y - 8)
      }
    })
  }
}
