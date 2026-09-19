const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const head=require('../assets/resources/scalp/user-head.json');
const {ScalpTopology}=require('../.cache/test-core/surface/ScalpTopology');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {HeadRaycast}=require('../.cache/test-core/surface/HeadRaycast');
const {FaceGeometry}=require('../.cache/test-core/character/FaceGeometry');
const {FaceExpressionController,FACE_EMOTIONS}=require('../.cache/test-core/character/FaceExpressionController');
const {unposeRay,pose}=require('../.cache/test-core/surface/HeadPose');
const styles=['spiky','long','crop','mohawk','quiff','sidepart','bob','lob','asymmetric','flipped','receding','crown','horseshoe','combover','bald'];
test('用户原始副本未改动；适配头部封闭、无重复面与悬空顶点',()=>{
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('preview/model-review/user-head.glb')).digest('hex'),'fb3463dd9d347435034bcf3dab3a64301e545c52fc1c1178c7957c9510615c20');
 const edges=new Map(),faces=new Set(),used=new Set(),p=head.headPositions,ix=head.headIndices;
 for(let f=0;f<ix.length;f+=3){const tri=ix.slice(f,f+3),key=[...tri].sort((a,b)=>a-b).join(',');assert.ok(!faces.has(key));faces.add(key);
 for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3];used.add(a);const k=a<b?a+':'+b:b+':'+a,e=edges.get(k)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(k,e);}}
 assert.equal(used.size,p.length/3);for(const edge of edges.values())assert.deepEqual(edge,[2,0]);
 assert.equal(used.size-edges.size+faces.size,2);new ScalpTopology(head);
});
for(const style of styles)test('用户头型 '+style+'：新表面绑定有效、旋转与剃光不产生无效坐标',()=>{
 const sim=new SurfaceHairSimulation(head);sim.reset(style);new ScalpTopology(sim.topology.asset);
 sim.dragTurn(.5,.3);sim.advance(1/60);assert.ok(sim.fiberMesh.evaluate(sim).every(Number.isFinite));
 sim.trim(new Float64Array(sim.lengths.length));assert.ok(sim.fiberMesh.evaluate(sim).every(Number.isFinite));
 sim.reset(style);new ScalpTopology(sim.topology.asset);
});
test('五官五种情绪、极限视线与眨眼不穿入新脸部，缓冲容量保持不变',()=>{
 const g=new FaceGeometry(head),face=new FaceExpressionController(()=>.5),ray=new HeadRaycast(head),buffer=g.positions;
 for(const emotion of FACE_EMOTIONS)for(const gaze of [-1,0,1])for(const blink of [0,.5,1]){
 face.setEmotion(emotion);face.gazeX=gaze;face.gazeY=gaze;face.blink=blink;g.update(face);assert.equal(g.positions,buffer);assert.ok(g.count<g.capacity);assert.ok(g.view.positions.every(Number.isFinite));
 for(let i=0;i<g.count;i+=3){let x=0,y=0,z=0;for(let v=0;v<3;v++){const k=(i+v)*3;x+=g.positions[k]/3;y+=g.positions[k+1]/3;z+=g.positions[k+2]/3;}
 const depth=3-ray.distance({ox:x,oy:y,oz:3,dx:0,dy:0,dz:-1},0);assert.ok(Number.isFinite(depth));assert.ok(z-depth>-.003,JSON.stringify({emotion,gaze,blink,clearance:z-depth}));}
 }
});
function penetration(s,p,previous=false){
 const mesh=s.cutMesh||s.fiberMesh,c=s.topology.asset.center,ray={},local={};let count=0,worst=0;
 for(let i=0;i<mesh.indices.length;i+=3){
  const ids=mesh.indices.slice(i,i+3);if(ids.every(id=>mesh.bindings[id].levels.every(v=>v===0)))continue;
  for(const sample of [[1,0,0],[0,1,0],[0,0,1],[1/3,1/3,1/3]]){
   if(ids.every((id,j)=>sample[j]===0||mesh.bindings[id].levels.every(v=>v===0)))continue;
   let x=0,y=0,z=0;for(let j=0;j<3;j++){const at=ids[j]*3;x+=p[at]*sample[j];y+=p[at+1]*sample[j];z+=p[at+2]*sample[j];}
   Object.assign(ray,{ox:x,oy:y,oz:z,dx:0,dy:0,dz:1});unposeRay(ray,previous?s.previousYaw:s.yaw,previous?s.previousPitch:s.pitch,c,local);
   x=local.ox-c[0];y=local.oy-c[1];z=local.oz-c[2];const d=Math.hypot(x,y,z);
   Object.assign(ray,{ox:c[0]+x/d*3,oy:c[1]+y/d*3,oz:c[2]+z/d*3,dx:-x/d,dy:-y/d,dz:-z/d});
   const depth=3-s.occluder.distance(ray,0)-d;if(depth>.005)count++;worst=Math.max(worst,depth);
  }
 }
 return {count,worst};
}

