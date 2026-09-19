const {test}=require('node:test');const assert=require('node:assert/strict');
const {FaceExpressionController}=require('../.cache/test-core/character/FaceExpressionController');
function advance(c,seconds){for(let i=0;i<Math.ceil(seconds*60);i++)c.update(1/60);}
test('视线平滑跟随、限幅、空闲回正及背面约束',()=>{
 const c=new FaceExpressionController(()=>.5);c.lookAtScreen(4,-3,0,0);c.update(1/60);assert.ok(c.gazeX>0&&c.gazeX<1);advance(c,.4);assert.ok(c.gazeX>.98&&c.gazeY<-.98);
 c.releaseLook();advance(c,1.4);assert.ok(Math.abs(c.gazeX)<.001&&Math.abs(c.gazeY)<.001);
 c.lookAtScreen(1,1,Math.PI,0);advance(c,.3);assert.ok(Math.abs(c.gazeX)<.001);
 c.lookAtScreen(1,.3,.5,.2);advance(c,.3);assert.ok(c.gazeX>.5&&c.gazeY>.2);
 c.lookAtScreen(NaN,1,0,0);assert.ok(Number.isFinite(c.gazeX));
});
test('自动眨眼完整开合，情绪和口形不被眨眼覆盖',()=>{
 const c=new FaceExpressionController(()=>0);c.setEmotion('sad');advance(c,2.4);assert.equal(c.blink,0);let maximum=0;
 for(let i=0;i<40;i++){c.update(1/60);maximum=Math.max(maximum,c.blink);assert.equal(c.mouthFrame,4);assert.equal(c.emotion,'sad');}
 assert.equal(maximum,1);assert.equal(c.blink,0);assert.ok(c.openness>.8);
 c.blinkNow();c.blinkNow();advance(c,.1);assert.equal(c.blink,1);c.setEmotion('happy');assert.equal(c.mouthFrame,1);advance(c,.3);assert.equal(c.blink,0);assert.equal(c.emotion,'happy');
});
test('眉毛独立平滑过渡，暂停恢复不补播眨眼',()=>{
 const c=new FaceExpressionController(()=>.5);c.setEmotion('angry');c.update(1/60);assert.ok(c.browAngle>0&&c.browAngle<.28);advance(c,.6);assert.ok(c.browAngle>.27);
 c.setEmotion('sad');advance(c,.6);assert.ok(c.browAngle<-.27);assert.ok(c.browHeight>0);
 c.blinkNow();advance(c,.1);c.suspend();assert.equal(c.blink,0);assert.equal(c.mouthFrame,4);advance(c,1);assert.equal(c.blink,0);
 c.update(Infinity);c.update(-1);assert.ok(Number.isFinite(c.openness));
});
