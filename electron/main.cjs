const { app, BrowserWindow, shell, session } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const appName = 'HO'
const defaultWidth = 1440
const defaultHeight = 960

let staticServer = null

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.data', 'application/octet-stream'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.task', 'application/octet-stream'],
  ['.wasm', 'application/wasm'],
])

function getContentType(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream'
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child)

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveRendererRoot() {
  return path.resolve(__dirname, '..', 'dist')
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500)
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Internal server error')
      return
    }

    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Length': content.length,
      'Content-Type': getContentType(filePath),
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
      'Cross-Origin-Opener-Policy': 'same-origin',
    })
    response.end(content)
  })
}

function createStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (!request.url) {
        response.writeHead(400)
        response.end('Bad request')
        return
      }

      const requestUrl = new URL(request.url, 'http://127.0.0.1')
      const safePathname = decodeURIComponent(requestUrl.pathname)
      const normalizedPathname = safePathname === '/' ? '/index.html' : safePathname
      const filePath = path.resolve(rootDir, `.${normalizedPathname}`)

      if (!isPathInside(rootDir, filePath)) {
        response.writeHead(403)
        response.end('Forbidden')
        return
      }

      fs.stat(filePath, (error, stat) => {
        if (!error && stat.isFile()) {
          sendFile(response, filePath)
          return
        }

        const hasExtension = path.extname(filePath) !== ''
        const fallbackPath = path.join(rootDir, 'index.html')

        if (!hasExtension && isPathInside(rootDir, fallbackPath)) {
          sendFile(response, fallbackPath)
          return
        }

        response.writeHead(404)
        response.end('Not found')
      })
    })

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate a local renderer server port.'))
        return
      }

      resolve({
        close: () => server.close(),
        url: `http://127.0.0.1:${address.port}/`,
      })
    })
  })
}

async function getRendererUrl() {
  if (process.env.ELECTRON_RENDERER_URL) {
    return process.env.ELECTRON_RENDERER_URL
  }

  const rendererRoot = resolveRendererRoot()

  if (!fs.existsSync(path.join(rendererRoot, 'index.html'))) {
    throw new Error(
      `Renderer build not found at ${rendererRoot}. Run "npm run build" before starting the desktop app.`,
    )
  }

  staticServer = await createStaticServer(rendererRoot)
  return staticServer.url
}

function installPermissionHandlers() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'camera' || permission === 'microphone')
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || permission === 'camera' || permission === 'microphone'
  })
}

async function createMainWindow() {
  const rendererUrl = await getRendererUrl()
  const mainWindow = new BrowserWindow({
    backgroundColor: '#eef4f7',
    height: defaultHeight,
    minHeight: 760,
    minWidth: 1120,
    show: false,
    title: appName,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: defaultWidth,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  await mainWindow.loadURL(rendererUrl)
}

app.setName(appName)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(async () => {
  installPermissionHandlers()
  await createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })
}).catch((error) => {
  console.error(error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  staticServer?.close()
  staticServer = null
})