for(const style of ['long','bob','spiky'])test('用户头型 '+style+'：左右跨头梳理后的表面避让',()=>{
 const sim=new SurfaceHairSimulation(head);sim.reset(style);const rig=sim.fiberRig,out={};
 for(let step=0;step<10;step++)for(const f of rig.fibers)rig.comb(f.group,step<5?-1:1,.15,-.8,.16,sim,out);
 const result=penetration(sim,sim.fiberMesh.evaluate(sim));assert.ok(result.worst<.012,JSON.stringify(result));
 sim.dragTurn(.6,.3);assert.ok(penetration(sim,sim.fiberMesh.evaluate(sim)).worst<.012);
});

test('完整上半身保留源拓扑和肩颈位置，角色缓冲包含身体且不追加占位肩膀',()=>{
 const {createCharacter}=require('../.cache/test-core/character/CharacterGeometry');
 const bytes=fs.readFileSync('preview/model-review/user-head.glb'),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n)),bin=28+n;
 const source=doc.accessors[0],view=doc.bufferViews[source.bufferView],offset=bin+(view.byteOffset||0)+(source.byteOffset||0),full=head.characterMesh;
 assert.ok(full);assert.equal(full.positions.length,source.count*3);assert.equal(full.indices.length,5174*3);assert.equal(full.colors.length,full.positions.length);
 for(let i=0;i<source.count;i++){
  const sx=bytes.readFloatLE(offset+i*12),sy=bytes.readFloatLE(offset+i*12+4),sz=bytes.readFloatLE(offset+i*12+8);
  assert.ok(Math.abs(full.positions[i*3]+sz*2.35)<1e-7);assert.ok(Math.abs(full.positions[i*3+1]-((sy-.69)*2.35+1.65))<1e-7);
  if(sy<.44||sy>.55||Math.abs(sz)>.082)assert.ok(Math.abs(full.positions[i*3+2]-sx*2.35)<1e-7);
 }
 const g=createCharacter(head,false,false),withBody=createCharacter(head,true,false);
 assert.equal(g.count,5174*3);assert.equal(withBody.count,g.count);assert.ok(g.count<g.capacity);
 assert.ok(g.view.colors.every(Number.isFinite));assert.ok(g.view.positions.every(Number.isFinite));
 const before=Math.min(...full.positions.filter((_,i)=>i%3===1));assert.ok(before<.04);
});


test('高清贴图与源 GLB 字节一致，展开角色三角形后仍保留原 UV 接缝',()=>{
 const bytes=fs.readFileSync('sceneresource/user-head/UserCharacter_HD_Source.glb'),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n)),bin=28+n;
 const image=doc.bufferViews[doc.images[0].bufferView];
 assert.deepEqual(fs.readFileSync('assets/resources/character/user-body.jpg'),bytes.subarray(bin+(image.byteOffset||0),bin+(image.byteOffset||0)+image.byteLength));
 const acc=doc.accessors[doc.meshes[0].primitives[0].attributes.TEXCOORD_0],view=doc.bufferViews[acc.bufferView],offset=bin+(view.byteOffset||0)+(acc.byteOffset||0);
 const {createCharacter}=require('../.cache/test-core/character/CharacterGeometry'),g=createCharacter(head,false,false);
 assert.equal(g.view.uvs.length,g.count*2);
 for(let i=0;i<g.count;i++)for(let axis=0;axis<2;axis++)assert.equal(g.view.uvs[i*2+axis],bytes.readFloatLE(offset+head.characterMesh.indices[i]*8+axis*4));
});
