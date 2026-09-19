// 使用指定 Creator 安装中的真实类型，不创建 cc 的宽泛替身声明。
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const engine = process.argv[2] || process.env.COCOS_ENGINE_PATH;
if (!engine) throw new Error('请传入 Creator resources/resources/3d/engine 目录');
(async () => {
    const output = path.join(root, 'temp/declarations'); fs.mkdirSync(output, { recursive: true });
    const original = path.join(engine, 'bin/.declarations/cc.d.ts');
    if (fs.existsSync(original) && fs.statSync(original).size > 10000) {
        for (const file of fs.readdirSync(path.dirname(original))) if (file.endsWith('.d.ts')) fs.copyFileSync(path.join(path.dirname(original), file), path.join(output, file));
    } else {
        const { dtsBundler } = require(path.join(engine, 'node_modules/@cocos/ccbuild'));
        await dtsBundler.build({ engine, outDir: output, withIndex: true, withExports: false, withEditorExports: false });
    }
    fs.writeFileSync(path.join(root, 'temp/tsconfig.cocos.json'), JSON.stringify({ compilerOptions: {
        target: 'ES2017', module: 'ES2015', moduleResolution: 'node', experimentalDecorators: true,
        strict: true, skipLibCheck: true, types: [], noEmit: true }, files: ['./declarations/cc.d.ts'] }, null, 2));
    console.log('真实引擎类型准备完成');
})().catch(error => { console.error(error); process.exitCode = 1; });
