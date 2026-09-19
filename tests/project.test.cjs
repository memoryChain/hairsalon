const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
test('启动场景引用有效，入口脚本使用 Creator 组件 UUID 编码', () => {
    const scene = read('assets/scenes/HairSalon.scene');
    const uuid = read('assets/scripts/app/HairSalonApp.ts.meta').uuid.replaceAll('-', '');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let compressed = uuid.slice(0, 5);
    for (let i = 5; i < 32; i += 3) { const value = parseInt(uuid.slice(i, i + 3), 16); compressed += alphabet[value >> 6] + alphabet[value & 63]; }
    assert.equal(scene[7].__type__, compressed);
    const visit = value => {
        if (!value || typeof value !== 'object') return;
        if ('__id__' in value) assert.ok(scene[value.__id__], `无效场景引用 ${value.__id__}`);
        assert.ok(!('__uuid__' in value), '启动场景不应引用旧项目资源');
        for (const child of Object.values(value)) visit(child);
    };
    visit(scene);
    assert.equal(read('settings/v2/packages/builder.json').common.startScene, read('assets/scenes/HairSalon.scene.meta').uuid);
});
test('原型启用动态网格和 UI，未引入刚体后端及线上账号', () => {
    const engine = read('settings/v2/packages/engine.json');
    const modules = engine.modules.configs[engine.modules.globalConfigKey].includeModules;
    assert.ok(modules.includes('3d') && modules.includes('ui') && modules.includes('graphics'));
    assert.ok(!modules.some(name => name.startsWith('physics')));
    const pack = read('package.json'); assert.equal(pack.creator.version, '3.8.8'); assert.equal(pack.devDependencies.typescript, '5.4.5');
    assert.ok(fs.existsSync(path.join(root, 'assets/race/fonts/ShuiMasterUI-Regular.ttf')));
});
