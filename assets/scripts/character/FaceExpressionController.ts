export type FaceEmotion = 'neutral' | 'happy' | 'surprised' | 'angry' | 'sad';
export const FACE_EMOTIONS: readonly FaceEmotion[] = ['neutral', 'happy', 'surprised', 'angry', 'sad'];
const LOOKS = { neutral: [0,0,1], happy: [-.12,.008,.78], surprised: [-.08,.035,1.18], angry: [.28,-.013,.63], sad: [-.28,.012,.84] };
const clamp = (x:number, a:number, b:number) => Math.max(a,Math.min(b,x));
/** 视线、眼睑、眉毛和口形独立；同一状态可驱动平面或立体五官。 */
export class FaceExpressionController {
    emotion: FaceEmotion = 'neutral';
    gazeX = 0; gazeY = 0;
    browAngle = 0; browHeight = 0; eyeOpen = 1; blink = 0;
    private targetX = 0; private targetY = 0; private idle = 0;
    private untilBlink = 0; private blinkAge = -1;
    constructor(private readonly random:()=>number = Math.random) { this.scheduleBlink(); }
    private scheduleBlink():void { this.untilBlink = 2.5 + clamp(this.random(),0,1)*3; }
    setEmotion(emotion:FaceEmotion):void { if(FACE_EMOTIONS.indexOf(emotion)>=0) this.emotion=emotion; }
    /** 先将屏幕方向逆变换到头部坐标；背面不强行扭眼追手。 */
    lookAtScreen(x:number,y:number,yaw:number,pitch:number):void {
        if(![x,y,yaw,pitch].every(Number.isFinite)) return;
        const visible=clamp((Math.cos(yaw)*Math.cos(pitch)-.1)/.45,0,1);
        const z=-y*Math.sin(pitch);
        this.targetX=clamp(x*Math.cos(yaw)-z*Math.sin(yaw),-1,1)*visible;
        this.targetY=clamp(y*Math.cos(pitch),-1,1)*visible;
        this.idle=0;
    }
    releaseLook():void { this.idle=Math.max(this.idle,.3); }
    blinkNow():void { if(this.blinkAge<0)this.blinkAge=0; }
    suspend():void { this.blinkAge=-1;this.blink=0;this.targetX=this.targetY=this.gazeX=this.gazeY=0;this.scheduleBlink(); }
    update(dt:number):boolean {
        if(!Number.isFinite(dt)||dt<=0)return false;
        dt=Math.min(dt,.1);this.idle+=dt;
        if(this.idle>.9)this.targetX=this.targetY=0;
        const oldX=this.gazeX,oldY=this.gazeY,oldB=this.blink,oldA=this.browAngle,oldH=this.browHeight,oldO=this.eyeOpen;
        const follow=1-Math.exp(-dt*14),mood=1-Math.exp(-dt*11),look=LOOKS[this.emotion];
        this.gazeX+=(this.targetX-this.gazeX)*follow;this.gazeY+=(this.targetY-this.gazeY)*follow;
        this.browAngle+=(look[0]-this.browAngle)*mood;this.browHeight+=(look[1]-this.browHeight)*mood;this.eyeOpen+=(look[2]-this.eyeOpen)*mood;
        if(this.blinkAge<0){this.untilBlink-=dt;if(this.untilBlink<=0)this.blinkAge=0;}
        if(this.blinkAge>=0){
            this.blinkAge+=dt;const t=this.blinkAge;
            this.blink=t<.08?t/.08:t<.12?1:Math.max(0,1-(t-.12)/.14);
            if(t>=.26){this.blinkAge=-1;this.blink=0;this.scheduleBlink();}
        }
        return Math.abs(oldX-this.gazeX)+Math.abs(oldY-this.gazeY)+Math.abs(oldB-this.blink)+Math.abs(oldA-this.browAngle)+Math.abs(oldH-this.browHeight)+Math.abs(oldO-this.eyeOpen)>1e-5;
    }
    get mouthFrame():number { return FACE_EMOTIONS.indexOf(this.emotion); }
    get openness():number { return Math.max(0,this.eyeOpen*(1-this.blink)); }
}
