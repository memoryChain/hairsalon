import { CameraZoom } from './CameraZoom';
import { FaceExpressionController, FACE_EMOTIONS } from '../character/FaceExpressionController';
import { Camera, EventMouse, EventKeyboard, EventTouch, input, Input, KeyCode, Node, geometry, Vec3, screen } from 'cc';
import { Ray } from '../hair/HairSimulation';
import { SurfaceHairSimulation } from '../surface/SurfaceHairSimulation';
import { CONFIG, ToolMode } from '../core/PrototypeConfig';
import { ScreenPoint } from '../hair/HairScreenCutter';
import { SalonGesture } from '../surface/SalonGesture';
export class SalonInput {
    mode: ToolMode = 'cut';
    private readonly zoom = new CameraZoom();
    readonly gesture: SalonGesture;
    private touchId = -1;
    private left = false;
    private right = false;
    private readonly ray = new geometry.Ray();
    private readonly worldPoint = new Vec3();
    private readonly screenPoint = new Vec3();
    constructor(private readonly surface: Node, private readonly camera: Camera, private readonly sim: SurfaceHairSimulation, private readonly face?: FaceExpressionController) {
        this.gesture = new SalonGesture(sim, this);
        for (const node of [surface]) {
            node.on(Node.EventType.TOUCH_START, this.start, this);
            node.on(Node.EventType.TOUCH_MOVE, this.move, this);
            node.on(Node.EventType.TOUCH_END, this.end, this);
            node.on(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
        }
        surface.on(Node.EventType.MOUSE_WHEEL, this.wheel, this);
        input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.on(Input.EventType.KEY_UP, this.keyUp, this);
    }
    update(dt: number): void {
        this.gesture.update(dt);
        if (this.left !== this.right)
            this.sim.turn((this.left ? -1 : 1) * Math.min(dt, 0.05) * 1.7);
    }
    cancel(): void { this.zoom.cancel(); this.touchId = -1; this.left = this.right = false; this.gesture.cancel(); this.sim.stop(); }
    private touchCancel(e: EventTouch): void {
        if (this.zoom.up(e.getID() ?? -1) || e.getID() === this.touchId) this.cancelSingle();
    }
    private cancelSingle(): void { this.touchId = -1; this.left = this.right = false; this.gesture.cancel(); this.sim.stop(); }
    zoomBy(ratio: number): void {
        this.cancelSingle();
        if (ratio === 0) this.zoom.set(1); else this.zoom.scale(ratio);
        this.applyZoom();
    }
    private wheel(e: EventMouse): void {
        this.cancelSingle(); this.zoom.wheel(-e.getScrollY() / 5); this.applyZoom();
    }
    private applyZoom(): void {
        const z = CONFIG.cameraZ * this.zoom.factor;
        if (this.camera.node.position.z !== z) this.camera.node.setPosition(0, CONFIG.cameraY, z);
    }
    private start(e: EventTouch): void {
        const location = e.getLocation();
        if (this.zoom.down(e.getID() ?? -1, location.x, location.y)) { this.cancelSingle(); return; }
        if (this.touchId !== -1)
            return;
        this.touchId = e.getID() ?? -1;
        const p = e.getLocation();
        this.trackFace(p.x, p.y);
        this.left = this.right = false;
        this.gesture.begin(p.x, p.y, this.mode, screen.devicePixelRatio);
    }
    private move(e: EventTouch): void {
        const location = e.getLocation();
        if (this.zoom.move(e.getID() ?? -1, location.x, location.y)) { this.applyZoom(); return; }
        if (e.getID() !== this.touchId)
            return;
        const p = e.getLocation();
        this.trackFace(p.x, p.y);
        this.gesture.move(p.x, p.y);
    }
    private end(e: EventTouch): void {
        if (this.zoom.up(e.getID() ?? -1)) { this.cancelSingle(); return; }
        if (e.getID() !== this.touchId)
            return;
        const p = e.getLocation();
        this.trackFace(p.x, p.y);
        this.gesture.end(p.x, p.y);
        this.touchId = -1;
    }
    private trackFace(x: number, y: number): void {
        this.worldPoint.set(0, 1.65, 0); this.camera.worldToScreen(this.worldPoint, this.screenPoint);
        const cx = this.screenPoint.x, cy = this.screenPoint.y;
        this.worldPoint.set(.6, 1.65, 0); this.camera.worldToScreen(this.worldPoint, this.screenPoint);
        const radius = Math.max(1, Math.abs(this.screenPoint.x - cx));
        this.face?.lookAtScreen((x-cx)/radius, (y-cy)/radius, this.sim.yaw, this.sim.pitch);
    }
    project(x: number, y: number, z: number, out: ScreenPoint): void {
        this.worldPoint.set(x, y, z);
        this.camera.worldToScreen(this.worldPoint, this.screenPoint);
        out.x = this.screenPoint.x;
        out.y = this.screenPoint.y;
        const origin = this.camera.node.worldPosition, forward = this.camera.node.forward;
        out.depth = (x - origin.x) * forward.x + (y - origin.y) * forward.y + (z - origin.z) * forward.z;
    }
    rayAt(x: number, y: number, out: Ray): void {
        this.camera.screenPointToRay(x, y, this.ray);
        const b = this.ray;
        out.ox = b.o.x;
        out.oy = b.o.y;
        out.oz = b.o.z;
        out.dx = b.d.x;
        out.dy = b.d.y;
        out.dz = b.d.z;
    }
    private keyDown(e: EventKeyboard): void {
        if (e.keyCode === KeyCode.KEY_E && this.face) this.face.setEmotion(FACE_EMOTIONS[(this.face.mouthFrame+1)%FACE_EMOTIONS.length]);
        if (e.keyCode === KeyCode.KEY_A)
            this.left = true;
        if (e.keyCode === KeyCode.KEY_D)
            this.right = true;
        if (e.keyCode === KeyCode.SPACE)
            this.cancel();
    }
    private keyUp(e: EventKeyboard): void {
        if (e.keyCode === KeyCode.KEY_A)
            this.left = false;
        if (e.keyCode === KeyCode.KEY_D)
            this.right = false;
        if (!this.left && !this.right)
            this.sim.stop();
    }
    dispose(): void {
        this.cancel();
        for (const node of [this.surface])
            if (node.isValid) {
                node.off(Node.EventType.MOUSE_WHEEL, this.wheel, this);
                node.off(Node.EventType.TOUCH_START, this.start, this);
                node.off(Node.EventType.TOUCH_MOVE, this.move, this);
                node.off(Node.EventType.TOUCH_END, this.end, this);
                node.off(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
            }
        input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
        input.off(Input.EventType.KEY_UP, this.keyUp, this);
    }
}
