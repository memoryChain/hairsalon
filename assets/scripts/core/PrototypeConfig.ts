import { HAIR_PRESETS } from './HairstyleCatalog';
export type { HairStyle } from './HairstyleCatalog';
export type ToolMode = 'rotate' | 'cut' | 'shave' | 'comb' | 'blow';
export const CONFIG = {
    step: 1 / 60, maxSteps: 4, iterations: 8, maxTurnSpeed: 3.5,
    dragRadiansPerPixel: 0.009, maxRotationSubsteps: 4, rotationStepAngle: 0.25,
    cutRadiusPixels: 10, shaveRadiusPixels: 12,
    maxDebris: 24, debrisLifetime: 5, minCutLength: 0.045,
    headY: 1.65, headX: 0.57, headHeight: 0.73, headZ: 0.54,
    floorY: -0.12, cameraZ: 7.1, cameraY: 1.60, fov: 39,
    radialSides: 6, maxVertices: 72000,
} as const;
export const PALETTE = {
    afro: HAIR_PRESETS.afro.color,
    mane: HAIR_PRESETS.mane.color,
    waves: HAIR_PRESETS.waves.color,
    curtains: HAIR_PRESETS.curtains.color,
    doublecover: HAIR_PRESETS.doublecover.color,
    backcover: HAIR_PRESETS.backcover.color,
    crownlong: HAIR_PRESETS.crownlong.color,

    spiky: [0.105, 0.12, 0.16], long: [0.37, 0.20, 0.18],
    crop: HAIR_PRESETS.crop.color, mohawk: HAIR_PRESETS.mohawk.color, quiff: HAIR_PRESETS.quiff.color, sidepart: HAIR_PRESETS.sidepart.color, bob: HAIR_PRESETS.bob.color, lob: HAIR_PRESETS.lob.color, asymmetric: HAIR_PRESETS.asymmetric.color, flipped: HAIR_PRESETS.flipped.color,
    receding: HAIR_PRESETS.receding.color, crown: HAIR_PRESETS.crown.color, horseshoe: HAIR_PRESETS.horseshoe.color, combover: HAIR_PRESETS.combover.color, bald: HAIR_PRESETS.bald.color,
    skin: [0.94, 0.68, 0.48], cape: [0.25, 0.58, 0.53],
} as const;
export const TOOL_HINTS: Record<ToolMode, string> = {
    cut: '滑动可连续剪发；头下方空白区域拖动旋转',
    shave: '沿头发涂抹剃光；下方空白区域拖动旋转',
    comb: '从头发起手向上或侧面梳；松手保留造型',
    blow: '从点击处朝头部吹风；按住持续吹动可见头发',
    rotate: '在头下方空白区域拖动，左右转动、上下俯仰',
};
