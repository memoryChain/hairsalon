import { GeometryBuffer } from '../hair/HairGeometry';
import { HeadAsset } from '../surface/ScalpTopology';
import { HeadRaycast } from '../surface/HeadRaycast';
import { CONFIG, PALETTE } from '../core/PrototypeConfig';

export function ellipsoid(g: GeometryBuffer, x: number, y: number, z: number,
    rx: number, ry: number, rz: number, color: readonly number[], sides = 20, rows = 12): void {
    const point = (t: number, p: number): number[] => [x + rx * Math.sin(t) * Math.cos(p), y + ry * Math.cos(t), z + rz * Math.sin(t) * Math.sin(p)];
    for (let row = 0; row < rows; row++) for (let col = 0; col < sides; col++) {
        const a = point(row / rows * Math.PI, col / sides * Math.PI * 2);
        const b = point((row + 1) / rows * Math.PI, col / sides * Math.PI * 2);
        const c = point((row + 1) / rows * Math.PI, (col + 1) / sides * Math.PI * 2);
        const d = point(row / rows * Math.PI, (col + 1) / sides * Math.PI * 2);
        g.triangle(...a as [number,number,number], ...c as [number,number,number], ...b as [number,number,number], color);
        g.triangle(...a as [number,number,number], ...d as [number,number,number], ...c as [number,number,number], color);
    }
}
export function createCharacter(model?: HeadAsset, includeBody = true, includeFeatures = true): GeometryBuffer {
    // 头型切换复用同一个 GPU 缓冲，容量不依赖初始选择。
    const g = new GeometryBuffer(64000);
    const uvs = new Float32Array(g.capacity * 2);
    const skin = model?.skinColor || PALETTE.skin;
    const detailed = !!model?.facialDetail;
    const headRay = model ? new HeadRaycast(model) : null;
    const faceZ = (x: number, y: number, fallback: number, offset: number): number => {
        if(!headRay)return fallback;
        const distance=headRay.distance({ox:x,oy:y,oz:3,dx:0,dy:0,dz:-1},0);
        return Number.isFinite(distance)?3-distance+offset:fallback;
    };
    if(model){
        const full=model.characterMesh,p=full?.positions??model.headPositions,ix=full?.indices??model.headIndices;
        for(let i=0;i<ix.length;i+=3){
            const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;
            g.triangle(p[a],p[a+1],p[a+2],p[b],p[b+1],p[b+2],p[c],p[c+1],p[c+2],skin);
            // 静态顶点色按 Blender 导出的平滑法线计算，消除脸部三角片色块。
            if(full?.normals||model.headNormals)for(let j=0;j<3;j++){
                const k=ix[i+j]*3,n=full?.normals??model.headNormals!,light=(full ? .82 : .70)+(full ? .18 : .30)*Math.max(0,n[k]*-.4+n[k+1]*.65+n[k+2]*.6),at=(g.count-3+j)*4;
                for(let channel=0;channel<3;channel++)g.colors[at+channel]=(full?full.colors[k+channel]:skin[channel])*light;
                if(full?.uvs){const target=(g.count-3+j)*2,source=ix[i+j]*2;uvs[target]=full.uvs[source];uvs[target+1]=full.uvs[source+1];g.colors[at+3]=light;}
            }
        }
    } else ellipsoid(g, 0, CONFIG.headY, 0, CONFIG.headX, CONFIG.headHeight, CONFIG.headZ, PALETTE.skin);
    if(includeBody&&!model?.characterMesh) addBody(g);
    if(!detailed) ellipsoid(g, 0, 1.52, faceZ(0,1.52,.53,.015), 0.085, 0.13, 0.10, PALETTE.skin, 10, 6);
    if(includeFeatures) {
    for (const x of [-0.21, 0.21]) {
        ellipsoid(g, x, 1.74, faceZ(x,1.74,.494,.009), 0.095, detailed ? 0.058 : 0.095, 0.032, [1, 0.97, 0.90], detailed ? 24 : 12, detailed ? 12 : 8);
        ellipsoid(g, x, 1.74, faceZ(x,1.74,.531,.043), detailed ? 0.031 : 0.042, detailed ? 0.041 : 0.056, 0.012, [0.12, 0.20, 0.23], detailed ? 20 : 10, detailed ? 12 : 6);
        ellipsoid(g, x, 1.9, faceZ(x,1.9,.49,.020), 0.108, detailed ? 0.015 : 0.025, 0.016, [0.25, 0.19, 0.17], detailed ? 24 : 10, detailed ? 8 : 5);
    }
    ellipsoid(g, 0, 1.28, faceZ(0,1.28,.456,.012), detailed ? 0.12 : 0.11, detailed ? 0.015 : 0.025, 0.016, [0.60, 0.30, 0.25], detailed ? 28 : 12, detailed ? 10 : 5);
    }
    if(!detailed) for (const x of [-0.57, 0.57]) {
        let anchor=x;
        if(headRay){const side=x<0?-1:1,distance=headRay.distance({ox:side*3,oy:1.57,oz:0,dx:-side,dy:0,dz:0},0);if(Number.isFinite(distance))anchor=side*(3-distance+.012);}
        ellipsoid(g, anchor, 1.57, 0, 0.095, 0.17, 0.105, PALETTE.skin, 10, 8);
    }
    g.view.uvs=uvs.subarray(0,g.count*2);
    g.finish(); return g;
}
function addBody(g:GeometryBuffer):void {
    ellipsoid(g,0,.99,0,.18,.45,.18,PALETTE.skin,12,8);
    ellipsoid(g,0,.3,0,.84,.4,.40,PALETTE.cape);
}
