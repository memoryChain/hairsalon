import { CONFIG, HairStyle } from '../core/PrototypeConfig';

export interface Strand {
    id: number; count: number; p: Float64Array; previous: Float64Array;
    rest: Float64Array; radius: Float64Array; lengths: Float64Array;
    attached: boolean; age: number; style: HairStyle;
}

export function makeStrand(id: number, points: number[], radii: number[], style: HairStyle): Strand {
    const count = radii.length;
    const lengths = new Float64Array(count);
    for (let i = 1; i < count; i++) lengths[i] = Math.hypot(
        points[i * 3] - points[(i - 1) * 3], points[i * 3 + 1] - points[(i - 1) * 3 + 1],
        points[i * 3 + 2] - points[(i - 1) * 3 + 2]);
    return { id, count, p: new Float64Array(points), previous: new Float64Array(points),
        rest: new Float64Array(points), radius: new Float64Array(radii), lengths,
        attached: true, age: 0, style };
}

// 每组指定头皮方向、中段弯向和尖端；局部高度相对头部中心。
// 先设计大轮廓，再以短层覆盖发根，不按经纬线向外均匀种锥体。
type SpikeRecipe = [number, number, number, number, number, number, number, number, number, number];
const SPIKES: SpikeRecipe[] = [
    // 顶部七个主发束，左右高低错落，尖端朝上或后掠。
    [-.48,.83,.12, -.56,1.05,.05, -.96,1.42,-.02, .29],
    [-.15,.98,-.1, -.23,1.23,-.06, -.46,1.74,-.12, .31],
    [.22,.95,-.08, .35,1.18,-.10, .39,1.60,-.20, .30],
    [.57,.76,.08, .64,.93,.02, 1.05,1.31,-.12, .30],
    [-.76,.58,-.06, -.78,.68,-.12, -1.22,.96,-.20, .28],
    [.81,.48,-.10, .83,.62,-.18, 1.29,.86,-.29, .27],
    [-.18,.78,-.63, -.22,.98,-.61, -.45,1.37,-.95, .30],
    // 刘海沿额头向下弯，三个大小不同的尖端形成有方向的发际线。
    [-.44,.64,.65, -.44,.66,.61, -.54,.28,.65, .25],
    [-.08,.77,.64, -.10,.66,.70, -.27,.31,.73, .28],
    [.36,.70,.62, .32,.70,.66, .12,.43,.76, .26],
    [.66,.48,.55, .52,.52,.57, .57,.20,.59, .21],
    // 两侧贴头过渡，尖端向后，不横向长出一圈刺。
    [-.94,.24,.25, -.65,.26,.05, -.82,.05,-.24, .20],
    [.94,.24,.25, .65,.26,.05, .82,.08,-.28, .20],
    [-.9,.32,-.28, -.70,.37,-.34, -1.00,.55,-.64, .25],
    [.9,.32,-.28, .70,.37,-.34, 1.03,.60,-.66, .25],
    // 后脑有独立可剪的覆叠层，不能用不可剪发帽填空。
    [-.55,.52,-.66, -.49,.63,-.65, -.80,.97,-1.02, .29],
    [.40,.63,-.66, .43,.73,-.66, .71,1.09,-1.04, .29],
    [0,.34,-.94, .02,.43,-.75, .12,.68,-1.18, .31],
    [-.62,-.04,-.78, -.49,-.05,-.63, -.66,-.18,-.87, .29],
    [.62,-.04,-.78, .49,-.05,-.63, .69,-.12,-.87, .29],
    [0,-.28,-.96, .0,-.27,-.62, -.10,-.50,-.78, .30],
    [-.30,.65,-.70, -.23,.56,-.68, -.28,.23,-.85, .28],
    [.30,.65,-.70, .23,.56,-.68, .34,.25,-.87, .28],
    [-.73,.32,-.60, -.58,.24,-.50, -.70,-.13,-.64, .25],
    [.73,.32,-.60, .58,.24,-.50, .70,-.10,-.66, .25],
    [-.27,.26,-.93, -.24,.16,-.66, -.34,-.19,-.83, .30],
    [.27,.26,-.93, .24,.16,-.66, .34,-.16,-.83, .30],
];
function createSpiky(): Strand[] {
    const result: Strand[] = [];
    const profile = [.82, 1, .96, .78, .52, .24, .012];
    for (const row of SPIKES) {
        const [nx,ny,nz,bx,by,bz,tx,ty,tz,width] = row;
        const n = Math.hypot(nx,ny,nz);
        const root = [nx / n * (CONFIG.headX + .055), CONFIG.headY + ny / n * (CONFIG.headHeight + .055), nz / n * (CONFIG.headZ + .055)];
        const bend = [bx, CONFIG.headY + by, bz], tip = [tx, CONFIG.headY + ty, tz];
        const points: number[] = [], radii: number[] = [];
        for (let i = 0; i < 7; i++) {
            const t = i / 6, a = (1-t)*(1-t), b = 2*(1-t)*t, c = t*t;
            for (let axis = 0; axis < 3; axis++) points.push(root[axis]*a + bend[axis]*b + tip[axis]*c);
            radii.push(width * profile[i]);
        }
        result.push(makeStrand(result.length, points, radii, 'spiky'));
    }
    return result;
}

export function createPreset(style: HairStyle): Strand[] {
    if (style === 'spiky') return createSpiky();
    const result: Strand[] = [];
    // 前额留出发际线；后脑允许更低的发根。避免把整颗头均匀种满。
    const rings = [0.3, 0.7, 1.12, 1.52];
    for (let row = 0; row < rings.length; row++) {
        const amount = row === 0 ? 5 : 10;
        for (let column = 0; column < amount; column++) {
            const phi = (column + row * 0.43) / amount * Math.PI * 2;
            const theta = rings[row];
            if (Math.cos(phi) > 0.35 && theta > 0.8) continue;
            const nx = Math.sin(theta) * Math.sin(phi), ny = Math.cos(theta), nz = Math.sin(theta) * Math.cos(phi);
            const points: number[] = [], radii: number[] = [];
            const count = 10;
            const radius = 0.105;
            for (let i = 0; i < count; i++) {
                const t = i / (count - 1);
                let x: number, y: number, z: number;
                // 顶部先绕头型铺开，再下垂；不是直接从头皮竖直落下。
                const sweep = Math.min(1, t / 0.58);
                const angle = theta + (1.72 - theta) * Math.sin(sweep * Math.PI * 0.5);
                const spread = 0.09 + 0.075 * Math.sin(t * Math.PI);
                const wrapped = Math.atan2(Math.sin(phi), Math.cos(phi));
                const side = wrapped < 0 ? -1 : 1;
                const parted = side * Math.max(Math.abs(wrapped), 1.18);
                const partWeight = Math.sin(Math.min(1, t / 0.48) * Math.PI * 0.5);
                const flowPhi = wrapped + (parted - wrapped) * partWeight;
                x = Math.sin(angle) * Math.sin(flowPhi) * (CONFIG.headX + spread);
                z = Math.sin(angle) * Math.cos(flowPhi) * (CONFIG.headZ + spread);
                y = CONFIG.headY + Math.cos(angle) * (CONFIG.headHeight + 0.11)
                    - Math.max(0, t - 0.58) / 0.42 * (0.52 + 0.13 * Math.sin(phi * 2));
                points.push(x, y, z);
                radii.push(radius * (1 - t * 0.65));
            }
            result.push(makeStrand(result.length, points, radii, style));
        }
    }
    return result;
}
