import { creativeCurve } from './CreativeGrooming';
import type { HairStyle, HairCurve } from './HairstyleCatalog';
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const SHAPES: Record<HairStyle, readonly number[]> = {
    afro: [1.6,.64,6], mane: [.65,.84,3.6], waves: [.24,.75,4.3], curtains: [.14,.80,4],
    doublecover: [.14,.88,3.8], backcover: [.18,.88,3.8], crownlong: [.18,.80,4],
    receding: [.04,.91,2.8], crown: [.03,.9,2.6], horseshoe: [.02,.93,2.4], combover: [.04,.92,3.2], bald: [0,.9,2],
    spiky: [.12, .97, 2.6], bob: [.10, .85, 3.5],
    long: [.09, .88, 3.8], crop: [.04, .93, 2.5], mohawk: [.05, .95, 2.9],
    quiff: [.14, .89, 3.1], sidepart: [.10, .86, 3.4], lob: [.12, .80, 4.1],
    asymmetric: [.10, .86, 3.6], flipped: [.10, .90, 3.7],
};
export function groomWidth(style: HairStyle, t: number, variation: number): number {
    const p = SHAPES[style];
    return (1 + p[0] * Math.sin(Math.PI * t)) * (1 - (p[1] + (variation - .5) * .045) * Math.pow(t, p[2] + (variation - .5) * .5));
}
/** 八款补充精修：造型层次由根部位置决定，避免每层重复相同长度。 */
export function createGroomCurve(style: HairStyle, root: number[], normal: number[], center: number[]): HairCurve {
    const creative=creativeCurve(style,root,normal,center);if(creative)return creative;
    const [nx, ny, nz] = normal, rx = root[0] - center[0], rz = root[2] - center[2], top = Math.max(0, ny);
    let az = Math.atan2(rx, rz);
    const side = rx < 0 ? -1 : 1, layer = Math.pow(top, 2.1), wave = Math.sin(az * 5 + .35), detail = Math.sin(rx * 19 + rz * 13 + root[1] * 7);
    let end: number[], control: number[];
    if (style === 'receding' || style === 'crown' || style === 'horseshoe' || style === 'combover' || style === 'bald') {
        const height = style === 'receding' ? .075 + .15 * top : style === 'crown' ? .09 + .09 * top : .065;
        end = root.map((v,a) => v + normal[a] * height);
        end[2] -= .10 * top;
        control = root.map((v,a) => v * .4 + end[a] * .6 + normal[a] * .03);
        if (style === 'combover' && rx > .15 && root[1] - center[1] > .20 && rz > -.26) {
            // 侧面留长发跨过裸露头顶；它仍是真实可剪、可重新梳开的发束。
            end = [center[0] - .35 - .12 * top, center[1] + .65 + .04 * top, root[2] - .10];
            control = [center[0] + .35, center[1] + 1.12, root[2] - .05];
        }
    } else if (style === 'crop') {
        const height = .05 + .17 * Math.pow(top, 1.6) + .018 * detail * top;
        end = [root[0] + nx * height + .04 * top * Math.cos(az * 2), root[1] + ny * height, root[2] + nz * height + .07 * top];
        control = root.map((v, a) => v * .45 + end[a] * .55 + normal[a] * .045);
    } else if (style === 'mohawk') {
        const ridge = Math.exp(-Math.pow(rx / .19, 2)) * clamp((ny + .15) * 1.5);
        const crest = .58 * ridge * (.94 + .13 * Math.sin(rz * 14));
        end = [root[0] + nx * .025, root[1] + ny * .025 + crest, root[2] + nz * .025 - .15 * ridge];
        control = root.map((v, a) => v * .40 + end[a] * .60 + normal[a] * (.012 + .025 * ridge));
    } else if (style === 'quiff') {
        const fore = clamp((nz + .25) * 1.3) * top, lift = .07 + .29 * fore + .08 * top;
        end = [root[0] + nx * .08 + .10 * top, root[1] + lift, root[2] + nz * .06 - (.20 + .35 * fore) * top];
        control = root.map((v, a) => v * .44 + end[a] * .56 + normal[a] * (.045 + .15 * fore));
    } else if (style === 'sidepart') {
        const flow = rx < -.14 ? -1 : 1, swept = clamp((ny + .1) * 1.3), front = Math.max(0, nz);
        end = [root[0] + nx * .065 + flow * (.21 + .12 * front) * swept, root[1] + .045 + .09 * swept, root[2] + nz * .07 - .12 * swept];
        control = root.map((v, a) => v * .45 + end[a] * .55 + normal[a] * (.035 + .12 * swept));
    } else {
        const fringe = style !== 'lob' && rz > .18 && Math.abs(az) < .82;
        if (fringe) {
            const slope = style === 'asymmetric' ? .12 * rx / .32 : .035 * Math.abs(rx) / .4;
            end = [root[0] + (style === 'asymmetric' ? .13 : side * .02), center[1] + .32 + slope + detail * .008, center[2] + .65];
            control = [root[0] * .4 + end[0] * .6, root[1] + .025, center[2] + .78];
        } else {
            if (rz > 0 && Math.abs(az) < 1.04) az = side * 1.04;
            const bottom = style === 'long' ? -1.05 + .67 * layer : style === 'lob' ? -.75 + .49 * layer : style === 'asymmetric' ? -.27 - .25 * Math.sin(az) + .38 * layer : -.52 + .46 * layer;
            const radius = (style === 'flipped' ? .91 - .13 * layer : .75 + .035 * layer) + .025 * wave;
            end = [center[0] + Math.sin(az) * radius, center[1] + bottom + .045 * wave + .015 * detail, center[2] + Math.cos(az) * (radius - .055)];
            const belly = style === 'flipped' ? .66 : .88 + .025 * layer;
            control = [center[0] + Math.sin(az) * belly, Math.max(end[1] + .08, Math.min(root[1] + .015, center[1] + .27)), center[2] + Math.cos(az) * (belly - .025)];
        }
        const cap = clamp((ny - .94) / .055), blend = cap * cap * (3 - 2 * cap);
        for (let a = 0; a < 3; a++) {
            end[a] = end[a] * (1 - blend) + (root[a] + normal[a] * .18) * blend;
            control[a] = control[a] * (1 - blend) + (root[a] + normal[a] * .22) * blend;
        }
    }
    return { end, control };
}
