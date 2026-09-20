import { BlockInputEvents, Button, Color, Font, Graphics, Label, Layers, Node, resources, Sprite, SpriteFrame, Texture2D, UITransform, view } from 'cc';
import { SalonSession } from '../gameplay/SalonSession';
import { Raster, VIEW_NAMES } from '../gameplay/HairScore';
import { comicLine } from '../gameplay/ComicFraming';

/** 营业流程 UI；只在阶段、客人或参考角度变化时重建内容。 */
export class SalonFlowHud {
    comicSprite: Sprite|null=null;
    private dialogueLabel: Label|null=null;
    private dialogueHint: Label|null=null;
    private dialoguePhoto: Node|null=null;
    private resultTexture: Texture2D|null=null;
    private resultAngleLabel: Label|null=null;
    private readonly root: Node;
    private content!: Node;
    private labels: Label[]=[];
    private textures: Texture2D[]=[];
    private frames: SpriteFrame[]=[];
    private regular?: Font;private bold?: Font;
    private revision=-1;private generation=0;private opened=false;private alive=true;private viewIndex=0;
    constructor(parent: Node,private readonly session: SalonSession,private readonly cancel:()=>void,private readonly showTools:(visible:boolean)=>void) {
        this.root=this.node('SalonFlow',parent,720,1280,0,0);
        view.on('canvas-resize',this.resize,this);this.render();
    }
    get blocksInput(): boolean { return this.opened || !this.session.canStyle; }
    sync(): void { if(this.revision!==this.session.revision)this.render(); }
    applyFonts(regular: Font,bold: Font): void { this.regular=regular;this.bold=bold;for(const l of this.labels)this.font(l); }
    private font(label: Label): void { const font=label.fontSize>=24?this.bold:this.regular;if(font){label.font=font;label.useSystemFont=false;} }
    private node(name:string,parent:Node,w:number,h:number,x:number,y:number):Node {
        const n=new Node(name);n.layer=Layers.Enum.UI_2D;parent.addChild(n);n.addComponent(UITransform).setContentSize(w,h);n.setPosition(x,y);return n;
    }
    private panel(parent:Node,w:number,h:number,x:number,y:number,color=new Color(255,250,238)):Node {
        const n=this.node('Panel',parent,w,h,x,y),g=n.addComponent(Graphics);g.fillColor=color;g.strokeColor=new Color(41,58,54);g.lineWidth=3;g.roundRect(-w/2,-h/2,w,h,14);g.fill();g.stroke();return n;
    }
    private label(parent:Node,text:string,x:number,y:number,w:number,size=23,h=42):Label {
        const n=this.node('Text',parent,w,h,x,y),l=n.addComponent(Label);l.string=text;l.fontSize=size;l.lineHeight=size+9;l.enableWrapText=true;l.overflow=Label.Overflow.SHRINK;l.horizontalAlign=Label.HorizontalAlign.CENTER;l.verticalAlign=Label.VerticalAlign.CENTER;l.color=new Color(41,58,54);this.labels.push(l);this.font(l);return l;
    }
    private button(parent:Node,text:string,x:number,y:number,w:number,callback:()=>void):Node {
        const n=this.panel(parent,w,56,x,y,new Color(36,109,92));n.addComponent(Button).transition=Button.Transition.NONE;
        this.label(n,text,0,0,w-12,23).color=new Color(255,252,241);n.on(Button.EventType.CLICK,callback);return n;
    }
    private image(parent:Node,raster:Raster,x:number,y:number,size:number):Sprite {
        const n=this.node('Portrait',parent,size,size,x,y),s=n.addComponent(Sprite),t=new Texture2D();t.reset({width:raster.size,height:raster.size,mipmapLevel:1});
        t.setFilters(Texture2D.Filter.LINEAR,Texture2D.Filter.LINEAR);t.setMipFilter(Texture2D.Filter.NONE);t.uploadData(raster.rgba);
        const frame=new SpriteFrame();frame.texture=t;s.sizeMode=Sprite.SizeMode.CUSTOM;s.spriteFrame=frame;
        s.node.getComponent(UITransform)!.setContentSize(size,size);this.textures.push(t);this.frames.push(frame);return s;
    }
    private photo(parent:Node,x:number,y:number,w:number,h:number):Sprite {
        const holder=this.panel(parent,w,h,x,y,new Color(242,235,220));
        const hint=this.label(holder,'照片载入中',0,0,w-10,16,h);
        const s=this.node('CelebrityPhoto',holder,w,h,0,0).addComponent(Sprite),generation=this.generation;
        s.sizeMode=Sprite.SizeMode.CUSTOM;
        resources.load(`references/${this.session.order.id}/texture`,Texture2D,(error,texture)=>{
            if(!this.alive||generation!==this.generation||!s.isValid)return;
            if(error){hint.string='照片暂不可用';return;}
            hint.node.active=false;
            const f=new SpriteFrame();f.texture=texture;this.frames.push(f);s.spriteFrame=f;
            const scale=Math.min(w/texture.width,h/texture.height);s.node.getComponent(UITransform)!.setContentSize(texture.width*scale,texture.height*scale);
        });
        return s;
    }
    private clear():void { this.comicSprite=null;this.dialogueLabel=null;this.dialogueHint=null;this.dialoguePhoto=null;this.resultTexture=null;this.resultAngleLabel=null;this.content?.destroy();for(const f of this.frames)f.destroy();for(const t of this.textures)t.destroy();this.frames=[];this.textures=[];this.labels=[]; }
    private changeResultView():void {
        if(!this.resultTexture||!this.resultAngleLabel)return;
        this.viewIndex=(this.viewIndex+1)%4;
        this.resultTexture.uploadData(this.session.getResultPortrait(this.viewIndex).rgba);
        this.resultAngleLabel.string=`作品${VIEW_NAMES[this.viewIndex]} · 换个角度`;
    }
    private updateDialogue():void {
        const step=this.session.phase==='arrival'?0:this.session.phase==='request'?1:2;
        this.dialogueLabel!.string=comicLine(step,this.session.order.request);
        this.dialogueHint!.string=step===2?'点击屏幕，开始理发':'点击屏幕，继续对话';
        this.dialoguePhoto!.active=step===1;
    }
    private render():void {
        this.showTools(!this.blocksInput);
        if(this.comicSprite&&!this.opened&&['arrival','request','ready'].indexOf(this.session.phase)>=0){
            this.revision=this.session.revision;this.updateDialogue();return;
        }
        this.clear();this.revision=this.session.revision;this.generation++;
        const size=view.getVisibleSize(),s=this.session;
        this.content=this.node('FlowContent',this.root,size.width,size.height,0,0);
        if(s.canStyle&&!this.opened) {
            const card=this.panel(this.content,178,246,252,size.height/2-206);
            card.addComponent(BlockInputEvents);this.photo(card,0,24,132,148);
            this.label(card,s.order.referenceName,0,-68,165,21);
            this.button(card,'对照发型',0,-103,164,()=>{this.cancel();this.opened=true;this.render();});
            this.button(this.content,'完成理发',0,-size.height/2+132,230,()=>{this.cancel();s.finish();this.render();});
            return;
        }
        const blocker=this.node('InputBlocker',this.content,size.width,size.height,0,0);blocker.addComponent(BlockInputEvents);
        const panel=this.panel(blocker,660,900,0,0);
        const scale=Math.min(1,(size.height-44)/900);panel.setScale(scale,scale,1);
        if(this.opened) {
            this.label(panel,`${s.order.referenceName} · ${s.order.title}`,0,392,610,29);
            this.photo(panel,0,92,360,430);
            this.label(panel,s.order.request,0,-202,590,22,72);
            this.label(panel,s.order.credit,0,-284,594,15,48);
            this.label(panel,'照片来源与许可见随包参考素材说明',0,-325,590,16);
            this.button(panel,'返回理发',0,-391,246,()=>{this.opened=false;this.render();});return;
        }
        if(s.phase==='settling') {this.label(panel,'整理一下，看看新造型…',0,0,600,32);return;}
        if(s.phase==='result'&&s.result) {
            const r=s.result;
            this.label(panel,`${r.total} 分 · ${r.stars} 星评价`,0,382,610,40);
            this.label(panel,r.total>=70?'这次造型，很有感觉！':'再练一次，会更接近！',0,320,610,26);
            this.photo(panel,-150,133,274,286);
            const work=this.image(panel,s.getResultPortrait(this.viewIndex),150,133,274);
            this.resultTexture=work.spriteFrame!.texture as Texture2D;
            this.label(panel,s.order.referenceName,-150,-38,280,21);this.label(panel,'你的作品',150,-38,280,21);
            const angleButton=this.button(panel,`作品${VIEW_NAMES[this.viewIndex]} · 换个角度`,0,-100,340,()=>this.changeResultView());
            this.resultAngleLabel=angleButton.getComponentInChildren(Label);
            this.label(panel,`外形 ${r.silhouette}    长度 ${r.length}    走向 ${r.direction}`,0,-159,604,27);
            this.label(panel,r.feedback,0,-232,588,25,86);
            this.button(panel,'再试一次',-155,-365,250,()=>{this.cancel();s.retry();this.render();});
            this.button(panel,'下一位客人',155,-365,250,()=>{this.cancel();this.viewIndex=0;s.nextCustomer();this.render();});return;
        }
        this.label(panel,`理发大师 · 第 ${s.customer} 位客人`,0,392,620,29);
        const stage=this.panel(panel,606,700,0,0,new Color(233,228,218));
        const model=this.node('FullCharacter',stage,568,436,0,-107);
        this.comicSprite=model.addComponent(Sprite);this.comicSprite.sizeMode=Sprite.SizeMode.CUSTOM;
        const bubble=this.panel(stage,534,176,0,244);
        const g=bubble.getComponent(Graphics)!;const bottom=-88;
        g.moveTo(30,bottom+2);g.lineTo(78,bottom+2);g.lineTo(30,bottom-35);g.close();g.fill();
        g.moveTo(78,bottom);g.lineTo(30,bottom-35);g.lineTo(30,bottom);g.stroke();
        this.label(bubble,'客人',-213,65,70,18);
        this.dialogueLabel=this.label(bubble,'',-55,-8,365,25,112);
        this.dialoguePhoto=this.photo(bubble,207,0,82,118).node.parent;
        this.dialogueHint=this.label(panel,'',0,-394,580,20);
        this.updateDialogue();
        blocker.addComponent(Button).transition=Button.Transition.NONE;
        blocker.on(Button.EventType.CLICK,()=>{this.cancel();s.advanceComic();this.render();});
    }
    private resize():void { this.clear();this.render(); }
    dispose():void {this.alive=false;view.off('canvas-resize',this.resize,this);this.clear();this.root.destroy();}
}
