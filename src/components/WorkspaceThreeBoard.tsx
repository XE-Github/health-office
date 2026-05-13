import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three'
import type { WorkspaceLayoutConfig, WorkspaceScreenConfig } from '../lib/workspaceConfig'
import type { WorkspaceLayoutProfile } from '../lib/workspaceLayoutProfiles'
import { formatWorkspaceLayoutProfileSummary } from '../lib/workspaceLayoutProfiles'
import {
  createWorkspaceScreenRectPatch,
  createWorkspaceScreenSizePatch,
  getWorkspaceScreenInchesFromSize,
  workspaceBoardBounds,
  workspaceDepthBounds,
  workspaceScreenCountLimit,
  workspaceScreenInchLimits,
  workspaceScreenLimits,
} from '../lib/workspaceConfig'

export type WorkspaceSceneView = {
  pitch: number
  yaw: number
}

export type WorkspaceScreenCalibrationVisual = {
  className: string
  label: string
  status: 'empty' | 'partial' | 'ready' | 'sampling'
}

type WorkspaceThreeBoardProps = {
  activeLayoutProfileId: string | null
  canAddScreen: boolean
  canUpdateLayoutProfile: boolean
  currentWorkspaceStatusLabel: string
  isLayoutProfileDirty: boolean
  layout: WorkspaceLayoutConfig
  layoutProfileCreateLabel: string
  layoutProfiles: WorkspaceLayoutProfile[]
  layoutProfileUpdateLabel: string
  onAddScreen: () => void
  onApplyLayoutProfile: (profileId: string) => void
  onCalibrateScreen: (screenId: string) => void
  onCreateLayoutProfile: () => void
  onDeleteLayoutProfile: (profileId: string) => void
  onDeleteScreen: (screenId: string) => void
  onExportLayoutProfile: (profileId: string) => void
  onImportLayoutProfile: (file: File) => void
  onResetView: () => void
  onSelectScreen: (screenId: string) => void
  onSetCameraScreen: (screenId: string) => void
  onUpdateLayoutProfile: () => void
  onUpdateScreen: (screenId: string, patch: Partial<WorkspaceScreenConfig>) => void
  onViewChange: (view: WorkspaceSceneView) => void
  screenStates: Record<string, WorkspaceScreenCalibrationVisual>
  selectedScreenCalibrationDetails: string[]
  selectedScreenCalibrationHint: string
  selectedScreenCalibrationLabel: string
  selectedScreenId: string
  view: WorkspaceSceneView
}

type DragState = {
  offset: Vector3
  plane: Plane
  pointerId: number
  screenId: string
}

type ControlDragMode = 'depth' | 'pitch' | 'resize' | 'yaw'

type ControlDragState = {
  mode: ControlDragMode
  originDepth: number
  originHeight: number
  originPitchDeg: number
  originWidth: number
  originYawDeg: number
  pointerId: number
  screenId: string
  startX: number
  startY: number
}

type ViewDragState = {
  originPitch: number
  originYaw: number
  pointerId: number
  startX: number
  startY: number
}

type NumericEditorField =
  | 'depth'
  | 'diagonalInches'
  | 'height'
  | 'pitchDeg'
  | 'width'
  | 'x'
  | 'y'
  | 'yawDeg'

type RuntimeProps = WorkspaceThreeBoardProps

type ThreeRuntime = {
  camera: PerspectiveCamera
  pickTargets: Mesh[]
  previewGroup: Group
  renderer: WebGLRenderer
  scene: Scene
  screenGroup: Group
}

const boardBounds = workspaceBoardBounds

const spaceBox = {
  depth: 840,
  height: 660,
  width: 1080,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step
}

function removeSignedZero(value: number) {
  return Object.is(value, -0) ? 0 : value
}

function getScreenSpacePosition(screen: WorkspaceScreenConfig) {
  return {
    x: removeSignedZero(Math.round(screen.x + screen.width / 2 - boardBounds.width / 2)),
    y: removeSignedZero(Math.round(boardBounds.height / 2 - (screen.y + screen.height / 2))),
    z: removeSignedZero(Math.round(screen.depth)),
  }
}

function createScreenSpacePatch(
  screen: WorkspaceScreenConfig,
  field: 'depth' | 'x' | 'y',
  value: number,
) {
  if (field === 'depth') {
    return {
      depth: Math.round(value),
    }
  }

  if (field === 'x') {
    return {
      x: boardBounds.width / 2 + value - screen.width / 2,
    }
  }

  return {
    y: boardBounds.height / 2 - value - screen.height / 2,
  }
}

function screenToWorld(screen: WorkspaceScreenConfig) {
  return new Vector3(
    boardBounds.width / 2 - (screen.x + screen.width / 2),
    boardBounds.height / 2 - (screen.y + screen.height / 2),
    screen.depth,
  )
}

function worldToScreenPatch(worldPosition: Vector3, screen: WorkspaceScreenConfig) {
  return {
    depth: clamp(
      roundToStep(worldPosition.z, 5),
      workspaceDepthBounds.near,
      workspaceDepthBounds.far,
    ),
    x: clamp(
      Math.round(boardBounds.width / 2 - worldPosition.x - screen.width / 2),
      28,
      boardBounds.width - screen.width - 28,
    ),
    y: clamp(
      Math.round(boardBounds.height / 2 - worldPosition.y - screen.height / 2),
      28,
      boardBounds.height - screen.height - 28,
    ),
  }
}

function createGridPlane(width: number, height: number, xSteps: number, ySteps: number, opacity: number) {
  const points: number[] = []

  for (let index = 0; index <= xSteps; index += 1) {
    const x = -width / 2 + (width * index) / xSteps
    points.push(x, -height / 2, 0, x, height / 2, 0)
  }

  for (let index = 0; index <= ySteps; index += 1) {
    const y = -height / 2 + (height * index) / ySteps
    points.push(-width / 2, y, 0, width / 2, y, 0)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))

  return new LineSegments(
    geometry,
    new LineBasicMaterial({
      color: 0x6b8f7d,
      depthWrite: false,
      opacity,
      transparent: true,
    }),
  )
}

