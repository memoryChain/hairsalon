"""Blender 后台生成两个测试头模及从头部直接提取的连续头皮。"""
import bpy, json, math, os
from pathlib import Path
from collections import Counter
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'sceneresource'
RUNTIME = ROOT / 'assets/resources/scalp'
OUT.mkdir(exist_ok=True); RUNTIME.mkdir(parents=True, exist_ok=True)
# 独立后台进程只操作本次创建的空场景，不读取或修改用户的窗口文件。
bpy.ops.wm.read_factory_settings(use_empty=True)

def make_head(name, sectors, scalp_rows, lower_rows, unusual, display_x):
    vertices = [(0, 2.38, 0)]
    for row in range(1, scalp_rows + lower_rows):
        for col in range(sectors):
            phi = col / sectors * math.tau
            front = max(0, math.cos(phi))
            limit = 1.96 - .86 * front ** 2 - .22 * abs(math.sin(phi)) ** 4
            theta = limit * row/scalp_rows if row <= scalp_rows else limit + (math.pi-limit)*(row-scalp_rows)/lower_rows
            nx,ny,nz=math.sin(theta)*math.sin(phi),math.cos(theta),math.sin(theta)*math.cos(phi)
            x,y,z=.57*nx,1.65+.73*ny,.54*nz
            if unusual:
                x=x*(1+.13*ny+.09*nx)+.035*(1-ny*ny)
                y=1.65+(y-1.65)*1.10+.045*nx*(1-ny*ny)
                z=z*(1-.10*ny)+.025*nx
            vertices.append((x,y,z))
    if unusual: vertices[0]=(0,1.65+.73*1.10,0)
    bottom=len(vertices); vertices.append((0,1.65-.73*(1.10 if unusual else 1),0))
    faces=[]
    for j in range(sectors): faces.append((0,1+j,1+(j+1)%sectors))
    for row in range(scalp_rows+lower_rows-2):
        for j in range(sectors):
            a=1+row*sectors+j;b=1+row*sectors+(j+1)%sectors;c=a+sectors;d=b+sectors
            faces.extend([(a,c,b),(b,c,d)])
    start=1+(scalp_rows+lower_rows-2)*sectors
    for j in range(sectors): faces.append((start+j,bottom,start+(j+1)%sectors))
    # 统一三角形朝向。
    fixed=[]
    for f in faces:
        a,b,c=(Vector(vertices[i]) for i in f)
        if (b-a).cross(c-a).dot((a+b+c)/3-Vector((0,1.65,0)))<0: f=(f[0],f[2],f[1])
        fixed.append(f)
    faces=fixed
    scalp_count=1+scalp_rows*sectors
    scalp_faces=[f for f in faces if all(i<scalp_count for i in f)]
    def mesh_object(suffix, verts, tris, color):
        mesh=bpy.data.meshes.new(name+suffix);mesh.from_pydata([(x,-z,y) for x,y,z in verts],[],tris);mesh.update()
        ob=bpy.data.objects.new(name+suffix,mesh);bpy.context.collection.objects.link(ob);ob.location.x=display_x
        ob.color=(*color,1)
        mat=bpy.data.materials.new(name+suffix);mat.diffuse_color=(*color,1);mesh.materials.append(mat)
        return ob
    head=mesh_object('_Head',vertices,faces,(.83,.54,.34))
    scalp=mesh_object('_Scalp',vertices[:scalp_count],scalp_faces,(.08,.45,.39))
    scalp.hide_render=True;scalp.hide_set(True)
    # 从 Blender 网格导出，头皮与头模逐顶点对应，不重新拟合椭球。
    coords=lambda mesh:[round(v,7) for p in mesh.vertices for v in (p.co.x,p.co.z,-p.co.y)]
    normals=[round(v,7) for p in scalp.data.vertices for v in (p.normal.x,p.normal.z,-p.normal.y)]
    edges=Counter(tuple(sorted((a,b))) for f in scalp_faces for a,b in zip(f,f[1:]+f[:1]))
    assert all(n in (1,2) for n in edges.values())
    boundary=[edge for edge,n in edges.items() if n==1]
    assert len(boundary)==sectors
    assert scalp_count-len(edges)+len(scalp_faces)==1
    assert all((scalp.data.vertices[i].co-head.data.vertices[i].co).length<1e-9 for i in range(scalp_count))
    return dict(id=name,name='非标准头型' if unusual else '标准头型',headPositions=coords(head.data),headIndices=[i for f in faces for i in f],scalpPositions=coords(scalp.data),scalpNormals=normals,scalpIndices=[i for f in scalp_faces for i in f],scalpHeadVertexIds=list(range(scalp_count)),center=[0,1.65,0],audit=dict(scalpVertices=scalp_count,scalpTriangles=len(scalp_faces),boundaryEdges=len(boundary),rootMaxGap=0,euler=1))

models=[make_head('standard',32,10,12,False,-.9),make_head('asymmetric',36,11,12,True,.9)]
(RUNTIME/'test-heads.json').write_text(json.dumps(dict(version=1,models=models),ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'test-scalps-audit.json').write_text(json.dumps([dict(id=m['id'],**m['audit']) for m in models],ensure_ascii=False,indent=2),encoding='utf-8')
# 为之后在 Blender 中检查准备实体材质视图；模型完成后才建立离线验收相机。
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':
        area.spaces.active.shading.type='SOLID';area.spaces.active.shading.color_type='MATERIAL'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'TestScalps.blend'))
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True
scene.world=bpy.data.worlds.new('ValidationWorld');scene.world.color=(.7,.7,.7);scene.render.resolution_x=900;scene.render.resolution_y=650;scene.render.resolution_percentage=100
cam_data=bpy.data.cameras.new('ValidationCamera');cam=bpy.data.objects.new('ValidationCamera',cam_data);scene.collection.objects.link(cam);scene.camera=cam;cam_data.type='ORTHO';cam_data.ortho_scale=3.6
for name,offset in ([] if os.environ.get('HAIR_SKIP_RENDERS') else [('front',(0,-6,0)),('back',(0,6,0)),('left',(-6,0,0)),('right',(6,0,0)),('top',(0,0,6)),('bottom',(0,0,-6))]):
    center=Vector((0,0,1.65));cam.location=center+Vector(offset);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/('test-heads-'+name+'.png'));bpy.ops.render.render(write_still=True)
print('测试头模与连续头皮已生成',[(m['id'],m['audit']) for m in models])

# 默认重建流水线始终接回高面数标准头型。
import runpy
runpy.run_path(str(ROOT/'scripts/build-detailed-head.py'),run_name='__main__')
