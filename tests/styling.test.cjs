const {test}=require('node:test');
const assert=require('node:assert/strict');
const models=require('../assets/resources/scalp/test-heads.json').models;
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {SalonGesture}=require('../.cache/test-core/surface/SalonGesture');
const {HairBrush}=require('../.cache/test-core/surface/HairBrush');
const {HAIR_PRESETS}=require('../.cache/test-core/core/HairstyleCatalog');
const {StrokePlaneCutter}=require('../.cache/test-core/surface/StrokePlaneCutter');
const projection={project(x,y,z,o){o.depth=6-z;o.x=300+x/o.depth*600;o.y=300+(y-1.65)/o.depth*600;},rayAt(x,y,o){const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n});}};
function point(s){const m=s.cutMesh||s.fiberMesh,p=m.evaluate(s),q={},ray={};let hit=null,best=-Infinity;for(let f=0;f<m.indices.length;f+=3){const ids=m.indices.slice(f,f+3),x=ids.reduce((v,id)=>v+p[id*3]/3,0),y=ids.reduce((v,id)=>v+p[id*3+1]/3,0),z=ids.reduce((v,id)=>v+p[id*3+2]/3,0);projection.project(x,y,z,q);if(q.x<340||q.y>300)continue;projection.rayAt(q.x,q.y,ray);const d=(x-ray.ox)*ray.dx+(y-ray.oy)*ray.dy+(z-ray.oz)*ray.dz;if(d>=s.occluder.distance(ray,s.yaw,s.pitch)-1e-4)continue;const score=q.x-q.y*.15;if(score>best){best=score;hit={x:q.x,y:q.y};}}assert.ok(hit);return hit;}
function length(f,bulge){let last=f.root,arc=0;for(let i=1;i<=16;i++){const t=i/16,q=1-t,p=f.root.map((v,a)=>q*q*q*v+3*q*q*t*(v+f.normal[a]*bulge)+3*q*t*t*f.control[a]+t*t*t*f.end[a]);arc+=Math.hypot(...p.map((v,a)=>v-last[a]));last=p;}return arc;}
function stroke(s,g,p,dx=70,dy=150){g.begin(p.x,p.y,'comb');assert.equal(g.action,'comb');for(let i=1;i<=30;i++){g.move(p.x+dx*i/30,p.y+dy*i/30);s.advance(1/60);}g.end(p.x+dx,p.y+dy);}
for(const model of models)test(model.id+'：垂发上梳保留造型和根域，不产生剪切且弧长受限',()=>{
 const s=new SurfaceHairSimulation(model);s.reset('long');const g=new SalonGesture(s,projection),before=s.fiberRig.fibers.map(f=>f.end.slice()),mesh=s.fiberMesh,indices=mesh.indices.slice();stroke(s,g,point(s));
 assert.equal(s.cuts,0);assert.equal(s.debris.length,0);assert.equal(s.fiberMesh,mesh);assert.deepEqual(mesh.indices,indices);assert.ok(s.fiberRig.fibers.some((f,i)=>f.end[1]>before[i][1]+.3));
 const saved=s.fiberRig.fibers.map(f=>f.end.slice());for(let i=0;i<300;i++)s.advance(1/60);assert.deepEqual(s.fiberRig.fibers.map(f=>f.end),saved);
 for(const f of s.fiberRig.fibers)assert.ok(Math.abs(length(f,HAIR_PRESETS.long.bulge)-f.restLength)<f.restLength*.006);
 const p=mesh.evaluate(s),roots=s.topology.roots;for(const f of s.fiberRig.fibers)for(let j=0;j<f.ids.length;j++)for(let a=0;a<3;a++)assert.ok(Math.abs(p[(f.base+j)*3+a]-roots[f.ids[j]*3+a])<1e-9);
 s.reset('long');assert.deepEqual(s.fiberRig.fibers.map(f=>f.end),before);
});
test('剪后梳理不复活已剪几何，梳后仍能斜切和全剃',()=>{
 const s=new SurfaceHairSimulation(models[0]);s.reset('long');const cutter=new StrokePlaneCutter();cutter.begin();assert.ok(cutter.sweep(s,projection,170,240,440,200,5));
 const kept=s.cutMesh,indices=kept.indices.slice(),cuts=s.cuts,g=new SalonGesture(s,projection);stroke(s,g,point(s),40,110);assert.equal(s.cutMesh,kept);assert.deepEqual(kept.indices,indices);assert.equal(s.cuts,cuts);
 let changed=false;for(let y=440;y>200&&!changed;y-=12){cutter.begin();changed=cutter.sweep(s,projection,170,y,460,y-25,5);}assert.ok(changed);
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;const geometry=new SurfaceHairGeometry();geometry.update(s);assert.equal(geometry.count,0);
});
for(const model of models)test(model.id+'：吹风改变造型，松手消退余摆但保留曲线，恢复可清除',()=>{
 const s=new SurfaceHairSimulation(model);s.reset('long');const p=point(s),g=new SalonGesture(s,projection),original=s.fiberRig.fibers.map(f=>f.end.slice());g.begin(p.x,p.y,'blow');assert.equal(g.action,'blow');let peak=0;
 for(let i=0;i<90;i++){g.update(1/60);s.advance(1/60);peak=Math.max(peak,...s.fiberRig.wind.map(Math.abs));}assert.ok(peak>.025);assert.equal(s.cuts,0);
 assert.ok(s.fiberRig.fibers.some((f,i)=>f.end[1]>original[i][1]+.1));g.end(p.x,p.y);
 const saved=s.fiberRig.fibers.map(f=>({end:f.end.slice(),control:f.control.slice()}));
 s.dragTurn(.45,.2);
 for(let i=0;i<360;i++){g.update(1/60);s.advance(1/60);}assert.ok(s.fiberRig.wind.every(v=>Math.abs(v)<1e-4));
 assert.deepEqual(s.fiberRig.fibers.map(f=>({end:f.end,control:f.control})),saved);
 for(const f of s.fiberRig.fibers)assert.ok(Math.abs(length(f,HAIR_PRESETS.long.bulge)-f.restLength)<f.restLength*.006);
 s.reset('long');assert.deepEqual(s.fiberRig.fibers.map(f=>f.end),original);
});
test('剪后吹风保留切口拓扑，吹好后仍可继续剪和剃光',()=>{
 const s=new SurfaceHairSimulation(models[0]);s.reset('long');const cutter=new StrokePlaneCutter();cutter.begin();assert.ok(cutter.sweep(s,projection,170,240,440,200,5));
 const mesh=s.cutMesh,indices=mesh.indices.slice(),p=point(s),g=new SalonGesture(s,projection),cuts=s.cuts;g.begin(p.x,p.y,'blow');
 for(let i=0;i<90;i++){g.update(1/60);s.advance(1/60);}g.end(p.x,p.y);assert.equal(s.cutMesh,mesh);assert.deepEqual(mesh.indices,indices);assert.equal(s.cuts,cuts);
 let changed=false;for(let y=440;y>200&&!changed;y-=12){cutter.begin();changed=cutter.sweep(s,projection,170,y,460,y-25,5);}assert.ok(changed);
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;const geometry=new SurfaceHairGeometry();geometry.update(s);assert.equal(geometry.count,0);
});
test('暂停、查看头皮、空白和已剃区域不会梳理或吹动隐藏头发',()=>{
 const s=new SurfaceHairSimulation(models[0]);s.reset('long');const brush=new HairBrush(),p=point(s),original=s.fiberRig.fibers.map(f=>f.end.slice());
 for(const flag of ['paused','debugScalp']){s[flag]=true;assert.equal(brush.comb(s,projection,p.x,p.y,p.x+30,p.y+80,24,1),0);assert.equal(brush.blow(s,projection,p.x,p.y,0,1,46,.05),0);s[flag]=false;}
 assert.equal(brush.comb(s,projection,0,0,10,10,24,1),0);assert.deepEqual(s.fiberRig.fibers.map(f=>f.end),original);
 s.trim(new Float64Array(s.lengths.length));brush.end();assert.equal(brush.comb(s,projection,p.x,p.y,p.x+30,p.y+80,24,1),0);assert.equal(brush.blow(s,projection,p.x,p.y,0,1,46,.05),0);
});
test('相反纵轴与双倍像素密度的梳理方向一致',()=>{
 const a=new SurfaceHairSimulation(models[0]),b=new SurfaceHairSimulation(models[0]);a.reset('long');b.reset('long');const p=point(a),flip={project(x,y,z,o){projection.project(x,y,z,o);o.x*=2;o.y=1200-o.y*2;},rayAt(x,y,o){projection.rayAt(x/2,(1200-y)/2,o);}},ga=new SalonGesture(a,projection),gb=new SalonGesture(b,flip,false);ga.begin(p.x,p.y,'comb',1);gb.begin(p.x*2,1200-p.y*2,'comb',2);
 for(let i=1;i<=20;i++){ga.move(p.x+i*2,p.y+i*4);gb.move((p.x+i*2)*2,1200-(p.y+i*4)*2);}
 for(let i=0;i<a.fiberRig.fibers.length;i++)for(let k=0;k<3;k++)assert.ok(Math.abs(a.fiberRig.fibers[i].end[k]-b.fiberRig.fibers[i].end[k])<1e-8);
});