function createTextTexture(
  title: string | string[],
  options?: {
    aspectRatio?: number
    backgroundColor?: string
    borderColor?: string
    textColor?: string
  },
) {
  const canvas = document.createElement('canvas')
  const aspectRatio = options?.aspectRatio && Number.isFinite(options.aspectRatio)
    ? clamp(options.aspectRatio, 0.25, 4)
    : 16 / 9
  const textureHeight = 512
  const textureWidth = Math.round(textureHeight * aspectRatio)
  canvas.width = textureWidth
  canvas.height = textureHeight
  const context = canvas.getContext('2d')

  if (!context) {
    return new CanvasTexture(canvas)
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = options?.backgroundColor ?? '#f7fafc'
  context.strokeStyle = options?.borderColor ?? '#cbd7e1'
  context.lineWidth = Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * 0.025))
  const padding = Math.max(24, Math.round(Math.min(canvas.width, canvas.height) * 0.08))
  const radius = Math.max(28, Math.round(Math.min(canvas.width, canvas.height) * 0.12))
  context.beginPath()
  context.roundRect(
    padding,
    padding,
    canvas.width - padding * 2,
    canvas.height - padding * 2,
    radius,
  )
  context.fill()
  context.stroke()

  context.fillStyle = options?.textColor ?? '#162433'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const resolvedLines = (Array.isArray(title) ? title : [title])
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
  const resolvedTitle = resolvedLines[0] ?? ''
  const resolvedSubtitle = resolvedLines[1] ?? ''
  const maxTextWidth = Math.max(24, canvas.width - padding * 2.8)
  const maxFontSize = Math.max(42, Math.min(118, Math.round(canvas.height * 0.24)))
  const minFontSize = 34
  let fontSize = maxFontSize

  while (fontSize > minFontSize) {
    context.font = `bold ${fontSize}px sans-serif`

    if (context.measureText(resolvedTitle).width <= maxTextWidth) {
      break
    }

    fontSize -= 4
  }

  context.font = `bold ${fontSize}px sans-serif`

  if (resolvedSubtitle) {
    const subtitleFontSize = Math.max(24, Math.round(fontSize * 0.5))
    context.fillText(resolvedTitle, canvas.width / 2, canvas.height * 0.44)
    context.font = `bold ${subtitleFontSize}px sans-serif`
    context.fillStyle = options?.textColor ?? '#425567'
    context.fillText(resolvedSubtitle, canvas.width / 2, canvas.height * 0.62)
  } else {
    context.fillText(resolvedTitle, canvas.width / 2, canvas.height / 2)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function createTextSprite(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'rgba(255, 255, 255, 0.88)'
    context.beginPath()
    context.roundRect(12, 22, canvas.width - 24, 84, 42)
    context.fill()
    context.fillStyle = '#425567'
    context.font = 'bold 42px sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const sprite = new Sprite(
    new SpriteMaterial({
      depthTest: true,
      map: texture,
      transparent: true,
    }),
  )
  sprite.scale.set(150, 38, 1)
  return sprite
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    if (child instanceof Mesh || child instanceof LineSegments || child instanceof Sprite) {
      if (child instanceof Mesh || child instanceof LineSegments) {
        child.geometry.dispose()
      }

      const material = child.material
      const materials = Array.isArray(material) ? material : [material]

      materials.forEach((item) => {
        const mappedMaterial = item as Material & { map?: Texture | null }
        mappedMaterial.map?.dispose()
        item.dispose()
      })
    }
  })
}

function createSpaceBoxGroup() {
  const group = new Group()
  const boxEdges = new LineSegments(
    new EdgesGeometry(new BoxGeometry(spaceBox.width, spaceBox.height, spaceBox.depth)),
    new LineBasicMaterial({
      color: 0x5d786d,
      opacity: 0.5,
      transparent: true,
    }),
  )
  group.add(boxEdges)

  const front = createGridPlane(spaceBox.width, spaceBox.height, 18, 11, 0.32)
  front.position.z = -spaceBox.depth / 2
  group.add(front)

  const back = createGridPlane(spaceBox.width, spaceBox.height, 18, 11, 0.48)
  back.position.z = spaceBox.depth / 2
  group.add(back)

  const floor = createGridPlane(spaceBox.width, spaceBox.depth, 18, 12, 0.5)
  floor.rotation.x = Math.PI / 2
  floor.position.y = -spaceBox.height / 2
  group.add(floor)

  const ceiling = createGridPlane(spaceBox.width, spaceBox.depth, 18, 12, 0.22)
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = spaceBox.height / 2
  group.add(ceiling)

  const left = createGridPlane(spaceBox.depth, spaceBox.height, 12, 11, 0.28)
  left.rotation.y = Math.PI / 2
  left.position.x = -spaceBox.width / 2
  group.add(left)

  const right = createGridPlane(spaceBox.depth, spaceBox.height, 12, 11, 0.28)
  right.rotation.y = Math.PI / 2
  right.position.x = spaceBox.width / 2
  group.add(right)

  const nearLabel = createTextSprite('靠近用户 -Z')
  nearLabel.position.set(0, -spaceBox.height / 2 - 26, -spaceBox.depth / 2)
  group.add(nearLabel)

  const farLabel = createTextSprite('远离用户 +Z')
  farLabel.position.set(0, spaceBox.height / 2 + 26, spaceBox.depth / 2)
  group.add(farLabel)

  return group
}

function updateCamera(camera: PerspectiveCamera, view: WorkspaceSceneView) {
  const radius = 1450
  const yaw = MathUtils.degToRad(view.yaw)
  const pitch = MathUtils.degToRad(view.pitch)
  const cosPitch = Math.cos(pitch)

  camera.position.set(
    Math.sin(yaw) * cosPitch * radius,
    Math.sin(pitch) * radius,
    -Math.cos(yaw) * cosPitch * radius,
  )
  camera.up.set(0, 1, 0)
  camera.lookAt(0, 0, 0)
}

function getPointerNdc(event: PointerEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()

  return new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
}

