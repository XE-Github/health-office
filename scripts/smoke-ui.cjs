const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const puppeteer = require('puppeteer-core')

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

const smokeUrl = process.env.SMOKE_URL || 'http://127.0.0.1:4173/'
const artifactDir = path.join(process.cwd(), 'test-artifacts')
const previewWaitMs = 30_000
const smokeScopes = new Set(['quick', 'workspace', 'camera', 'full'])

function getSmokeScope() {
  const scopeArg = process.argv.find((arg) => arg.startsWith('--scope='))
  const scope = scopeArg ? scopeArg.slice('--scope='.length) : process.env.SMOKE_SCOPE || 'full'

  if (!smokeScopes.has(scope)) {
    throw new Error(`Unsupported smoke scope "${scope}". Use quick, workspace, camera, or full.`)
  }

  return scope
}

const smokeScope = getSmokeScope()

function shouldRunScope(scope) {
  return smokeScope === 'full' || smokeScope === scope
}

function getExecutablePath() {
  const found = chromeCandidates.find((candidate) => fs.existsSync(candidate))

  if (!found) {
    throw new Error('No Chrome or Edge executable found for smoke test.')
  }

  return found
}

async function waitForSelector(page, selector, label, timeout = 20_000) {
  await page.waitForSelector(selector, { timeout })
  return `PASS ${label}`
}

async function waitForGone(page, selector, label, timeout = 20_000) {
  await page.waitForFunction(
    (needle) => !document.querySelector(needle),
    { timeout },
    selector,
  )
  return `PASS ${label}`
}

async function clickBySelector(page, selector) {
  await page.waitForSelector(selector, { timeout: 20_000 })
  await page.click(selector)
}

async function hoverBySelector(page, selector) {
  await page.waitForSelector(selector, { timeout: 20_000 })
  await page.hover(selector)
}

async function replaceInputValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 20_000 })
  await page.click(selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.keyboard.type(value)
  await page.keyboard.press('Enter')
}

async function typeInputValueWithoutCommit(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 20_000 })
  await page.click(selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.keyboard.type(value)
}

async function assertSelectorTextIncludes(page, selector, expected, label, timeout = 20_000) {
  await page.waitForFunction(
    (needleSelector, needleText) => {
      const element = document.querySelector(needleSelector)
      return Boolean(element && element.textContent && element.textContent.includes(needleText))
    },
    { timeout },
    selector,
    expected,
  )

  return `PASS ${label}`
}

async function assertInputValue(page, selector, expected, label, timeout = 20_000) {
  await page.waitForFunction(
    (needleSelector, needleValue) => {
      const element = document.querySelector(needleSelector)
      return Boolean(element instanceof HTMLInputElement && element.value === needleValue)
    },
    { timeout },
    selector,
    expected,
  )

  return `PASS ${label}`
}

async function assertSelectorCount(page, selector, expected, label, timeout = 20_000) {
  await page.waitForFunction(
    (needleSelector, needleCount) => document.querySelectorAll(needleSelector).length === needleCount,
    { timeout },
    selector,
    expected,
  )

  return `PASS ${label}`
}

async function assertHudCanReceiveScroll(page, label, timeout = 20_000) {
  await page.waitForFunction(
    () => {
      const hud = document.querySelector('[data-smoke="camera-hud"]')

      if (!(hud instanceof HTMLElement)) {
        return false
      }

      const styles = window.getComputedStyle(hud)

      return styles.pointerEvents !== 'none' && styles.overflowY !== 'hidden'
    },
    { timeout },
  )

  return `PASS ${label}`
}

async function waitForCameraVideoReady(page, label, timeout = 25_000) {
  await page.waitForFunction(
    () => {
      const video = document.querySelector('[data-smoke="camera-video"]')

      return Boolean(
        video &&
          video instanceof HTMLVideoElement &&
          video.srcObject &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0,
      )
    },
    { timeout },
  )

  return `PASS ${label}`
}

