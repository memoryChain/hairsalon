import { SurfaceHairSimulation } from '../surface/SurfaceHairSimulation';
import { HeadAsset } from '../surface/ScalpTopology';

export interface HairSnapshot {
    positions: Float64Array;
    indices: number[];
    tips: Float64Array;
    weights: Float64Array;
    regions: number[];
}
export const REGION_NAMES = ['刘海', '左侧', '右侧', '后脑', '顶部'];
export const VIEW_NAMES = ['正面', '右侧', '背面', '左侧'];
export interface HairScore { total: number; silhouette: number; length: number; direction: number; stars: number; feedback: string; views: number[]; }

/** 只复制存活的实际裁剪网格；无碎发、无相机和瞬时摆动。 */
export function captureHair(sim: SurfaceHairSimulation): HairSnapshot {
    const mesh = sim.cutMesh || sim.fiberMesh, positions = mesh.evaluate(sim, false, true).slice();
    const fibers = sim.fiberRig.fibers, tips = new Float64Array(fibers.length * 3), weights = new Float64Array(fibers.length);
    const alive = fibers.map(f => f.ids.some(id => sim.lengths[id] > 0)), regions: number[] = [], indices: number[] = [];
    const far = new Float64Array(fibers.length);
    for (const f of fibers) {
        weights[f.group] = f.ids.reduce((sum, id) => sum + sim.topology.vertexArea[id], 0) / f.ids.length;
        regions.push(f.normal[1] > .72 ? 4 : f.normal[2] > .45 ? 0 : f.normal[2] < -.35 ? 3 : f.root[0] < sim.topology.asset.center[0] ? 1 : 2);
    }
    for (let t = 0; t < mesh.indices.length; t += 3) {
        const group = mesh.groups[t / 3] || 0;
        if (!alive[group]) continue;
        const root = fibers[group].root;
        indices.push(mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]);
        for (let j = 0; j < 3; j++) {
            const k = mesh.indices[t + j] * 3, x = positions[k] - root[0], y = positions[k + 1] - root[1], z = positions[k + 2] - root[2], d = x*x + y*y + z*z;
            if (d > far[group]) { far[group] = d; tips.set([x,y,z], group * 3); }
        }
    }
    // 每个表面导向只改缓存；下一次渲染仍读取实时状态。
    return { positions, indices, tips, weights, regions };
}

export interface Raster { size: number; depth: Float32Array; mask: Uint8Array; rgba: Uint8Array; }
export interface RasterFrame { span: number; offsetX: number; offsetY: number; }
export function newRaster(size: number): Raster {
    const result = { size, depth: new Float32Array(size*size), mask: new Uint8Array(size*size), rgba: new Uint8Array(size*size*4) };
    result.depth.fill(-Infinity);
    for (let i = 0; i < size*size; i++) result.rgba.set([242,235,220,255], i*4);
    return result;
}
/** 固定头部尺度的正交光栅化。头部先写深度，遮挡背面的头发。 */
export function rasterMesh(out: Raster, positions: ArrayLike<number>, indices: ArrayLike<number>, center: readonly number[], yaw: number, hair: boolean, color: readonly number[], vertexColors?: ArrayLike<number>, frame?: RasterFrame, prelit=false): void {
    const n = out.size, scale = n / (frame?.span ?? 2.9), c = Math.cos(yaw), s = Math.sin(yaw), projected = new Float64Array(positions.length);
    for (let k = 0; k < positions.length; k += 3) {
        const x = positions[k]-center[0], y = positions[k+1]-center[1], z = positions[k+2]-center[2];
        projected[k] = n/2+(x*c+z*s-(frame?.offsetX ?? 0))*scale; projected[k+1] = n/2-(y-(frame?.offsetY ?? .05))*scale; projected[k+2] = -x*s+z*c;
    }
    for (let k = 0; k < indices.length; k += 3) {
        const a = indices[k]*3, b = indices[k+1]*3, d = indices[k+2]*3;
        const ax = projected[a], ay = projected[a+1], bx = projected[b], by = projected[b+1], cx = projected[d], cy = projected[d+1];
        const area = (by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
        if (Math.abs(area)<1e-8) continue;
        const x0 = Math.max(0,Math.floor(Math.min(ax,bx,cx))), x1 = Math.min(n-1,Math.ceil(Math.max(ax,bx,cx)));
        const y0 = Math.max(0,Math.floor(Math.min(ay,by,cy))), y1 = Math.min(n-1,Math.ceil(Math.max(ay,by,cy)));
        const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
        const vx=positions[d]-positions[a],vy=positions[d+1]-positions[a+1],vz=positions[d+2]-positions[a+2];
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx, norm=Math.hypot(nx,ny,nz)||1;
        const light=prelit?1:.72+.28*Math.abs((nx*.3+ny*.6+nz*.7)/norm);
        for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
            const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/area, v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/area, w=1-u-v;
            if(u<0||v<0||w<0)continue;
            const depth=u*projected[a+2]+v*projected[b+2]+w*projected[d+2], at=y*n+x;
            if(depth<out.depth[at])continue;
            out.depth[at]=depth;out.mask[at]=hair?1:0;
            for(let channel=0;channel<3;channel++)out.rgba[at*4+channel]=Math.round(255*light*(vertexColors ? vertexColors[indices[k]*4+channel]*u+vertexColors[indices[k+1]*4+channel]*v+vertexColors[indices[k+2]*4+channel]*w : color[channel]));
        }
    }
}
export function renderHairView(snapshot: HairSnapshot, head: HeadAsset, view: number, size = 96, frame?: RasterFrame): Raster {
    const result = newRaster(size), yaw = view*Math.PI/2;
    rasterMesh(result,head.headPositions,head.headIndices,head.center,yaw,false,head.skinColor || [.94,.72,.56],undefined,frame);
    rasterMesh(result,snapshot.positions,snapshot.indices,head.center,yaw,true,[.15,.10,.075],undefined,frame);
    return result;
}
function near(mask: Uint8Array, at: number, size: number): boolean {
    const x=at%size,y=Math.floor(at/size);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<size&&y+dy>=0&&y+dy<size&&mask[at+dy*size+dx])return true;
    return false;
}
export function compareMasks(a: Uint8Array,b: Uint8Array,size: number): number {
    let union=0,intersection=0,count=0,close=0;
    for(let i=0;i<a.length;i++) {
        if(a[i]||b[i])union++;if(a[i]&&b[i])intersection++;
        if(a[i]){count++;if(near(b,i,size))close++;}if(b[i]){count++;if(near(a,i,size))close++;}
    }
    return union ? .65*intersection/union+.35*close/Math.max(1,count) : 1;
}
export function regionalHairFeatures(snapshot:HairSnapshot) {
    const lengths=new Float64Array(5),vectors=new Float64Array(15),weights=new Float64Array(5);
    for(let i=0;i<snapshot.weights.length;i++){
        const r=snapshot.regions[i],w=snapshot.weights[i],k=i*3;
        weights[r]+=w;lengths[r]+=w*Math.hypot(snapshot.tips[k],snapshot.tips[k+1],snapshot.tips[k+2]);
        for(let a=0;a<3;a++)vectors[r*3+a]+=w*snapshot.tips[k+a];
    }
    for(let r=0;r<5;r++)if(weights[r]>0){lengths[r]/=weights[r];for(let a=0;a<3;a++)vectors[r*3+a]/=weights[r];}
    return {lengths,vectors,weights};
}

