import { Camera, Color, Graphics, Layers, Node, UITransform, Vec3, view } from 'cc';
import { CutTrail } from '../effects/CutTrail';
import { WindLines } from '../effects/WindLines';

/** 单个 Graphics 画布叠加刀光和卷动气流，将屏幕坐标转换到 UI 层。 */
export class CutTrailHud {
    private readonly node:Node;
    private readonly transform:UITransform;
    private readonly graphics:Graphics;
    private readonly screen=new Vec3();private readonly world=new Vec3();
    private readonly a=new Vec3();private readonly b=new Vec3();
    private readonly color=new Color();
    private readonly path=new Float64Array(49*2);
    private revision=-1;
    private windRevision=-1;
    constructor(parent:Node,private readonly camera:Camera,private readonly trail:CutTrail,private readonly wind:WindLines){
        this.node=new Node('ToolEffects');this.node.layer=Layers.Enum.UI_2D;parent.addChild(this.node);
        this.transform=this.node.addComponent(UITransform);this.graphics=this.node.addComponent(Graphics);
        view.on('canvas-resize',this.clear,this);
    }
    private position(x:number,y:number,out:Vec3):void {
        this.screen.set(x,y,0);this.camera.screenToWorld(this.screen,this.world);this.transform.convertToNodeSpaceAR(this.world,out);
    }
    update():void {
        if(this.revision===this.trail.revision&&this.windRevision===this.wind.revision)return;
        this.revision=this.trail.revision;this.windRevision=this.wind.revision;
        const g=this.graphics;g.clear();g.lineCap=Graphics.LineCap.ROUND;g.lineJoin=Graphics.LineJoin.ROUND;
        for(const s of this.wind.lines){
            if(s.alpha<=0)continue;
            this.position(s.x0,s.y0,this.a);this.position(s.x1,s.y1,this.b);
            const pixels=Math.hypot(s.x1-s.x0,s.y1-s.y0);if(pixels<1e-5)continue;
            const ratio=Math.hypot(this.b.x-this.a.x,this.b.y-this.a.y)/pixels*s.scale;
            const p=this.path,count=s.path.length/2;
            for(let i=0;i<count;i++){this.position(s.path[i*2],s.path[i*2+1],this.a);p[i*2]=this.a.x;p[i*2+1]=this.a.y;}
            for(let layer=0;layer<2;layer++){
                g.lineWidth=(layer===0?6:2)*ratio;
                this.color.set(layer===0?94:244,layer===0?184:254,layer===0?215:255,Math.round((layer===0?70:205)*s.alpha));g.strokeColor=this.color;
                g.moveTo(p[0],p[1]);
                for(let i=1;i<count-1;i++){const k=i*2;g.quadraticCurveTo(p[k],p[k+1],(p[k]+p[k+2])*.5,(p[k+1]+p[k+3])*.5);}
                g.lineTo(p[(count-1)*2],p[(count-1)*2+1]);g.stroke();
            }
        }
        this.trail.preparePath();
        const count=this.trail.pointCount,p=this.path,source=this.trail.path;
        if(count<2)return;
        for(let i=0;i<count;i++){this.position(source[i*2],source[i*2+1],this.a);p[i*2]=this.a.x;p[i*2+1]=this.a.y;}
        this.position(source[0]+this.trail.pathScale,source[1],this.a);
        const ratio=Math.hypot(this.a.x-p[0],this.a.y-p[1]);
        g.lineCap=Graphics.LineCap.ROUND;g.lineJoin=Graphics.LineJoin.ROUND;
        for(let layer=0;layer<2;layer++){
            g.lineWidth=(layer===0?8:2.5)*ratio;
            this.color.set(layer===0?112:255,layer===0?220:255,255,Math.round((layer===0?100:240)*this.trail.opacity));g.strokeColor=this.color;
            g.moveTo(p[0],p[1]);
            for(let i=1;i<count-1;i++){const k=i*2;g.quadraticCurveTo(p[k],p[k+1],(p[k]+p[k+2])*.5,(p[k+1]+p[k+3])*.5);}
            g.lineTo(p[(count-1)*2],p[(count-1)*2+1]);g.stroke();
        }
    }
    private clear():void {this.trail.clear();this.wind.clear();this.update();}
    dispose():void {view.off('canvas-resize',this.clear,this);this.node.destroy();}
}
