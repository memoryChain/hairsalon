const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['gameplay/SalonSession.ts','input/CameraZoom.ts','character/FaceGeometry.ts','character/FaceExpressionController.ts','core/PrototypeConfig.ts','hair/HairPresets.ts','hair/HairSimulation.ts','hair/HairGeometry.ts','hair/HairScreenCutter.ts','character/CharacterGeometry.ts','surface/SurfaceHairSimulation.ts','surface/SurfaceHairGeometry.ts','surface/SurfaceScreenCutter.ts','surface/SalonGesture.ts','surface/PlaneHairCutter.ts','surface/FiberScreenCutter.ts'];
for (const [directory, module] of [['preview/core', ts.ModuleKind.ES2020], ['.cache/test-core', ts.ModuleKind.CommonJS]]) {
    const options = { target: ts.ScriptTarget.ES2020, module, strict: true, skipLibCheck: true,
        rootDir: path.join(root, 'assets/scripts'), outDir: path.join(root, directory), types: [] };
    const program = ts.createProgram(files.map(f => path.join(root, 'assets/scripts', f)), options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) {
        console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root,
            getCanonicalFileName: f => f, getNewLine: () => '\n' })); process.exit(1);
    }
    program.emit();
}
fs.copyFileSync(path.join(root, 'assets/resources/scalp/test-heads.json'), path.join(root, 'preview/test-heads.json'));
fs.copyFileSync(path.join(root, 'assets/resources/scalp/user-head.json'), path.join(root, 'preview/user-head.json'));
fs.copyFileSync(path.join(root, 'assets/resources/character/user-body.jpg'), path.join(root, 'preview/user-body.jpg'));
console.log('共享模拟与几何编译完成');

fs.cpSync(path.join(root, 'assets/resources/references'), path.join(root, 'preview/references'), { recursive: true });
