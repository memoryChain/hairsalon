const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=require('../assets/resources/scalp/test-heads.json').models;
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {unposeRay,pose}=require('../.cache/test-core/surface/HeadPose');
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
for(const model of models)for(const style of ['long','bob','spiky'])test(model.id+' '+style+'：梳理宽束的截面和侧面避开真实头模，根绑定不变',()=>{
 const s=new SurfaceHairSimulation(model);s.reset(style);const rig=s.fiberRig,mesh=s.fiberMesh,out={};
 for(let step=0;step<10;step++)for(const f of rig.fibers)rig.comb(f.group,step<5?-1:1,.15,-.8,.16,s,out);
 const fixed=mesh.evaluate(s).slice(),good=penetration(s,fixed);
 for(const f of rig.fibers)f.groomed=false;const raw=mesh.evaluate(s).slice(),bad=penetration(s,raw);for(const f of rig.fibers)f.groomed=true;
 assert.ok(good.worst<.012,JSON.stringify({bad,good}));assert.ok(good.count<=bad.count);
 const q={},roots=s.topology.roots; s.dragTurn(.6,.3);
 for(const previous of [false,true]){const p=mesh.evaluate(s,previous).slice();assert.ok(p.every(Number.isFinite));assert.ok(penetration(s,p,previous).worst<.012,JSON.stringify({previous,result:penetration(s,p,previous)}));
  for(const f of rig.fibers)for(let j=0;j<f.ids.length;j++){const id=f.ids[j]*3,k=(f.base+j)*3;pose(roots[id],roots[id+1],roots[id+2],previous?s.previousYaw:s.yaw,previous?s.previousPitch:s.pitch,model.center,q);assert.ok(Math.hypot(p[k]-q.x,p[k+1]-q.y,p[k+2]-q.z)<1e-9);}
 }
 const next=new Float64Array(s.lengths.length);s.trim(next);assert.ok(rig.evaluate(s,false).every(Number.isFinite));s.reset(style);assert.ok(s.fiberRig.fibers.every(f=>!f.groomed));
});
