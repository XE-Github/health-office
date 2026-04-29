import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element "#root" was not found.')
}

const root = createRoot(rootElement)

function renderBootstrapLoading() {
  root.render(
    <div className="bootstrap-shell">
      <section className="bootstrap-card bootstrap-card-loading">
        <span className="bootstrap-eyebrow">Launching</span>
        <h1>HO 正在启动。</h1>
        <p>正在初始化前端模块与实时感知能力，首次启动会稍慢一些。</p>
        <div className="bootstrap-loading">
          <span className="bootstrap-spinner" aria-hidden="true" />
          <strong>加载中，请稍候…</strong>
        </div>
      </section>
    </div>,
  )
}

function renderBootstrapError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap failure.'

  root.render(
    <div className="bootstrap-shell">
      <section className="bootstrap-card">
        <span className="bootstrap-eyebrow">Bootstrap Error</span>
        <h1>页面启动失败，已进入可见兜底状态。</h1>
        <p>当前不是空白页了。前端初始化时发生了错误，请重启 dev 服务并强制刷新页面。</p>
        <div className="bootstrap-code">{message}</div>
        <ol>
          <li>关闭当前 `npm run dev` 进程。</li>
          <li>重新执行 `npm run dev`。</li>
          <li>打开终端输出里的地址，并按 `Ctrl + Shift + R` 强制刷新。</li>
        </ol>
      </section>
    </div>,
  )
}

async function bootstrap() {
  renderBootstrapLoading()

  try {
    const { default: App } = await import('./App.tsx')

    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (error) {
    console.error('App bootstrap failed.', error)
    renderBootstrapError(error)
  }
}

void bootstrap()
