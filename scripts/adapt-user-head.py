"""在独立 Blender 中适配用户头模；原始文件只读。"""
import bpy, bmesh, json, struct, math, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'preview/model-review/user-head.glb'
OUT=ROOT/'sceneresource/user-head'
OUT.mkdir(parents=True,exist_ok=True)
b=SOURCE.read_bytes(); n=struct.unpack_from('<I',b,12)[0]; doc=json.loads(b[20:20+n]); data=b[28+n:]
def acc(i,fmt):
 a=doc['accessors'][i]; v=doc['bufferViews'][a['bufferView']]; o=v.get('byteOffset',0)+a.get('byteOffset',0)
 return list(struct.iter_unpack(fmt,data[o:o+struct.calcsize(fmt)*a['count']]))
pos=acc(0,'<fff'); uv=acc(2,'<ff'); indices=[v[0] for v in acc(3,'<H')]
bpy.ops.wm.read_factory_settings(use_empty=True)
# Blender 使用 Z 朝上，输出时回到游戏的 Y 朝上、Z 朝前。
scale=2.35
vertices=[(-z,-x,(y-.69)*scale+1.65) for x,y,z in pos]
vertices=[(x*scale,y*scale,z) for x,y,z in vertices]
mesh=bpy.data.meshes.new('用户头模_原始拓扑'); mesh.from_pydata(vertices,[],[indices[i:i+3] for i in range(0,len(indices),3)]); mesh.update()
obj=bpy.data.objects.new('适配头部',mesh); bpy.context.collection.objects.link(obj); bpy.context.view_layer.objects.active=obj; obj.select_set(True)
layer=mesh.uv_layers.new(name='OriginalUV')
for poly in mesh.polygons:
 for li in poly.loop_indices:
  u,v=uv[mesh.loops[li].vertex_index]; layer.data[li].uv=(u,1-v)
# 另存原始完整模型与材质，用于对照和恢复。
original=obj.copy(); original.data=mesh.copy(); original.name='原始半身_只读参考'; bpy.context.collection.objects.link(original)
original.hide_render=True; original.hide_set(True)
origmat=bpy.data.materials.new('原始贴图_保留'); origmat.use_nodes=True
tex=origmat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(ROOT/'assets/resources/character/user-body.jpg'));tex.image.pack()
origmat.node_tree.links.new(tex.outputs['Color'],origmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color']); original.data.materials.append(origmat)
bm=bmesh.new();bm.from_mesh(mesh)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
# 在颈部截取并封口；不改变头顶、耳鼻和脸颊的轮廓。
# 斜向颈根截面保留下巴前缘，去掉背侧和肩部，不沿锯齿状顶点删除。
cut_z=(.435-.69)*scale+1.65
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,cut_z),plane_no=(0,-.3,1),clear_inner=True,clear_outer=False)
bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
bm.verts.ensure_lookup_table()
original_co={v:v.co.copy() for v in bm.verts}
# 嘴周深度松弛：只移动前后方向，过渡带逐渐归零，保留原下巴。
weights={}
for v in bm.verts:
 x,depth,z=v.co; sy=(z-1.65)/scale+.69
 r=(x/(.082*scale))**2+((sy-.497)/.041)**2
 if depth<-.155*scale and r<1:
  weights[v]=(1-r)**2
# 用嘴周正常皮肤拟合弧面，消除固定嘴槽，不把鼻子或下巴一起磨平。
rim=[];target=[]
for v in bm.verts:
 xx=v.co.x/(.082*scale);yy=((v.co.z-1.65)/scale+.69-.497)/.041;r=xx*xx+yy*yy
 if 1<r<2.3 and v.co.y<-.16*scale:
  rim.append([1,xx,yy,xx*xx,xx*yy,yy*yy]);target.append(v.co.y)
coeff=np.linalg.lstsq(np.array(rim),np.array(target),rcond=None)[0]
for v in weights:
 xx=v.co.x/(.082*scale);yy=((v.co.z-1.65)/scale+.69-.497)/.041;r=xx*xx+yy*yy
 t=max(0,min(1,(1-r)/.6));w=t*t*(3-2*t)
 depth=float(np.dot(coeff,[1,xx,yy,xx*xx,xx*yy,yy*yy]));v.co.y=v.co.y*(1-w)+depth*w