function getDepthGestureDelta(deltaX: number, deltaY: number, viewYaw: number) {
  const sideStrength = Math.abs(Math.sin(MathUtils.degToRad(viewYaw)))

  if (sideStrength > 0.55) {
    return deltaX * (Math.sign(Math.sin(MathUtils.degToRad(viewYaw))) || 1)
  }

  return -deltaY
}

function getScreenCalibrationPalette(stateClassName?: string) {
  switch (stateClassName) {
    case 'is-ready':
      return {
        backgroundColor: '#e4f3ea',
        borderColor: '#6d987f',
      }
    case 'is-sampling':
      return {
        backgroundColor: '#fff2de',
        borderColor: '#c58b34',
      }
    case 'is-partial':
      return {
        backgroundColor: '#f2efff',
        borderColor: '#8a7ec4',
      }
    default:
      return {
        backgroundColor: '#fdecee',
        borderColor: '#c97a88',
      }
  }
}

function getLayoutPreviewPalette() {
  return {
    backgroundColor: '#edf4ff',
    borderColor: '#7f99c9',
  }
}

function getWorkspaceStatusTone(statusLabel: string) {
  if (statusLabel.includes('未进入可靠范围') || statusLabel.includes('未识别')) {
    return 'is-warning'
  }

  if (statusLabel.includes('切换')) {
    return 'is-transition'
  }

  return 'is-active'
}

