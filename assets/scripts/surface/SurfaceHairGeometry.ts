import { ScalpDisplayMesh } from './ScalpDisplayMesh';
import { HeadAsset } from './ScalpTopology';
import { HAIR_PRESETS, ALL_HAIR_STYLES, HairStyle } from '../core/HairstyleCatalog';
import { pose } from './HeadPose';
import { GeometryBuffer } from '../hair/HairGeometry';
import { SurfaceHairSimulation, Point3 } from './SurfaceHairSimulation';
const TONES = {
    spiky: Array.from({ length: 16 }, (_, i) => [.09 + i * .003, .108 + i * .0035, .14 + i * .004]),
    long: Array.from({ length: 16 }, (_, i) => [.22 + i * .008, .105 + i * .0045, .07 + i * .003]),
};
const ENDS = { spiky: [.13, .148, .18], long: [.30, .16, .105] };
const ALL_TONES = {} as Record<HairStyle, number[][]>;
const ALL_ENDS = {} as Record<HairStyle, number[]>;
for (const style of ALL_HAIR_STYLES) {
    ALL_TONES[style] = style === 'spiky' || style === 'long' ? TONES[style] : Array.from({length:16}, (_,i) => HAIR_PRESETS[style].color.map(v => v*(.88+i*.016)));
    ALL_ENDS[style] = style === 'spiky' || style === 'long' ? ENDS[style] : HAIR_PRESETS[style].color.map(v => v*1.08);
}
// 精修款不再逐缕跳色；以连续曲面明暗表现体积。
for(const style of ALL_HAIR_STYLES)ALL_TONES[style]=Array.from({length:16},(_,i)=>HAIR_PRESETS[style].color.map(v=>v*(.99+i*.0013)));
const SCALP_COLORS = [[.12, .55, .48], [.20, .70, .60]];
/** 全部发缕与碎发合并输出；显示头皮时直接显示原覆盖域。 */
export class SurfaceHairGeometry extends GeometryBuffer {
    private alive = new Uint8Array(0);
    private smoothNormals = new Float64Array(0);
    private buildNormals(p: Float64Array, ix: readonly number[], caps: readonly boolean[]): void {
        if(this.smoothNormals.length!==p.length)this.smoothNormals=new Float64Array(p.length);
        const out=this.smoothNormals;out.fill(0);
        for(let f=0;f<ix.length;f+=3){
            if(caps[f/3])continue;
            const a=ix[f]*3,b=ix[f+1]*3,c=ix[f+2]*3;
            const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
            const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
            out[a]+=nx;out[a+1]+=ny;out[a+2]+=nz;out[b]+=nx;out[b+1]+=ny;out[b+2]+=nz;out[c]+=nx;out[c+1]+=ny;out[c+2]+=nz;
        }
    }
    private soften(color: readonly number[], a: number,b: number,c: number): void {
        const before=this.count;this.emit(color);if(this.count===before)return;
        for(let j=0;j<3;j++){
            const k=(j===0?a:j===1?b:c)*3,n=this.smoothNormals,l=Math.hypot(n[k],n[k+1],n[k+2])||1;
            const diffuse=Math.max(0,(-.4*n[k]+.65*n[k+1]+.6*n[k+2])/l),sheen=Math.pow(Math.max(0,(.3*n[k+1]+.95*n[k+2])/l),10)*.035;
            const light=.72+.28*diffuse,at=(before+j)*4;
            this.colors[at]=color[0]*light+sheen;this.colors[at+1]=color[1]*light+sheen*.85;this.colors[at+2]=color[2]*light+sheen*.65;
        }
    }
    private scalpAsset?: HeadAsset;
    private scalpDisplay?: ScalpDisplayMesh;
    private scalpWorld = new Float64Array(0);
    private scalpYaw = NaN;
    private scalpPitch = NaN;
    private readonly a: Point3 = { x: 0, y: 0, z: 0 };
    private readonly b: Point3 = { x: 0, y: 0, z: 0 };
    private readonly c: Point3 = { x: 0, y: 0, z: 0 };
    private emit(color: readonly number[]): void {
        const a = this.a, b = this.b, c = this.c, ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-11)
            return;
        this.triangle(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, color);
    }
    private read(p: ArrayLike<number>, a: number, b: number, c: number): void {
        this.a.x = p[a];
        this.a.y = p[a + 1];
        this.a.z = p[a + 2];
        this.b.x = p[b];
        this.b.y = p[b + 1];
        this.b.z = p[b + 2];
        this.c.x = p[c];
        this.c.y = p[c + 1];
        this.c.z = p[c + 2];
    }
    update(sim: SurfaceHairSimulation): void {
        this.count = 0;
        if (sim.debugScalp) {
            const asset = sim.topology.asset;
            if (this.scalpAsset !== asset) {
                this.scalpDisplay = new ScalpDisplayMesh(asset); this.scalpAsset = asset;
                this.scalpWorld = new Float64Array(this.scalpDisplay.positions.length);
                this.scalpYaw = this.scalpPitch = NaN;
            }
            const display = this.scalpDisplay!, p = display.positions, world = this.scalpWorld;
            if (this.scalpYaw !== sim.yaw || this.scalpPitch !== sim.pitch) {
                for (let k = 0; k < p.length; k += 3) {
                    pose(p[k], p[k + 1], p[k + 2], sim.yaw, sim.pitch, asset.center, this.a);
                    world[k] = this.a.x; world[k + 1] = this.a.y; world[k + 2] = this.a.z;
                }
                this.scalpYaw = sim.yaw; this.scalpPitch = sim.pitch;
            }
            const ix = display.indices;
            for (let f = 0; f < ix.length; f += 3) {
                this.read(world, ix[f] * 3, ix[f + 1] * 3, ix[f + 2] * 3);
                this.emit(SCALP_COLORS[display.sourceFaces[f / 3] % 2]);
            }
            this.finish();
            return;
        }
        const fibers = sim.fiberRig.fibers;
        if (this.alive.length !== fibers.length)
            this.alive = new Uint8Array(fibers.length);
        this.alive.fill(0);
        for (let i = 0; i < fibers.length; i++)
            for (const id of fibers[i].ids)
                if (sim.lengths[id] > 0)
                    this.alive[i] = 1;
        const mesh = sim.cutMesh || sim.fiberMesh, p = mesh.evaluate(sim), ix = mesh.indices;
        this.buildNormals(p,ix,mesh.caps);
        for (let f = 0; f < ix.length; f += 3) {
            const group = mesh.groups[f / 3] || 0;
            if (!this.alive[group])
                continue;
            this.read(p, ix[f] * 3, ix[f + 1] * 3, ix[f + 2] * 3);
            if(!mesh.caps[f/3])this.soften(ALL_TONES[sim.style][(group*7)%16],ix[f],ix[f+1],ix[f+2]);
            else this.emit(mesh.caps[f / 3] ? ALL_ENDS[sim.style] : ALL_TONES[sim.style][(group * 7) % 16]);
        }
        for (const d of sim.debris)
            for (let f = 0; f < d.p.length; f += 9) {
                this.read(d.p, f, f + 3, f + 6);
                this.emit(ALL_TONES[d.style][((d.groups ? d.groups[f / 9] : 0) * 7) % 16]);
            }
        this.finish();
    }
}
