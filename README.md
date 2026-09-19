# 卡通理发原型

基于 **Cocos Creator 3.8.8 / TypeScript 5.4.5** 的单人 3D 理发技术原型，面向微信小游戏。当前使用用户提供的完整半身角色，包含 12 款可改造初始发型、连续投影斜切、局部剃光、梳理定型、吹风定型、整体旋转俯仰和镜头缩放。仍处于技术原型阶段，尚未完成微信真机验收。

## 本地启动

需要 Node.js 与 npm。在项目目录运行：

```sh
npm ci
npm run preview
```

打开 http://127.0.0.1:4179/ 进入理发场景；http://127.0.0.1:4179/expressions.html 为五官表情对比页，http://127.0.0.1:4179/model-review/index.html 为原始角色检查页。

Windows 安装依赖后也可双击 `启动独立预览.cmd`。预览脚本会编译共享 TypeScript，并复制运行时模型和贴图到预览目录；生成文件不提交。关闭终端即停止服务，端口可通过环境变量 `PORT` 设置。

独立 WebGL 预览复用游戏的模拟、几何和拾取代码，用于快速验证交互，不是 Creator 发布产物。

## 操作

- 顶部切换 12 款初始发型；切换会清除当前修剪和梳理结果。
- 剪发：手指或鼠标沿头发连续划动，按投影方向生成斜切面，不需要每刀抬手。
- 剃光：涂抹删除局部发根，头部遮挡的后脑需旋转后操作。
- 梳理／吹风：改变头发走向，松手保留造型。
- 在头下方身体或空白区域拖动，整体左右旋转、上下俯仰；头发有停转惯性。
- 滚轮、双指缩放或左侧按钮调整镜头。
- 查看头皮显示绿色覆盖域；恢复发型清除当前改造。

初始发型包括尖刺、齐刘海长发、波波头、及肩发、爆炸头、狮鬃长发、外翻长发、中分长发、双侧交叠遮盖、后梳前盖、圆秃长发和侧梳遮盖。详见 [初始发型与改造空间](docs/可改造初始发型.zh.md)。

## Cocos 工程

使用 Cocos Dashboard 导入本目录，选择 Creator 3.8.8，等待资源导入后打开 `assets/scenes/HairSalon.scene`。入口为 `assets/scripts/app/HairSalonApp.ts`。`library`、`temp`、`profiles`、依赖和构建产物均由本机生成，不提交。

```sh
npm run typecheck
npm test
npm run fonts:check
```

类型检查依赖 Creator 生成的 `temp/tsconfig.cocos.json`。也可使用 `node scripts/prepare-types.cjs <Creator引擎目录>` 从已安装的真实引擎准备类型。纯逻辑测试与独立预览不需要启动 Creator。

截至 2026-09-20：类型、字体检查通过；249 项测试通过 248 项。`tests/project.test.cjs` 中禁止 physics 模块的断言与现有引擎配置不一致，属于已知失败，未通过修改断言掩盖。Creator 构建与微信真机验收尚未完成。

## 资源和目录

|目录|内容|
|---|---|
|`assets/scripts`|角色、发型、碰撞、剪切、输入与 Cocos 渲染|
|`assets/resources`|运行时头皮绑定、角色数据、高清贴图与材质|
|`assets/race/fonts`|项目内置中文字库|
|`preview`|独立理发预览、表情对比与角色检查|
|`sceneresource`|Blender 源文件、原始及适配 GLB|
|`scripts`|共享逻辑编译、资源生成、字库工具|
|`tests`|模拟、网格、输入与资产回归|
|`docs`|技术设计、演进与验证记录|

用户角色保留上半身和高清衣服贴图。当前头皮 321 个共享点、608 个根面，发根绑定实际头部表面；无发区域不生成不可剪的发帽。头发与碎发合并为动态网格，梳理碰撞保持截面粗细。仍为简化发束模拟，复杂形状、自碰撞和移动端性能需后续完善。

## 可复现资源工具

模型工具使用 `scripts/run-blender.py`，通过 `BLENDER_EXECUTABLE` 或被忽略的 `.agents/local.json` 配置本机 Blender 路径。常规开发和预览无需重新生成模型。

修改静态界面文案后运行 `npm run fonts:setup`（首次）、`npm run fonts:build` 与 `npm run fonts:check`。工具生成字库及字形清单，不手工修改；源字体缓存不提交。第三方字体授权见 `LICENSES`。

## 技术文档

- [连续头皮覆盖](docs/连续头皮覆盖原型.zh.md)
- [操作与斜切实现](docs/操作与斜切实现.zh.md)
- [表情贴图技术调研](docs/表情贴图技术调研.zh.md)
- [嘴部侧视贴合修复](docs/嘴部侧视贴合修复.zh.md)
- [梳理发束膨胀修复](docs/梳理发束膨胀修复.zh.md)

较早文档中的发型数量和测试头型描述保留为演进记录，当前行为以此 README 和对应较新文档为准。项目独立于游泳工程，不包含其账号、联网状态或运行缓存。
