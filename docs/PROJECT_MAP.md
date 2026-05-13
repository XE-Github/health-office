# 健康办公项目索引

这份文档用于后续快速迭代时减少无关上下文读取。默认先根据需求定位功能区，只读对应文件；除非需求跨域，否则不要先打开整份 `App.tsx` 或完整 smoke 脚本。

## 默认迭代规则

- 默认只做浏览器 Web 适配；Electron / 桌面端只在明确提出时处理。
- 默认采用快速模式：小改动只跑 `npm run verify:quick`。
- 只有用户明确说“准备验收”或“准备交付”时，才跑 `npm run verify:full`、桌面打包或长链路测试。
- 每轮需求先锁定影响范围，再读取文件；不为了保险全量加载上下文。
- 模块化按需求逐步做，不进行一次性大拆分。

## 功能到文件

| 功能区 | 优先读取 | 何时读取 |
| --- | --- | --- |
| HO 主卡片、入口、Demo 快捷触发 | `src/components/OfficeHeroPanel.tsx`, `src/styles/hero.css` | 改首页卡片、按钮、校准入口、Demo 入口 |
| 页面编排与全局状态接线 | `src/App.tsx` | 改跨模块状态、弹窗入口、HUD portal、统一提醒候选接线 |
| 设置弹窗 | `src/components/SettingsPanel.tsx`, `src/styles/settings.css`, `src/lib/userTuning.ts` | 改阈值、开关、个人基准、设置文案 |
| 实时感知窗口 | `src/components/CameraPanel.tsx`, `src/styles/camera.css`, `src/styles/camera-fullscreen.css` | 改摄像头画面、HUD 开关、全屏、窗口布局 |
| HUD 内容 | `src/App.tsx`, `src/components/CameraPanel.tsx`, `src/styles/camera.css` | 改 HUD 字段、拖动、复制快照、显示/隐藏逻辑 |
| 顶部 Toast 提醒 | `src/components/ReminderToast.tsx`, `src/lib/reminderDefinitions.ts`, `src/hooks/useReminderScheduler.ts`, `src/styles/reminder-toast.css` | 改提醒文案、优先级、冷却、完成/眨眼关闭 |
| 摄像头与视觉运行时 | `src/hooks/usePoseMonitor.ts`, `src/lib/poseMonitorDetectors.ts`, `src/lib/visionRuntime.ts`, `src/workers/faceLandmarker.worker.ts` | 改模型加载、摄像头状态、检测主循环、Worker 降级 |
| 视距检测与校准 | `src/lib/distance.ts`, `src/lib/poseMonitorMath.ts`, `src/lib/poseMonitorStorage.ts`, `src/lib/calibrationDisplay.ts` | 改视距信号、阈值、校准采样、持久化、校准文案 |
| 姿态检测与基线 | `src/lib/poseMonitorMath.ts`, `src/lib/poseMonitorConstants.ts`, `src/lib/poseMonitorTypes.ts`, `src/hooks/usePoseMonitor.ts` | 改低头、前倾、歪头、肩线倾斜、姿态校准 |
| 眨眼检测 | `src/lib/poseMonitorMath.ts`, `src/lib/poseMonitorConstants.ts`, `src/lib/poseMonitorStorage.ts`, `src/hooks/usePoseMonitor.ts` | 改 EAR、眨眼计数、低频判断、日计数 |
| 关键点和骨架绘制 | `src/lib/poseMonitorOverlay.ts`, `src/styles/camera.css` | 改画面 overlay、关键点、骨架、Face/Pose 标注 |
| 多屏配置弹窗 | `src/components/WorkspaceConfigPage.tsx`, `src/styles/workspace-config.css` | 改弹窗布局、当前屏信息、校准状态、配置入口 |
| Three.js 空间画布 | `src/components/WorkspaceThreeBoard.tsx`, `src/lib/workspaceConfig.ts` | 改 3D 画布、屏幕拖动、控制杆、尺寸/位置/姿态编辑 |
| 布局档案 | `src/lib/workspaceLayoutProfiles.ts`, `src/lib/presetWorkspaceLayoutProfiles.ts`, `src/components/WorkspaceThreeBoard.tsx` | 改布局保存、更新、导入、导出、预置布局 |
| 多屏校准与工作屏识别 | `src/lib/workspaceCalibration.ts`, `src/lib/poseMonitorMath.ts`, `src/components/WorkspaceConfigPage.tsx` | 改屏幕校准、当前工作屏推断、侧屏适配 |
| 测试脚本 | `scripts/smoke-ui.cjs`, `scripts/side-screen-regression.mjs`, `package.json` | 改 smoke 覆盖范围、测试命令、回归脚本 |
| 预置布局同步 | `scripts/sync-preset-workspace-layouts.cjs`, `public/preset-workspace-layouts/manifest.json` | 改预置布局读取路径、manifest、同步规则 |

## 测试分层

| 命令 | 用途 | 默认场景 |
| --- | --- | --- |
| `npm run verify:quick` | `typecheck + lint` | 日常小迭代默认使用 |
| `npm run verify:build` | `typecheck + lint + build` | 改脚本、构建、懒加载、依赖时使用 |
| `npm run smoke:quick` | 首页、模式选择、设置弹窗基础链路 | 快速 UI 可用性检查 |
| `npm run smoke:workspace` | 多屏配置、3D 画布、布局档案、导入导出 | 改多屏配置时使用 |
| `npm run smoke:camera` | 摄像头、HUD、校准入口、返回 HO 后视频保持 | 改摄像头/HUD/校准时使用 |
| `npm run verify:full` | 完整构建和完整 smoke | 准备验收/交付时使用 |

