import { ensureTfjsBackend, getVisionRuntime } from './visionRuntime'
import type {
  DualDetectors,
  FaceContourMap,
} from './poseMonitorTypes'

let detectorsPromise: Promise<DualDetectors> | null = null

export function resetDetectors() {
  detectorsPromise = null
}

export async function getDetectors() {
  if (!detectorsPromise) {
    detectorsPromise = (async () => {
      const { faceContours, faceLandmarksDetection, poseDetection, posePairs } =
        await getVisionRuntime()

      try {
        // MediaPipe solutions reuse shared global runtime names internally,
        // so loading Face Mesh and BlazePose in parallel can race and corrupt init.
        const faceDetector = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: 'mediapipe',
            maxFaces: 1,
            refineLandmarks: true,
            solutionPath: '/mediapipe/face_mesh',
          },
        )
        const poseDetector = await poseDetection.createDetector(
          poseDetection.SupportedModels.BlazePose,
          {
            runtime: 'mediapipe',
            enableSmoothing: true,
            modelType: 'full',
            solutionPath: '/mediapipe/pose',
          },
        )

        return {
          faceContours: faceContours as FaceContourMap,
          faceDetector,
          poseDetector,
          posePairs,
          runtimeLabel: 'MediaPipe',
        }
      } catch (mediapipeError) {
        console.warn(
          'MediaPipe detector init failed, falling back to TFJS runtime.',
          mediapipeError,
        )

        const backend = await ensureTfjsBackend()
        const faceDetector = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: 'tfjs',
            maxFaces: 1,
            refineLandmarks: true,
          },
        )
        const poseDetector = await poseDetection.createDetector(
          poseDetection.SupportedModels.BlazePose,
          {
            runtime: 'tfjs',
            enableSmoothing: true,
            modelType: 'full',
          },
        )

        return {
          faceContours: faceContours as FaceContourMap,
          faceDetector,
          poseDetector,
          posePairs,
          runtimeLabel: `TFJS ${backend.toUpperCase()}`,
        }
      }
    })().catch((error: unknown) => {
      resetDetectors()
      throw error
    })
  }

  return detectorsPromise
}
