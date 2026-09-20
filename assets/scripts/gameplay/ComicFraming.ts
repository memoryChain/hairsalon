export interface ComicBounds { minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number; }
/** 漫画离屏图按 2× 尺寸采样；限制最长边，避免大屏生成无上限的实时纹理。 */
export function comicRenderSize(width:number,height:number):{width:number;height:number} {
    const w=Math.max(1,Number.isFinite(width)?width:1),h=Math.max(1,Number.isFinite(height)?height:1);
    const scale=Math.min(2,1536/Math.max(w,h));
    return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale))};
}
/** 取现有完整模型与头发的包围范围，镜头包含肩膀、衣服和模型底部。 */
export function comicBounds(body:ArrayLike<number>,hair:ArrayLike<number>):ComicBounds {
    const out:ComicBounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};
    for(const p of [body,hair])for(let i=0;i<p.length;i+=3){
        out.minX=Math.min(out.minX,p[i]);out.maxX=Math.max(out.maxX,p[i]);
        out.minY=Math.min(out.minY,p[i+1]);out.maxY=Math.max(out.maxY,p[i+1]);
        out.minZ=Math.min(out.minZ,p[i+2]);out.maxZ=Math.max(out.maxZ,p[i+2]);
    }
    return out;
}
export function comicCamera(bounds:ComicBounds,aspect:number,fov:number):{x:number;y:number;z:number} {
    const tangent=Math.tan(fov*Math.PI/360),height=(bounds.maxY-bounds.minY)*.5,width=(bounds.maxX-bounds.minX)*.5;
    const distance=Math.max(height,width/Math.max(.1,aspect))*1.12/tangent;
    return {x:(bounds.minX+bounds.maxX)*.5,y:(bounds.minY+bounds.maxY)*.5,z:bounds.maxZ+distance};
}
/** 使用进店时的固定范围；剪短后不自动推近，用户仍可手动缩放。 */
export function stylingCameraZ(bounds:ComicBounds,aspect:number,fov:number,cameraY:number,defaultZ:number):number {
    const tangent=Math.tan(fov*Math.PI/360);
    const width=Math.max(Math.abs(bounds.minX),Math.abs(bounds.maxX));
    const height=Math.max(Math.abs(bounds.minY-cameraY),Math.abs(bounds.maxY-cameraY));
    return Math.max(defaultZ,bounds.maxZ+Math.max(width/Math.max(.1,aspect),height)*1.12/tangent);
}
export function comicLine(step:number,request:string):string {
    return step===0?'老板，今天想换个新发型！':step===1?request:'就照这个感觉来，拜托老板啦！';
}
