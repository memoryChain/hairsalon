import { cycleStyle, styleTitle } from '../core/HairstyleCatalog';
import { Button, Camera, Canvas, Color, Font, Graphics, Label, Layers, Node, UITransform, view, screen, sys } from 'cc';
import { HairStyle, ToolMode, TOOL_HINTS } from '../core/PrototypeConfig';
const INK = new Color(34, 54, 62), PAPER = new Color(250, 247, 240), TEAL = new Color(27, 108, 97);
type Control = {
    node: Node;
    label: Label;
    graphics: Graphics;
    selected: boolean;
    width: number;
};
export class PrototypeHud {
    readonly inputSurface: Node;
    private readonly labels: Label[] = [];
    private readonly controls = new Map<string, Control>();
    private readonly status: Label;
    private readonly hint: Label;
    private readonly styleLabel: Label;
    private style: HairStyle = 'spiky';
    private readonly root: Node;
    private readonly topControls: Node;
    private readonly bottomControls: Node;
    private readonly camera: Camera;
    private alive = true;
    private mode: ToolMode = 'cut';
    private inspecting = false;
    constructor(canvasNode: Node, onStyle: (style: HairStyle) => void, onMode: (mode: ToolMode) => void, onReset: () => void, onInspect: () => void, onZoom: (ratio: number) => void) {
        const canvas = canvasNode.getComponent(Canvas)!;
        const camera = this.camera = canvas.cameraComponent!;
        camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        camera.visibility = Layers.BitMask.UI_2D;
        camera.priority = 10;
        camera.orthoHeight = 640;
        this.root = this.node('PrototypeHud', canvasNode, 720, 1280, 0, 0);
        this.inputSurface = this.node('InteractionArea', this.root, 720, 1280, 0, 0);
        this.topControls = this.node('TopControls', this.root, 720, 140, 0, 0);
        this.bottomControls = this.node('BottomControls', this.root, 720, 120, 0, 0);
        this.styleLabel = this.label(styleTitle(this.style), 25, 0, -24, 650, this.topControls);
        this.status = this.label('', 14, 0, -119, 650, this.topControls);
        this.hint = this.label('滑动可连续剪发；头下方空白区域拖动旋转', 17, 0, 92, 660, this.bottomControls);
        this.button('previousStyle', '上一款', -80, -76, () => onStyle(cycleStyle(this.style, -1)), this.topControls);
        this.button('nextStyle', '下一款', 80, -76, () => onStyle(cycleStyle(this.style, 1)), this.topControls);
        this.button('zoomOut', '拉远', -294, -165, () => onZoom(1 / .85), this.topControls, 98);
        this.button('zoomReset', '复位', -294, -221, () => onZoom(0), this.topControls, 98);
        this.button('zoomIn', '拉近', -294, -277, () => onZoom(.85), this.topControls, 98);
        this.button('cut', '剪发', -275, 38, () => onMode('cut'), this.bottomControls, 100);
        this.button('comb', '梳理', -165, 38, () => onMode('comb'), this.bottomControls, 100);
        this.button('blow', '吹风', -55, 38, () => onMode('blow'), this.bottomControls, 100);
        this.button('shave', '剃光', 55, 38, () => onMode('shave'), this.bottomControls, 100);
        this.button('inspect', '查看头皮', 165, 38, onInspect, this.bottomControls, 100);
        this.button('reset', '恢复发型', 275, 38, onReset, this.bottomControls, 100);
        this.selectStyle('spiky');
        this.selectMode('cut');
        // 窗口变化只更新画布，不在逐帧路径中触发布局。
        view.on('canvas-resize', this.resize, this);
        this.resize();
    }
    private node(name: string, parent: Node, width: number, height: number, x: number, y: number): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height);
        node.setPosition(x, y);
        return node;
    }
    private label(text: string, size: number, x: number, y: number, width: number, parent = this.root): Label {
        const node = this.node('Text', parent, width, size + 16, x, y);
        const label = node.addComponent(Label);
        label.fontSize = size;
        label.lineHeight = size + 6;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = INK;
        label.string = text;
        this.labels.push(label);
        return label;
    }
    private button(id: string, text: string, x: number, y: number, callback: () => void, parent: Node, width = 148): void {
        const node = this.node(id, parent, width, 48, x, y);
        const graphics = node.addComponent(Graphics);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.NONE;
        const labelNode = this.node('Text', node, width - 8, 42, 0, 0);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 20;
        label.lineHeight = 26;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        this.labels.push(label);
        const control = { node, label, graphics, selected: false, width };
        this.controls.set(id, control);
        this.paint(control, false);
        node.on(Button.EventType.CLICK, callback);
    }
    private paint(control: Control, selected: boolean): void {
        control.selected = selected;
        control.graphics.clear();
        control.graphics.fillColor = selected ? TEAL : PAPER;
        control.graphics.roundRect(-control.width / 2, -24, control.width, 48, 10);
        control.graphics.fill();
        control.label.color = selected ? PAPER : INK;
    }
    private select(ids: readonly string[], selected: string): void {
        for (const id of ids) {
            const c = this.controls.get(id)!;
            if (c.selected !== (id === selected))
                this.paint(c, id === selected);
        }
    }
    selectStyle(style: HairStyle): void { this.style = style; const title = styleTitle(style); if (this.styleLabel.string !== title)
        this.styleLabel.string = title; }
    selectMode(mode: ToolMode): void {
        this.mode = mode;
        this.select(['cut', 'comb', 'blow', 'shave'], mode);
        const text = this.inspecting ? '绿色为真实头皮；再次点击查看头皮返回操作' : TOOL_HINTS[mode];
        if (this.hint.string !== text)
            this.hint.string = text;
    }
    selectInspect(active: boolean): void {
        this.inspecting = active;
        this.selectMode(this.mode);
        const c = this.controls.get('inspect')!;
        if (c.selected !== active)
            this.paint(c, active);
    }
    setFeedback(text: string): void {
        if (!this.inspecting && this.hint.string !== text)
            this.hint.string = text;
    }
    setStatus(text: string): void {
        if (this.status.string !== text)
            this.status.string = text;
    }
    applyFonts(regular: Font, bold: Font): void {
        if (!this.alive)
            return;
        for (const label of this.labels) {
            label.font = label.fontSize >= 20 ? bold : regular;
            label.useSystemFont = false;
        }
    }
    private resize(): void {
        const size = view.getVisibleSize();
        this.root.parent?.getComponent(UITransform)?.setContentSize(size.width, size.height);
        this.root.getComponent(UITransform)!.setContentSize(size.width, size.height);
        this.inputSurface.getComponent(UITransform)!.setContentSize(size.width, size.height);
        this.camera.orthoHeight = size.height / 2;
        const safe = sys.getSafeAreaRect(), windowSize = screen.windowSize;
        const scaleY = size.height / Math.max(1, windowSize.height);
        const topInset = Math.max(14, (windowSize.height - safe.y - safe.height) * scaleY);
        const bottomInset = Math.max(16, safe.y * scaleY);
        this.topControls.setPosition(0, size.height / 2 - topInset, 0);
        this.bottomControls.setPosition(0, -size.height / 2 + bottomInset, 0);
    }
    dispose(): void { this.alive = false; view.off('canvas-resize', this.resize, this); this.root.destroy(); }
}
