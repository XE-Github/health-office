## [LRN-20260401-001] best_practice

**Logged**: 2026-04-01T16:48:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
下线旧页面入口或功能分支时，不能只删 UI，还要兼容本地持久化状态，否则旧的 `localStorage` 值会把用户带进不存在的视图。

### Details
这次移除底部 Demo 入口和 `gaze` 训练后，`detailView` 的旧持久化值仍可能是已下线的 `demo`。如果只删除按钮和卡片，不做兼容处理，页面刷新后就可能落在一个没有任何内容的辅助区，用户会误以为页面坏了。

### Suggested Action
- 删除旧视图时，同步梳理对应的 `localStorage` key 和默认值
- 对持久化枚举值增加一次运行时归一化，发现非法值时自动回退到安全默认项
- 把“删 UI + 清状态 + 跑 smoke”当成同一类变更的固定收尾步骤

### Metadata
- Source: simplify-and-harden
- Related Files: src/App.tsx
- Tags: localStorage, migration, ui-removal, hardening
- Pattern-Key: harden.persisted-view-migration

---

## [LRN-20260410-001] best_practice

**Logged**: 2026-04-10T00:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: vision-adaptation

### Summary
For side-screen office use, do not treat "facing the camera" as the only valid working posture. Keep a calibrated alignment baseline, then maintain a separate runtime working-alignment baseline that can drift toward a stable side-screen orientation.

### Details
The previous model used absolute yaw/offset thresholds to gate posture and distance checks. In real office use, users often turn toward a side monitor while remaining in a healthy working posture. Absolute gating made side-screen use look like "head tilt / distance too close / posture normal only when facing the camera." The more robust pattern is: (1) keep a persisted calibration baseline for distance/posture, (2) capture alignment baseline during posture calibration, and (3) adapt posture and distance using deltas from the current stable working alignment instead of deltas from camera-center.

### Suggested Action
- Use absolute face angle only for hard out-of-range detection.
- Use alignment delta vs. working baseline for posture gating and distance compensation.
- Let the working baseline drift only while posture is normal and distance is not too close, so bad posture does not retrain the baseline.

### Metadata
- Source: implementation
- Related Files: src/hooks/usePoseMonitor.ts
- Tags: side-screen, calibration, baseline, posture, distance
- Pattern-Key: adaptation.use-calibrated-baseline-plus-dynamic-working-alignment

---

## [LRN-20260409-002] correction

**Logged**: 2026-04-09T21:20:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
长时间交互的关闭进度不能依赖滚动窗口计数，校准缺失时也不能再用隐藏兜底冒充“已可用”。

### Details
这轮人工测试暴露了两个典型问题。第一，提醒 Toast 的“眨眼 3 次关闭”原来基于 `blinkCountWindow`，而这个值是 60 秒窗口内的滚动计数，窗口滑动后会出现 `3/2 -> 3/1` 的倒退，长时间运行后也容易让关闭逻辑失效。第二，视距/姿态在未拿到本地校准数据时，页面文案虽然写“未校准”，但底层仍可能用旧的自动基线兜底，造成产品语义和真实行为不一致。

### Suggested Action
- 需要“累计完成次数”的交互，一律使用单调递增计数或事件序列，不能直接复用滚动窗口统计值。
- 只要产品语义明确要求“未校准不可用”，就不要再保留隐式自动兜底，否则用户很难理解系统当前到底依据什么在判断。

### Metadata
- Source: user_feedback
- Related Files: src/components/ReminderToast.tsx, src/hooks/usePoseMonitor.ts, src/App.tsx
- Tags: blink, calibration, interaction, product-logic
- Pattern-Key: harden.monotonic-progress-and-explicit-calibration-state

---

## [LRN-20260408-001] correction

**Logged**: 2026-04-08T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
姿态校准后的提醒灵敏度不能只靠“统一放宽/收紧阈值”来调；要分别针对低头、前倾、肩线倾斜做基于个人基线的偏移判断，并把“侧屏办公”作为独立适配场景处理。

