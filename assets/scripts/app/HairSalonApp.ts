import { _decorator, assetManager, resources, JsonAsset, Component, Font, game, Game, view, ResolutionPolicy } from 'cc';
import { SurfaceHairSimulation } from '../surface/SurfaceHairSimulation';
import { HeadAsset } from '../surface/ScalpTopology';
import { SalonRenderer } from '../rendering/SalonRenderer';
import { PrototypeHud } from '../ui/PrototypeHud';
import { SalonInput } from '../input/SalonInput';
import { HairStyle, ToolMode, TOOL_HINTS } from '../core/PrototypeConfig';
import { ResourcePaths } from '../core/ResourcePaths';
const { ccclass } = _decorator;
@ccclass('HairSalonApp')
export class HairSalonApp extends Component {
    private simulation!: SurfaceHairSimulation;
    private hidden = false;
    private renderer!: SalonRenderer;
    private hud!: PrototypeHud;
    private controls!: SalonInput;
    private hudTime = 0;
    private renderedRevision = -1;
    private dead = false;
    onLoad(): void {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
        this.hud = new PrototypeHud(this.node, style => this.changeStyle(style), mode => this.changeMode(mode), () => {
            if (this.simulation)
                this.changeStyle(this.simulation.style, true);
        }, () => {
            if (!this.simulation)
                return;
            this.controls.cancel();
            this.simulation.debugScalp = !this.simulation.debugScalp;
            this.simulation.revision++;
            this.hud.selectInspect(this.simulation.debugScalp);
            this.renderer.sync(this.simulation);
        }, ratio => this.controls?.zoomBy(ratio));
        this.hud.setStatus('正在载入用户头模');
        this.loadFonts();
        resources.load(ResourcePaths.userHead, JsonAsset, (error, asset) => {
            if (this.dead)
                return;
            if (error) {
                this.hud.setStatus('用户头模加载失败');
                console.error(error);
                return;
            }
            try {
                const userHead = asset.json as HeadAsset;
                if (!userHead || userHead.id !== 'user-head') throw new Error('头模资源缺失');
                this.simulation = new SurfaceHairSimulation(userHead);
                this.simulation.paused = this.hidden;
                this.renderer = new SalonRenderer(this.node.parent!, this.simulation);
                this.controls = new SalonInput(this.hud.inputSurface, this.renderer.camera, this.simulation, this.renderer.face);
            }
            catch (error) {
                this.hud.setStatus('头皮数据校验失败');
                console.error(error);
            }
        });
        game.on(Game.EVENT_HIDE, this.hide, this);
        game.on(Game.EVENT_SHOW, this.show, this);
    }
    private changeStyle(style: HairStyle, force = false): void {
        if (!this.simulation || (!force && style === this.simulation.style))
            return;
        this.controls.cancel();
        this.simulation.debugScalp = false;
        this.hud.selectInspect(false);
        this.simulation.reset(style);
        this.hud.selectStyle(style);
        this.renderer.sync(this.simulation);
    }
    private changeMode(mode: ToolMode): void {
        if (!this.controls || (this.controls.mode === mode && !this.simulation.debugScalp))
            return;
        this.controls.cancel();
        if (this.simulation.debugScalp) {
            this.simulation.debugScalp = false;
            this.simulation.revision++;
            this.hud.selectInspect(false);
        }
        this.controls.mode = mode;
        this.controls.gesture.feedback = TOOL_HINTS[mode];
        this.hud.selectMode(mode);
    }
    private loadFonts(): void {
        assetManager.loadBundle(ResourcePaths.fontBundle, (error, bundle) => {
            if (this.dead)
                return;
            if (error) {
                console.error('字体分包加载失败', error);
                return;
            }
            bundle.load(ResourcePaths.regularFont, Font, (regularError, regular) => {
                if (this.dead)
                    return;
                if (regularError) {
                    console.error('正文字体加载失败', regularError);
                    return;
                }
                bundle.load(ResourcePaths.boldFont, Font, (boldError, bold) => {
                    if (this.dead)
                        return;
                    if (boldError) {
                        console.error('标题字体加载失败', boldError);
                        return;
                    }
                    this.hud.applyFonts(regular, bold);
                });
            });
        });
    }
    update(dt: number): void {
        if (!this.simulation || !this.controls || this.simulation.paused)
            return;
        this.controls.update(dt);
        this.renderer.updateFace(dt);
        if (this.simulation.advance(dt) || this.renderedRevision !== this.simulation.revision) {
            this.renderer.sync(this.simulation);
            this.renderedRevision = this.simulation.revision;
        }
        this.hudTime += dt;
        if (this.hudTime >= 0.2) {
            this.hudTime = 0;
            this.hud.setFeedback(this.controls.gesture.feedback);
            this.hud.setStatus(`角色 ${(this.simulation.topology.asset.characterMesh?.indices.length ?? this.simulation.topology.asset.headIndices.length) / 3} 面 · 发缕 ${this.simulation.fiberRig.fibers.length} · 碎发 ${this.simulation.debris.length}`);
        }
    }
    private hide(): void {
        this.hidden = true;
        this.renderer?.face.suspend();
        this.controls?.cancel();
        if (this.simulation) {
            this.simulation.paused = true;
            this.simulation.clearVelocity();
        }
    }
    private show(): void {
        this.hidden = false;
        if (this.simulation) {
            this.simulation.clearVelocity();
            this.simulation.paused = false;
        }
    }
    onDestroy(): void {
        this.dead = true;
        game.off(Game.EVENT_HIDE, this.hide, this);
        game.off(Game.EVENT_SHOW, this.show, this);
        this.controls?.dispose();
        this.hud?.dispose();
        this.renderer?.dispose();
    }
}