moved=[(v.co-original_co[v]).length for v in weights]
bmesh.ops.triangulate(bm,faces=list(bm.faces))
# 颈部凹口封闭可能生成两面重合的小耳片，成对移除并清理孤立元素。
seen={};duplicates=[]
for f in bm.faces:
 key=frozenset(f.verts)
 if key in seen:duplicates.extend([seen[key],f])
 else:seen[key]=f
if duplicates:bmesh.ops.delete(bm,geom=list(set(duplicates)),context='FACES_ONLY')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
assert all(e.is_manifold for e in bm.edges), '头部存在非流形边'
bm.to_mesh(mesh);bm.free()
assert not mesh.validate(verbose=True), '头部网格校验发生修复，需检查导出逻辑'
for f in mesh.polygons:f.use_smooth=True
mesh.update()
skin=(.955,.755,.602,1)
mat=bpy.data.materials.new('干净皮肤_五官独立');mat.diffuse_color=skin;mat.use_nodes=True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=skin
mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85
mesh.materials.clear();mesh.materials.append(mat)
p=[c for v in mesh.vertices for c in (v.co.x,v.co.z,-v.co.y)]
norm=[c for v in mesh.vertices for c in (v.normal.x,v.normal.z,-v.normal.y)]
ix=[i for f in mesh.polygons for i in f.vertices]
# 每个发根重新射向真实头部并生成三角形重心绑定，不沿用旧顶点索引。
base=json.loads((ROOT/'assets/resources/scalp/test-heads.json').read_text())['models'][0]
verts=[Vector(p[i:i+3]) for i in range(0,len(p),3)]
tris=[ix[i:i+3] for i in range(0,len(ix),3)]
bvh=BVHTree.FromPolygons(verts,tris,all_triangles=True);center=Vector((0,1.65,0))
roots=[]; normals=[];bindings=[]; ids=[]
for i in range(0,len(base['scalpPositions']),3):
 direction=(Vector(base['scalpPositions'][i:i+3])-Vector(base['center'])).normalized()
 hit,no,face,distance=bvh.ray_cast(center,direction,4)
 if hit is None:raise RuntimeError('发根没有命中头部')
 a,bb,c=[verts[k] for k in tris[face]];v0=bb-a;v1=c-a;v2=hit-a
 d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);den=d00*d11-d01*d01
 wb=(d11*d20-d01*d21)/den;wc=(d00*d21-d01*d20)/den;wa=1-wb-wc
 weights3=[max(0,v) for v in (wa,wb,wc)]; total=sum(weights3); weights3=[v/total for v in weights3]
 point=sum((verts[k]*w for k,w in zip(tris[face],weights3)),Vector())
 normal=sum((Vector(norm[k*3:k*3+3])*w for k,w in zip(tris[face],weights3)),Vector()).normalized()
 roots.extend(point);normals.extend(normal);bindings.extend([face,*weights3]);ids.append(tris[face][0])
asset=dict(id='user-head',name='用户头型',center=list(center),facialDetail=True,skinColor=list(skin[:3]),
 faceLayout=dict(width=1.10,top=1.86,height=.90,front=.25),
 headPositions=p,headNormals=norm,headIndices=ix,scalpPositions=roots,scalpNormals=normals,
 scalpIndices=base['scalpIndices'],scalpHeadVertexIds=ids,scalpSurfaceBindings=bindings)
# 显示保留完整源半身；截取头部只用于头皮和碰撞，不再作为可见模型。
# 顶点色仅保留为加载失败时的回退；运行时使用原始 UV 高清贴图。
image=tex.image;pixels=np.array(image.pixels[:],dtype=float).reshape(image.size[1],image.size[0],4)
def sample(u,v):
 x=max(0,min(image.size[0]-1,u*image.size[0]-.5));y=max(0,min(image.size[1]-1,(1-v)*image.size[1]-.5))
 xx=int(x);yy=int(y);tx=x-xx;ty=y-yy
 return ((pixels[yy,xx,:3]*(1-tx)+pixels[yy,min(xx+1,image.size[0]-1),:3]*tx)*(1-ty)+(pixels[min(yy+1,image.size[1]-1),xx,:3]*(1-tx)+pixels[min(yy+1,image.size[1]-1),min(xx+1,image.size[0]-1),:3]*tx)*ty).tolist()