### Details
用户反馈表明三类问题同时存在：低头、前倾、肩线倾斜都需要很大幅度才会触发；而把笔记本放到侧面时，又容易出现姿态和视距误判。根因是当前姿态链路虽然已有姿态基线和脸屏适配，但在手动姿态校准后仍然保留了过强的保守阈值，同时又让歪头/肩线倾斜在侧屏场景下继续参与判断。更合理的做法是：对低头和前倾加入“相对个人基线的偏移量”信号，提高校准后灵敏度；对肩线倾斜降低基础阈值，但在侧屏场景下明显抬高门槛或暂停；对视距则用头姿角度做更强的透视补偿，并在侧屏时增加判定缓冲。

### Suggested Action
- 低头检测同时看“低于阈值”和“相对基线下沉了多少”
- 前倾检测同时看“脸肩比例增大”和“相对基线前探了多少”
- 肩线倾斜降低基础阈值，但在明显侧屏时提高门槛
- 侧屏办公要单独当作一个适配场景，不要直接复用正对屏幕时的歪头/肩线规则

### Metadata
- Source: user_feedback
- Related Files: src/hooks/usePoseMonitor.ts
- Tags: posture, calibration, side-screen, sensitivity
- Pattern-Key: adapt.posture-thresholds-by-baseline-and-screen-angle

---

## [LRN-20260408-003] best_practice

**Logged**: 2026-04-08T18:10:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
姿态检测如果同时承担“自动学习当前设备几何关系”和“用户显式校准”的职责，后续很容易把自动兜底逻辑和用户可见校准逻辑混在一起；更稳的做法是保留自动 baseline 作为隐式兜底，同时单独提供一条可持久化的“姿态基线校准”链路给用户主动触发。

### Details
这轮为了适配笔记本摄像头在屏幕上方、屏幕开合角度各异的真实办公场景，已经先做了自动 posture baseline bootstrap，用来避免刚启动就把自然看屏误判成低头或前倾。但用户接下来需要一个明确、可理解、可复用的“姿态基线校准”功能。如果直接把用户校准继续塞进原来的自动 sampleRef / baselineRef 更新分支里，就会出现两个问题：一是 UI 很难解释当前到底是“系统自动学习”还是“用户手动校准”；二是后续一旦继续调姿态阈值，很容易不小心破坏用户显式校准这条能力。更可靠的实现是：保留自动 baseline 作为后台兜底，同时新增独立的 posture calibration state、sample refs、blocking reasons 和本地持久化；用户校准完成后再把结果写回 baselineRef，并在 UI 中明确显示“开始校准 / 采样中 / 已生效”。

### Suggested Action
- 对“自动学习”和“用户显式校准”并存的检测能力，优先拆成两条独立状态链：后台兜底链 + 用户可见链
- 用户可见校准要单独持久化，避免应用重启后又退回隐式自动基线
- 采样中的 blocking reason 要面向用户表达清楚，例如“请让肩膀完整入镜”“检测到快速移动，已清零并重新采样”
- 自动 baseline 的后续细化更新应在用户手动校准未进行时执行，避免两条链路互相污染

### Metadata
- Source: self_review
- Related Files: src/hooks/usePoseMonitor.ts, src/App.tsx
- Tags: posture, calibration, baseline, laptop-camera, ux
- Pattern-Key: separate.auto-baseline-from-user-calibration

---

## [LRN-20260408-004] posture_manual_baseline_must_not_drift_after_calibration

**Logged**: 2026-04-08T18:34:00+08:00
**Priority**: high
**Status**: resolved
**Area**: posture-detection

### Summary
姿态检测一旦引入“手动姿态校准”，就不能再让后台自动 baseline refinement 继续悄悄跟着用户姿态漂移；否则用户会感觉“校准之后反而什么都检测不出来了”。

### Details
这轮用户反馈：做完姿态校准后，HUD 中姿态长时间保持正常，只有极大幅度低头才触发，而且前倾、驼背基本复现不出来。根因不是单一阈值，而是两层叠加：第一，手动姿态校准写入的 baseline 仍然会被后台的自动 refine 逻辑持续更新，用户逐渐前倾或塌肩时，baseline 也会慢慢跟过去，导致真正的偏移量被吃掉；第二，原有阈值是为“无手动基线、尽量低误报”的保守策略设计的，放到“已有个人姿态基线”的场景就显得过宽。修复方式是：用户完成手动姿态校准后，锁定 posture baseline，不再让自动 refine 覆盖；同时把低头、前倾、驼背改成“相对校准基线的更敏感偏移阈值”，而不是继续沿用兜底型保守阈值。