export function scoreHair(actual: HairSnapshot,target: HairSnapshot,head: HeadAsset,targetViews?: Raster[]): HairScore {
    const views = [0,1,2,3].map(view=>100*compareMasks(renderHairView(actual,head,view).mask,(targetViews?.[view] || renderHairView(target,head,view)).mask,96));
    let weight=0,length=0,direction=0; const errors=[0,0,0,0,0],areas=[0,0,0,0,0],signed=[0,0,0,0,0];
    // 按共同头皮区域汇总，不将不同预设的发束编号当作同一缕头发。
    const af=regionalHairFeatures(actual),bf=regionalHairFeatures(target);
    for(let i=0;i<5;i++) {
        const k=i*3,a=af.vectors,b=bf.vectors,al=af.lengths[i],bl=bf.lengths[i];
        const w=Math.max(af.weights[i],bf.weights[i]), tolerance=.035, error=Math.max(0,Math.abs(al-bl)-tolerance)/Math.max(.12,bl*.75);
        const an=Math.hypot(a[k],a[k+1],a[k+2]),bn=Math.hypot(b[k],b[k+1],b[k+2]);
        const ls=Math.max(0,1-error), cosine=an>1e-6&&bn>1e-6?(a[k]*b[k]+a[k+1]*b[k+1]+a[k+2]*b[k+2])/(an*bn):al===bl?1:-1;
        const ds=Math.max(0,1-Math.max(0,Math.acos(Math.max(-1,Math.min(1,cosine)))-.12)/(Math.PI*.65));
        weight+=w;length+=w*ls;direction+=w*ds;
        errors[i]+=w*(1-ls);areas[i]+=w;signed[i]+=w*(al-bl);
    }
    length=100*length/Math.max(1e-9,weight);direction=100*direction/Math.max(1e-9,weight);
    const silhouette=views.reduce((a,b)=>a+b,0)/4,total=Math.round(.5*silhouette+.3*length+.2*direction);
    let worst=0;for(let i=1;i<5;i++)if(errors[i]/Math.max(areas[i],1e-9)>errors[worst]/Math.max(areas[worst],1e-9))worst=i;
    const feedback=total>=90?'轮廓和层次都很接近，客人很满意！':length<88?`${REGION_NAMES[worst]}${signed[worst]>0?'还偏长，可以再修短一些。':'剪得偏短，下次多留一点长度。'}`:direction<85?'长度接近了，试试用手或吹风调整走向。':'长度不错，再对照侧面和背面修整轮廓。';
    return { total,silhouette:Math.round(silhouette),length:Math.round(length),direction:Math.round(direction),stars:total>=90?3:total>=70?2:total>=45?1:0,feedback,views:views.map(Math.round) };
}

