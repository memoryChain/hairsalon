import { createGroomCurve } from './HairGrooming';
/** 发型只改变曲线、截面与弹性；使用各自发际线，共用根域拓扑。 */
export const ALL_HAIR_STYLES = ['spiky', 'long', 'crop', 'mohawk', 'quiff', 'sidepart', 'bob', 'lob', 'asymmetric', 'flipped', 'receding', 'crown', 'horseshoe', 'combover', 'bald', 'afro', 'mane', 'waves', 'curtains', 'doublecover', 'backcover', 'crownlong'] as const;
export type HairStyle = typeof ALL_HAIR_STYLES[number];
export const HAIR_STYLES: readonly HairStyle[] = ['spiky','long','bob','lob','afro','mane','waves','curtains','doublecover','backcover','crownlong','combover'];
export interface HairPreset {
    name: string;
    color: readonly number[];
    bulge: number;
    taper: number;
    power: number;
    spring: number;
    damping: number;
    sway: number;
}
export const HAIR_PRESETS: Record<HairStyle, HairPreset> = {
    afro: { name: '蓬松爆炸头', color: [0.16, 0.1, 0.075], bulge: 0.48, taper: .85, power: 2, spring: 55, damping: 6, sway: 0.06 },
    mane: { name: '狮鬃长发', color: [0.4, 0.23, 0.09], bulge: 0.38, taper: .85, power: 2, spring: 55, damping: 6, sway: 0.14 },
    waves: { name: '外翻长发', color: [0.34, 0.15, 0.095], bulge: 0.32, taper: .85, power: 2, spring: 55, damping: 6, sway: 0.14 },
    curtains: { name: '中分长发', color: [0.15, 0.105, 0.085], bulge: 0.24, taper: .85, power: 2, spring: 55, damping: 6, sway: 0.12 },
    doublecover: { name: '双侧交叠遮盖', color: [0.23, 0.14, 0.1], bulge: 0.22, taper: .85, power: 2, spring: 55, damping: 6, sway: 0.07 },
    backcover: { name: '后梳前盖', color: [0.17, 0.12, 0.095], bulge: 0.26, taper: .85, power: 2, spring: 55, damping: 6, sway: 0.07 },
    crownlong: { name: '圆秃长发', color: [0.28, 0.18, 0.115], bulge: 0.28, taper: .85, power: 2, spring: 55, damping: 6, sway: 0.12 },
    spiky: { name: '赛亚尖刺', color: [.105, .12, .16], bulge: .16, taper: .94, power: 1.3, spring: 95, damping: 7, sway: .18 },
    long: { name: '齐刘海长发', color: [.29, .145, .095], bulge: .27, taper: .87, power: 1.8, spring: 38, damping: 5, sway: .12 },
    crop: { name: '清爽短碎发', color: [.12, .09, .075], bulge: .07, taper: .75, power: 1.4, spring: 110, damping: 8, sway: .045 },
    mohawk: { name: '莫西干', color: [.19, .105, .07], bulge: .04, taper: .93, power: 1.2, spring: 90, damping: 7, sway: .14 },
    quiff: { name: '蓬松背头', color: [.30, .19, .10], bulge: .18, taper: .84, power: 1.5, spring: 80, damping: 7, sway: .10 },
    sidepart: { name: '侧分短发', color: [.12, .145, .19], bulge: .16, taper: .83, power: 1.5, spring: 75, damping: 6, sway: .085 },
    bob: { name: '齐刘海波波头', color: [.26, .12, .085], bulge: .24, taper: .48, power: 2, spring: 60, damping: 6, sway: .085 },
    lob: { name: '及肩中发', color: [.39, .25, .13], bulge: .26, taper: .75, power: 1.8, spring: 44, damping: 5, sway: .12 },
    asymmetric: { name: '不对称短发', color: [.23, .12, .20], bulge: .25, taper: .65, power: 1.8, spring: 53, damping: 5.5, sway: .11 },
    flipped: { name: '外翘短发', color: [.40, .17, .09], bulge: .25, taper: .85, power: 1.5, spring: 52, damping: 5.5, sway: .13 },
    receding: { name: 'M 型后退', color: [.21, .14, .10], bulge: 0.07, taper: .9, power: 2.5, spring: 80, damping: 7, sway: .06 },
    crown: { name: '头顶圆秃', color: [.21, .14, .10], bulge: 0.065, taper: .9, power: 2.5, spring: 80, damping: 7, sway: .06 },
    horseshoe: { name: '马蹄形秃顶', color: [.21, .14, .10], bulge: 0.04, taper: .9, power: 2.5, spring: 80, damping: 7, sway: .06 },
    combover: { name: '侧梳遮盖', color: [.21, .14, .10], bulge: 0.1, taper: .9, power: 2.5, spring: 80, damping: 7, sway: .06 },
    bald: { name: '全秃', color: [.21, .14, .10], bulge: 0.02, taper: .9, power: 2.5, spring: 80, damping: 7, sway: .06 },
};
export function cycleStyle(style: HairStyle, delta: number): HairStyle {
    const n = HAIR_STYLES.length;
    return HAIR_STYLES[(HAIR_STYLES.indexOf(style) + delta % n + n) % n];
}
export function styleTitle(style: HairStyle): string {
    return `${HAIR_STYLES.indexOf(style) + 1}/${HAIR_STYLES.length} · ${HAIR_PRESETS[style].name}`;
}
export interface HairCurve {
    control: number[];
    end: number[];
}
/** 新造型的局部曲线。只在切换发型/头型时生成，模拟帧读取缓存。 */
export function createStyleCurve(style: HairStyle, root: number[], normal: number[], center: number[], seed: number): HairCurve {
    if (style !== 'bob') return createGroomCurve(style, root, normal, center);
    const [nx, ny, nz] = normal, rx = root[0] - center[0], rz = root[2] - center[2];
    const top = Math.max(0, ny), noise = Math.sin(seed * 12.9898) * .012;
    let end: number[], control: number[];
    {
        const az = Math.atan2(rx, rz), side = rx < 0 ? -1 : 1;
        const fringe = rz > .18 && Math.abs(az) < .78;
        if (fringe) {
            // 刘海沿额头排成几片弧形大束，长短错开，不从头顶逐条垂到同一高度。
            const across = Math.min(1, Math.abs(rx) / .40);
            end = [root[0] + side * .045, center[1] + .31 + .04 * across + noise * .5, center[2] + .65];
            control = [end[0] * .85 + center[0] * .15, root[1] + .02, center[2] + .79];
        }
        else {
            const a = rz > 0 && Math.abs(az) < 1.05 ? side * 1.05 : az;
            const layer = Math.pow(Math.max(0, ny), 2.2), wave = Math.sin(a * 5 + .35);
            const radius = .70 + .04 * wave + .055 * layer;
            end = [center[0] + Math.sin(a) * radius, center[1] - .39 + .73 * layer + .025 * wave, center[2] + Math.cos(a) * (radius - .04)];
            control = [center[0] + Math.sin(a) * (.88 + .035 * layer), Math.max(end[1] + .04, Math.min(root[1] + .02, center[1] + .18)), center[2] + Math.cos(a) * .82];
        }
        // 头顶用短而圆的真实发束衔接分缝，不再让顶层发束全部倒向两侧形成深缺口。
        const crown = Math.max(0, Math.min(1, (ny - .89) / .105)), soft = crown * crown * (3 - 2 * crown);
        for (let axis = 0; axis < 3; axis++) {
            end[axis] = end[axis] * (1 - soft) + (root[axis] + normal[axis] * .18) * soft;
            control[axis] = control[axis] * (1 - soft) + (root[axis] + normal[axis] * .22) * soft;
        }
    }
    return { control, end };
}