### Suggested Action
- 检测能力同时拥有“自动兜底 baseline”和“用户手动校准 baseline”时，要明确哪一条有更高优先级
- 用户手动校准完成后，默认锁定该基线，除非用户再次主动校准
- 面向“已校准”的阈值应单独设计，不能直接复用“未校准时的低误报阈值”
- 如果出现“校准后几乎永远正常”的反馈，优先排查 baseline drift，再排查阈值宽松问题

### Metadata
- Source: user_feedback
- Related Files: src/hooks/usePoseMonitor.ts
- Tags: posture, calibration, baseline-drift, thresholds
- Pattern-Key: lock.manual-posture-baseline-after-calibration

---

## [LRN-20260408-002] posture_laptop_camera_geometry

**Logged**: 2026-04-08T10:32:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Posture detection for laptop users must account for camera-over-screen geometry and natural downward screen gaze.

### Details
The laptop camera is above the display, and the screen hinge is usually opened beyond 90 degrees. A user can be upright while naturally looking slightly downward or at a screen plane that is not perpendicular to the face. Absolute head/face geometry can therefore misclassify normal use as `head-down` or `forward-head`.

### Suggested Action
- Learn an initial local working posture baseline from stable face/upper-body frames before making aggressive posture calls.
- Before the baseline is ready, make posture classification conservative and only classify obvious deviations.
- After baseline exists, classify posture by deviation from the user's current screen/camera geometry rather than an ideal front-facing camera assumption.
- Keep face/screen alignment as a reliability gate, not as a direct posture diagnosis.

### Metadata
- Source: user_feedback
- Related Files: src/hooks/usePoseMonitor.ts
- Tags: posture, laptop-camera, face-screen-adaptation
- Pattern-Key: vision.posture.camera_geometry
- Recurrence-Count: 1

### Resolution
- **Resolved**: 2026-04-08T10:32:00+08:00
- **Notes**: Added initial posture baseline bootstrapping from stable frames and made no-baseline posture thresholds more conservative.

---

## [LRN-20260408-001] detection_thresholds_user_feedback

**Logged**: 2026-04-08T10:20:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
Vision detection thresholds should be tuned around natural user motion, not only obvious demo gestures.

### Details
User feedback showed blink detection required overly forceful blinks and posture detection over-reported `forward-head` while the user was sitting upright. The root cause was a combination of conservative blink sampling/thresholds and a forward-head classifier that accepted small face-to-shoulder/face-ratio changes without enough head-angle gating.

### Suggested Action
When tuning health micro-intervention logic:
- Prefer higher-frequency blink sampling and less aggressive smoothing so short natural blinks are captured.
- Keep moderate face angle/offset within the usable range, then fall back only at truly unreliable angles.
- Make forward-head stricter than distance changes; require in-range face alignment and larger deviation from posture baseline before classifying.
- Validate with user feedback because automated smoke tests cannot measure real camera accuracy.

### Metadata
- Source: user_feedback
- Related Files: src/hooks/usePoseMonitor.ts
- Tags: vision, blink, posture, thresholds
- Pattern-Key: vision.thresholds.natural_motion
- Recurrence-Count: 1

### Resolution
- **Resolved**: 2026-04-08T10:20:00+08:00
- **Notes**: Increased blink sampling frequency, made blink thresholds more sensitive, relaxed moderate face-angle gating, and tightened forward-head classification.

---

## [LRN-20260402-009] correction

**Logged**: 2026-04-02T14:14:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
视距校准完成后的“回填设定”不能再用比采样链路更窄的 UI 范围去静默裁剪，否则会出现“采样 29%，落地成 26%”这类假偏差。

### Details
这次问题不是视距采样本身错了，而是产品层的归一化逻辑仍把“正常基线”限制在 `10%~26%`。当用户在 `29%` 的真实视距信号下完成校准时，采样链路拿到的基线是对的，但 `deriveDistancePresetFromBaseline -> normalizeDistancePreset` 在回填阈值时把它 silently clamp 到了 `26%`。结果就是：HUD 采样信号和用户实际动作都没问题，最终生效设定却被隐藏的上限改写。更稳的做法是让“采样允许范围”“回填归一化范围”“UI 输入范围”共享同一套常量，并且把这套范围覆盖到当前校准能力允许的上界。

