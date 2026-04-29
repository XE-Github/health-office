type InputImage = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement
type PoseResultsListener = (results: unknown) => void

type PoseInstance = {
  close(): Promise<void>
  initialize(): Promise<void>
  onResults(listener: PoseResultsListener): void
  reset(): void
  send(inputs: { image: InputImage }, at?: number): Promise<void>
  setOptions(options: Record<string, unknown>): void
}

type PoseConstructor = new (config?: {
  locateFile?: (path: string, prefix?: string) => string
}) => PoseInstance

type PoseScope = typeof globalThis & {
  POSE_CONNECTIONS?: Array<[number, number]>
  POSE_LANDMARKS?: Record<string, number>
  POSE_LANDMARKS_LEFT?: Record<string, number>
  POSE_LANDMARKS_NEUTRAL?: Record<string, number>
  POSE_LANDMARKS_RIGHT?: Record<string, number>
  Pose?: PoseConstructor
  VERSION?: string
}

const scope = globalThis as PoseScope
const scriptId = 'mediapipe-pose-runtime'
let runtimePromise: Promise<PoseConstructor> | null = null

function loadRuntime() {
  if (scope.Pose) {
    return Promise.resolve(scope.Pose)
  }

  if (runtimePromise) {
    return runtimePromise
  }

  runtimePromise = new Promise<PoseConstructor>((resolve, reject) => {
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null

    const handleReady = () => {
      if (!scope.Pose) {
        reject(new Error('MediaPipe Pose runtime loaded, but Pose is unavailable.'))
        return
      }

      resolve(scope.Pose)
    }

    if (existing) {
      if (scope.Pose) {
        resolve(scope.Pose)
        return
      }

      existing.addEventListener('load', handleReady, { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load MediaPipe Pose runtime.')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = '/mediapipe/pose/pose.js'
    script.addEventListener('load', handleReady, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Failed to load MediaPipe Pose runtime.')),
      { once: true },
    )
    document.head.appendChild(script)
  }).catch((error) => {
    runtimePromise = null
    throw error
  })

  return runtimePromise
}

export class Pose implements PoseInstance {
  private instancePromise: Promise<PoseInstance>
  private pendingOptions: Record<string, unknown> | null = null
  private resultsListener: PoseResultsListener | null = null

  constructor(config?: { locateFile?: (path: string, prefix?: string) => string }) {
    this.instancePromise = loadRuntime().then((Ctor) => {
      const instance = new Ctor(config)

      if (this.pendingOptions) {
        instance.setOptions(this.pendingOptions)
      }

      if (this.resultsListener) {
        instance.onResults(this.resultsListener)
      }

      return instance
    })
  }

  close() {
    return this.instancePromise.then((instance) => instance.close())
  }

  initialize() {
    return this.instancePromise.then((instance) => instance.initialize())
  }

  onResults(listener: PoseResultsListener) {
    this.resultsListener = listener
    void this.instancePromise.then((instance) => {
      instance.onResults(listener)
    })
  }

  reset() {
    void this.instancePromise.then((instance) => {
      instance.reset()
    })
  }

  send(inputs: { image: InputImage }, at?: number) {
    return this.instancePromise.then((instance) => instance.send(inputs, at))
  }

  setOptions(options: Record<string, unknown>) {
    this.pendingOptions = {
      ...this.pendingOptions,
      ...options,
    }

    void this.instancePromise.then((instance) => {
      instance.setOptions(options)
    })
  }
}

export const POSE_CONNECTIONS = scope.POSE_CONNECTIONS ?? []
export const POSE_LANDMARKS = scope.POSE_LANDMARKS ?? {}
export const POSE_LANDMARKS_LEFT = scope.POSE_LANDMARKS_LEFT ?? {}
export const POSE_LANDMARKS_RIGHT = scope.POSE_LANDMARKS_RIGHT ?? {}
export const POSE_LANDMARKS_NEUTRAL = scope.POSE_LANDMARKS_NEUTRAL ?? {}
export const VERSION = scope.VERSION ?? '0.0.0'