function clearPreviousArtifacts() {
  fs.mkdirSync(artifactDir, { recursive: true })

  for (const filename of fs.readdirSync(artifactDir)) {
    if (/^smoke-(home|failure)\.png$/.test(filename) || filename === 'smoke-downloads') {
      try {
        fs.rmSync(path.join(artifactDir, filename), { force: true, recursive: true })
      } catch (error) {
        if (error && error.code !== 'ENOENT') {
          console.warn(`WARN Could not remove stale artifact ${filename}: ${error.code || error.message}`)
        }
      }
    }
  }
}

async function waitForDownloadedLayoutJson(downloadDir, label, timeout = 20_000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    const filenames = fs.existsSync(downloadDir) ? fs.readdirSync(downloadDir) : []
    const jsonFile = filenames.find(
      (filename) => filename.endsWith('.json') && !filename.endsWith('.crdownload'),
    )

    if (jsonFile) {
      const filePath = path.join(downloadDir, jsonFile)
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(content)

      if (
        content.length > 80 &&
        parsed &&
        parsed.kind === 'workspace-layout-profile' &&
        Array.isArray(parsed.profile?.layout?.screens) &&
        parsed.profile.layout.screens.length > 0
      ) {
        return `PASS ${label}`
      }

      throw new Error(`Downloaded layout JSON is empty or invalid: ${filePath}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`No layout JSON was downloaded within ${timeout}ms.`)
}

async function waitForNativeSavedLayoutJson(page, label, timeout = 20_000) {
  await page.waitForFunction(
    () => {
      const savedFile = window.__smokeNativeLayoutSave

      if (!savedFile || !savedFile.text || savedFile.size <= 80 || !savedFile.closed) {
        return false
      }

      try {
        const parsed = JSON.parse(savedFile.text)

        return Boolean(
          parsed &&
            parsed.kind === 'workspace-layout-profile' &&
            Array.isArray(parsed.profile?.layout?.screens) &&
            parsed.profile.layout.screens.length > 0,
        )
      } catch {
        return false
      }
    },
    { timeout },
  )

  return `PASS ${label}`
}

function assertLocalFaceLandmarkerAssets() {
  const requiredAssets = [
    path.join(process.cwd(), 'public', 'mediapipe', 'face_landmarker', 'face_landmarker.task'),
    path.join(process.cwd(), 'public', 'mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_internal.js'),
    path.join(process.cwd(), 'public', 'mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_internal.wasm'),
    path.join(process.cwd(), 'public', 'mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_module_internal.js'),
    path.join(process.cwd(), 'public', 'mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_module_internal.wasm'),
    path.join(process.cwd(), 'public', 'mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_nosimd_internal.js'),
    path.join(process.cwd(), 'public', 'mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_nosimd_internal.wasm'),
  ]
  const missingAssets = requiredAssets.filter((assetPath) => !fs.existsSync(assetPath))

  if (missingAssets.length > 0) {
    throw new Error(`Missing local Face Landmarker assets:\n${missingAssets.join('\n')}`)
  }
}

async function isUrlReachable(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' })
    return response.ok || response.status === 304
  } catch {
    return false
  }
}

async function waitForUrl(url, timeout = previewWaitMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    if (await isUrlReachable(url)) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Preview server at ${url} was not reachable within ${timeout}ms.`)
}

function startPreviewServer() {
  const viteCli = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js')

  return spawn(process.execPath, [
    viteCli,
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort',
  ], {
    cwd: process.cwd(),
    stdio: 'ignore',
  })
}

async function run() {
  assertLocalFaceLandmarkerAssets()
  clearPreviousArtifacts()
  let previewProcess = null

  if (!(await isUrlReachable(smokeUrl))) {
    previewProcess = startPreviewServer()

    try {
      await waitForUrl(smokeUrl)
    } catch (error) {
      previewProcess.kill('SIGTERM')
      throw error
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getExecutablePath(),
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
    defaultViewport: {
      width: 1440,
      height: 1100,
    },
  })

  const page = await browser.newPage()
  const passes = []
  const consoleFailures = []
  const downloadDir = path.join(artifactDir, 'smoke-downloads')
  fs.mkdirSync(downloadDir, { recursive: true })
  const cdpSession = await page.target().createCDPSession()
  await cdpSession.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  })

  page.on('console', (message) => {
    const text = message.text()

    if (
      text.includes('Face Landmarker worker is unavailable') ||
      text.includes('Face Landmarker worker failed') ||
      text.includes('Face Landmarker worker request failed') ||
      text.includes('Face Landmarker adaptation is unavailable')
    ) {
      consoleFailures.push(text)
    }
  })

  try {
    await page.goto(smokeUrl, { waitUntil: 'networkidle2', timeout: 60_000 })

    passes.push(await waitForSelector(page, '[data-smoke="app-shell"]', '首页完成加载'))
    passes.push(await waitForSelector(page, '[data-smoke="screen-mode-card"]', '屏幕模式选择默认可见'))
    passes.push(await waitForSelector(page, '[data-smoke="readiness-checklist"]', '准备清单可见'))
    passes.push(await waitForSelector(page, '[data-smoke="start-block-reason"]', '开始办公禁用原因可见'))
    passes.push(await waitForSelector(page, '[data-smoke="calibration-complete-feedback"]', '校准完成反馈区域可见'))
    passes.push(await waitForSelector(page, '[data-smoke="screen-mode-single"]', '单屏模式入口可见'))
    passes.push(await waitForSelector(page, '[data-smoke="screen-mode-multi"]', '多屏模式入口可见'))
    await clickBySelector(page, '[data-smoke="screen-mode-single"]')
    passes.push(await assertSelectorTextIncludes(page, '[data-smoke="screen-mode-card"]', '单屏模式', '可选择单屏模式'))

    passes.push(await waitForSelector(page, '[data-smoke="settings-open"]', '设置入口可见'))
    await clickBySelector(page, '[data-smoke="settings-open"]')
    passes.push(await waitForSelector(page, '[data-smoke="settings-modal"]', '设置弹窗可见'))
    passes.push(await waitForSelector(page, '[data-smoke="personal-baseline-panel"]', '设置区可在弹窗中显示'))
    passes.push(await waitForSelector(page, '[data-smoke="distance-settings-card"]', '视距设置区可在弹窗中显示'))
    passes.push(await waitForSelector(page, '[data-smoke="posture-head-down-toggle"]', '姿态提醒保留低头开关'))
    passes.push(await waitForSelector(page, '[data-smoke="posture-forward-head-toggle"]', '姿态提醒保留前倾开关'))
    passes.push(await waitForSelector(page, '[data-smoke="posture-head-tilt-toggle"]', '姿态提醒保留歪头开关'))
    passes.push(await waitForSelector(page, '[data-smoke="posture-shoulder-tilt-toggle"]', '姿态提醒保留肩线倾斜开关'))
    await clickBySelector(page, '[data-smoke="settings-close"]')
    passes.push(await waitForGone(page, '[data-smoke="settings-modal"]', '设置弹窗可关闭', 5_000))

    if (shouldRunScope('workspace')) {
    await clickBySelector(page, '[data-smoke="screen-mode-multi"]')
    passes.push(await assertSelectorTextIncludes(page, '[data-smoke="screen-mode-card"]', '多屏模式', '可切换多屏模式'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-config-open"]', 'workspace config open visible'))
    await clickBySelector(page, '[data-smoke="workspace-config-open"]')
    passes.push(await waitForSelector(page, '[data-smoke="workspace-config-modal"]', 'workspace config modal visible'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-config-page"]', 'workspace config page visible'))
    passes.push(await assertSelectorTextIncludes(page, '[data-smoke="workspace-config-page"]', '工作屏', 'workspace config shows current screen summary'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-space-box"]', 'workspace config exposes spatial box'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-rotatable-board"]', 'workspace config exposes rotatable 3D board'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-three-canvas"]', 'workspace config lazy-loads Three.js canvas'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-layout-profile-panel"]', 'workspace config exposes layout profile panel'))
    passes.push(await waitForSelector(page, '[data-profile-source="preset"]', 'workspace config exposes preset layout profiles'))
    passes.push(await assertSelectorTextIncludes(page, '[data-smoke="workspace-layout-profile-panel"]', '双屏幕布局1', 'workspace config shows preset layout filename'))
    passes.push(await assertSelectorCount(page, '[data-smoke="workspace-layout-profile-preset"]', 9, 'workspace config shows all preset layout profiles as read-only'))
    passes.push(await assertSelectorCount(page, '[data-smoke="workspace-layout-profile-export"]', 0, 'workspace config hides export action for preset layouts'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-layout-profile-save"]', 'workspace config exposes layout profile save action'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-layout-profile-update"]', 'workspace config exposes layout profile update action'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-layout-profile-import"]', 'workspace config exposes layout import action'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-layout-profile-file-input"]', 'workspace config exposes hidden layout file input'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-add-screen-inline"]', 'workspace config exposes inline add-screen action'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-screen-calibrate-inline"]', 'workspace config exposes inline calibration action'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-delete-screen-inline"]', 'workspace config exposes inline delete action'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-set-camera-inline"]', 'workspace config exposes inline camera-screen action'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-view-drag-handle"]', 'workspace config exposes dedicated view drag handle'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-view-reset"]', 'workspace config exposes reset-view shortcut'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-depth-handle"]', 'workspace config exposes 3D depth drag handle'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-yaw-handle"]', 'workspace config exposes 3D yaw drag handle'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-pitch-handle"]', 'workspace config exposes 3D pitch drag handle'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-resize-handle"]', 'workspace config exposes screen resize handle'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-rotate-clockwise"]', 'workspace config exposes 90-degree rotate action'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-screen-calibration-status"]', 'workspace config makes screen calibration status visible'))
    passes.push(await assertInputValue(page, '[data-smoke="workspace-space-x-input"]', '0', 'workspace config uses box-center X origin'))
    passes.push(await assertInputValue(page, '[data-smoke="workspace-space-y-input"]', '0', 'workspace config uses box-center Y origin'))
    passes.push(await assertInputValue(page, '[data-smoke="workspace-space-z-input"]', '0', 'workspace config uses box-center Z origin'))
    await typeInputValueWithoutCommit(page, '[data-smoke="workspace-space-x-input"]', '210')
    passes.push(
      await assertSelectorTextIncludes(
        page,
        '[data-smoke="workspace-selected-space-probe"]',
        'x:210',
        'workspace config commits X input to board state while typing',
      ),
    )
    await page.keyboard.press('Enter')
    await typeInputValueWithoutCommit(page, '[data-smoke="workspace-space-z-input"]', '35')
    passes.push(
      await assertSelectorTextIncludes(
        page,
        '[data-smoke="workspace-selected-space-probe"]',
        'z:35',
        'workspace config commits Z input to board state while typing',
      ),
    )
    await page.keyboard.press('Enter')
    await replaceInputValue(page, '[data-smoke="workspace-space-z-input"]', '0')
    await replaceInputValue(page, '[data-smoke="workspace-screen-width-input"]', '151')
    await replaceInputValue(page, '[data-smoke="workspace-space-x-input"]', '0')
    passes.push(await assertInputValue(page, '[data-smoke="workspace-space-x-input"]', '0', 'workspace config keeps zero X when selected screen width is odd'))
    await replaceInputValue(page, '[data-smoke="workspace-space-y-input"]', '-10')
    passes.push(await assertInputValue(page, '[data-smoke="workspace-space-y-input"]', '-10', 'workspace config accepts negative center-space Y input'))
    await replaceInputValue(page, '[data-smoke="workspace-screen-height-input"]', '120')
    await clickBySelector(page, '[data-smoke="workspace-rotate-clockwise"]')
    passes.push(await assertInputValue(page, '[data-smoke="workspace-screen-width-input"]', '120', 'workspace config rotates selected screen width clockwise'))
    passes.push(await assertInputValue(page, '[data-smoke="workspace-screen-height-input"]', '151', 'workspace config rotates selected screen height clockwise'))
    await clickBySelector(page, '[data-smoke="workspace-layout-profile-save"]')
    passes.push(await waitForSelector(page, '[data-smoke="workspace-layout-profile-item"]', 'workspace config can save a layout profile'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-layout-profile-export"]', 'workspace config exposes layout export action inside saved profile card'))
    await page.evaluate(() => {
      window.__smokeNativeLayoutSave = {
        closed: false,
        size: 0,
        text: '',
      }

      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => {
          let content = ''

          return {
            createWritable: async () => ({
              close: async () => {
                window.__smokeNativeLayoutSave = {
                  closed: true,
                  size: new TextEncoder().encode(content).byteLength,
                  text: content,
                }
              },
              truncate: async (size) => {
                if (size === 0) {
                  content = ''
                }
              },
              write: async (input) => {
                const payload =
                  input && typeof input === 'object' && input.type === 'write'
                    ? input.data
                    : input

                if (typeof payload === 'string') {
                  content = payload
                  return
                }

                if (payload instanceof Blob) {
                  content = await payload.text()
                  return
                }

                content = new TextDecoder().decode(payload)
              },
            }),
            getFile: async () =>
              new File([content], 'layout.json', {
                type: 'application/json',
              }),
          }
        },
      })
    })
    await clickBySelector(page, '[data-smoke="workspace-layout-profile-export"]')
    passes.push(await waitForNativeSavedLayoutJson(page, 'workspace config exports non-empty layout JSON through native picker'))
    await page.evaluate(() => {
      try {
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          value: undefined,
        })
      } catch {
        // Ignore browsers that expose this property as non-configurable.
      }
    })
    await clickBySelector(page, '[data-smoke="workspace-layout-profile-export"]')
    passes.push(await waitForDownloadedLayoutJson(downloadDir, 'workspace config exports non-empty layout JSON'))
    await clickBySelector(page, '[data-smoke="workspace-config-close"]')
    passes.push(await waitForGone(page, '[data-smoke="workspace-config-modal"]', 'workspace config modal closes', 5_000))
    passes.push(await waitForSelector(page, '[data-smoke="screen-mode-card"]', 'back from workspace config'))
    }

    if (smokeScope === 'camera') {
      await clickBySelector(page, '[data-smoke="screen-mode-multi"]')
      passes.push(await assertSelectorTextIncludes(page, '[data-smoke="screen-mode-card"]', '多屏模式', 'camera smoke can enter multi-screen mode'))
    }

    await page.screenshot({
      path: path.join(artifactDir, 'smoke-home.png'),
      fullPage: true,
    })

    if (shouldRunScope('camera')) {
    await clickBySelector(page, '[data-smoke="camera-request"]')
    await new Promise((resolve) => setTimeout(resolve, 4_000))
    if (consoleFailures.length > 0) {
      throw new Error(`Face Landmarker worker console failure:\n${consoleFailures.join('\n')}`)
    }

    passes.push(await waitForCameraVideoReady(page, '摄像头视频流已挂载到实时窗口'))
    passes.push(await waitForSelector(page, '[data-smoke="camera-hud-toggle"]', 'HUD 显示开关可见'))
    await clickBySelector(page, '[data-smoke="camera-hud-toggle"]')
    passes.push(await waitForSelector(page, '[data-smoke="camera-hud"]', '摄像头入口可正常拉起', 25_000))
    passes.push(await assertHudCanReceiveScroll(page, 'HUD 可接收滚动事件'))
    passes.push(await waitForSelector(page, '[data-smoke="camera-hud-copy"]', 'HUD 调试快照复制入口可见'))
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '视距信号/基线', 'HUD 合并展示视距信号与基线'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '过近/偏远阈值', 'HUD 合并展示过近与偏远阈值'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '脸屏适配', 'HUD 展示脸屏自动适配'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '屏幕模式', 'HUD 展示屏幕模式'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '工作屏 3D', 'HUD 展示工作屏 3D 配置'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '头姿角度', 'HUD 展示头姿角度'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '今日眨眼', 'HUD 展示今日眨眼计数'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '摄像头状态', 'HUD 展示摄像头状态'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '连续用眼', 'HUD 展示连续用眼时间'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '用眼在岗', 'HUD 展示用眼在岗状态'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '多屏识别', 'HUD 展示多屏识别分组'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '匹配置信度', 'HUD 展示工作屏匹配置信度'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '匹配依据', 'HUD 展示工作屏匹配依据'),
    )
    passes.push(
      await assertSelectorTextIncludes(page, '[data-smoke="camera-hud"]', '校准质量', 'HUD 展示工作屏校准质量'),
    )

    passes.push(await waitForSelector(page, '[data-smoke="calibration-trigger"]', '统一校准入口可见'))

    await clickBySelector(page, '[data-smoke="camera-hud-toggle"]')
    passes.push(await waitForGone(page, '[data-smoke="camera-hud"]', 'HUD 可再次点击隐藏', 5_000))

    await clickBySelector(page, '[data-smoke="workspace-config-open"]')
    passes.push(await waitForSelector(page, '[data-smoke="workspace-config-modal"]', '摄像头打开时可进入多屏配置弹窗'))
    passes.push(await waitForSelector(page, '[data-smoke="workspace-config-page"]', '摄像头打开时可进入多屏配置'))
    await clickBySelector(page, '[data-smoke="workspace-config-close"]')
    passes.push(await waitForGone(page, '[data-smoke="workspace-config-modal"]', '摄像头打开时可关闭多屏配置弹窗', 5_000))
    passes.push(await waitForSelector(page, '[data-smoke="screen-mode-card"]', '摄像头打开后可返回 HO'))
    passes.push(await waitForCameraVideoReady(page, '返回 HO 后摄像头视频流仍然可用'))
    passes.push(await waitForSelector(page, '[data-smoke="camera-hud-toggle"]', '返回 HO 后实时窗口操作仍可见'))

    passes.push(await waitForSelector(page, '[data-smoke="calibration-card"]', '统一校准卡片可见'))

    if (smokeScope === 'full') {
    await clickBySelector(page, '[data-smoke="demo-toggle"]')
    passes.push(await waitForSelector(page, '[data-smoke="demo-trigger-eye"]', 'Demo 快捷条可正常显示'))
    await clickBySelector(page, '[data-smoke="demo-trigger-eye"]')
    passes.push(await waitForSelector(page, '[data-smoke="reminder-toast"]', 'Demo 链路可触发统一提醒'))
    await hoverBySelector(page, '[data-smoke="reminder-toast"]')
    await clickBySelector(page, '[data-smoke="reminder-complete"]')
    passes.push(await waitForGone(page, '[data-smoke="reminder-toast"]', '提醒 toast 可正常完成并关闭'))
    }
    }
  } catch (error) {
    await page.screenshot({
      path: path.join(artifactDir, 'smoke-failure.png'),
      fullPage: true,
    })
    throw error
  } finally {
    await browser.close()
    if (previewProcess) {
      previewProcess.kill('SIGTERM')
    }
  }

  console.log(passes.join('\n'))
}

run().catch((error) => {
  console.error(error.stack || error.message || String(error))
  process.exit(1)
})