export function WorkspaceThreeBoard({
  activeLayoutProfileId,
  canAddScreen,
  canUpdateLayoutProfile,
  currentWorkspaceStatusLabel,
  isLayoutProfileDirty,
  layout,
  layoutProfileCreateLabel,
  layoutProfiles,
  layoutProfileUpdateLabel,
  onAddScreen,
  onApplyLayoutProfile,
  onCalibrateScreen,
  onCreateLayoutProfile,
  onDeleteLayoutProfile,
  onDeleteScreen,
  onExportLayoutProfile,
  onImportLayoutProfile,
  onResetView,
  onSelectScreen,
  onSetCameraScreen,
  onUpdateLayoutProfile,
  onUpdateScreen,
  onViewChange,
  screenStates,
  selectedScreenCalibrationDetails,
  selectedScreenCalibrationHint,
  selectedScreenCalibrationLabel,
  selectedScreenId,
  view,
}: WorkspaceThreeBoardProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const runtimeRef = useRef<ThreeRuntime | null>(null)
  const propsRef = useRef<RuntimeProps>({
    activeLayoutProfileId,
    canAddScreen,
    canUpdateLayoutProfile,
    currentWorkspaceStatusLabel,
    isLayoutProfileDirty,
    layout,
    layoutProfileCreateLabel,
    layoutProfiles,
    layoutProfileUpdateLabel,
    onAddScreen,
    onApplyLayoutProfile,
    onCalibrateScreen,
    onCreateLayoutProfile,
    onDeleteLayoutProfile,
    onDeleteScreen,
    onExportLayoutProfile,
    onImportLayoutProfile,
    onResetView,
    onSelectScreen,
    onSetCameraScreen,
    onUpdateLayoutProfile,
    onUpdateScreen,
    onViewChange,
    screenStates,
    selectedScreenCalibrationDetails,
    selectedScreenCalibrationHint,
    selectedScreenCalibrationLabel,
    selectedScreenId,
    view,
  })
  const dragRef = useRef<DragState | null>(null)
  const viewDragRef = useRef<ViewDragState | null>(null)
  const controlDragRef = useRef<ControlDragState | null>(null)
  const [hoveredLayoutProfileId, setHoveredLayoutProfileId] = useState<string | null>(null)
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>({})
  const selectedScreen =
    layout.screens.find((screen) => screen.id === selectedScreenId) ?? layout.screens[0] ?? null
  const canDeleteSelectedScreen = layout.screens.length > 1 && Boolean(selectedScreen)
  const canResetView = Math.abs(view.pitch) > 0.01 || Math.abs(view.yaw) > 0.01
  const selectedScreenState = selectedScreen ? screenStates[selectedScreen.id] : null
  const selectedScreenSpacePosition = selectedScreen
    ? getScreenSpacePosition(selectedScreen)
    : null
  const currentWorkspaceStatusTone = getWorkspaceStatusTone(currentWorkspaceStatusLabel)
  const hoveredLayoutProfile =
    hoveredLayoutProfileId === null
      ? null
      : layoutProfiles.find((profile) => profile.id === hoveredLayoutProfileId) ?? null

  useEffect(() => {
    propsRef.current = {
      activeLayoutProfileId,
      canAddScreen,
      canUpdateLayoutProfile,
      currentWorkspaceStatusLabel,
      isLayoutProfileDirty,
      layout,
      layoutProfileCreateLabel,
      layoutProfiles,
      layoutProfileUpdateLabel,
      onAddScreen,
      onApplyLayoutProfile,
      onCalibrateScreen,
      onCreateLayoutProfile,
      onDeleteLayoutProfile,
      onDeleteScreen,
      onExportLayoutProfile,
      onImportLayoutProfile,
      onResetView,
      onSelectScreen,
      onSetCameraScreen,
      onUpdateLayoutProfile,
      onUpdateScreen,
      onViewChange,
      screenStates,
      selectedScreenCalibrationDetails,
      selectedScreenCalibrationHint,
      selectedScreenCalibrationLabel,
      selectedScreenId,
      view,
    }
  }, [
    activeLayoutProfileId,
    canAddScreen,
    canUpdateLayoutProfile,
    currentWorkspaceStatusLabel,
    isLayoutProfileDirty,
    layout,
    layoutProfileCreateLabel,
    layoutProfiles,
    layoutProfileUpdateLabel,
    onAddScreen,
    onApplyLayoutProfile,
    onCalibrateScreen,
    onCreateLayoutProfile,
    onDeleteLayoutProfile,
    onDeleteScreen,
    onExportLayoutProfile,
    onImportLayoutProfile,
    onResetView,
    onSelectScreen,
    onSetCameraScreen,
    onUpdateLayoutProfile,
    onUpdateScreen,
    onViewChange,
    screenStates,
    selectedScreenCalibrationDetails,
    selectedScreenCalibrationHint,
    selectedScreenCalibrationLabel,
    selectedScreenId,
    view,
  ])

  useEffect(() => {
    const host = canvasHostRef.current

    if (!host) {
      return
    }

    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
    })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.className = 'workspace-three-canvas'
    renderer.domElement.dataset.smoke = 'workspace-three-canvas'
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new PerspectiveCamera(42, 1, 1, 3000)
    const previewGroup = new Group()
    const screenGroup = new Group()
    scene.add(createSpaceBoxGroup())
    scene.add(previewGroup)
    scene.add(screenGroup)

    const runtime: ThreeRuntime = {
      camera,
      pickTargets: [],
      previewGroup,
      renderer,
      scene,
      screenGroup,
    }
    runtimeRef.current = runtime

    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const intersection = new Vector3()

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    const getScreenHit = (event: PointerEvent) => {
      pointer.copy(getPointerNdc(event, renderer.domElement))
      raycaster.setFromCamera(pointer, camera)
      return raycaster.intersectObjects(runtime.pickTargets, false)[0] ?? null
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }

      const hit = getScreenHit(event)

      if (!hit) {
        return
      }

      const screenId = hit.object.userData.screenId as string | undefined
      const screen = propsRef.current.layout.screens.find((item) => item.id === screenId)

      if (!screenId || !screen) {
        return
      }

      event.preventDefault()
      renderer.domElement.setPointerCapture(event.pointerId)
      propsRef.current.onSelectScreen(screenId)

      const screenWorld = screenToWorld(screen)
      const planeNormal = camera.getWorldDirection(new Vector3()).normalize()
      const plane = new Plane().setFromNormalAndCoplanarPoint(planeNormal, screenWorld)
      raycaster.ray.intersectPlane(plane, intersection)

      dragRef.current = {
        offset: screenWorld.clone().sub(intersection),
        plane,
        pointerId: event.pointerId,
        screenId,
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragRef.current

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      const screen = propsRef.current.layout.screens.find((item) => item.id === dragState.screenId)

      if (!screen) {
        return
      }

      event.preventDefault()
      pointer.copy(getPointerNdc(event, renderer.domElement))
      raycaster.setFromCamera(pointer, camera)

      if (!raycaster.ray.intersectPlane(dragState.plane, intersection)) {
        return
      }

      propsRef.current.onUpdateScreen(
        dragState.screenId,
        worldToScreenPatch(intersection.clone().add(dragState.offset), screen),
      )
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
        return
      }

      renderer.domElement.releasePointerCapture(event.pointerId)
      dragRef.current = null
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointercancel', handlePointerUp)

    let animationFrame = 0
    const render = () => {
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(render)
    }
    render()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp)
      disposeObject(scene)
      renderer.dispose()
      renderer.domElement.remove()
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current

    if (!runtime) {
      return
    }

    updateCamera(runtime.camera, view)
  }, [view])

  useEffect(() => {
    const runtime = runtimeRef.current

    if (!runtime) {
      return
    }

    runtime.screenGroup.children.forEach((child) => disposeObject(child))
    runtime.screenGroup.clear()
    runtime.pickTargets = []

    layout.screens.forEach((screen) => {
      const isSelected = screen.id === selectedScreenId
      const calibrationState = screenStates[screen.id]
      const calibrationPalette = getScreenCalibrationPalette(calibrationState?.className)
      const screenRoot = new Group()
      screenRoot.position.copy(screenToWorld(screen))
      screenRoot.rotation.set(
        MathUtils.degToRad(screen.pitchDeg),
        MathUtils.degToRad(screen.yawDeg),
        0,
      )

      const screenMaterial = new MeshBasicMaterial({
        color: 0xffffff,
        depthTest: true,
        depthWrite: true,
        map: createTextTexture([screen.name, calibrationState?.label ?? '未校准'], {
          aspectRatio: screen.width / screen.height,
          backgroundColor: calibrationPalette.backgroundColor,
          borderColor: calibrationPalette.borderColor,
        }),
        side: DoubleSide,
      })
      const screenMesh = new Mesh(
        new PlaneGeometry(screen.width, screen.height),
        screenMaterial,
      )
      screenMesh.rotation.y = Math.PI
      screenMesh.userData.screenId = screen.id
      screenRoot.add(screenMesh)
      runtime.pickTargets.push(screenMesh)

      const outline = new LineSegments(
        new EdgesGeometry(new PlaneGeometry(screen.width, screen.height)),
        new LineBasicMaterial({
          color: isSelected ? 0x4a83d8 : Number(`0x${calibrationPalette.borderColor.slice(1)}`),
          linewidth: 2,
        }),
      )
      outline.position.z = 0.4
      screenRoot.add(outline)
      runtime.screenGroup.add(screenRoot)
    })
  }, [layout, screenStates, selectedScreenId])

  useEffect(() => {
    const runtime = runtimeRef.current

    if (!runtime) {
      return
    }

    runtime.previewGroup.children.forEach((child) => disposeObject(child))
    runtime.previewGroup.clear()

    if (!hoveredLayoutProfile || hoveredLayoutProfile.id === activeLayoutProfileId) {
      return
    }

    const previewPalette = getLayoutPreviewPalette()

    hoveredLayoutProfile.layout.screens.forEach((screen) => {
      const screenRoot = new Group()
      screenRoot.position.copy(screenToWorld(screen))
      screenRoot.rotation.set(
        MathUtils.degToRad(screen.pitchDeg),
        MathUtils.degToRad(screen.yawDeg),
        0,
      )

      const previewMaterial = new MeshBasicMaterial({
        color: 0xffffff,
        depthTest: true,
        depthWrite: false,
        map: createTextTexture(screen.name, {
          ...previewPalette,
          aspectRatio: screen.width / screen.height,
        }),
        opacity: 0.36,
        side: DoubleSide,
        transparent: true,
      })
      const previewMesh = new Mesh(
        new PlaneGeometry(screen.width, screen.height),
        previewMaterial,
      )
      previewMesh.rotation.y = Math.PI
      screenRoot.add(previewMesh)

      const previewOutline = new LineSegments(
        new EdgesGeometry(new PlaneGeometry(screen.width, screen.height)),
        new LineBasicMaterial({
          color: Number(`0x${previewPalette.borderColor.slice(1)}`),
          opacity: 0.7,
          transparent: true,
        }),
      )
      previewOutline.position.z = 0.4
      screenRoot.add(previewOutline)

      runtime.previewGroup.add(screenRoot)
    })
  }, [activeLayoutProfileId, hoveredLayoutProfile])

  const handleViewPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    viewDragRef.current = {
      originPitch: view.pitch,
      originYaw: view.yaw,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const handleViewPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const viewDrag = viewDragRef.current

    if (!viewDrag || viewDrag.pointerId !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - viewDrag.startX
    const deltaY = event.clientY - viewDrag.startY

    onViewChange({
      pitch: clamp(viewDrag.originPitch + deltaY * 0.25, -70, 70),
      yaw: clamp(viewDrag.originYaw + deltaX * 0.35, -180, 180),
    })
  }

  const handleViewPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!viewDragRef.current || viewDragRef.current.pointerId !== event.pointerId) {
      return
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    viewDragRef.current = null
  }

  const handleControlPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    mode: ControlDragMode,
  ) => {
    const screen = selectedScreen

    if (event.button !== 0 || !screen) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    controlDragRef.current = {
      mode,
      originDepth: screen.depth,
      originHeight: screen.height,
      originPitchDeg: screen.pitchDeg,
      originWidth: screen.width,
      originYawDeg: screen.yawDeg,
      pointerId: event.pointerId,
      screenId: screen.id,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const handleControlPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = controlDragRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - dragState.startX
    const deltaY = event.clientY - dragState.startY

    if (dragState.mode === 'depth') {
      onUpdateScreen(dragState.screenId, {
        depth: clamp(
          roundToStep(dragState.originDepth + getDepthGestureDelta(deltaX, deltaY, view.yaw), 5),
          workspaceDepthBounds.near,
          workspaceDepthBounds.far,
        ),
      })
      return
    }

    if (dragState.mode === 'yaw') {
      onUpdateScreen(dragState.screenId, {
        yawDeg: clamp(Math.round(dragState.originYawDeg + deltaX * 0.2), -45, 45),
      })
      return
    }

    if (dragState.mode === 'pitch') {
      onUpdateScreen(dragState.screenId, {
        pitchDeg: clamp(Math.round(dragState.originPitchDeg - deltaY * 0.2), -28, 28),
      })
      return
    }

    const nextWidth = clamp(
      Math.round(dragState.originWidth + deltaX),
      workspaceScreenLimits.minWidth,
      workspaceScreenLimits.maxWidth,
    )
    const nextHeight = clamp(
      Math.round(dragState.originHeight + deltaY),
      workspaceScreenLimits.minHeight,
      workspaceScreenLimits.maxHeight,
    )

    onUpdateScreen(dragState.screenId, {
      diagonalInches: getWorkspaceScreenInchesFromSize(nextWidth, nextHeight),
      height: nextHeight,
      width: nextWidth,
    })
  }

  const handleControlPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!controlDragRef.current || controlDragRef.current.pointerId !== event.pointerId) {
      return
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    controlDragRef.current = null
  }

  const updateSelectedScreen = (patch: Partial<WorkspaceScreenConfig>) => {
    if (!selectedScreen) {
      return
    }

    onUpdateScreen(selectedScreen.id, patch)
  }

  const getNumericDraftKey = (field: NumericEditorField) =>
    selectedScreen ? `${selectedScreen.id}:${field}` : field

  const getNumericInputValue = (field: NumericEditorField, value: number) => {
    const draftValue = numericDrafts[getNumericDraftKey(field)]

    return draftValue ?? String(removeSignedZero(value))
  }

  const updateNumericDraft = (field: NumericEditorField, value: string) => {
    const key = getNumericDraftKey(field)

    setNumericDrafts((currentDrafts) => ({
      ...currentDrafts,
      [key]: value,
    }))
  }

  const isCommittableNumericDraft = (value: string) => {
    const trimmedValue = value.trim()

    return (
      trimmedValue !== '' &&
      trimmedValue !== '-' &&
      trimmedValue !== '+' &&
      trimmedValue !== '.' &&
      trimmedValue !== '-.' &&
      trimmedValue !== '+.' &&
      Number.isFinite(Number(trimmedValue))
    )
  }

  const handleNumericChange =
    (field: NumericEditorField, commitValue: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value

      updateNumericDraft(field, nextValue)

      if (isCommittableNumericDraft(nextValue)) {
        commitValue(nextValue)
      }
    }

  const clearNumericDraft = (field: NumericEditorField) => {
    const key = getNumericDraftKey(field)

    setNumericDrafts((currentDrafts) => {
      if (!(key in currentDrafts)) {
        return currentDrafts
      }

      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[key]
      return nextDrafts
    })
  }

  const handleNumericKeyDown =
    (field: NumericEditorField) => (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.currentTarget.blur()
        return
      }

      if (event.key === 'Escape') {
        clearNumericDraft(field)
        event.currentTarget.blur()
      }
    }

  const commitMetricInput =
    (field: 'depth' | 'pitchDeg' | 'x' | 'y' | 'yawDeg') =>
    (value: string) => {
      if (!selectedScreen || value.trim() === '') {
        return
      }

      const nextValue = Number(value)

        if (!Number.isFinite(nextValue)) {
          return
        }

      if (field === 'depth' || field === 'x' || field === 'y') {
        updateSelectedScreen(createScreenSpacePatch(selectedScreen, field, nextValue))
        return
      }

      updateSelectedScreen({ [field]: Math.round(nextValue) } as Partial<WorkspaceScreenConfig>)
    }

  const commitNumericInput = (
    field: NumericEditorField,
    commitValue: (value: string) => void,
  ) => {
    const key = getNumericDraftKey(field)
    const draftValue = numericDrafts[key]

    clearNumericDraft(field)

    if (draftValue === undefined) {
      return
    }

    commitValue(draftValue)
  }

  const commitSizeInput =
    (field: 'diagonalInches' | 'height' | 'width') =>
    (value: string) => {
      if (!selectedScreen || value.trim() === '') {
        return
      }

      const nextValue = Number(value)

      if (!Number.isFinite(nextValue)) {
        return
      }

      if (field === 'diagonalInches') {
        updateSelectedScreen(createWorkspaceScreenSizePatch(nextValue))
        return
      }

      const nextWidth = field === 'width' ? nextValue : selectedScreen.width
      const nextHeight = field === 'height' ? nextValue : selectedScreen.height
      updateSelectedScreen(createWorkspaceScreenRectPatch(nextWidth, nextHeight))
    }

  const rotateSelectedScreenClockwise = () => {
    if (!selectedScreen) {
      return
    }

    const centerX = selectedScreen.x + selectedScreen.width / 2
    const centerY = selectedScreen.y + selectedScreen.height / 2
    const nextSize = createWorkspaceScreenRectPatch(selectedScreen.height, selectedScreen.width)

    updateSelectedScreen({
      ...nextSize,
      x: centerX - nextSize.width / 2,
      y: centerY - nextSize.height / 2,
    })
  }

  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (file) {
      void onImportLayoutProfile(file)
    }
  }

  return (
    <div className="workspace-three-board" data-smoke="workspace-rotatable-board">
      <div ref={canvasHostRef} className="workspace-three-canvas-host" />
      <span className="workspace-three-smoke-probe" data-smoke="workspace-space-box">
        space-box
      </span>
      <div className="workspace-three-screen-probes" aria-hidden="true">
        {layout.screens.map((screen) => (
          <span key={screen.id} data-smoke="workspace-board-screen">
            {screen.name}
          </span>
        ))}
      </div>
      {selectedScreen && selectedScreenSpacePosition ? (
        <span className="workspace-three-smoke-probe" data-smoke="workspace-selected-space-probe">
          {`x:${selectedScreenSpacePosition.x};y:${selectedScreenSpacePosition.y};z:${selectedScreenSpacePosition.z};w:${selectedScreen.width};h:${selectedScreen.height};yaw:${selectedScreen.yawDeg};pitch:${selectedScreen.pitchDeg}`}
        </span>
      ) : null}
      <div className="workspace-three-board-actions" aria-label="屏幕操作">
        <button
          className="workspace-three-action-button"
          data-smoke="workspace-add-screen-inline"
          disabled={!canAddScreen}
          onClick={onAddScreen}
          title={
            canAddScreen
              ? '在画布中添加一块工作屏'
              : `最多允许 ${workspaceScreenCountLimit} 块屏幕`
          }
          type="button"
        >
          添加屏幕
        </button>
        <button
          className="workspace-three-action-button"
          data-smoke="workspace-view-reset"
          disabled={!canResetView}
          onClick={onResetView}
          title={canResetView ? '回到初始视角' : '当前已是原始视角'}
          type="button"
        >
          重置视角
        </button>
        <button
          className="workspace-three-action-button"
          data-smoke="workspace-set-camera-inline"
          disabled={!selectedScreen || selectedScreen.kind === 'camera'}
          onClick={() => selectedScreen && onSetCameraScreen(selectedScreen.id)}
          type="button"
        >
          设为摄像头屏
        </button>
        <button
          className="workspace-three-action-button is-danger"
          data-smoke="workspace-delete-screen-inline"
          disabled={!canDeleteSelectedScreen}
          onClick={() => selectedScreen && onDeleteScreen(selectedScreen.id)}
          type="button"
        >
          删除屏幕
        </button>
      </div>
      <div className="workspace-three-layout-panel" data-smoke="workspace-layout-profile-panel">
        <div className="workspace-three-layout-panel-header">
          <strong>布局档案</strong>
        </div>
        <div className="workspace-three-layout-actions">
          <button
            className="workspace-three-layout-save"
            data-smoke="workspace-layout-profile-save"
            onClick={onCreateLayoutProfile}
            type="button"
          >
            {layoutProfileCreateLabel}
          </button>
          <button
            className="workspace-three-layout-update"
            data-smoke="workspace-layout-profile-update"
            disabled={!canUpdateLayoutProfile || !isLayoutProfileDirty}
            onClick={onUpdateLayoutProfile}
            title={
              !canUpdateLayoutProfile
                ? '先加载一个已保存布局'
                : isLayoutProfileDirty
                  ? '用当前画布内容覆盖活动布局'
                  : '当前布局已经是最新状态'
            }
            type="button"
          >
            {layoutProfileUpdateLabel}
          </button>
            <div className="workspace-three-layout-file-actions">
              <button
                className="workspace-three-layout-file-button"
                data-smoke="workspace-layout-profile-import"
                onClick={() => importInputRef.current?.click()}
                type="button"
              >
                导入布局
              </button>
            </div>
          <input
            ref={importInputRef}
            accept=".json,application/json"
            className="workspace-three-layout-file-input"
            data-smoke="workspace-layout-profile-file-input"
            onChange={handleImportFileChange}
            type="file"
          />
        </div>
        <div className="workspace-three-layout-list">
          {layoutProfiles.length > 0 ? (
            layoutProfiles.map((profile) => {
              const isActive = profile.id === activeLayoutProfileId
              const isPreviewing = profile.id === hoveredLayoutProfileId
              const isPreset = profile.source === 'preset'

              return (
                <div
                  key={profile.id}
                  className={`workspace-three-layout-item${isActive ? ' is-active' : ''}${
                    isPreviewing ? ' is-previewing' : ''
                  }${isPreset ? ' is-preset' : ''
                  }`}
                  onMouseEnter={() => setHoveredLayoutProfileId(profile.id)}
                  onMouseLeave={() =>
                    setHoveredLayoutProfileId((current) => (current === profile.id ? null : current))
                  }
                >
                  <button
                    className="workspace-three-layout-item-main"
                    data-smoke="workspace-layout-profile-item"
                    data-profile-source={isPreset ? 'preset' : 'user'}
                    onClick={() => onApplyLayoutProfile(profile.id)}
                    type="button"
                  >
                    <strong>{profile.name}</strong>
                    <small>{formatWorkspaceLayoutProfileSummary(profile)}</small>
                  </button>
                    <div className="workspace-three-layout-item-meta">
                      <span className="workspace-three-layout-item-time">
                        {new Intl.DateTimeFormat('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(profile.updatedAt)}
                      </span>
                      <div className="workspace-three-layout-item-actions">
                        {isPreset ? (
                          <span
                            className="workspace-three-layout-item-preset"
                            data-smoke="workspace-layout-profile-preset"
                          >
                            预置
                          </span>
                        ) : null}
                        <button
                          aria-label={`导出${profile.name}`}
                          className="workspace-three-layout-item-export"
                          data-smoke={isPreset ? undefined : 'workspace-layout-profile-export'}
                          disabled={isPreset}
                          hidden={isPreset}
                          onClick={() => onExportLayoutProfile(profile.id)}
                          type="button"
                        >
                          导出
                        </button>
                        <button
                          aria-label={`删除${profile.name}`}
                          className="workspace-three-layout-item-delete"
                          disabled={isPreset}
                          hidden={isPreset}
                          onClick={() => onDeleteLayoutProfile(profile.id)}
                          type="button"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                </div>
              )
            })
          ) : (
            <div className="workspace-three-layout-empty">
              <strong>还没有保存的布局</strong>
              <small>先摆好屏幕位置，再保存当前布局。</small>
            </div>
          )}
        </div>
      </div>
      {selectedScreen && (
        <div
          className={`workspace-three-selection-card ${selectedScreenState?.className ?? ''}`}
          data-smoke="workspace-screen-calibration-status"
        >
          <div className="workspace-three-selection-header">
            <div className="workspace-three-selection-header-main">
              <strong>{selectedScreen.name}</strong>
            <span
              className={`workspace-three-selection-badge ${
                selectedScreen.kind === 'camera' ? 'is-camera' : 'is-work'
              }`}
            >
              {selectedScreen.kind === 'camera' ? '摄像头屏' : '工作屏'}
            </span>
            </div>
            <span
              className={`workspace-three-selection-status-pill ${currentWorkspaceStatusTone}`}
              data-smoke="workspace-current-screen-status"
            >
              当前工作屏：{currentWorkspaceStatusLabel}
            </span>
          </div>
          <div className="workspace-three-selection-groups">
            <section className="workspace-three-editor-group workspace-three-editor-group-space">
              <span className="workspace-three-editor-label">空间</span>
              <div className="workspace-three-editor-fields workspace-three-editor-fields-triplet workspace-three-editor-fields-space">
                <label className="workspace-three-editor-field">
                  <small>X</small>
                    <input
                      aria-label="屏幕 X"
                      data-smoke="workspace-space-x-input"
                      onBlur={() => commitNumericInput('x', commitMetricInput('x'))}
                      onChange={handleNumericChange('x', commitMetricInput('x'))}
                      onKeyDown={handleNumericKeyDown('x')}
                      step="1"
                      type="number"
                      value={getNumericInputValue('x', selectedScreenSpacePosition?.x ?? 0)}
                    />
                  </label>
                  <label className="workspace-three-editor-field">
                    <small>Y</small>
                    <input
                      aria-label="屏幕 Y"
                      data-smoke="workspace-space-y-input"
                      onBlur={() => commitNumericInput('y', commitMetricInput('y'))}
                      onChange={handleNumericChange('y', commitMetricInput('y'))}
                      onKeyDown={handleNumericKeyDown('y')}
                      step="1"
                      type="number"
                      value={getNumericInputValue('y', selectedScreenSpacePosition?.y ?? 0)}
                    />
                  </label>
                  <label className="workspace-three-editor-field">
                    <small>Z</small>
                    <input
                      aria-label="屏幕 Z"
                      data-smoke="workspace-space-z-input"
                      onBlur={() => commitNumericInput('depth', commitMetricInput('depth'))}
                      onChange={handleNumericChange('depth', commitMetricInput('depth'))}
                      onKeyDown={handleNumericKeyDown('depth')}
                      step="5"
                      type="number"
                      value={getNumericInputValue('depth', selectedScreenSpacePosition?.z ?? 0)}
                    />
                  </label>
              </div>
            </section>
            <section className="workspace-three-editor-group">
              <span className="workspace-three-editor-label">姿态</span>
              <div className="workspace-three-editor-fields">
                <label className="workspace-three-editor-field">
                  <small>左右夹角</small>
                    <input
                      aria-label="屏幕左右夹角"
                      onBlur={() => commitNumericInput('yawDeg', commitMetricInput('yawDeg'))}
                      onChange={handleNumericChange('yawDeg', commitMetricInput('yawDeg'))}
                      onKeyDown={handleNumericKeyDown('yawDeg')}
                      step="1"
                      type="number"
                      value={getNumericInputValue('yawDeg', selectedScreen.yawDeg)}
                    />
                  </label>
                <label className="workspace-three-editor-field">
                  <small>上下倾角</small>
                    <input
                      aria-label="屏幕上下倾角"
                      onBlur={() => commitNumericInput('pitchDeg', commitMetricInput('pitchDeg'))}
                      onChange={handleNumericChange('pitchDeg', commitMetricInput('pitchDeg'))}
                      onKeyDown={handleNumericKeyDown('pitchDeg')}
                      step="1"
                      type="number"
                      value={getNumericInputValue('pitchDeg', selectedScreen.pitchDeg)}
                    />
                  </label>
              </div>
            </section>
            <section className="workspace-three-editor-group">
              <span className="workspace-three-editor-label">尺寸</span>
              <div className="workspace-three-editor-fields workspace-three-editor-fields-size">
                <label className="workspace-three-editor-field">
                  <small>英寸</small>
                  <input
                    aria-label="屏幕英寸"
                    data-smoke="workspace-screen-inch-input"
                    max={workspaceScreenInchLimits.max}
                    min={workspaceScreenInchLimits.min}
                    onBlur={() =>
                      commitNumericInput('diagonalInches', commitSizeInput('diagonalInches'))
                    }
                    onChange={handleNumericChange(
                      'diagonalInches',
                      commitSizeInput('diagonalInches'),
                    )}
                    onKeyDown={handleNumericKeyDown('diagonalInches')}
                    step="0.5"
                    type="number"
                    value={getNumericInputValue('diagonalInches', selectedScreen.diagonalInches)}
                  />
                </label>
                <label className="workspace-three-editor-field">
                  <small>宽</small>
                  <input
                    aria-label="屏幕宽"
                    data-smoke="workspace-screen-width-input"
                    max={workspaceScreenLimits.maxWidth}
                    min={workspaceScreenLimits.minWidth}
                    onBlur={() => commitNumericInput('width', commitSizeInput('width'))}
                    onChange={handleNumericChange('width', commitSizeInput('width'))}
                    onKeyDown={handleNumericKeyDown('width')}
                    step="1"
                    type="number"
                    value={getNumericInputValue('width', selectedScreen.width)}
                  />
                </label>
                <label className="workspace-three-editor-field">
                  <small>高</small>
                  <input
                    aria-label="屏幕高"
                    data-smoke="workspace-screen-height-input"
                    max={workspaceScreenLimits.maxHeight}
                    min={workspaceScreenLimits.minHeight}
                    onBlur={() => commitNumericInput('height', commitSizeInput('height'))}
                    onChange={handleNumericChange('height', commitSizeInput('height'))}
                    onKeyDown={handleNumericKeyDown('height')}
                    step="1"
                    type="number"
                    value={getNumericInputValue('height', selectedScreen.height)}
                  />
                </label>
              </div>
            </section>
            <section
              className={`workspace-three-editor-group workspace-three-editor-group-status ${
                selectedScreenState?.className ?? ''
              }`}
            >
              <span className="workspace-three-editor-label">校准</span>
              <strong>{selectedScreenCalibrationLabel}</strong>
              {selectedScreenCalibrationDetails.length > 0 ? (
                <div className="workspace-three-editor-status-lines">
                  {selectedScreenCalibrationDetails.map((detail) => (
                    <span key={detail}>{detail}</span>
                  ))}
                </div>
              ) : null}
              <small>{selectedScreenCalibrationHint}</small>
              <button
                className="workspace-three-editor-status-action"
                data-smoke="workspace-screen-calibrate-inline"
                disabled={selectedScreenState?.status === 'sampling'}
                onClick={() => onCalibrateScreen(selectedScreen.id)}
                type="button"
              >
                {selectedScreenState?.status === 'sampling'
                  ? '校准中'
                  : selectedScreenState?.status === 'ready'
                    ? '重新校准这块屏幕'
                    : '校准这块屏幕'}
              </button>
            </section>
          </div>
        </div>
      )}
      <button
        className="workspace-three-view-handle"
        data-smoke="workspace-view-drag-handle"
        onPointerCancel={handleViewPointerUp}
        onPointerDown={handleViewPointerDown}
        onPointerMove={handleViewPointerMove}
        onPointerUp={handleViewPointerUp}
        type="button"
      >
        <span className="workspace-three-view-handle-label">旋转视角</span>
      </button>
      <div className="workspace-three-board-controls" aria-label="当前屏幕调整">
        <button
          className="workspace-board-handle workspace-board-handle-depth"
          data-smoke="workspace-depth-handle"
          disabled={!selectedScreen}
          onPointerCancel={handleControlPointerUp}
          onPointerDown={(event) => handleControlPointerDown(event, 'depth')}
          onPointerMove={handleControlPointerMove}
          onPointerUp={handleControlPointerUp}
          title="左右拖动或上下拖动，调整屏幕离你的前后距离"
          type="button"
        >
          前后 Z
        </button>
        <button
          className="workspace-board-handle workspace-board-handle-yaw"
          data-smoke="workspace-yaw-handle"
          disabled={!selectedScreen}
          onPointerCancel={handleControlPointerUp}
          onPointerDown={(event) => handleControlPointerDown(event, 'yaw')}
          onPointerMove={handleControlPointerMove}
          onPointerUp={handleControlPointerUp}
          title="左右拖动，调整屏幕左右夹角"
          type="button"
        >
          左右夹角
        </button>
        <button
          className="workspace-board-handle workspace-board-handle-pitch"
          data-smoke="workspace-pitch-handle"
          disabled={!selectedScreen}
          onPointerCancel={handleControlPointerUp}
          onPointerDown={(event) => handleControlPointerDown(event, 'pitch')}
          onPointerMove={handleControlPointerMove}
          onPointerUp={handleControlPointerUp}
          title="上下拖动，调整屏幕上下倾角"
          type="button"
        >
          上下倾角
        </button>
        <button
          className="workspace-board-resize-handle"
          data-smoke="workspace-resize-handle"
          disabled={!selectedScreen}
          onPointerCancel={handleControlPointerUp}
          onPointerDown={(event) => handleControlPointerDown(event, 'resize')}
          onPointerMove={handleControlPointerMove}
          onPointerUp={handleControlPointerUp}
          title="拖动调整屏幕宽高，系统会限制最大尺寸"
          type="button"
        >
          尺寸
        </button>
        <button
          className="workspace-board-rotate-button"
          data-smoke="workspace-rotate-clockwise"
          disabled={!selectedScreen}
          onClick={rotateSelectedScreenClockwise}
          title="将当前屏幕顺时针旋转 90°，并保持中心位置不变"
          type="button"
        >
          旋转90°
        </button>
      </div>
      <div className="workspace-view-readout">
        视角 yaw {view.yaw.toFixed(0)}° / pitch {view.pitch.toFixed(0)}°
      </div>
    </div>
  )
}
