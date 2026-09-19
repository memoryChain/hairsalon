import { GeometryBuffer } from '../hair/HairGeometry';
import { HeadAsset } from '../surface/ScalpTopology';
import { HeadRaycast } from '../surface/HeadRaycast';
import { FaceExpressionController } from './FaceExpressionController';
const WHITE=[.98,.985,.99],INK=[.07,.065,.06],BROW=[.30,.23,.18],MOUTH=[.24,.115,.06],LIP=[.56,.32,.20];
const GRID=128, EYES=[71,185];
/** 贴脸五官层：切换头型时采样表面，表情只更新小网格。 */
export class FaceGeometry extends GeometryBuffer {
    private readonly depths=new Float64Array((GRID+1)*(GRID+1));
    private width=.95; private top=2.03; private height=1.02;
    private readonly pointA=new Float64Array(2);
    private readonly pointB=new Float64Array(2);
    private readonly pointC=new Float64Array(2);
    constructor(model:HeadAsset){super(6000);this.setHead(model);}
    setHead(model:HeadAsset):void{
        this.width=model.faceLayout?.width??.95;this.top=model.faceLayout?.top??2.03;this.height=model.faceLayout?.height??1.02;
        const surface=model.characterMesh ? {...model,headPositions:model.characterMesh.positions,headIndices:model.characterMesh.indices,headNormals:model.characterMesh.normals} : model;
        const raycast=new HeadRaycast(surface),ray={ox:0,oy:0,oz:3,dx:0,dy:0,dz:-1};
        for(let y=0;y<=GRID;y++)for(let x=0;x<=GRID;x++){
            ray.ox=(x/GRID-.5)*this.width;ray.oy=this.top-y/GRID*this.height;
            const d=raycast.distance(ray,0);this.depths[y*(GRID+1)+x]=Number.isFinite(d)?3-d:0;
        }
    }
    private depth(x:number,y:number):number{
        const u=Math.max(0,Math.min(GRID-.00001,x/256*GRID)),v=Math.max(0,Math.min(GRID-.00001,y/256*GRID));
        const a=Math.floor(u),b=Math.floor(v),tx=u-a,ty=v-b,k=b*(GRID+1)+a,d=this.depths;
        return(d[k]*(1-tx)+d[k+1]*tx)*(1-ty)+(d[k+GRID+1]*(1-tx)+d[k+GRID+2]*tx)*ty;
    }
    private tri(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,color:readonly number[],lift=.012):void{
        if(ay>150&&by>150&&cy>150){
            this.mouthTri(ax,ay,bx,by,cx,cy,color,.0012+(lift-.012)*.05);return;
        }
        this.emitTri(ax,ay,bx,by,cx,cy,color,lift);
    }
    private mouthTri(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,color:readonly number[],lift:number):void{
        const ab=(ax-bx)**2+(ay-by)**2,bc=(bx-cx)**2+(by-cy)**2,ca=(cx-ax)**2+(cy-ay)**2;
        if(Math.max(ab,bc,ca)>16){
            if(ab>=bc&&ab>=ca){const x=(ax+bx)/2,y=(ay+by)/2;this.mouthTri(ax,ay,x,y,cx,cy,color,lift);this.mouthTri(x,y,bx,by,cx,cy,color,lift);}
            else if(bc>=ca){const x=(bx+cx)/2,y=(by+cy)/2;this.mouthTri(ax,ay,bx,by,x,y,color,lift);this.mouthTri(ax,ay,x,y,cx,cy,color,lift);}
            else{const x=(cx+ax)/2,y=(cy+ay)/2;this.mouthTri(ax,ay,bx,by,x,y,color,lift);this.mouthTri(x,y,bx,by,cx,cy,color,lift);}
            return;
        }
        this.emitTri(ax,ay,bx,by,cx,cy,color,lift);
    }
    private emitTri(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,color:readonly number[],lift:number):void{
        const start=this.count;
        this.triangle((ax/256-.5)*this.width,this.top-ay/256*this.height,this.depth(ax,ay)+lift,
            (bx/256-.5)*this.width,this.top-by/256*this.height,this.depth(bx,by)+lift,
            (cx/256-.5)*this.width,this.top-cy/256*this.height,this.depth(cx,cy)+lift,color);
        for(let i=start;i<this.count;i++)for(let c=0;c<3;c++)this.colors[i*4+c]=color[c];
    }
    private clip(px:number,py:number,out:Float64Array,eyeX:number,eyeY:number,eyeRy:number):void{
        if(Number.isFinite(eyeX)){const dx=(px-eyeX)/27,dy=(py-eyeY)/eyeRy,r=Math.hypot(dx,dy);if(r>1){px=eyeX+dx/r*27;py=eyeY+dy/r*eyeRy;}}
        out[0]=px;out[1]=py;
    }
    private oval(x:number,y:number,rx:number,ry:number,color:readonly number[],lift=.012,eyeX=NaN,eyeY=0,eyeRy=0):void{
        for(let i=0;i<32;i++){
            const a=i/32*Math.PI*2,b=(i+1)/32*Math.PI*2;
            this.clip(x+Math.cos(a)*rx,y+Math.sin(a)*ry,this.pointA,eyeX,eyeY,eyeRy);
            this.clip(x+Math.cos(b)*rx,y+Math.sin(b)*ry,this.pointB,eyeX,eyeY,eyeRy);this.clip(x,y,this.pointC,eyeX,eyeY,eyeRy);
            this.tri(this.pointC[0],this.pointC[1],this.pointA[0],this.pointA[1],this.pointB[0],this.pointB[1],color,lift);
        }
    }
    private line(ax:number,ay:number,bx:number,by:number,width:number,color:readonly number[]):void{
        const dx=bx-ax,dy=by-ay,l=Math.hypot(dx,dy)||1,nx=-dy/l*width/2,ny=dx/l*width/2;
        this.tri(ax+nx,ay+ny,bx+nx,by+ny,bx-nx,by-ny,color,.018);
        this.tri(ax+nx,ay+ny,bx-nx,by-ny,ax-nx,ay-ny,color,.018);
    }
    update(face:FaceExpressionController):void{
        this.count=0;
        for(const x of EYES){
            const openness=Math.max(.025,face.openness),ry=21*openness;
            if(openness>.055){
                this.oval(x,74,27.7,ry+.7,BROW);
                this.oval(x,74,27,ry,WHITE,.017);
                const gx=x+face.gazeX*9,gy=74-face.gazeY*6;
                this.oval(gx,gy,3.8,4.6,INK,.026,x,74,ry);
            }else this.line(x-24,75,x+24,75,1.4,BROW);
            const angle=face.browAngle*(x<128?1:-1),y=35-face.browHeight/this.height*256;
            for(let i=0;i<12;i++){
                const a=-26+i/12*52,b=-26+(i+1)/12*52;
                this.line(x+a,y+Math.sin(angle)*a-3*(1-a*a/676),x+b,y+Math.sin(angle)*b-3*(1-b*b/676),1.6,BROW);
            }
        }
        if(face.emotion==='neutral'){
            this.oval(128,189,17,4.4,LIP);this.oval(128,189,15.8,2.8,MOUTH,.022);
        }else if(face.emotion==='surprised'){
            this.oval(128,189,8.5,13,LIP);this.oval(128,189,7,11,MOUTH,.022);
        }else{
            const curve=face.emotion==='happy'?7:face.emotion==='sad'?-8:-3;
            for(let i=0;i<24;i++){
                const a=-18+i*1.5,b=a+1.5;
                this.line(128+a,189+curve*(1-a*a/324),128+b,189+curve*(1-b*b/324),face.emotion==='happy'?3:2.5,MOUTH);
            }
        }
        this.finish();
    }
}
