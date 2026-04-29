import assert from 'node:assert/strict'

import {
  createAlignmentAdjustedMetrics,
  deriveAlignmentAdaptation,
  deriveAlignmentRiskAdjustment,
} from '../src/lib/poseMonitorMath.ts'

function createAlignment(overrides = {}) {
  return {
    detector: 'face-landmarker',
    horizontal: 'center',
    horizontalOffset: 0,
    pitchDeg: 0,
    pitchProxy: 0,
    quality: 0.96,
    reason: 'none',
    rollDeg: 0,
    status: 'in-range',
    vertical: 'level',
    verticalOffset: 0,
    yawDeg: 0,
    yawProxy: 0,
    ...overrides,
  }
}

const baselineMetrics = {
  chinShoulderRatio: 0.19,
  confidence: 0.96,
  eyeShoulderRatio: 0.25,
  eyeSpanRatio: 0.082,
  faceConfidence: 1,
  faceRatio: 0.246,
  faceToShoulderRatio: 0.38,
  headRollDeg: 0,
  irisRatio: 0.014,
  mouthShoulderRatio: 0.16,
  noseShoulderRatio: 0.23,
  poseConfidence: 0.9,
  shoulderTiltDeg: 0,
  shoulderWidthRatio: 0.52,
}

const sideTarget = {
  horizontalOffset: 0.32,
  pitchDeg: -3,
  rollDeg: 0,
  verticalOffset: -0.04,
  yawDeg: 29,
}

const alignedSideScreen = createAlignment({
  horizontal: 'right',
  horizontalOffset: 0.32,
  pitchDeg: -3,
  verticalOffset: -0.04,
  yawDeg: 29,
  yawProxy: 0.42,
})
const alignedAdaptation = deriveAlignmentAdaptation(alignedSideScreen, sideTarget)
const alignedAdjustment = deriveAlignmentRiskAdjustment(
  alignedSideScreen.status,
  alignedAdaptation,
)
const alignedMetrics = createAlignmentAdjustedMetrics(
  baselineMetrics,
  alignedSideScreen,
  sideTarget,
)

assert.equal(alignedAdaptation.targetSideStrength, 1)
assert.equal(alignedAdjustment.sideTargetFit, 1)
assert.ok(alignedAdjustment.distanceRelaxation >= 0.12)
assert.ok(alignedAdjustment.distanceSlack >= 0.014)
assert.ok(
  Math.abs(alignedMetrics.faceRatio - baselineMetrics.faceRatio) < 0.001,
  'side-screen target fit should not inflate face ratio',
)

const driftedSideScreen = createAlignment({
  horizontal: 'right',
  horizontalOffset: 0.54,
  pitchDeg: -4,
  status: 'edge',
  verticalOffset: -0.05,
  yawDeg: 43,
  yawProxy: 0.58,
})
const driftedAdjustment = deriveAlignmentRiskAdjustment(
  driftedSideScreen.status,
  deriveAlignmentAdaptation(driftedSideScreen, sideTarget),
)

assert.ok(
  driftedAdjustment.sideTargetFit < 0.6,
  'side-screen fit should drop after obvious head/camera offset drift',
)
assert.ok(
  driftedAdjustment.sideTargetFit < alignedAdjustment.sideTargetFit,
  'drifted side-screen should lose target-fit relaxation',
)

const noBaselineAdjustedMetrics = createAlignmentAdjustedMetrics(
  baselineMetrics,
  alignedSideScreen,
  null,
)

assert.ok(
  noBaselineAdjustedMetrics.faceRatio > baselineMetrics.faceRatio,
  'without a side-screen target, angle compensation should remain conservative',
)

console.log('side-screen regression checks passed')
