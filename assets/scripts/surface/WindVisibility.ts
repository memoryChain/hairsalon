import type { SurfaceHairSimulation } from './SurfaceHairSimulation';
import type { HairProjection } from '../hair/HairScreenCutter';
import { pose } from './HeadPose';

/** 吹风使用当前网格的低分辨率深度遮罩，排除背面发根和被头/其他发束遮挡的发束。 */
export class WindVisibility {
    private readonly size=64;
    private readonly depth=new Float64Array(64*64);
    private readonly groups=new Int32Array(64*64);
    private visible=new Uint8Array(0);
    private facing=new Uint8Array(0);
    private hairScreen=new Float64Array(0);
    private headScreen=new Float64Array(0);
    private readonly point={x:0,y:0,z:0};
    private readonly root={x:0,y:0,z:0};
    private readonly q={x:0,y:0,depth:0};
    private readonly ray={ox:0,oy:0,oz:0,dx:0,dy:0,dz:0};
    private minX=0;private minY=0;private spanX=1;private spanY=1;

    sample(sim:SurfaceHairSimulation,projection:HairProjection):Uint8Array {
        const fibers=sim.fiberRig.fibers,mesh=sim.cutMesh||sim.fiberMesh,p=mesh.evaluate(sim),head=sim.topology.asset;
        if(this.visible.length!==fibers.length){this.visible=new Uint8Array(fibers.length);this.facing=new Uint8Array(fibers.length);}
        this.visible.fill(0);this.facing.fill(0);
        for(const f of fibers){
            let alive=false;for(const id of f.ids)if(sim.lengths[id]>0){alive=true;break;}if(!alive)continue;
            pose(f.root[0],f.root[1],f.root[2],sim.yaw,sim.pitch,head.center,this.root);
            pose(f.root[0]+f.normal[0],f.root[1]+f.normal[1],f.root[2]+f.normal[2],sim.yaw,sim.pitch,head.center,this.point);
            projection.project(this.root.x,this.root.y,this.root.z,this.q);projection.rayAt(this.q.x,this.q.y,this.ray);
            const dot=(this.point.x-this.root.x)*-this.ray.dx+(this.point.y-this.root.y)*-this.ray.dy+(this.point.z-this.root.z)*-this.ray.dz;
            if(dot>0)this.facing[f.group]=1;
        }
        if(this.hairScreen.length!==p.length)this.hairScreen=new Float64Array(p.length);
        if(this.headScreen.length!==head.headPositions.length)this.headScreen=new Float64Array(head.headPositions.length);
        this.project(p,this.hairScreen,projection,sim,false);this.project(head.headPositions,this.headScreen,projection,sim,true);
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        // 只用存活面取范围，剪掉的远端顶点不挤占采样分辨率。
        for(const [screen,indices] of [[this.hairScreen,mesh.indices],[this.headScreen,head.headIndices]] as const){
            for(const id of indices){const k=id*3;if(screen[k+2]<=0)continue;
                minX=Math.min(minX,screen[k]);maxX=Math.max(maxX,screen[k]);minY=Math.min(minY,screen[k+1]);maxY=Math.max(maxY,screen[k+1]);}
        }
        if(!Number.isFinite(minX))return this.visible;
        const width=Math.max(1e-6,maxX-minX),height=Math.max(1e-6,maxY-minY);
        this.minX=minX-width*.01;this.minY=minY-height*.01;this.spanX=width*1.02;this.spanY=height*1.02;
        this.depth.fill(Infinity);this.groups.fill(-1);
        this.raster(this.headScreen,head.headIndices);
        this.raster(this.hairScreen,mesh.indices,mesh.groups);
        for(const group of this.groups)if(group>=0&&this.facing[group])this.visible[group]=1;
        return this.visible;
    }
    private project(p:ArrayLike<number>,out:Float64Array,projection:HairProjection,sim:SurfaceHairSimulation,transform:boolean):void {
        for(let k=0;k<p.length;k+=3){
            if(transform){pose(p[k],p[k+1],p[k+2],sim.yaw,sim.pitch,sim.topology.asset.center,this.point);projection.project(this.point.x,this.point.y,this.point.z,this.q);}
            else projection.project(p[k],p[k+1],p[k+2],this.q);
            out[k]=this.q.x;out[k+1]=this.q.y;out[k+2]=this.q.depth;
        }
    }
    private raster(p:Float64Array,indices:ArrayLike<number>,groups?:ArrayLike<number>):void {
        const n=this.size,sx=n/this.spanX,sy=n/this.spanY;
        for(let t=0;t<indices.length;t+=3){
            const a=indices[t]*3,b=indices[t+1]*3,c=indices[t+2]*3;
            if(p[a+2]<=0||p[b+2]<=0||p[c+2]<=0)continue;
            const ax=(p[a]-this.minX)*sx,ay=(p[a+1]-this.minY)*sy,bx=(p[b]-this.minX)*sx,by=(p[b+1]-this.minY)*sy,cx=(p[c]-this.minX)*sx,cy=(p[c+1]-this.minY)*sy;
            const area=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(area)<1e-8)continue;
            const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(n-1,Math.ceil(Math.max(ax,bx,cx))),y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(n-1,Math.ceil(Math.max(ay,by,cy)));
            for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
                const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/area,v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/area,w=1-u-v;
                if(u<0||v<0||w<0)continue;
                const depth=1/(u/p[a+2]+v/p[b+2]+w/p[c+2]),at=y*n+x;
                if(depth>=this.depth[at]-1e-7)continue;
                this.depth[at]=depth;this.groups[at]=groups?groups[t/3]:-1;
            }
        }
    }
}
