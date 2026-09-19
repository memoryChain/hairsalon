"""细化标准测试头模；保留既有头皮域，不增加发缕或物理导向。"""
import bpy, json, math, os
from pathlib import Path
from collections import Counter
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'sceneresource'
# 独立进程从已保存的旧源读取，写入新的源文件，不覆盖旧模型或窗口场景。
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(OUT/'TestScalps.blend'),link=False) as (src,dst):
    dst.objects=['standard_Head','standard_Scalp']
head,scalp=dst.objects
for ob in (head,scalp): bpy.context.collection.objects.link(ob);ob.location=(0,0,0)
base=[(v.co.x,v.co.z,-v.co.y) for v in head.data.vertices]
faces=[tuple(p.vertices) for p in head.data.polygons]
root_count=len(scalp.data.vertices)

def gauss(x,c,s): return math.exp(-((x-c)/s)**2)
def sculpt(point):
    x,y,z=point
    n=Vector((x/.57,(y-1.65)/.73,z/.54));n.normalize()
    nx,ny,nz=n;theta=math.acos(max(-1,min(1,ny)));phi=math.atan2(nx,nz)
    front=max(0,math.cos(phi));limit=1.96-.86*front**2-.22*abs(math.sin(phi))**4
    if theta<=limit+1e-7:return point
    t=min(1,(theta-limit)/.24);fade=t*t*(3-2*t)
    sy=1.65+.73*ny;r=math.sqrt(max(0,1-ny*ny))
    sx=.57*nx*(1-.12*gauss(sy,1.14,.18)-.03*gauss(sy,1.75,.14))
    sz=.54*nz
    if nz>0:
        sz=.54*r*front**.75-.042*gauss(sy,1.69,.31)*front**2
        # 鼻梁、鼻尖、鼻翼在同一个连续表面上起伏；眼窝、口周和下巴有真实深度。
        bump=.075*gauss(sx,0,.058)*gauss(sy,1.68,.18)
        bump+=.135*gauss(sx,0,.071)*gauss(sy,1.52,.074)
        bump+=.038*(gauss(sx,.074,.036)+gauss(sx,-.074,.036))*gauss(sy,1.49,.048)
        bump-=.040*(gauss(sx,.205,.10)+gauss(sx,-.205,.10))*gauss(sy,1.76,.060)
        bump+=.020*(gauss(sx,.205,.12)+gauss(sx,-.205,.12))*gauss(sy,1.85,.055)
        bump+=.018*(gauss(sx,.30,.12)+gauss(sx,-.30,.12))*gauss(sy,1.55,.12)
        bump+=.042*gauss(sx,0,.16)*gauss(sy,1.32,.085)
        bump+=.10*gauss(sx,0,.20)*gauss(sy,1.07,.11)
        sz+=bump*front**2
    sz+=.14*gauss(sy,.94,.12)
    sy+=.075*gauss(sy,.92,.11)
    return (x+(sx-x)*fade,y+(sy-y)*fade,z+(sz-z)*fade)

# 三角网格每边三等分：原顶点身份不变，边中点跨面共享，主头模超过一万面。
vertices=[sculpt(v) if i>=root_count else v for i,v in enumerate(base)]
triangles=[];cache={}
def vertex(face,i,j):
    a,b,c=faces[face];weights=[3-i-j,i,j];ids=[a,b,c]
    active=[(ids[k],weights[k]) for k in range(3) if weights[k]]
    if len(active)==1:return active[0][0]
    key=tuple(sorted(active)) if len(active)==2 else ('face',face,i,j)
    if key not in cache:
        pos=tuple(sum(base[ids[k]][axis]*weights[k]/3 for k in range(3)) for axis in range(3))
        cache[key]=len(vertices);vertices.append(sculpt(pos))
    return cache[key]
for f in range(len(faces)):
    for i in range(3):
        for j in range(3-i):
            triangles.append((vertex(f,i,j),vertex(f,i+1,j),vertex(f,i,j+1)))
            if i+j<2:triangles.append((vertex(f,i+1,j),vertex(f,i+1,j+1),vertex(f,i,j+1)))
