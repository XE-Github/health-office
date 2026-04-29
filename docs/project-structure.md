# 健康办公项目结构速查

这份文档用于后续快速迭代时减少无关上下文读取。优先按需求类型打开对应模块，不要默认整段阅读 `App.tsx` 或 `usePoseMonitor.ts`。

## 入口层

- `src/App.tsx`：主应用编排层，负责页面组合、状态接线、HUD 浮层、提醒入口和多屏配置页入口。除非要改全局状态接线，否则不要把页面 JSX 或业务算法继续堆进这里。
- `src/main.tsx`：React 挂载入口。
- `src/App.css`：主样式聚合入口，只保留 `src/styles/` 的导入顺序。不要继续往这里写具体样式。

## 样式层

- `src/styles/app-layout.css`：全局页面宽度、viewport、主布局和 stacked 基础规则。
- `src/styles/hero.css`：健康办公主卡片、当前建议、校准卡片和 Demo 快捷触发。
- `src/styles/density.css`：compact / tight 布局密度适配规则。
- `src/styles/buttons.css`：按钮基础样式。
- `src/styles/camera.css`：实时感知窗口、摄像头画面、HUD、校准完成提示。
- `src/styles/settings.css`：设置卡片、输入项、姿态提醒开关。
- `src/styles/workspace-config.css`：多屏配置页。
- `src/styles/panel-primitives.css`：Panel、状态胶囊、ToggleChip 等通用 UI 样式。
- `src/styles/reminder-toast.css`：顶部轻提醒 Toast。
- `src/styles/camera-fullscreen.css`：摄像头视窗全屏样式。
- `src/styles/responsive.css`：大屏网格与小屏响应式规则。改响应式布局时最后看这里。

## UI 层

- `src/components/ui/AppPrimitives.tsx`：通用轻量 UI 原语，例如卡片、状态胶囊、输入项、开关、Demo 触发按钮。改设置卡片基础形态时优先看这里。
- `src/components/OfficeHeroPanel.tsx`：左侧健康办公主卡片，包含开始办公、摄像头授权、Demo 模式、多屏配置入口、校准状态和 Demo 快捷触发。改主卡片展示和入口文案时先看这里。
- `src/components/CameraPanel.tsx`：实时感知窗口展示层，包含摄像头画面、overlay canvas、HUD 开关、全屏按钮、摄像头状态与校准完成提示。改实时感知窗口布局时先看这里。
- `src/components/SettingsPanel.tsx`：设置卡片展示层，包含连续用眼、低眨眼阈值、姿态提醒开关、视距阈值输入。改设置项布局与输入文案时先看这里。
- `src/components/ReminderToast.tsx`：顶部轻提醒 Toast。改提醒外观与眨眼关闭展示时看这里。
- `src/components/WorkspaceConfigPage.tsx`：多屏布局配置弹窗壳层，已经由 `App.tsx` 懒加载。改弹窗信息架构、屏幕列表和校准侧栏时看这里。
- `src/components/WorkspaceThreeBoard.tsx`：懒加载 Three.js 3D 画布。改空间盒子、屏幕拖动、旋转视角控制杆、画布内添加/删除/校准入口时看这里。

## 状态与业务配置层

- `src/lib/userTuning.ts`：个人基准、推荐阈值、正式/Demo 节奏参数、阈值归一化。改“连续用眼阈值、眨眼低频阈值、视距阈值默认值”时优先看这里。
- `src/lib/calibrationDisplay.ts`：视距/姿态校准的状态文案和提示文案。改 HUD 或卡片里的校准提示时优先看这里。
- `src/lib/reminderDefinitions.ts`：提醒候选生成。改提醒标题、建议、优先级候选时看这里。
- `src/hooks/useReminderScheduler.ts`：统一提醒调度。改“同一时间只出现一个提醒、冷却、完成/关闭逻辑”时看这里。

## 检测与算法层

- `src/hooks/usePoseMonitor.ts`：视觉检测主 Hook，保留摄像头帧循环、状态接线和核心流程编排。不要再往这里堆常量、存储、绘制或纯计算。
- `src/lib/poseMonitorTypes.ts`：视觉检测共享类型。改 Hook 返回数据、校准快照、视距/姿态/眨眼数据结构时先看这里。
- `src/lib/poseMonitorConstants.ts`：检测参数、关键点索引、绘制颜色和默认状态。改眨眼灵敏度、校准采样帧数、姿态阈值基础参数时先看这里。
- `src/lib/poseMonitorStorage.ts`：视距/姿态校准与今日眨眼计数的 localStorage 读写。改“重启后恢复数据/清空或迁移本地数据”时先看这里。
- `src/lib/poseMonitorMath.ts`：纯计算工具，包括基线均值、角度差、侧屏适配补偿、视距校准融合、眨眼基线等。改侧屏办公适配、校准数值计算时先看这里。
- `src/lib/poseMonitorOverlay.ts`：摄像头画面上的 Face/Pose 关键点、骨架、轮廓绘制。改实时感知窗口可视化时先看这里。
- `src/lib/poseMonitorDetectors.ts`：Face Mesh / BlazePose 检测器初始化、MediaPipe 到 TFJS 的降级与模型缓存。改摄像头初始化失败、模型加载、运行时降级时先看这里。
- `src/workers/faceLandmarker.worker.ts`：Face Landmarker Worker。
- `src/lib/visionRuntime.ts`：视觉运行时加载。
- `src/lib/distance.ts`：视距阈值、校准 preset 和基础数值工具。
- `src/lib/workspaceConfig.ts`：多屏布局配置数据结构、空间边界、屏幕尺寸上限与归一化。
- `src/lib/workspaceCalibration.ts`：多屏校准数据、当前工作屏推断与目标数据。

## 后续重构优先级

1. 继续把 `usePoseMonitor.ts` 内部的 `blink`、`distance`、`posture`、`calibration` 流程拆成领域子模块，但每次只拆一条链路并跑快速校验。
2. 把 `App.css` 按 `hero`、`camera`、`settings`、`workspace-config` 分组拆分，避免样式修改时加载整份 CSS。
3. 继续观察 `App.tsx` 剩余状态接线，如果下一轮 UI 改动仍需要读太多上下文，再抽 `cameraHudSections` 或校准入口接线。
4. 保持跨模块关系通过 `lib` 和 `hooks` 中间层连接，避免组件直接依赖检测实现细节。