### Suggested Action
- 视距阈值与基线范围统一收敛到共享 helper，不要在 UI 和回填逻辑里各写一套 magic number。
- 采样链路允许到哪里，手动编辑和回填就至少要允许到哪里，避免 silent clip。
- 排查“用户看到的信号值”和“最终持久化生效值”之间是否还有其他隐藏转换。

### Metadata
- Source: user_feedback
- Related Files: src/App.tsx, src/lib/distance.ts
- Tags: distance, calibration, thresholds, silent-clip
- Pattern-Key: harden.distance-calibration-no-silent-clamp

---

## [LRN-20260402-008] best_practice

**Logged**: 2026-04-02T14:02:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: product-logic

### Summary
视距校准要和“打开摄像头”解耦；相机启动时优先恢复本地校准，只有用户明确触发时才进入重新采样。

### Details
这次需求再次暴露了一个典型产品冲突：如果每次 `requestCamera()` 都顺手调用 `recalibrate()`，那系统就会把“允许摄像头”和“重新校准视距”绑死在一起，导致用户每次重启都被重新拉进采样流程。更合理的做法是分三层：第一层，视距阈值和最近一次有效校准结果分别持久化；第二层，启动时先恢复本地校准快照，让检测直接进入可用状态；第三层，只有用户显式点了“视距校准”时才开始采样。这样既保住开箱即用，也不会把重新校准做成高频打扰。

### Suggested Action
- 相机启动默认只做检测准备，不自动开始视距校准。
- 视距校准基线要单独落本地，而不是只保存回填后的阈值。
- 没有本地校准时，先按当前阈值继续运行，同时给出轻量提示，而不是强制采样。

### Metadata
- Source: user_feedback
- Related Files: src/hooks/usePoseMonitor.ts, src/App.tsx, README.md
- Tags: distance, calibration, persistence, product-logic
- Pattern-Key: decouple.camera-start-from-distance-recalibration

---

## [LRN-20260402-007] best_practice

**Logged**: 2026-04-02T13:36:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: testing

### Summary
UI smoke tests in this repo should prefer stable `data-smoke` selectors over visible copy, and `npm run smoke` should self-start the local preview when needed.

### Details
This round exposed two recurring sources of brittleness: first, using UI copy as the main locator makes smoke tests fragile when product text is refined; second, requiring a manually started preview adds avoidable setup friction and makes `verify` less portable. The durable fix was to add small, targeted `data-smoke` attributes to key controls and panels, then move the smoke script to selector-first assertions. The script now also probes the preview URL and starts `npm run preview` automatically when no server is already running.

### Suggested Action
- Prefer `data-smoke` on high-value entry points, toggles, exports, overlays, and reminder actions.
- Keep smoke assertions anchored to structure and behavior, not exact wording, unless copy itself is the thing being validated.
- Make repository-level verification commands self-sufficient so `npm run verify` works in a clean local environment without manual server setup.

### Metadata
- Source: self_review
- Related Files: scripts/smoke-ui.cjs, src/App.tsx, src/components/FocusExerciseGuide.tsx
- Tags: smoke-test, selectors, preview, regression
- Pattern-Key: harden.selector-first-smoke-and-self-hosted-preview

---

## [LRN-20260402-006] best_practice

**Logged**: 2026-04-02T23:40:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
浏览器侧视距判断如果已经开放“用户阈值 + 视距校准”，最稳的实现是“虹膜主信号、脸宽兜底、姿态只做门控”。

### Details
这次为了提升视距判断准确性，没有回到三路联合投票，而是在现有 478 点脸部模型上引入了 iris 直径信号。做法是：优先用双眼 iris 尺寸相对校准基线推导出当前距离信号，再用少量 faceRatio 做兜底混合；如果出现明显低头/前倾，则姿态只用于决定“当前是否适合启用 iris 主信号”，而不是直接参与距离分类。这样既能保留 iris 对真实前后距离更敏感的优势，又能在 iris 不稳定、眼镜反光或姿态异常时自动退回脸宽信号，避免 UI 阈值和最终状态脱节。

### Suggested Action
- 后续只要继续迭代视距精度，优先增强 iris 质量门控和头部朝向补偿，不要再把肩宽比例拉回最终距离判断
- 用户可见的 `视距信号`、校准基线和阈值必须全部基于同一条最终距离信号链路
- 当主信号升级时，校准基线和 HUD 也要同步切到新信号，避免“显示的是 A，实际判断的是 B”

