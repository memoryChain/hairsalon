import { FaceEmotion, FaceExpressionController } from '../character/FaceExpressionController';
import { FaceGeometry } from '../character/FaceGeometry';
import { createCharacter } from '../character/CharacterGeometry';
import { HeadAsset } from '../surface/ScalpTopology';
import { HairSnapshot, Raster, RasterFrame, newRaster, rasterMesh } from './HairScore';

const characters=new WeakMap<HeadAsset,{positions:Float32Array;colors:Float32Array;indices:number[]}>();
function character(head:HeadAsset){
    let cached=characters.get(head);
    if(!cached){
        const mesh=createCharacter(head,true,false),data=mesh.finish();
        cached={positions:Float32Array.from(data.positions),colors:Float32Array.from(data.colors!),indices:Array.from({length:mesh.count},(_,i)=>i)};
        characters.set(head,cached);
    }
    return cached;
}

/** 展示取景与评分的固定尺度分离，仅包含当前存活发面，保留边缘余量。 */
export function resultFrame(snapshot: HairSnapshot, head: HeadAsset, view: number): RasterFrame {
    const yaw=view*Math.PI/2,c=Math.cos(yaw),s=Math.sin(yaw);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    const include=(p:ArrayLike<number>,indices:ArrayLike<number>)=>{
        for(let i=0;i<indices.length;i++){
            const k=indices[i]*3,x=p[k]-head.center[0],y=p[k+1]-head.center[1],z=p[k+2]-head.center[2],rx=x*c+z*s;
            minX=Math.min(minX,rx);maxX=Math.max(maxX,rx);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        }
    };
    const body=character(head);include(body.positions,body.indices);include(snapshot.positions,snapshot.indices);
    return {span:Math.max(.2,maxX-minX,maxY-minY)*1.12,offsetX:(minX+maxX)/2,offsetY:(minY+maxY)/2};
}

/** 展示图 2×2 子像素覆盖率合成；保留细眉/瞳孔，不用模糊滤镜涂抹五官。 */
export function resolvePortraitSamples(source:Raster):Raster {
    const out=newRaster(source.size/2),n=out.size;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const at=y*n+x,a=y*2*source.size+x*2,b=a+source.size;
        for(let channel=0;channel<4;channel++)out.rgba[at*4+channel]=Math.round((source.rgba[a*4+channel]+source.rgba[(a+1)*4+channel]+source.rgba[b*4+channel]+source.rgba[(b+1)*4+channel])/4);
        out.depth[at]=Math.max(source.depth[a],source.depth[a+1],source.depth[b],source.depth[b+1]);
        out.mask[at]=source.mask[a]+source.mask[a+1]+source.mask[b]+source.mask[b+1]>=2?1:0;
    }
    return out;
}

export function resultPortrait(snapshot: HairSnapshot,head: HeadAsset,view: number,emotion: FaceEmotion='neutral'): Raster {
    // 只在首次查看该角度时渲染高分辨率临时图，缓存仍是 512×512。
    const frame=resultFrame(snapshot,head,view),out=newRaster(1024),body=character(head),yaw=view*Math.PI/2;
    rasterMesh(out,body.positions,body.indices,head.center,yaw,false,head.skinColor||[.94,.72,.56],body.colors,frame,true);
    rasterMesh(out,snapshot.positions,snapshot.indices,head.center,yaw,true,[.15,.10,.075],undefined,frame);
    const face=new FaceExpressionController(()=>.5),geometry=new FaceGeometry(head);
    face.setEmotion(emotion,true);geometry.update(face);
    const data=geometry.finish(),indices=Array.from({length:geometry.count},(_,i)=>i);
    // 五官与实时 builtin-unlit 材质一致，不额外叠加逐三角面照明。
    rasterMesh(out,data.positions,indices,head.center,view*Math.PI/2,false,[.22,.12,.08],data.colors,frame,true);
    return resolvePortraitSamples(out);
}