# 耳根从左右头表面的射线交点推导，内侧有 0.035 的有意嵌入。
main_triangles=len(triangles);main_vertices=len(vertices)
bvh=BVHTree.FromPolygons([Vector(p) for p in vertices],triangles,all_triangles=True)
ear_audit=[]
for side in (-1,1):
    hit,normal,index,distance=bvh.ray_cast(Vector((side*2,1.60,-.025)),Vector((-side,0,0)))
    assert hit is not None
    anchor=abs(hit.x);base_ear=len(vertices);sectors=32;rows=20
    def ear(theta,phi):
        ny=math.cos(theta);nx=math.sin(theta)*math.cos(phi);nz=math.sin(theta)*math.sin(phi)
        bowl=.033*max(0,nx)*gauss(ny,0,.55)*gauss(nz,0,.60)
        return (side*(anchor+.045+.080*nx-bowl),1.60+.158*ny,-.025+.083*nz-.018*ny)
    vertices.append(ear(0,0))
    for row in range(1,rows):
        for col in range(sectors):vertices.append(ear(row/rows*math.pi,col/sectors*math.tau))
    bottom=len(vertices);vertices.append(ear(math.pi,0));ear_faces=[]
    for col in range(sectors):ear_faces.append((base_ear,base_ear+1+col,base_ear+1+(col+1)%sectors))
    for row in range(rows-2):
        for col in range(sectors):
            a=base_ear+1+row*sectors+col;b=base_ear+1+row*sectors+(col+1)%sectors;c=a+sectors;d=b+sectors
            ear_faces.extend([(a,c,b),(b,c,d)])
    last=base_ear+1+(rows-2)*sectors
    for col in range(sectors):ear_faces.append((last+col,bottom,last+(col+1)%sectors))
    center=Vector((side*(anchor+.045),1.60,-.025))
    for tri in ear_faces:
        a,b,c=[Vector(vertices[i]) for i in tri]
        if (b-a).cross(c-a).dot((a+b+c)/3-center)<0:tri=(tri[0],tri[2],tri[1])
        triangles.append(tri)
    ear_audit.append(dict(side=side,anchor=round(anchor,7),intentionalOverlap=.035,triangles=len(ear_faces)))
mesh=bpy.data.meshes.new('DetailedHeadMesh');mesh.from_pydata([(x,-z,y) for x,y,z in vertices],[],triangles);mesh.update()
head.data=mesh;head.name='StandardDetailedHead'
mat=bpy.data.materials.new('Skin');mat.diffuse_color=(.72,.49,.35,1);mesh.materials.append(mat)
for face in mesh.polygons:face.use_smooth=True
# 头皮处保持原始根域面位置，使用连续解析法线消除旧三角片的明暗块。
custom_normals=[]
for i,v in enumerate(mesh.vertices):
    x,y,z=vertices[i];normal=v.normal.copy()
    if i<main_vertices:
        unit=Vector((x/.57,(y-1.65)/.73,z/.54));unit.normalize()
        phi=math.atan2(unit.x,unit.z);front=max(0,math.cos(phi));limit=1.96-.86*front**2-.22*abs(math.sin(phi))**4
        t=max(0,min(1,(math.acos(max(-1,min(1,unit.y)))-limit)/.24))
        ideal=Vector((x/(.57*.57),-z/(.54*.54),(y-1.65)/(.73*.73)));ideal.normalize()
        normal=ideal.lerp(normal,t*t*(3-2*t));normal.normalize()
    custom_normals.append(normal)
mesh.normals_split_custom_set_from_vertices(custom_normals)
scalp.hide_render=True;scalp.hide_set(True)
# 数值验收：封闭、绕序、无退化、原头皮顶点精确绑定。
edges=Counter(tuple(sorted((a,b))) for tri in triangles for a,b in zip(tri,tri[1:]+tri[:1]))
assert all(n==2 for n in edges.values())
assert len(triangles)>=10000
assert max((mesh.vertices[i].co-scalp.data.vertices[i].co).length for i in range(root_count))<1e-7
assert min(p.area for p in mesh.polygons)>1e-10
coords=lambda values:[round(float(x),7) for v in values for x in (v.x,v.z,-v.y)]
path=ROOT/'assets/resources/scalp/test-heads.json';library=json.loads(path.read_text(encoding='utf-8'));model=library['models'][0]
model.update(headPositions=coords([v.co for v in mesh.vertices]),headIndices=[i for tri in triangles for i in tri],headNormals=coords(custom_normals),facialDetail=True)
model['audit'].update(headVertices=len(mesh.vertices),headTriangles=len(triangles),headClosed=True,mainHeadTriangles=main_triangles,ears=ear_audit)
path.write_text(json.dumps(library,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'test-scalps-audit.json').write_text(json.dumps([dict(id=m['id'],**m['audit']) for m in library['models']],ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'detailed-head-audit.json').write_text(json.dumps(model['audit'],ensure_ascii=False,indent=2),encoding='utf-8')
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':area.spaces.active.shading.type='SOLID'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'StandardDetailedHead.blend'))
# MCP 不可用时，源文件保存后使用离线验收相机输出六面；相机不进入模型源。
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_cavity=True
scene.world=bpy.data.worlds.new('AuditWorld');scene.world.color=(.6,.6,.6)
scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100
camdata=bpy.data.cameras.new('AuditCamera');cam=bpy.data.objects.new('AuditCamera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=1.9
for name,offset in ([] if os.environ.get('HAIR_SKIP_RENDERS') else [('front',(0,-6,0)),('back',(0,6,0)),('left',(-6,0,0)),('right',(6,0,0)),('top',(0,0,6)),('bottom',(0,0,-6)),('quarter',(4,-6,1))]):
    center=Vector((0,0,1.65));cam.location=center+Vector(offset);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/('test-heads-detail-'+name+'.png'));bpy.ops.render.render(write_still=True)
print('标准高面数头型生成完成',model['audit'])