### Metadata
- Source: simplify-and-harden
- Related Files: src/hooks/usePoseMonitor.ts
- Tags: iris, distance, calibration, signal-design
- Pattern-Key: prefer.iris-primary-face-fallback-distance-signal

---

## [LRN-20260402-005] correction

**Logged**: 2026-04-02T23:10:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
用户可见的“视距设定”一旦可调，真实判定必须直接跟随这组阈值，不能再被隐藏辅助信号覆盖。

### Details
这次用户反馈：在 `过近` 状态下手动把阈值调回“正常”后，界面仍然持续提示 `过近`。根因有两层。第一层是距离分类虽然暴露成了 `过近阈值 / 正常基线 / 过远阈值` 三个可调值，但底层仍沿用 `faceRatio + eyeSpanRatio + faceToShoulderRatio` 的 2/3 投票逻辑，导致用户看到的 `视距信号` 已经进入正常区间时，隐藏的肩宽或眼距信号仍可能把状态继续压在 `too-close`。第二层是提醒调度器不会因为候选条件消失而自动收起当前 toast，于是即便阈值变化后问题已经解除，旧提醒仍然挂在界面上。对用户来说，这会直接破坏“我调的就是当前判定边界”的心智模型。

### Suggested Action
- 只要产品把距离阈值开放给用户手动调节，就让 `视距信号` 成为手动模式下的主判定依据，避免隐藏辅助信号覆盖最终状态
- 辅助信号可以继续用于默认模式、稳定性判断或未来调试，但不要和用户可见阈值争夺最终解释权
- 提醒调度器需要支持“条件已解除则自动收起当前提醒”，否则会让用户误以为设置没有生效
- 后续只要出现“设置值改变但主状态没变”的场景，优先检查是否还有不可见的二级规则在覆盖用户心智模型

### Metadata
- Source: user_feedback
- Related Files: src/hooks/usePoseMonitor.ts, src/hooks/useReminderScheduler.ts
- Tags: distance, thresholds, reminder, mental-model
- Pattern-Key: align.user-visible-thresholds-with-final-state

---

## [LRN-20260402-001] best_practice

**Logged**: 2026-04-02T10:12:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
在这个项目里用 PowerShell 检查中文源码时，要显式使用 `-Encoding utf8`；同时 smoke 对状态区断言要覆盖“准备中”这类过渡态，不能只盯最终文案。

### Details
这次重构视距校准时，`Get-Content` 默认输出把中文读成了乱码，导致 JSX 补丁定位一度不稳定。改成 `Get-Content -Encoding utf8` 后，文件内容和实际源码一致，补丁才能精确命中。另一个问题是 smoke 只断言了“采样中 / 已生效 / 允许摄像头后可开始校准”，但新版交互在摄像头刚稳定前会先显示“正在准备摄像头与关键点，稳定后会自动开始采样”，从而出现假失败。

### Suggested Action
- 在这个仓库里读取含中文 UI 文案的源码时，默认带上 `-Encoding utf8`
- 对状态机类 UI 的 smoke 断言，优先覆盖“准备中 / 采样中 / 已生效”这类阶段性文案，而不是只匹配单一终态

### Metadata
- Source: simplify-and-harden
- Related Files: src/App.tsx, scripts/smoke-ui.cjs
- Tags: powershell, utf8, smoke-test, ui-state
- Pattern-Key: harden.utf8-and-transitional-smoke

---

## [LRN-20260402-002] correction

**Logged**: 2026-04-02T10:26:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
用户主动触发“视距校准”时，校准链路必须只围绕距离本身工作，不能再混入姿态门槛或复用姿态基线。

### Details
之前的实现虽然把视距校准单独做成了入口，但底层仍然复用了通用姿态判断与共享基线，导致校准时会出现“请先坐直并抬头”这类与用户意图冲突的提示。对用户来说，校准的语义是“把我现在这个舒服距离记下来”，不是“先通过一遍姿态考核”。更深一层的问题是，如果直接用共享基线重建，还会把当前姿态带进后续姿态阈值里。

