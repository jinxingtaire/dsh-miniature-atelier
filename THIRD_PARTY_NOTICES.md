# 第三方署名与许可证 / Third-party credits and notices

本文件记录 3D 造物台使用的上游组件、案例来源与设计参考。

This document records the upstream components, catalog sources, and design references for 3D Maker Studio.

## 随插件分发的内容 / Bundled material

| 项目 / Project | 作者 / Credit | 用途 / Use | 版本与许可证 / Version and license |
| --- | --- | --- | --- |
| [Three.js](https://github.com/mrdoob/three.js) | Three.js Authors | 浏览器渲染引擎，原样附在 `src/three.min.js`，构建后随安装包分发。 / The browser rendering engine is vendored verbatim in `src/three.min.js` and included in the install bundle. | [r160](https://github.com/mrdoob/three.js/tree/r160) · [MIT](licenses/three-js-MIT.txt) |
| [awesome-deepseek-v4.1-flash](https://github.com/sandbase-lab/awesome-deepseek-v4.1-flash) | SandBase Lab | 部分案例索引和来源链接收录到 `src/sandbase-cases.json`，保留作者署名。 / Some catalog entries and source links are included in `src/sandbase-cases.json` with creator credit. | [来源修订 / Source revision `376039d`](https://github.com/sandbase-lab/awesome-deepseek-v4.1-flash/tree/376039d536eb4980db540e038b9c9486c0c1df93) · [MIT（原始整理结构 / original curation structure）](licenses/sandbase-MIT.txt) |

第三方原帖、图片、演示视频与提示词由各自权利人持有。案例索引保留作者与原帖链接，素材的授权以原来源为准。 [SandBase Lab 媒体说明](https://github.com/sandbase-lab/awesome-deepseek-v4.1-flash/blob/376039d536eb4980db540e038b9c9486c0c1df93/MEDIA-RIGHTS.md) · [参考库作者与原帖](src/reference-library.js)

Rights to external posts, images, demo videos, and prompts remain with their respective owners. The catalog credits creators and links to their posts. Refer to the original source for reuse terms. [SandBase Lab media rights](https://github.com/sandbase-lab/awesome-deepseek-v4.1-flash/blob/376039d536eb4980db540e038b9c9486c0c1df93/MEDIA-RIGHTS.md) · [Reference library credits and links](src/reference-library.js)

## 设计参考 / Design references

下列仓库用于评估和设计三种创作流程。3D 造物台独立实现这些流程，安装包只需要 DSH 即可启动。

These repositories informed the design of three workflows. 3D Maker Studio implements the workflows independently and runs as a DSH plugin.

| 参考项目 / Project | 作者 / Credit | 参考范围 / Design reference | 查阅的修订 / Reviewed revision |
| --- | --- | --- | --- |
| [machine-skill](https://github.com/AirsupHQ/machine-skill) | Air Supply Technologies Inc. (AirsupHQ) | 机械剖面与持续联动的交互表达。 / Interactive cutaways and continuously linked mechanical motion. | [`e0bd066`](https://github.com/AirsupHQ/machine-skill/tree/e0bd066ac5beaf48512935de2fc0f0e55636853a) |
| [teardown](https://github.com/elvarofficial/teardown) | elvarofficial | 零件爆炸视图、分步拆解和复装。 / Exploded views, step-by-step disassembly, and reassembly. | [`a91262a`](https://github.com/elvarofficial/teardown/tree/a91262ac1109051e014662d42ecb0b7bc1f113b1) |
| [factory-skill](https://github.com/AirsupHQ/factory-skill) | Air Supply Technologies Inc. (AirsupHQ) | 微缩厂房、物料流动与产线瓶颈展示。 / Miniature factories, material flow, and visible production bottlenecks. | [`9fde755`](https://github.com/AirsupHQ/factory-skill/tree/9fde7554e6a30e77ea1008dec08f2ba8d8d37f27) |

## 宿主、可选工具与外部服务 / Host, optional tooling, and external services

| 项目 / Project | 作者 / Credit | 角色 / Role |
| --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | DeepSeek AI | 插件宿主、模型连接和原生会话。 / Plugin host, model connection, and native sessions. |
| [Playwright](https://github.com/microsoft/playwright) | Microsoft and contributors | 可选浏览器验收工具。 / Optional browser verification tooling. |
| [FxEmbed](https://github.com/FxEmbed/FxEmbed) | FxEmbed contributors | 参考库按需读取公开 X 原帖的外部服务。 / External service for the catalog's on-demand retrieval of public X posts. |