render_positions=[];render_colors=[]
for (sx,sy,sz),(u,v) in zip(pos,uv):
 x=-sz*scale;y=(sy-.69)*scale+1.65;z=sx*scale
 # 复用上一版已经确认的嘴部局部平顺，不因换表情进一步改脸型。
 xx=x/(.082*scale);yy=(sy-.497)/.041;r=xx*xx+yy*yy
 if sx>.155 and r<1:
  t=max(0,min(1,(1-r)/.6));w=t*t*(3-2*t);depth=float(np.dot(coeff,[1,xx,yy,xx*xx,xx*yy,yy*yy]));z=z*(1-w)-depth*w
 render_positions.extend([x,y,z])
 color=sample(u,v)
 # 清除脸部固定五官；颈部过渡延续肤色，背心与手臂保留源配色。
 blend=max(0,min(1,(sy-.43)/.03));blend=blend*blend*(3-2*blend)
 render_colors.extend([color[c]*(1-blend)+skin[c]*blend for c in range(3)])
render_mesh=original.data.copy();render_mesh.name='完整半身_显示网格'
for vertex in render_mesh.vertices:
 i=vertex.index*3;vertex.co=(render_positions[i],-render_positions[i+2],render_positions[i+1])
render_mesh.update()
# UV 接缝的重复顶点不能独立重算法线，否则额头和肩膀会出现三角块。
source_normals=acc(1,'<fff');tree=KDTree(len(mesh.vertices))
for v in mesh.vertices:tree.insert(v.co,v.index)
tree.balance();render_normals=[];blender_normals=[]
for i,v in enumerate(render_mesh.vertices):
 nx,ny,nz=source_normals[i];no=Vector((-nz,-nx,ny))
 if .45<pos[i][1]<.55 and abs(pos[i][2])<.09:
  co,index,distance=tree.find(v.co)
  if distance<1e-5:no=mesh.vertices[index].normal
 blender_normals.append(no);render_normals.extend((no.x,no.z,-no.y))
render_mesh.normals_split_custom_set([blender_normals[loop.vertex_index] for loop in render_mesh.loops])
asset['characterMesh']=dict(positions=render_positions,normals=render_normals,indices=indices,colors=render_colors,uvs=[c for value in uv for c in value])
render_obj=bpy.data.objects.new('完整半身_整体旋转',render_mesh);bpy.context.collection.objects.link(render_obj)
colors=render_mesh.color_attributes.new(name='RuntimeColor',type='FLOAT_COLOR',domain='POINT')
for i,value in enumerate(colors.data):value.color=(*render_colors[i*3:i*3+3],1)
render_mat=bpy.data.materials.new('半身源配色_独立五官');render_mat.use_nodes=True
color_node=render_mat.node_tree.nodes.new('ShaderNodeVertexColor');color_node.layer_name='RuntimeColor'
render_mat.node_tree.links.new(color_node.outputs['Color'],render_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
render_mesh.materials.clear();render_mesh.materials.append(render_mat)
obj.hide_render=True;obj.hide_set(True);obj.select_set(False);render_obj.select_set(True);bpy.context.view_layer.objects.active=render_obj
(ROOT/'assets/resources/scalp/user-head.json').write_text(json.dumps(asset,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
# 头皮保存在作者文件中，游戏按 JSON 中的三角形和重心权重读取。
sm=bpy.data.meshes.new('头皮绑定域');sm.from_pydata([(roots[i],-roots[i+2],roots[i+1]) for i in range(0,len(roots),3)],[],[base['scalpIndices'][i:i+3] for i in range(0,len(base['scalpIndices']),3)])
so=bpy.data.objects.new('头皮绑定域_非不可剪发帽',sm);bpy.context.collection.objects.link(so);so.hide_render=True;so.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'UserHead_Adapted.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'UserCharacter_Adapted.glb'),export_format='GLB',use_selection=True,export_yup=True)
report=dict(characterTriangles=len(indices)//3,characterVertices=len(pos),characterColorMode='原 UV 顶点采样；脸部独立干净肤色',sourceSha256=hashlib.sha256(b).hexdigest(),vertices=len(mesh.vertices),triangles=len(ix)//3,scalpRoots=len(ids),scalpFaces=len(base['scalpIndices'])//3,mouthVertices=len(weights),mouthMaxDisplacement=max(moved,default=0),uniformScale=scale,sourceCenter=[0,.69,0],cutSourcePlane='sourceY + 0.3 * sourceX = 0.435',skinTreatment='原始贴图保留在参考对象；运行时改用独立干净皮肤材质',faceLayout=asset['faceLayout'])
(ROOT/'docs/用户头模适配数据.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