### Suggested Action
- 用户主动校准距离时，单独使用距离采样基线，不要复用姿态基线
- 校准阻塞原因只保留“距离极端导致信号不稳”和“脸部关键点不稳”两类
- 如果仍需要姿态基线，保持自动后台采样，与用户触发的视距校准解耦

### Metadata
- Source: user_feedback
- Related Files: src/hooks/usePoseMonitor.ts, src/App.tsx
- Tags: calibration, distance, posture, product-logic
- Pattern-Key: decouple.user-distance-calibration-from-posture

---

## [LRN-20260402-003] correction

**Logged**: 2026-04-02T19:05:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
视距校准的“稳定采样”不能只和上一帧做一次比较；校准期需要更高频的检测节奏，并且只有连续稳定后才计入样本。

### Details
这次用户反馈，在视距采样过程中快速前后移动头部时，界面没有提示“先稳定后再采样”。根因是原实现虽然增加了 `unstable` 分支，但仍沿用了常规 `750ms` 的检测节奏，并且一旦当前帧看起来正常就会立刻记样本。对真实用户动作来说，这样很容易漏掉短时晃动，导致界面表现成“继续采样”，和用户体感不一致。

### Suggested Action
- 用户主动做视距校准时，临时提高检测频率，优先捕捉短时头部位移和距离变化
- 校准样本只在“连续稳定若干帧”后才累计，避免一帧正常就混入样本
- 一旦检测到明显快速移动，清空当前未完成的校准样本，并明确告诉用户会从 0/6 重新开始
- 稳定性提示要跟真实采样条件完全一致，不能出现“文案说要稳定，实际上仍在偷偷采样”的偏差

### Metadata
- Source: user_feedback
- Related Files: src/hooks/usePoseMonitor.ts, src/App.tsx
- Tags: calibration, stability, sampling, product-logic
- Pattern-Key: harden.distance-calibration-stability-window

---

## [LRN-20260402-004] correction

**Logged**: 2026-04-02T22:05:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
需要跨卡片或跨视窗自由拖动的 HUD，不能只靠 `position: fixed`；还必须把 DOM 挂载到更高层，并避免整块面板拦截页面点击。

### Details
这次用户反馈，HUD 在普通状态下虽然样式看起来像固定悬浮层，但超出“实时感知窗口”后依然被裁剪。根因不是定位样式，而是 HUD 仍然挂在摄像头卡片内部，父级裁剪仍会生效。把 HUD 改成 portal 后，第二个问题又出现了：全局 HUD 会挡住底下按钮点击。最终稳定方案是：普通状态 portal 到 `document.body`，全屏时 portal 到全屏卡片节点；同时让 HUD 主体 `pointer-events: none`，只保留标题栏可拖拽。

### Suggested Action
- 需要跨容器悬浮的调试层，优先检查“挂载位置”而不是只调 CSS
- 同时评估悬浮层是否会挡住底层交互，必要时把交互范围缩到标题栏或少数可点击区域
- 对这类 UI 改动补浏览器级 smoke，确认不会影响其他按钮链路

### Metadata
- Source: user_feedback
- Related Files: src/App.tsx, src/App.css
- Tags: portal, hud, overlay, pointer-events
- Pattern-Key: harden.global-overlay-portal-and-hit-testing

---

## [LRN-20260402-010] correction

**Logged**: 2026-04-02T14:32:44+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
只要同一个产品动作有多个入口，入口之间就必须复用同一条执行链路；否则会出现“界面看起来做了同一件事，但一个入口会生效、另一个入口不会生效”的隐性状态分叉。

### Details
这次用户反馈“视距信号已经到 27.5%，重新采样后基线还是旧值 16.7%，而且重复采样也不变”。根因不是采样没跑，而是页面里至少有两个“重新采样/校准视距”的入口：设置卡片里的按钮会先标记 `applySampledDistancePresetRef.current = true`，因此采样完成后会把结果回填到个人基准；顶部的“重新采样视距”按钮则直接调用 `recalibrate()`，没有标记“把采样结果应用到当前设定”，导致内部采样虽然完成，用户真正看到的阈值和基线却保持旧值不变。对用户来说，这会直接表现为“我明明重采了，但系统没变”，而且非常难从界面上看出是入口不一致导致的。

