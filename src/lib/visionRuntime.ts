export type FaceLandmarksModule = typeof import('@tensorflow-models/face-landmarks-detection')
export type PoseDetectionModule = typeof import('@tensorflow-models/pose-detection')

export interface VisionRuntime {
  faceContours: Record<string, number[]>
  faceLandmarksDetection: FaceLandmarksModule
  poseDetection: PoseDetectionModule
  posePairs: Array<[number, number]>
}

export type TfjsBackendLabel = 'webgl' | 'cpu' | string

let runtimePromise: Promise<VisionRuntime> | null = null
let tfjsBackendPromise: Promise<TfjsBackendLabel> | null = null

export async function getVisionRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const [faceLandmarksDetectionModule, poseDetectionModule] = await Promise.all([
        import('@tensorflow-models/face-landmarks-detection'),
        import('@tensorflow-models/pose-detection'),
      ])

      return {
        faceContours: faceLandmarksDetectionModule.util.getKeypointIndexByContour(
          faceLandmarksDetectionModule.SupportedModels.MediaPipeFaceMesh,
        ) as Record<string, number[]>,
        faceLandmarksDetection: faceLandmarksDetectionModule,
        poseDetection: poseDetectionModule,
        posePairs: poseDetectionModule.util.getAdjacentPairs(
          poseDetectionModule.SupportedModels.BlazePose,
        ) as Array<[number, number]>,
      }
    })().catch((error: unknown) => {
      runtimePromise = null
      throw error
    })
  }

  return runtimePromise
}

export async function ensureTfjsBackend() {
  if (!tfjsBackendPromise) {
    tfjsBackendPromise = (async () => {
      const tf = await import('@tensorflow/tfjs-core')

      await Promise.all([
        import('@tensorflow/tfjs-backend-webgl'),
        import('@tensorflow/tfjs-backend-cpu'),
      ])

      const backendOrder: TfjsBackendLabel[] = ['webgl', 'cpu']

      for (const backend of backendOrder) {
        try {
          const applied = await tf.setBackend(backend)

          if (applied) {
            await tf.ready()
            return backend
          }
        } catch (error) {
          console.warn(`Failed to activate TFJS backend "${backend}".`, error)
        }
      }

      await tf.ready()
      return tf.getBackend()
    })().catch((error: unknown) => {
      tfjsBackendPromise = null
      throw error
    })
  }

  return tfjsBackendPromise
}
