const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {partitionRoots}=require('../.cache/test-core/surface/FiberLayout');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const models=[require('../assets/resources/scalp/user-head.json'),...require('../assets/resources/scalp/test-heads.json').models];
const styles=['crop','mohawk','quiff','sidepart','receding','crown','horseshoe','combover'];
for(const head of models)for(const style of styles)test(head.id+' '+style+'：初始发根域的面内采样由实际发体遮住头皮',()=>{
 const s=new SurfaceHairSimulation(head);s.reset(style);const mesh=s.fiberMesh;mesh.evaluate(s);
 const roots=s.topology.roots,ix=s.topology.triangles,c=head.center;
 for(const cell of partitionRoots(s))for(const f of cell.faces)for(const weights of [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){
  const v=[0,0,0];for(let j=0;j<3;j++)for(let a=0;a<3;a++)v[a]+=roots[ix[f*3+j]*3+a]*weights[j];
  for(let a=0;a<3;a++)v[a]-=c[a];const d=Math.hypot(...v);for(let a=0;a<3;a++)v[a]/=d;
  const ray={ox:c[0]+v[0]*3,oy:c[1]+v[1]*3,oz:c[2]+v[2]*3,dx:-v[0],dy:-v[1],dz:-v[2]};
  const skin=s.occluder.distance(ray,0),hair=mesh.distance(ray);
  assert.ok(hair<skin-1e-5,JSON.stringify({face:f,weights,hair,skin}));
 }
});
test('初始避让只在形状变化时计算，转动复用缓存，全剃不残留发根层',()=>{
 const s=new SurfaceHairSimulation(models[0]);s.reset('crop');let calls=0;
 const constrain=s.groomCollision.constrain.bind(s.groomCollision);s.groomCollision.constrain=(...args)=>{calls++;return constrain(...args);};
 s.fiberMesh.evaluate(s);assert.ok(calls>0);const first=calls,buffer=s.fiberRig.positions;
 s.fiberMesh.evaluate(s,true);s.dragTurn(.8,.2);s.fiberMesh.evaluate(s);s.fiberMesh.evaluate(s,true);
 assert.equal(calls,first);assert.equal(s.fiberRig.positions,buffer);
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;const g=new SurfaceHairGeometry();g.update(s);assert.equal(g.count,0);
});

for(const style of ['crop','mohawk','quiff','sidepart'])test(style+'：初始与急转中，从侧面八个视角检查发根覆盖',()=>{
 const head=models[0],s=new SurfaceHairSimulation(head);s.reset(style);
 const roots=s.topology.roots,ix=s.topology.triangles,c=head.center;
 const {pose}=require('../.cache/test-core/surface/HeadPose');
 for(const yaw of [0,1.57]){
  if(yaw)s.dragTurn(yaw,.2);const mesh=s.fiberMesh;mesh.evaluate(s);
  for(const cell of partitionRoots(s))for(const f of cell.faces){
   const v=[0,0,0];for(let j=0;j<3;j++)for(let a=0;a<3;a++)v[a]+=roots[ix[f*3+j]*3+a]/3;
   for(let a=0;a<3;a++)v[a]-=c[a];const d=Math.hypot(...v);for(let a=0;a<3;a++)v[a]/=d;
   const r={ox:c[0]+v[0]*3,oy:c[1]+v[1]*3,oz:c[2]+v[2]*3,dx:-v[0],dy:-v[1],dz:-v[2]};
   const radius=3-s.occluder.distance(r,0),target={};pose(c[0]+v[0]*radius,c[1]+v[1]*radius,c[2]+v[2]*radius,s.yaw,s.pitch,c,target);
   for(let angle=0;angle<8;angle++){
    const x=Math.sin(angle*Math.PI/4)*4,y=1.65,z=Math.cos(angle*Math.PI/4)*4;
    const dx=target.x-x,dy=target.y-y,dz=target.z-z,n=Math.hypot(dx,dy,dz),ray={ox:x,oy:y,oz:z,dx:dx/n,dy:dy/n,dz:dz/n};
    const skin=s.occluder.distance(ray,s.yaw,s.pitch);if(Math.abs(skin-n)>.003)continue;
    assert.ok(mesh.distance(ray)<skin-1e-5,JSON.stringify({yaw,angle,face:f}));
   }
  }
 }
});