### Suggested Action
- 所有“开始视距校准/重新采样视距”的按钮都必须复用同一个入口函数，统一处理“进入设置页、标记应用采样结果、开始采样”这三件事
- 以后只要有同一动作的多个 UI 入口，优先抽成单一 action handler，不要在 JSX 里分散写多套分支逻辑
- 遇到“用户说做了动作但状态没更新”的问题时，优先排查是不是不同入口走了不同状态链，而不是只盯检测算法本身

### Metadata
- Source: user_feedback
- Related Files: src/App.tsx
- Tags: calibration, entrypoint, state-flow, product-logic
- Pattern-Key: unify.multi-entry-actions-into-single-flow

---

## [LRN-20260407-001] best_practice

**Logged**: 2026-04-07T00:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
当单个 React 页面文件开始承载趋势图、提醒 Toast、检测主界面和设置页等多类上下文时，优先抽离“纯展示 + 明确 props”的组件，降低主文件阅读成本。

### Details
本轮源码梳理发现 `App.tsx` 同时包含业务状态聚合、眨眼趋势 SVG 图表、提醒 Toast、设置输入控件和主页面结构，文件超过 2500 行，后续迭代容易把不相关上下文混在一起。最安全的第一步不是重写核心检测 hook，而是把与业务状态耦合较弱的 `BlinkRateChart` 和 `ReminderToast` 抽到 `src/components/`，同时把趋势图时间格式化函数放进 `src/lib/`。这样保留原交互与 smoke 选择器，又能减少 App 主文件上下文。

### Suggested Action
- 优先抽离纯展示组件，不要在同一轮里大改摄像头检测、视距算法和 UI 结构
- 被多个组件复用的格式化函数放在 `src/lib/`，避免 React Fast Refresh 的 “组件文件只导出组件” 规则报错
- 抽组件后必须跑 `typecheck`、`lint`、`build` 和 smoke，确认选择器与交互链路没有被破坏

### Metadata
- Source: self_review
- Related Files: src/App.tsx, src/components/BlinkRateChart.tsx, src/components/ReminderToast.tsx, src/lib/blinkHistoryFormat.ts
- Tags: refactor, react, component-boundaries, context-size
- Pattern-Key: refactor.extract-pure-ui-components-from-app

---
## [LRN-20260412-001] correction

**Logged**: 2026-04-12T17:07:22.7227120+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
CSS 3D is not reliable enough for the multi-screen spatial editor once selection, occlusion, and view-relative dragging all matter; isolate the editor into a lazy Three.js module.

### Details
The previous CSS 3D board used the same pointer surface for rotating the scene and dragging screens, so users could accidentally rotate the space box when trying to move a screen. It also had view-relative gesture problems: after rotating around the Y axis, depth edits still behaved like a fixed vertical DOM gesture. Moving to a Three.js canvas gives a real 3D scene, raycast-based screen selection, depth-tested occlusion, and a separate dedicated view-rotation handle.

### Suggested Action
- Keep workspace spatial editing isolated in `WorkspaceThreeBoard.tsx`.
- Do not bind blank-canvas dragging to both scene rotation and object movement.
- Keep coordinate semantics explicit: near user is `-Z`, far from user is `+Z`.
- Use view-plane dragging for screen movement so the interaction adapts to the current camera angle.

### Metadata
- Source: user_feedback
- Related Files: src/components/WorkspaceThreeBoard.tsx, src/components/WorkspaceConfigPage.tsx
- Tags: threejs, multi-screen, spatial-editor, interaction
- Pattern-Key: workspace.spatial-editor-use-raycasted-three-module

---

## [LRN-20260507-001] correction

**Logged**: 2026-05-07T00:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
Multi-screen config numeric inputs should not show draft values that are ahead of the rendered 3D board state.

### Details
The user reported that editing Space X/Y/Z could leave the parameter card and the canvas temporarily inconsistent until refresh. The cause was draft-only numeric input: the card showed `numericDrafts`, while the actual layout and Three.js board were only updated on blur/Enter.

### Suggested Action
For visual configuration panels, commit finite numeric values live while still preserving draft handling for incomplete input states such as empty, `-`, or `.`. Add smoke probes that assert committed board state changes before blur/Enter.

### Metadata
- Source: user_feedback
- Related Files: src/components/WorkspaceThreeBoard.tsx, scripts/smoke-ui.cjs
- Tags: react, threejs, controlled-input, regression-test
