const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HairSimulation, headRayDistance } = require('../.cache/test-core/hair/HairSimulation');
const { HairGeometry } = require('../.cache/test-core/hair/HairGeometry');
const { CONFIG } = require('../.cache/test-core/core/PrototypeConfig');
const { createCharacter } = require('../.cache/test-core/character/CharacterGeometry');
const tick = (sim, n) => { for (let i = 0; i < n; i++) sim.advance(1 / 60); };
const length = a => a.lengths.reduce((sum, value) => sum + value, 0);
const speed = sim => { let value = 0; for (const s of sim.strands) for (let i = 3; i < s.p.length; i++) value += (s.p[i] - s.previous[i]) ** 2; return Math.sqrt(value); };

for (const style of ['spiky', 'long']) {
    test(`${style}：转动后发根保持精确绑定，急停有余摆且能衰减`, () => {
        const sim = new HairSimulation(); sim.reset(style); tick(sim, 180);
        for (let i = 0; i < 30; i++) { sim.turn(0.045); sim.advance(1 / 60); }
        sim.stop(); const moving = speed(sim); assert.ok(moving > 0.002);
        const yaw = sim.yaw; tick(sim, 1); assert.equal(sim.yaw, yaw);
        assert.ok(speed(sim) > 0.001, '停止头部不能抹掉发束速度');
        tick(sim, 600); assert.ok(speed(sim) < moving * 0.15, `未衰减：${speed(sim)} / ${moving}`);
        for (const s of sim.strands) {
            assert.ok(Math.abs(s.p[0] - (Math.cos(yaw) * s.rest[0] + Math.sin(yaw) * s.rest[2])) < 1e-9);
            assert.equal(s.p[1], s.rest[1]);
        }
    });
}
test('30 Hz 与 60 Hz 输入相同时间得到相同结果', () => {
    const a = new HairSimulation(), b = new HairSimulation(); a.turn(0.75); b.turn(0.75);
    for (let i = 0; i < 120; i++) a.advance(1 / 60);
    for (let i = 0; i < 60; i++) b.advance(1 / 30);
    assert.deepEqual(a.strands[12].p, b.strands[12].p);
    assert.equal(a.advance(100), CONFIG.maxSteps);
});
test('任意段内剪切保持原长、切口粗细及两侧速度', () => {
    const sim = new HairSimulation(); sim.reset('long'); tick(sim, 30); sim.turn(0.8); tick(sim, 5);
    const s = sim.strands[2], segment = 5, t = 0.37;
    const total = length(s), j = (segment - 1) * 3, k = segment * 3;
    const expected = [0, 1, 2].map(axis => s.p[j + axis] + (s.p[k + axis] - s.p[j + axis]) * t);
    const old = [0, 1, 2].map(axis => s.previous[j + axis] + (s.previous[k + axis] - s.previous[j + axis]) * t);
    const radius = s.radius[segment - 1] + (s.radius[segment] - s.radius[segment - 1]) * t;
    assert.ok(sim.cut(s, segment, t));
    const d = sim.debris[0]; assert.equal(d.attached, false);
    assert.ok(Math.abs(total - length(s) - length(d)) < 1e-10);
    assert.deepEqual([...s.p.slice(-3)], expected); assert.deepEqual([...d.p.slice(0, 3)], expected);
    assert.deepEqual([...s.previous.slice(-3)], old); assert.deepEqual([...d.previous.slice(0, 3)], old);
    assert.equal(s.radius[s.count - 1], radius); assert.equal(d.radius[0], radius);
    const g = new HairGeometry(); g.update(sim.strands, sim.debris);
    assert.ok(g.count > 0 && g.count < CONFIG.maxVertices);
    const expectedVertices = [...sim.strands, ...sim.debris].reduce((n, a) => n + (a.count - 1) * 6 * CONFIG.radialSides + 6 * CONFIG.radialSides, 0);
    assert.equal(g.count, expectedVertices, '两端都应有封口');
});
test('朝脸的射线不能穿过头部剪后脑，外侧发束可命中', () => {
    const sim = new HairSimulation();
    const ray = { ox: 0, oy: CONFIG.headY, oz: 6, dx: 0, dy: 0, dz: -1 };
    const hit = sim.pick(ray);
    assert.ok(!hit || hit.distance < headRayDistance(ray, sim.yaw));
    let found = false;
    for (let x = -1.2; x <= 1.2; x += 0.1) for (let y = 2.25; y < 3.2; y += 0.1)
        if (sim.pick({ ...ray, ox: x, oy: y })) found = true;
    assert.ok(found);
});
test('碎发容量有上限，寿命结束回收，重置清空剪切', () => {
    const sim = new HairSimulation(); sim.reset('long');
    for (const s of sim.strands) sim.cut(s, 5, 0.5);
    assert.equal(sim.debris.length, CONFIG.maxDebris);
    tick(sim, 310); assert.equal(sim.debris.length, 0);
    sim.reset(); assert.equal(sim.cuts, 0); assert.equal(sim.debris.length, 0);
});
test('反复切换、急转、剪切后数值和网格仍在容量内', () => {
    const sim = new HairSimulation(), g = new HairGeometry();
    for (let run = 0; run < 6; run++) {
        sim.reset(run % 2 ? 'spiky' : 'long');
        for (let frame = 0; frame < 600; frame++) {
            sim.turn(Math.sin(frame / 12) * 0.2); sim.advance(1 / 60);
            if (frame % 45 === 0) { const s = sim.strands[(frame / 45) % sim.strands.length | 0]; sim.cut(s, Math.max(1, s.count - 3), 0.4); }
        }
        for (const s of [...sim.strands, ...sim.debris]) for (const value of s.p) assert.ok(Number.isFinite(value) && Math.abs(value) < 8);
        g.update(sim.strands, sim.debris); assert.ok(g.count < CONFIG.maxVertices);
    }
    const character = createCharacter(); assert.ok(character.count > 0 && character.count < character.capacity);
});
test('后台暂停不推进，恢复清除旧速度和累计时间', () => {
    const sim = new HairSimulation(); sim.turn(0.7); tick(sim, 10);
    sim.paused = true; const before = [...sim.strands[0].p]; assert.equal(sim.advance(5), 0);
    assert.deepEqual([...sim.strands[0].p], before); sim.clearVelocity(); assert.equal(speed(sim), 0);
});


