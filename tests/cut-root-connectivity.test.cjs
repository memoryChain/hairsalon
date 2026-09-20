const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../assets/resources/scalp/test-heads.json');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {PlaneHairCutter}=require('../.cache/test-core/surface/PlaneHairCutter');

function assertRooted(mesh){
 const adjacent=Array.from({length:mesh.bindings.length},()=>[]),visited=new Set(),pending=[];
 for(let f=0;f<mesh.indices.length;f+=3)for(let j=0;j<3;j++){
  const a=mesh.indices[f+j],b=mesh.indices[f+(j+1)%3];adjacent[a].push(b);adjacent[b].push(a);
 }
 for(const i of mesh.indices){const b=mesh.bindings[i];if(b.levels.every((level,j)=>level===0||b.weights[j]===0)&&!visited.has(i)){visited.add(i);pending.push(i);}}
 while(pending.length){const i=pending.pop();for(const next of adjacent[i])if(!visited.has(next)){visited.add(next);pending.push(next);}}
 assert.ok(mesh.indices.every(i=>visited.has(i)),'所有保留三角形都必须沿网格连接到实际发根');
 const edges=new Map();
 for(let f=0;f<mesh.indices.length;f+=3)for(let j=0;j<3;j++){
  const a=mesh.indices[f+j],b=mesh.indices[f+(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`,e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);
 }
 for(const e of edges.values())assert.deepEqual(e,[2,0],'保留侧切口必须闭合且绕序相反');
}
function volume(p,ix){let v=0;for(let f=0;f<ix.length;f+=3){const a=ix[f]*3,b=ix[f+1]*3,c=ix[f+2]*3;v+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;}return v;}

test('卷曲发缕多次穿过刀面：保留侧的无根碎片也掉落，保留原速度与体积',()=>{
 const s=new SurfaceHairSimulation(library.models[0]);s.reset('afro',2.2);
 for(let i=0;i<s.previous.length;i++)s.previous[i]-=(i%3+1)*.001;
 const source=s.fiberMesh,p=source.evaluate(s).slice(),previous=source.evaluate(s,true).slice(),before=volume(p,source.indices);
 const untouchedIds=new Set(source.indices.filter((_,f)=>source.groups[Math.floor(f/3)]!==16));
 const untouched=Array.from(untouchedIds,i=>source.bindings[i]);
 const result=new PlaneHairCutter().clip(s,{x:1,y:0,z:0,d:-.45},undefined,new Set([16]));
 assert.equal(result.changed,true,result.message);assertRooted(s.cutMesh);
 assert.ok(untouched.every(b=>s.cutMesh.bindings.includes(b)),'未命中的其他发缕保持原绑定');
 assert.deepEqual(result.groups,[16]);
 const debris=s.debris[0];let returnedVertices=0;
 for(let i=0;i<debris.p.length;i+=3)if(debris.p[i]<.45-1e-6){
  for(let j=0;j<p.length;j+=3)if(Math.hypot(p[j]-debris.p[i],p[j+1]-debris.p[i+1],p[j+2]-debris.p[i+2])<1e-10){
   returnedVertices++;for(let k=0;k<3;k++)assert.ok(Math.abs(previous[j+k]-debris.previous[i+k])<1e-10,'新脱落部分继承剪断前速度');break;
  }
 }
 assert.ok(returnedVertices>0,'弯回保留侧的断发不能继续绑定在头上');
 const after=volume(s.cutMesh.evaluate(s),s.cutMesh.indices),fallen=volume(debris.p,Array.from({length:debris.p.length/3},(_,i)=>i));
 assert.ok(Math.abs(before-after-fallen-(result.discardedVolume||0))<1e-9,'根连通筛选后仍保持体积守恒');
 const initialY=debris.p[1];for(let i=0;i<20;i++)s.advance(1/60);assert.ok(debris.p[1]<initialY,'碎片应受重力下落');
 s.dragTurn(.6,.2);for(let i=0;i<310;i++)s.advance(1/60);
 assert.equal(s.debris.length,0);assertRooted(s.cutMesh);
});

for(const model of library.models)for(const growth of [2.2,2.6])test(`${model.id} 蓬松发型 ${growth} 倍：多次剪切后没有悬空组件`,()=>{
 const s=new SurfaceHairSimulation(model),cutter=new PlaneHairCutter(),q={};s.reset('afro',growth);let cuts=0;
 for(const plane of [{x:1,y:0,z:0,d:-.45},{x:-1,y:0,z:0,d:-.46},{x:0,y:1,z:0,d:-2.6},{x:0,y:0,z:-1,d:-.52}]){
  const active=new Set();s.fiberRig.fibers.forEach((fiber,g)=>{if(fiber.ids.every(id=>{s.pointAt(id,0,q);return plane.x*q.x+plane.y*q.y+plane.z*q.z+plane.d<-.008;}))active.add(g);});
  // 局部刀线逐缕命中，避免一整头的复杂切口因某一缕无法耳切而整体回滚。
  for(const group of active)if(cutter.clip(s,plane,undefined,new Set([group])).changed)cuts++;
  if(s.cutMesh)assertRooted(s.cutMesh);
  assert.ok(s.debris.length<=12);assert.ok(s.debris.reduce((n,d)=>n+d.p.length/3,0)<=16000);
 }
 assert.ok(cuts>=3);s.dragTurn(.4,-.15);for(let i=0;i<60;i++)s.advance(1/60);assertRooted(s.cutMesh);
});
