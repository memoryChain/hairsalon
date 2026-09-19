import { FaceExpressionController } from '../character/FaceExpressionController';
import { FaceGeometry } from '../character/FaceGeometry';
import { pose } from '../surface/HeadPose';
import { EffectAsset, Texture2D, resources, warn, Camera, Color, Layers, Material, Mesh, MeshRenderer, Node, utils, Vec3, Quat, gfx } from 'cc';
import { ResourcePaths } from '../core/ResourcePaths';
import { CONFIG } from '../core/PrototypeConfig';
import { createCharacter } from '../character/CharacterGeometry';
import { GeometryBuffer } from '../hair/HairGeometry';
import { SurfaceHairGeometry } from '../surface/SurfaceHairGeometry';
import { SurfaceHairSimulation } from '../surface/SurfaceHairSimulation';
export class SalonRenderer {
    readonly face = new FaceExpressionController();
    private readonly faceGeometry: FaceGeometry;
    private readonly faceMesh: Mesh;
    private readonly faceRenderer: MeshRenderer;
    private faceTime = 0;
    readonly camera: Camera;
    readonly world: Node;
    readonly character: Node;
    readonly hair = new SurfaceHairGeometry();
    private readonly meshes: Mesh[] = [];
    private readonly material: Material;
    private readonly hairMesh: Mesh;
    private readonly hairRenderer: MeshRenderer;
    private lastYaw = NaN;
    private lastPitch = NaN;
    private readonly qYaw = new Quat();
    private readonly qPitch = new Quat();
    private readonly qPose = new Quat();
    private readonly origin = { x: 0, y: 0, z: 0 };
    private headId = '';
    private texturedHead = false;
    private bodyMaterial: Material | null = null;
    private disposed = false;
    private readonly characterMesh: Mesh;
    private readonly characterRenderer: MeshRenderer;
    constructor(parent: Node, simulation: SurfaceHairSimulation) {
        this.world = new Node('SalonWorld');
        parent.addChild(this.world);
        this.material = new Material();
        this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true },
            states: { rasterizerState: { cullMode: gfx.CullMode.NONE } } });
        const cameraNode = new Node('SalonCamera');
        this.world.addChild(cameraNode);
        cameraNode.setPosition(0, CONFIG.cameraY, CONFIG.cameraZ);
        this.camera = cameraNode.addComponent(Camera);
        this.camera.projection = Camera.ProjectionType.PERSPECTIVE;
        this.camera.fov = CONFIG.fov;
        this.camera.near = 0.05;
        this.camera.far = 30;
        this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        this.camera.clearColor = new Color(230, 225, 214, 255);
        this.camera.visibility = Layers.BitMask.DEFAULT;
        const characterResult = this.addGeometry('Character', createCharacter(simulation.topology.asset, true, false));
        this.character = characterResult.node;
        this.characterMesh = characterResult.mesh;
        this.characterRenderer = characterResult.renderer;
        this.headId = simulation.topology.asset.id;
        this.texturedHead = !!simulation.topology.asset.characterMesh?.uvs;
        this.faceGeometry = new FaceGeometry(simulation.topology.asset);
        this.faceGeometry.update(this.face);
        const faceResult = this.addGeometry('Expressions', this.faceGeometry);
        faceResult.node.setParent(this.character);
        this.faceMesh = faceResult.mesh; this.faceRenderer = faceResult.renderer;
        this.hair.update(simulation);
        const hairResult = this.addGeometry('HairAndClippings', this.hair);
        this.hairMesh = hairResult.mesh;
        this.hairRenderer = hairResult.renderer;
        this.loadBodyMaterial();
    }
    private loadBodyMaterial(): void {
        resources.load(ResourcePaths.userCharacterEffect, EffectAsset, (effectError, effect) => {
            if (this.disposed) return;
            if (effectError) { warn('角色贴图材质加载失败', effectError); return; }
            resources.load(ResourcePaths.userBodyTexture, Texture2D, (textureError, texture) => {
                if (this.disposed) return;
                if (textureError) { warn('角色高清贴图加载失败', textureError); return; }
                const material = new Material();
                material.initialize({ effectAsset: effect });
                material.setProperty('mainTexture', texture);
                this.bodyMaterial = material;
                if (this.texturedHead) this.characterRenderer.setMaterial(material, 0);
            });
        });
    }
    private addGeometry(name: string, geometry: GeometryBuffer): {
        node: Node;
        mesh: Mesh;
        renderer: MeshRenderer;
    } {
        const node = new Node(name);
        node.layer = Layers.Enum.DEFAULT;
        this.world.addChild(node);
        const mesh = utils.MeshUtils.createDynamicMesh(0, geometry.finish(), undefined, { maxSubMeshes: 1, maxSubMeshVertices: geometry.capacity, maxSubMeshIndices: 0 });
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setMaterial(this.material, 0);
        this.meshes.push(mesh);
        return { node, mesh, renderer };
    }
    sync(simulation: SurfaceHairSimulation): void {
        if (this.headId !== simulation.topology.asset.id) {
            this.headId = simulation.topology.asset.id;
            this.texturedHead = !!simulation.topology.asset.characterMesh?.uvs;
            this.characterRenderer.setMaterial(this.texturedHead && this.bodyMaterial ? this.bodyMaterial : this.material, 0);
            const geometry = createCharacter(simulation.topology.asset, true, false);
            this.characterMesh.updateSubMesh(0, geometry.finish());
            this.characterRenderer.onGeometryChanged();
            this.faceGeometry.setHead(simulation.topology.asset);
            this.faceGeometry.update(this.face);
            this.faceMesh.updateSubMesh(0, this.faceGeometry.view);
            this.faceRenderer.onGeometryChanged();
        }
        if (simulation.yaw !== this.lastYaw || simulation.pitch !== this.lastPitch) {
            this.lastYaw = simulation.yaw;
            this.lastPitch = simulation.pitch;
            Quat.fromAxisAngle(this.qYaw, Vec3.UP, simulation.yaw);
            Quat.fromAxisAngle(this.qPitch, Vec3.RIGHT, simulation.pitch);
            Quat.multiply(this.qPose, this.qPitch, this.qYaw);
            this.character.setRotation(this.qPose);
            pose(0, 0, 0, simulation.yaw, simulation.pitch, simulation.topology.asset.center, this.origin);
            this.character.setPosition(this.origin.x, this.origin.y, this.origin.z);
        }
        this.hair.update(simulation);
        this.hairMesh.updateSubMesh(0, this.hair.view);
        this.hairRenderer.onGeometryChanged();
    }
    updateFace(dt: number): void {
        this.faceTime += dt;
        if (this.faceTime < 1 / 30) return;
        const changed = this.face.update(this.faceTime); this.faceTime = 0;
        if (!changed) return;
        this.faceGeometry.update(this.face);
        this.faceMesh.updateSubMesh(0, this.faceGeometry.view);
        this.faceRenderer.onGeometryChanged();
    }
    dispose(): void {
        this.disposed = true;
        this.world.destroy();
        for (const mesh of this.meshes)
            mesh.destroy();
        this.material.destroy();
        this.bodyMaterial?.destroy();
    }
}
