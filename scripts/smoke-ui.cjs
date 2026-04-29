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
    if (/^smoke-(home|failure)\.png$/.test(filename)) {
      try {
        fs.rmSync(path.join(artifactDir, filename), { force: true })
      } catch (error) {
        if (error && error.code !== 'ENOENT') {
          console.warn(`WARN Could not remove stale artifact ${filename}: ${error.code || error.message}`)
        }
      }
    }
  }
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
    passes.push(await waitForSelector(page, '[data-smoke="workspace-screen-calibration-status"]', 'workspace config makes screen calibration status visible'))
    await clickBySelector(page, '[data-smoke="workspace-config-close"]')
    passes.push(await waitForGone(page, '[data-smoke="workspace-config-modal"]', 'workspace config modal closes', 5_000))
    passes.push(await waitForSelector(page, '[data-smoke="screen-mode-card"]', 'back from workspace config'))

    await page.screenshot({
      path: path.join(artifactDir, 'smoke-home.png'),
      fullPage: true,
    })

    await clickBySelector(page, '[data-smoke="camera-request"]')
    await new Promise((resolve) => setTimeout(resolve, 4_000))
    if (consoleFailures.length > 0) {
      throw new Error(`Face Landmarker worker console failure:\n${consoleFailures.join('\n')}`)
    }

    passes.push(await waitForCameraVideoReady(page, '摄像头视频流已挂载到实时窗口'))
    passes.push(await waitForSelector(page, '[data-smoke="camera-hud-toggle"]', 'HUD 显示开关可见'))
    await clickBySelector(page, '[data-smoke="camera-hud-toggle"]')
    passes.push(await waitForSelector(page, '[data-smoke="camera-hud"]', '摄像头入口可正常拉起', 25_000))
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

    passes.push(await waitForSelector(page, '[data-smoke="posture-calibration-status"]', '姿态校准状态可见'))

    await clickBySelector(page, '[data-smoke="demo-toggle"]')
    passes.push(await waitForSelector(page, '[data-smoke="demo-trigger-eye"]', 'Demo 快捷条可正常显示'))
    await clickBySelector(page, '[data-smoke="demo-trigger-eye"]')
    passes.push(await waitForSelector(page, '[data-smoke="reminder-toast"]', 'Demo 链路可触发统一提醒'))
    await hoverBySelector(page, '[data-smoke="reminder-toast"]')
    await clickBySelector(page, '[data-smoke="reminder-complete"]')
    passes.push(await waitForGone(page, '[data-smoke="reminder-toast"]', '提醒 toast 可正常完成并关闭'))
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
