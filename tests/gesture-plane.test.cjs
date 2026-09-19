const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../assets/resources/scalp/test-heads.json');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const {SurfaceHairGeometry}=require('../.cache/test-core/surface/SurfaceHairGeometry');
const {BoundHairMesh}=require('../.cache/test-core/surface/BoundHairMesh');
const {PlaneHairCutter}=require('../.cache/test-core/surface/PlaneHairCutter');
const {SalonGesture}=require('../.cache/test-core/surface/SalonGesture');
const {pose}=require('../.cache/test-core/surface/HeadPose');
const projection={project(x,y,z,o){o.depth=6-z;o.x=300+x/o.depth*600;o.y=300+(y-1.65)/o.depth*600;},rayAt(x,y,o){const dx=(x-300)/600,dy=(y-300)/600,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.65,oz:6,dx:dx/n,dy:dy/n,dz:-1/n});}};
const tick=(s,n)=>{for(let i=0;i<n;i++)s.advance(1/60);};
function manifold(mesh){const edges=new Map();for(let f=0;f<mesh.indices.length;f+=3)for(let j=0;j<3;j++){const a=mesh.indices[f+j],b=mesh.indices[f+(j+1)%3],key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1);}for(const n of edges.values())assert.equal(n,2);}
function volume(p,ix){let v=0;for(let f=0;f<ix.length;f+=3){const a=ix[f]*3,b=ix[f+1]*3,c=ix[f+2]*3;v+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;}return v;}
for(const model of library.models)for(const style of ['spiky','long'])test(model.id+' '+style+'：真实斜切共面、封闭、体积守恒，连续切割与摆动不复活旧面',()=>{
 const s=new SurfaceHairSimulation(model);s.reset(style);const cutter=new PlaneHairCutter(),source=BoundHairMesh.from(s);source.evaluate(s);const before=volume(source.p,source.indices);
 const sign=style==='spiky'?1:-1,height=style==='spiky'?2.75:.8,plane={x:.15,y:sign,z:.07,d:-height*sign};
 const result=cutter.clip(s,plane);assert.equal(result.changed,true);manifold(s.cutMesh);const p=s.cutMesh.evaluate(s);let caps=0;
 for(let f=0;f<s.cutMesh.indices.length;f+=3)if(s.cutMesh.caps[f/3]){caps++;for(let j=0;j<3;j++){const i=s.cutMesh.indices[f+j]*3;assert.ok(Math.abs(p[i]*plane.x+p[i+1]*plane.y+p[i+2]*plane.z+plane.d)<1e-10);}}
 assert.ok(caps>0);const d=s.debris[0],debrisVolume=volume(d.p,Array.from({length:d.p.length/3},(_,i)=>i));
 assert.ok(Math.abs(before-volume(p,s.cutMesh.indices)-debrisVolume-(result.discardedVolume||0))<1e-9,'切前体积应等于保留、显示碎发与预算省略碎发之和');
 assert.ok(Math.abs(debrisVolume)>1e-6);
 const indexCount=s.cutMesh.indices.length;s.dragTurn(.7,.3);tick(s,300);assert.equal(s.cutMesh.indices.length,indexCount);manifold(s.cutMesh);
 const mesh=new SurfaceHairGeometry();mesh.update(s);assert.ok(mesh.count<mesh.capacity);for(const v of mesh.view.positions)assert.ok(Number.isFinite(v));
 s.dragTurn(-.7,-.3);tick(s,300);assert.ok(cutter.clip(s,{...plane,d:plane.d+.05}).changed);manifold(s.cutMesh);
 s.trim(new Float64Array(s.lengths.length));s.debris.length=0;mesh.update(s);assert.equal(mesh.count,0,'斜切后全剃不能残留封口或底帽');
});
test('俯仰根部、头模射线变换一致；拖动保留顶端惯性，角度有限且松手不追赶',()=>{
 const s=new SurfaceHairSimulation(library.models[1]),initial=s.p.slice();s.dragTurn(.8,.4);assert.deepEqual(s.p,initial);
 for(let i=0;i<s.topology.count;i++){const a={},b={},k=i*3,r=s.topology.roots;s.pointAt(i,0,a);pose(r[k],r[k+1],r[k+2],s.yaw,s.pitch,s.topology.asset.center,b);assert.deepEqual(a,b);}
 const local={ox:0,oy:1.7,oz:3,dx:0,dy:0,dz:-1},o={},d={};pose(local.ox,local.oy,local.oz,s.yaw,s.pitch,s.topology.asset.center,o);pose(0,0,-1,s.yaw,s.pitch,[0,0,0],d);
 const ray={ox:o.x,oy:o.y,oz:o.z,dx:d.x,dy:d.y,dz:d.z};assert.ok(Math.abs(s.occluder.distance(local,0)-s.occluder.distance(ray,s.yaw,s.pitch))<1e-10);
 tick(s,3);assert.ok(s.p.some((v,i)=>Math.abs(v-s.previous[i])>1e-5));s.dragTurn(0,100);assert.equal(s.pitch,Math.PI/6);s.dragTurn(0,-100);assert.equal(s.pitch,-Math.PI/6);
 s.stop();const yaw=s.yaw,pitch=s.pitch;tick(s,300);assert.equal(s.yaw,yaw);assert.equal(s.pitch,pitch);
});
test('下方起点锁定旋转；上方背景划入头发即时剪，松手和取消不额外提交',()=>{
 const s=new SurfaceHairSimulation(library.models[0]),g=new SalonGesture(s,projection);
 g.begin(50,50);assert.equal(g.action,'rotate');g.move(300,420);assert.equal(g.action,'rotate');g.end(310,430);assert.equal(s.cuts,0);
 s.reset();g.begin(50,420);assert.equal(g.action,'cut');g.move(300,420);assert.ok(s.cuts>0);assert.equal(s.yaw,0);
 const cuts=s.cuts;g.cancel();assert.equal(s.cuts,cuts);
 s.reset();g.begin(300,420);assert.equal(s.cuts,0,'静止按下还没有切面方向');g.move(314,425);assert.ok(s.cuts>0,'一开始滑动便剪，不等待松手');const count=s.cuts;g.end(314,425);assert.equal(s.cuts,count);
 s.trim(new Float64Array(s.lengths.length));g.begin(300,420,'shave');assert.equal(g.action,'shave');
});
test('浏览器与 Cocos 的相反纵轴和像素密度得到相同转动角度',()=>{
 const a=new SurfaceHairSimulation(library.models[0]),b=new SurfaceHairSimulation(library.models[0]);
 const flipped={project(x,y,z,o){projection.project(x,y,z,o);o.x*=2;o.y=1200-o.y*2;},rayAt(x,y,o){projection.rayAt(x/2,(1200-y)/2,o);}};
 const ga=new SalonGesture(a,projection,true),gb=new SalonGesture(b,flipped,false);
 ga.begin(50,50,'cut',1);gb.begin(100,1100,'cut',2);ga.move(80,70);gb.move(160,1060);assert.equal(a.yaw,b.yaw);assert.equal(a.pitch,b.pitch);
});
test('屏幕刀线支持斜切，头皮保护与未命中不改变原网格',()=>{
 const s=new SurfaceHairSimulation(library.models[0]),cut=new PlaneHairCutter();
 assert.equal(cut.cutStroke(s,projection,285,425,350,395).changed,true);assert.ok(s.cutMesh);
 const mesh=s.cutMesh,cuts=s.cuts;assert.equal(cut.cutStroke(s,projection,230,340,370,340).changed,false);assert.equal(s.cutMesh,mesh);assert.equal(s.cuts,cuts);
 assert.equal(cut.cutStroke(s,projection,50,600,100,600).changed,false);assert.equal(s.cutMesh,mesh);
});
test('有限刀线不切到同一平面上没有划过的独立发尖',()=>{
 const s=new SurfaceHairSimulation(library.models[0]),cut=new PlaneHairCutter();
 assert.equal(cut.clip(s,{x:0,y:1,z:0,d:-2.65},(p,a,b)=>p[a*3]>.25&&p[b*3]>.25).changed,true);
 const p=s.cutMesh.evaluate(s);let untouched=false;for(let i=0;i<p.length;i+=3)if(p[i]<0&&p[i+1]>2.7)untouched=true;assert.ok(untouched);
});
test('旋转俯仰后屏幕命中使用当前头发；多刀保持缓冲与碎片预算',()=>{
 const s=new SurfaceHairSimulation(library.models[1]),c=new PlaneHairCutter(),g=new SurfaceHairGeometry();s.reset('long');
 for(let i=0;i<35;i++){c.clip(s,{x:.03*Math.sin(i),y:-1,z:0,d:.61+i*.008});s.dragTurn(.08,.01);tick(s,1);g.update(s);assert.ok(g.count<=g.capacity);assert.ok(s.debris.reduce((n,d)=>n+d.p.length/3,0)<=16000);if(s.cutMesh)manifold(s.cutMesh);}
 tick(s,310);assert.equal(s.debris.length,0);s.clearVelocity();assert.ok(s.p.every(Number.isFinite));s.reset();assert.equal(s.cutMesh,null);
});

test('角色转向并俯仰后仍可用屏幕刀线生成精确切口',()=>{
 const s=new SurfaceHairSimulation(library.models[1]);s.dragTurn(.75,.3);tick(s,300);const q={},screen={};let top=-Infinity;
 for(let i=0;i<s.topology.count;i++){s.pointAt(i,0,q);projection.project(q.x,q.y,q.z,screen);top=Math.max(top,screen.y);}
 const cut=new PlaneHairCutter(),result=cut.cutStroke(s,projection,150,top+12,450,top+32);assert.equal(result.changed,true,result.message);manifold(s.cutMesh);
});