test('快速拖动即时按距离转动，不限速、不丢事件转角，松手无追赶', () => {
    const sim = new HairSimulation();
    const initialTip = [...sim.strands[0].p.slice(-3)];
    sim.dragTurn(200 * CONFIG.dragRadiansPerPixel);
    assert.ok(Math.abs(sim.yaw - 1.8) < 1e-12);
    assert.equal(sim.targetYaw, sim.yaw);
    assert.deepEqual([...sim.strands[0].p.slice(-3)], initialTip, '拖动不能刚性旋转发梢');
    const yaw = sim.yaw;
    tick(sim, 30); assert.equal(sim.yaw, yaw);
    const split = new HairSimulation();
    for (let i = 0; i < 20; i++) split.dragTurn(10 * CONFIG.dragRadiansPerPixel);
    assert.ok(Math.abs(split.yaw - sim.yaw) < 1e-12, '事件数量不能改变总转角');
});
test('未到物理步也立即更新角度和发根，反向拖动立即响应', () => {
    const sim = new HairSimulation();
    sim.targetYaw = Math.PI;
    const revision = sim.revision;
    sim.dragTurn(0.4); assert.equal(sim.yaw, 0.4); assert.ok(sim.revision > revision);
    assert.equal(sim.advance(CONFIG.step / 2), 0);
    sim.dragTurn(-0.7); assert.ok(Math.abs(sim.yaw + 0.3) < 1e-12);
    for (const s of sim.strands) {
        assert.ok(Math.abs(s.p[0] - (Math.cos(sim.yaw) * s.rest[0] + Math.sin(sim.yaw) * s.rest[2])) < 1e-9);
        assert.equal(s.p[1], s.rest[1]);
    }
    sim.advance(CONFIG.step / 2); assert.ok(Math.abs(sim.yaw + 0.3) < 1e-12);
    assert.equal(sim.targetYaw, sim.yaw, '拖动接管时取消按钮剩余转角');
});
test('快速拖动的毛发子步不增加碎发寿命消耗', () => {
    const sim = new HairSimulation(); sim.cut(sim.strands[0], 3, 0.5);
    sim.dragTurn(2.1); sim.advance(CONFIG.step);
    assert.ok(Math.abs(sim.debris[0].age - CONFIG.step) < 1e-12);
});
for (const style of ['spiky', 'long']) test(`${style}：快速往返拖动及变子步后毛发稳定，松手仍有余摆`, () => {
    const sim = new HairSimulation(); sim.reset(style); tick(sim, 120);
    for (let i = 0; i < 180; i++) {
        sim.dragTurn(Math.sin(i * 0.2) * 0.95); sim.advance(1 / 60);
        for (const s of sim.strands) for (const value of s.p) assert.ok(Number.isFinite(value) && Math.abs(value) < 8);
    }
    const yaw = sim.yaw;
    tick(sim, 2); const moving = speed(sim); assert.ok(moving > 0.002);
    tick(sim, 600); assert.equal(sim.yaw, yaw); assert.ok(speed(sim) < moving * 0.15);
});
