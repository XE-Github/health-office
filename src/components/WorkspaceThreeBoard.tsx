import {
  useEffect,
  useRef,
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
}

type WorkspaceThreeBoardProps = {
  canAddScreen: boolean
  layout: WorkspaceLayoutConfig
  onAddScreen: () => void
  onCalibrateScreen: (screenId: string) => void
  onDeleteScreen: (screenId: string) => void
  onResetView: () => void
  onSelectScreen: (screenId: string) => void
  onSetCameraScreen: (screenId: string) => void
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

type RuntimeProps = WorkspaceThreeBoardProps

type ThreeRuntime = {
  camera: PerspectiveCamera
  pickTargets: Mesh[]
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
  options?: { camera?: boolean; selected?: boolean },
) {
  const canvas = document.createElement('canvas')
  canvas.width = 680
  canvas.height = 220
  const context = canvas.getContext('2d')

  if (!context) {
    return new CanvasTexture(canvas)
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = options?.selected
    ? '#e9f2ff'
    : options?.camera
      ? '#e5f4ec'
      : '#f7fafc'
  context.strokeStyle = options?.selected
    ? '#4a83d8'
    : options?.camera
      ? '#5d936f'
      : '#cbd7e1'
  context.lineWidth = 8
  context.beginPath()
  context.roundRect(18, 18, canvas.width - 36, canvas.height - 36, 34)
  context.fill()
  context.stroke()

  context.fillStyle = '#162433'
  context.font = 'bold 54px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const resolvedTitle = Array.isArray(title) ? title[0] ?? '' : title
  context.fillText(resolvedTitle, canvas.width / 2, canvas.height / 2)

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

export function WorkspaceThreeBoard({
  canAddScreen,
  layout,
  onAddScreen,
  onCalibrateScreen,
  onDeleteScreen,
  onResetView,
  onSelectScreen,
  onSetCameraScreen,
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
  const runtimeRef = useRef<ThreeRuntime | null>(null)
  const propsRef = useRef<RuntimeProps>({
    canAddScreen,
    layout,
    onAddScreen,
    onCalibrateScreen,
    onDeleteScreen,
    onResetView,
    onSelectScreen,
    onSetCameraScreen,
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
  const selectedScreen =
    layout.screens.find((screen) => screen.id === selectedScreenId) ?? layout.screens[0] ?? null
  const canDeleteSelectedScreen = layout.screens.length > 1 && Boolean(selectedScreen)
  const canResetView = Math.abs(view.pitch) > 0.01 || Math.abs(view.yaw) > 0.01
  const selectedScreenState = selectedScreen ? screenStates[selectedScreen.id] : null

  useEffect(() => {
    propsRef.current = {
      canAddScreen,
      layout,
      onAddScreen,
      onCalibrateScreen,
      onDeleteScreen,
      onResetView,
      onSelectScreen,
      onSetCameraScreen,
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
    canAddScreen,
    layout,
    onAddScreen,
    onCalibrateScreen,
    onDeleteScreen,
    onResetView,
    onSelectScreen,
    onSetCameraScreen,
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
    const screenGroup = new Group()
    scene.add(createSpaceBoxGroup())
    scene.add(screenGroup)

    const runtime: ThreeRuntime = {
      camera,
      pickTargets: [],
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
      const screenRoot = new Group()
      screenRoot.position.copy(screenToWorld(screen))
      screenRoot.rotation.set(
        MathUtils.degToRad(screen.pitchDeg),
        MathUtils.degToRad(screen.yawDeg),
        0,
      )

      const screenMaterial = new MeshBasicMaterial({
        color: isSelected ? 0xe9f2ff : screen.kind === 'camera' ? 0xdff0e7 : 0xf6fafc,
        depthTest: true,
        depthWrite: true,
        map: createTextTexture(screen.name, {
          camera: screen.kind === 'camera',
          selected: isSelected,
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
          color: isSelected ? 0x4a83d8 : screen.kind === 'camera' ? 0x5d936f : 0x90a4b8,
          linewidth: 2,
        }),
      )
      outline.position.z = 0.4
      screenRoot.add(outline)
      runtime.screenGroup.add(screenRoot)
    })
  }, [layout, selectedScreenId])

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

  const handleMetricInput =
    (field: 'depth' | 'pitchDeg' | 'x' | 'y' | 'yawDeg') =>
    (value: string) => {
      if (!selectedScreen || value.trim() === '') {
        return
      }

      const nextValue = Number(value)

      if (!Number.isFinite(nextValue)) {
        return
      }

      updateSelectedScreen({ [field]: Math.round(nextValue) } as Partial<WorkspaceScreenConfig>)
    }

  const handleSizeInput =
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
          className="workspace-three-action-button"
          data-smoke="workspace-screen-calibrate-inline"
          disabled={!selectedScreen}
          onClick={() => selectedScreen && onCalibrateScreen(selectedScreen.id)}
          type="button"
        >
          校准屏幕
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
      {selectedScreen && (
        <div
          className={`workspace-three-selection-card ${selectedScreenState?.className ?? ''}`}
          data-smoke="workspace-screen-calibration-status"
        >
          <div className="workspace-three-selection-header">
            <strong>{selectedScreen.name}</strong>
            <span
              className={`workspace-three-selection-badge ${
                selectedScreen.kind === 'camera' ? 'is-camera' : 'is-work'
              }`}
            >
              {selectedScreen.kind === 'camera' ? '摄像头屏' : '工作屏'}
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
                    onChange={(event) => handleMetricInput('x')(event.target.value)}
                    step="1"
                    type="number"
                    value={Math.round(selectedScreen.x)}
                  />
                </label>
                <label className="workspace-three-editor-field">
                  <small>Y</small>
                  <input
                    aria-label="屏幕 Y"
                    onChange={(event) => handleMetricInput('y')(event.target.value)}
                    step="1"
                    type="number"
                    value={Math.round(selectedScreen.y)}
                  />
                </label>
                <label className="workspace-three-editor-field">
                  <small>Z</small>
                  <input
                    aria-label="屏幕 Z"
                    onChange={(event) => handleMetricInput('depth')(event.target.value)}
                    step="5"
                    type="number"
                    value={selectedScreen.depth}
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
                    onChange={(event) => handleMetricInput('yawDeg')(event.target.value)}
                    step="1"
                    type="number"
                    value={selectedScreen.yawDeg}
                  />
                </label>
                <label className="workspace-three-editor-field">
                  <small>上下倾角</small>
                  <input
                    aria-label="屏幕上下倾角"
                    onChange={(event) => handleMetricInput('pitchDeg')(event.target.value)}
                    step="1"
                    type="number"
                    value={selectedScreen.pitchDeg}
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
                    onChange={(event) => handleSizeInput('diagonalInches')(event.target.value)}
                    step="0.5"
                    type="number"
                    value={selectedScreen.diagonalInches}
                  />
                </label>
                <label className="workspace-three-editor-field">
                  <small>宽</small>
                  <input
                    aria-label="屏幕宽"
                    data-smoke="workspace-screen-width-input"
                    max={workspaceScreenLimits.maxWidth}
                    min={workspaceScreenLimits.minWidth}
                    onChange={(event) => handleSizeInput('width')(event.target.value)}
                    step="1"
                    type="number"
                    value={selectedScreen.width}
                  />
                </label>
                <label className="workspace-three-editor-field">
                  <small>高</small>
                  <input
                    aria-label="屏幕高"
                    data-smoke="workspace-screen-height-input"
                    max={workspaceScreenLimits.maxHeight}
                    min={workspaceScreenLimits.minHeight}
                    onChange={(event) => handleSizeInput('height')(event.target.value)}
                    step="1"
                    type="number"
                    value={selectedScreen.height}
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
      </div>
      <div className="workspace-view-readout">
        视角 yaw {view.yaw.toFixed(0)}° / pitch {view.pitch.toFixed(0)}°
      </div>
    </div>
  )
}
