const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../assets/resources/scalp/test-heads.json');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {StrokePlaneCutter}=require('../.cache/test-core/surface/StrokePlaneCutter');
const {SalonGesture}=require('../.cache/test-core/surface/SalonGesture');
const projection={project(x,y,z,o){o.depth=6-z;o.x=300+x/o.depth*600;o.y=300+(y-1.65)/o.depth*600;},rayAt(x,y,o){const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n});}};
function closed(m){const edges=new Map();for(let f=0;f<m.indices.length;f+=3)for(let j=0;j<3;j++){const a=m.indices[f+j],b=m.indices[f+(j+1)%3],key=a<b?a+':'+b:b+':'+a,e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}for(const e of edges.values())assert.deepEqual(e,[2,0]);}
function plane(x0,y0,x1,y1){const a={},b={};projection.rayAt(x0,y0,a);projection.rayAt(x1,y1,b);let x=a.dy*b.dz-a.dz*b.dy,y=a.dz*b.dx-a.dx*b.dz,z=a.dx*b.dy-a.dy*b.dx,n=Math.hypot(x,y,z);x/=n;y/=n;z/=n;return {x,y,z,d:-(x*a.ox+y*a.oy+z*a.oz)};}
function capCheck(s,line){const m=s.cutMesh,p=m.evaluate(s),q={},pl=plane(...line);let count=0,unequal=false;const levels=new Map();
 for(let f=0;f<m.indices.length;f+=3)if(m.caps[f/3]){count++;for(let j=0;j<3;j++){const id=m.indices[f+j],k=id*3;assert.ok(Math.abs(pl.x*p[k]+pl.y*p[k+1]+pl.z*p[k+2]+pl.d)<1e-9);projection.project(p[k],p[k+1],p[k+2],q);const [x0,y0,x1,y1]=line;assert.ok(Math.abs((q.x-x0)*(y1-y0)-(q.y-y0)*(x1-x0))/Math.hypot(x1-x0,y1-y0)<1e-7,'每个切面顶点都必须投影回真实滑动直线');
 const b=m.bindings[id],t=b.levels.reduce((n,v,i)=>n+v*b.weights[i],0),group=m.groups[f/3];if(levels.has(group)&&Math.abs(levels.get(group)-t)>1e-4)unequal=true;levels.set(group,t);}}
 assert.ok(count>0);assert.ok(unequal,'切口不可退回每缕等长截断');closed(m);
}
for(const model of library.models)for(const style of ['spiky','long'])test(model.id+' '+style+'：滑动即执行真实投影斜切，切面共面且不等长',()=>{
 const s=new SurfaceHairSimulation(model);s.reset(style);const c=new StrokePlaneCutter(),line=style==='spiky'?[195,439,409,400]:[196,224,410,186];c.begin();assert.ok(c.sweep(s,projection,...line,5));capCheck(s,line);
 assert.ok(s.debris.length);for(const d of s.debris)assert.deepEqual(d.p,d.previous);
 const cuts=s.cuts;assert.equal(c.sweep(s,projection,...line,5),false);assert.equal(s.cuts,cuts);
});
test('逐段输入的直线留下同一投影切面，按下和松手都不生成默认平切',()=>{
 const s=new SurfaceHairSimulation(library.models[0]),g=new SalonGesture(s,projection);g.begin(180,440);assert.equal(s.cuts,0);
 for(let x=184;x<=420;x+=4)g.move(x,440-(x-180)*.18);assert.ok(s.cuts>0);capCheck(s,[180,440,420,396.8]);const cuts=s.cuts;g.end(420,396.8);assert.equal(s.cuts,cuts);
});
test('短段只剪命中的局部发尖，真实头部遮挡阻止后脑，暂停与头皮检查不剪',()=>{
 const s=new SurfaceHairSimulation(library.models[0]),c=new StrokePlaneCutter();c.begin();assert.ok(c.sweep(s,projection,315,421,335,414,3));
 const groups=new Set(s.debris.flatMap(d=>Array.from(d.groups)));assert.ok(groups.size>0&&groups.size<100);
 const saved=s.cutMesh;const distance=s.occluder.distance;s.occluder.distance=()=>0;c.begin();assert.equal(c.sweep(s,projection,190,435,410,398,5),false);s.occluder.distance=distance;
 s.paused=true;assert.equal(c.sweep(s,projection,190,435,410,398,5),false);s.paused=false;s.debugScalp=true;assert.equal(c.sweep(s,projection,190,435,410,398,5),false);assert.equal(s.cutMesh,saved);
});
test('旋转俯仰后用当前形态斜切；反复多刀不复活旧面，保持几何预算',()=>{
 const s=new SurfaceHairSimulation(library.models[1]);s.reset('long');s.dragTurn(.7,.25);for(let i=0;i<180;i++)s.advance(1/60);
 const c=new StrokePlaneCutter(),line=[170,245,440,195];c.begin();assert.ok(c.sweep(s,projection,...line,5));capCheck(s,line);
 const g=new SurfaceHairGeometry();for(let i=0;i<25;i++){c.begin();c.sweep(s,projection,170,240+i*2,440,200+i*2,5);g.update(s);closed(s.cutMesh);assert.ok(g.count<=g.capacity);assert.ok(s.debris.reduce((n,d)=>n+d.p.length/3,0)<=16000);}
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;g.update(s);assert.equal(g.count,0);
});

