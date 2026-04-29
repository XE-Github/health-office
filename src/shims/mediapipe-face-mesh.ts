type InputImage = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement
type LandmarkConnectionArray = Array<[number, number]>

type FaceMeshResultsListener = (results: unknown) => void

type FaceMeshInstance = {
  close(): Promise<void>
  initialize(): Promise<void>
  onResults(listener: FaceMeshResultsListener): void
  reset(): void
  send(inputs: { image: InputImage }, at?: number): Promise<void>
  setOptions(options: Record<string, unknown>): void
}

type FaceMeshConstructor = new (config?: {
  locateFile?: (path: string, prefix?: string) => string
}) => FaceMeshInstance

type FaceMeshScope = typeof globalThis & {
  FACE_GEOMETRY?: Record<string, unknown>
  FACEMESH_CONTOURS?: LandmarkConnectionArray
  FACEMESH_FACE_OVAL?: LandmarkConnectionArray
  FACEMESH_LEFT_EYE?: LandmarkConnectionArray
  FACEMESH_LEFT_EYEBROW?: LandmarkConnectionArray
  FACEMESH_LEFT_IRIS?: LandmarkConnectionArray
  FACEMESH_LIPS?: LandmarkConnectionArray
  FACEMESH_RIGHT_EYE?: LandmarkConnectionArray
  FACEMESH_RIGHT_EYEBROW?: LandmarkConnectionArray
  FACEMESH_RIGHT_IRIS?: LandmarkConnectionArray
  FACEMESH_TESSELATION?: LandmarkConnectionArray
  FaceMesh?: FaceMeshConstructor
  VERSION?: string
}

const scope = globalThis as FaceMeshScope
const scriptId = 'mediapipe-face-mesh-runtime'
let runtimePromise: Promise<FaceMeshConstructor> | null = null

function loadRuntime() {
  if (scope.FaceMesh) {
    return Promise.resolve(scope.FaceMesh)
  }

  if (runtimePromise) {
    return runtimePromise
  }

  runtimePromise = new Promise<FaceMeshConstructor>((resolve, reject) => {
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null

    const handleReady = () => {
      if (!scope.FaceMesh) {
        reject(new Error('MediaPipe Face Mesh runtime loaded, but FaceMesh is unavailable.'))
        return
      }

      resolve(scope.FaceMesh)
    }

    if (existing) {
      if (scope.FaceMesh) {
        resolve(scope.FaceMesh)
        return
      }

      existing.addEventListener('load', handleReady, { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load MediaPipe Face Mesh runtime.')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = '/mediapipe/face_mesh/face_mesh.js'
    script.addEventListener('load', handleReady, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Failed to load MediaPipe Face Mesh runtime.')),
      { once: true },
    )
    document.head.appendChild(script)
  }).catch((error) => {
    runtimePromise = null
    throw error
  })

  return runtimePromise
}

export class FaceMesh implements FaceMeshInstance {
  private instancePromise: Promise<FaceMeshInstance>
  private pendingOptions: Record<string, unknown> | null = null
  private resultsListener: FaceMeshResultsListener | null = null

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

  onResults(listener: FaceMeshResultsListener) {
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

export const FACE_GEOMETRY = scope.FACE_GEOMETRY ?? {}
export const FACEMESH_LIPS = scope.FACEMESH_LIPS ?? []
export const FACEMESH_LEFT_EYE = scope.FACEMESH_LEFT_EYE ?? []
export const FACEMESH_LEFT_EYEBROW = scope.FACEMESH_LEFT_EYEBROW ?? []
export const FACEMESH_LEFT_IRIS = scope.FACEMESH_LEFT_IRIS ?? []
export const FACEMESH_RIGHT_EYE = scope.FACEMESH_RIGHT_EYE ?? []
export const FACEMESH_RIGHT_EYEBROW = scope.FACEMESH_RIGHT_EYEBROW ?? []
export const FACEMESH_RIGHT_IRIS = scope.FACEMESH_RIGHT_IRIS ?? []
export const FACEMESH_FACE_OVAL = scope.FACEMESH_FACE_OVAL ?? []
export const FACEMESH_CONTOURS = scope.FACEMESH_CONTOURS ?? []
export const FACEMESH_TESSELATION = scope.FACEMESH_TESSELATION ?? []
export const VERSION = scope.VERSION ?? '0.0.0'
