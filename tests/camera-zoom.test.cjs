const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CameraZoom}=require('../.cache/test-core/input/CameraZoom');
const {SalonGesture}=require('../.cache/test-core/surface/SalonGesture');
const {SurfaceHairSimulation}=require('../.cache/test-core/surface/SurfaceHairSimulation');
const head=require('../assets/resources/scalp/user-head.json');
test('缩放具有安全范围，滚轮方向正确，复位不改变单指状态',()=>{
 const z=new CameraZoom();z.wheel(-100);assert.ok(z.factor<1);z.wheel(100);assert.ok(Math.abs(z.factor-1)<1e-12);
 z.scale(.001);assert.equal(z.factor,z.min);z.scale(1000);assert.equal(z.factor,z.max);
 z.set(NaN);assert.equal(z.factor,z.max);z.scale(-1);assert.equal(z.factor,z.max);z.set(1);assert.equal(z.factor,1);
});
test('双指张开拉近；抬起一指后继续屏蔽剪发，全部抬起才恢复',()=>{
 const z=new CameraZoom();assert.equal(z.down(1,0,0),false);assert.equal(z.down(2,100,0),true);
 assert.equal(z.move(2,150,0),true);assert.ok(Math.abs(z.factor-2/3)<1e-12);
 assert.equal(z.up(2),true);const factor=z.factor;assert.equal(z.move(1,50,50),true);assert.equal(z.factor,factor);
 assert.equal(z.up(1),true);assert.equal(z.down(3,0,0),false);assert.equal(z.move(3,30,20),false);
 z.cancel();assert.equal(z.down(4,0,0),false);
});
test('第三指和重合双指不产生缩放跳变；取消不重置镜头',()=>{
 const z=new CameraZoom();z.down(1,0,0);z.down(2,0,0);z.move(2,100,0);assert.equal(z.factor,1);
 z.down(3,1000,0);z.move(3,2000,0);assert.equal(z.factor,1);z.up(1);z.move(3,2100,0);assert.ok(z.factor<1);
 const f=z.factor;z.cancel();assert.equal(z.factor,f);assert.equal(z.move(3,0,0),false);
});
for(const factor of [.55,1,1.65])test('镜头距离 '+factor+'：缩放后的发梢投影能命中头发、下方仍可旋转',()=>{
 const sim=new SurfaceHairSimulation(head),distance=7.1*factor,projection={
  project(x,y,z,o){o.depth=distance-z;o.x=360+x/o.depth*1000;o.y=640+(y-1.6)/o.depth*1000;},
  rayAt(x,y,o){const dx=(x-360)/1000,dy=(y-640)/1000,n=Math.hypot(dx,dy,1);Object.assign(o,{ox:0,oy:1.6,oz:distance,dx:dx/n,dy:dy/n,dz:-1/n});}
 };
 const gesture=new SalonGesture(sim,projection),point={x:0,y:0,depth:0};
 assert.ok(gesture.hitsHair(360,640+(2.45-1.6)/distance*1000));
 projection.project(0,.9,0,point);assert.ok(gesture.isRotationArea(point.y));
 const cuts=sim.cuts;gesture.begin(20,point.y,'cut');assert.equal(gesture.action,'rotate');gesture.move(40,point.y);gesture.end(40,point.y);assert.equal(sim.cuts,cuts);
});