for(const style of ['spiky','long'])test(style+'：一次按住可返回同一批发缕连续剪两刀，无需抬手',()=>{
 const s=new SurfaceHairSimulation(library.models[0]);s.reset(style);const c=new StrokePlaneCutter();
 const y=style==='spiky'?435:205,delta=style==='spiky'?-20:20;c.begin();assert.ok(c.sweep(s,projection,180,y,420,y,5));const first=new Set(s.debris.flatMap(d=>Array.from(d.groups))),count=s.cuts;
 assert.ok(c.sweep(s,projection,420,y+delta,180,y+delta,5));assert.ok(s.cuts>count);const second=s.debris.at(-1);assert.ok(Array.from(second.groups).some(id=>first.has(id)),'必须能再次修剪原来那批发缕');closed(s.cutMesh);
 const before=s.cutMesh,cutCount=s.cuts;assert.equal(c.sweep(s,projection,180,y+delta,180,y+delta,5),false);assert.equal(s.cutMesh,before);assert.equal(s.cuts,cutCount);
});
test('同一触摸往返剪发不锁死，静止不连削，剪后仍能完整剃光',()=>{
 const s=new SurfaceHairSimulation(library.models[0]),g=new SalonGesture(s,projection);g.begin(180,440);g.move(420,440);const first=s.cuts;g.move(420,420);g.move(180,420);assert.ok(s.cuts>first);assert.equal(g.action,'cut');closed(s.cutMesh);
 const saved=s.cuts;for(let i=0;i<30;i++)g.move(180,420);assert.equal(s.cuts,saved);g.end(180,420);
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;const mesh=new SurfaceHairGeometry();mesh.update(s);assert.equal(mesh.count,0);
});
test('头下面整片空白可旋转，垂发末端优先剪切；起手后动作锁定',()=>{
 const s=new SurfaceHairSimulation(library.models[0]);s.reset('long');const g=new SalonGesture(s,projection);assert.ok(g.isRotationArea(210));
 for(const x of [80,300,520]){g.begin(x,210);assert.equal(g.action,'rotate');g.move(x+20,230);assert.equal(g.action,'rotate');g.end(x+20,230);}
 s.reset('long');let hit=null;for(let x=190;x<410;x+=2)if(g.hitsHair(x,210)){hit=x;break;}assert.notEqual(hit,null);g.begin(hit,210);assert.equal(g.action,'cut');g.move(hit+12,216);assert.equal(g.action,'cut');g.cancel();
});
