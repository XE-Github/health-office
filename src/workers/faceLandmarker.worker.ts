import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision'

const workerSelf = self as typeof self & {
  custom_dbg?: (...data: unknown[]) => void
  import?: (url: string) => Promise<unknown>
  ModuleFactory?: unknown
}

workerSelf.custom_dbg ??= (...data: unknown[]) => {
  console.warn(...data)
}

workerSelf.import ??= (url: string) => {
  const normalizedUrl = url.replace(/\?import$/, '')
  const dynamicImport = new Function('url', 'return import(url)') as (
    url: string,
  ) => Promise<unknown>

  return dynamicImport(normalizedUrl).then((module) => {
    if (
      module &&
      typeof module === 'object' &&
      'default' in module &&
      typeof module.default === 'function'
    ) {
      workerSelf.ModuleFactory = module.default
    }

    return module
  })
}

type FaceScreenAlignmentStatus = 'in-range' | 'edge' | 'out-of-range' | 'undetected'
type FaceScreenHorizontal = 'left' | 'center' | 'right'
type FaceScreenVertical = 'up' | 'level' | 'down'

interface WorkerFaceScreenAlignment {
  detector: 'face-landmarker'
  horizontal: FaceScreenHorizontal
  horizontalOffset: number
  pitchDeg: number
  pitchProxy: number
  quality: number
  reason: 'none' | 'face-off-center' | 'face-angle' | 'face-roll' | 'face-missing'
  rollDeg: number
  status: FaceScreenAlignmentStatus
  vertical: FaceScreenVertical
  verticalOffset: number
  yawDeg: number
  yawProxy: number
}

type WorkerRequest =
  | {
      bitmap: ImageBitmap
      id: number
      timestampMs: number
      type: 'detect'
    }

type WorkerResponse =
  | {
      alignment: WorkerFaceScreenAlignment | null
      id: number
      ok: true
    }
  | {
      error: string
      id: number
      ok: false
    }

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null

function getFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const visionFileset = await FilesetResolver.forVisionTasks(
        '/mediapipe/tasks-vision/wasm',
        true,
      )

      return FaceLandmarker.createFromOptions(visionFileset, {
        baseOptions: {
          delegate: 'CPU',
          modelAssetPath: '/mediapipe/face_landmarker/face_landmarker.task',
        },
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
      })
    })().catch((error: unknown) => {
      faceLandmarkerPromise = null
      throw error
    })
  }

  return faceLandmarkerPromise
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeAngleDeg(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

function extractEulerFromMatrix(matrixData: number[]) {
  if (matrixData.length < 16) {
    return null
  }

  const m00 = matrixData[0]
  const m10 = matrixData[4]
  const m11 = matrixData[5]
  const m12 = matrixData[6]
  const m20 = matrixData[8]
  const m21 = matrixData[9]
  const m22 = matrixData[10]
  const sy = Math.hypot(m00, m10)
  const singular = sy < 1e-6
  const pitch = singular ? Math.atan2(-m12, m11) : Math.atan2(m21, m22)
  const yaw = Math.atan2(-m20, sy)
  const roll = singular ? 0 : Math.atan2(m10, m00)

  return {
    pitchDeg: normalizeAngleDeg(pitch * (180 / Math.PI)),
    rollDeg: normalizeAngleDeg(roll * (180 / Math.PI)),
    yawDeg: normalizeAngleDeg(yaw * (180 / Math.PI)),
  }
}

function estimateFaceScreenAlignment(
  result: FaceLandmarkerResult | null,
): WorkerFaceScreenAlignment | null {
  const landmarks = result?.faceLandmarks[0]
  const matrix = result?.facialTransformationMatrixes[0]

  if (!landmarks || landmarks.length < 478 || !matrix) {
    return null
  }

  const xValues = landmarks.map((point) => point.x)
  const yValues = landmarks.map((point) => point.y)
  const faceCenterX = (Math.min(...xValues) + Math.max(...xValues)) / 2
  const faceCenterY = (Math.min(...yValues) + Math.max(...yValues)) / 2
  const horizontalOffset = (faceCenterX - 0.5) * 2
  const verticalOffset = (faceCenterY - 0.5) * 2
  const euler = extractEulerFromMatrix(matrix.data)

  if (!euler) {
    return null
  }

  const yawAbs = Math.abs(euler.yawDeg)
  const pitchAbs = Math.abs(euler.pitchDeg)
  const rollAbs = Math.abs(euler.rollDeg)
  const offsetScore = Math.max(Math.abs(horizontalOffset), Math.abs(verticalOffset))
  const status: FaceScreenAlignmentStatus =
    offsetScore > 0.72 || yawAbs > 50 || pitchAbs > 38 || rollAbs > 42
      ? 'out-of-range'
      : offsetScore > 0.52 || yawAbs > 34 || pitchAbs > 28 || rollAbs > 32
        ? 'edge'
        : 'in-range'
  const reason: WorkerFaceScreenAlignment['reason'] =
    status === 'out-of-range' || status === 'edge'
      ? offsetScore > 0.52
        ? 'face-off-center'
        : yawAbs > 34 || pitchAbs > 28
          ? 'face-angle'
          : rollAbs > 32
            ? 'face-roll'
            : 'none'
      : 'none'

  return {
    detector: 'face-landmarker',
    horizontal:
      horizontalOffset < -0.18 ? 'left' : horizontalOffset > 0.18 ? 'right' : 'center',
    horizontalOffset,
    pitchDeg: euler.pitchDeg,
    pitchProxy: pitchAbs / 90,
    quality: clampNumber(
      1 -
        Math.max(
          offsetScore / 0.72,
          yawAbs / 50,
          pitchAbs / 38,
          rollAbs / 42,
        ),
      0,
      1,
    ),
    reason,
    rollDeg: euler.rollDeg,
    status,
    vertical: verticalOffset < -0.18 ? 'up' : verticalOffset > 0.18 ? 'down' : 'level',
    verticalOffset,
    yawDeg: euler.yawDeg,
    yawProxy: yawAbs / 90,
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  if (request.type !== 'detect') {
    return
  }

  void (async () => {
    try {
      const faceLandmarker = await getFaceLandmarker()
      const result = faceLandmarker.detectForVideo(request.bitmap, request.timestampMs)
      request.bitmap.close()

      const response: WorkerResponse = {
        alignment: estimateFaceScreenAlignment(result),
        id: request.id,
        ok: true,
      }

      self.postMessage(response)
    } catch (error) {
      request.bitmap.close()

      const response: WorkerResponse = {
        error: error instanceof Error ? error.message : String(error),
        id: request.id,
        ok: false,
      }

      self.postMessage(response)
    }
  })()
}
