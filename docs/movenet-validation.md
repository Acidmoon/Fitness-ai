# MoveNet 接入与真实视频验证

验证日期：2026-10-16，Asia/Shanghai。

## 结论

现有 MoveNet 模型能够作为**单人二维骨架时序生产者**接入当前 Cordis MVP。已完成本地文件接收 → 骨架识别 → 动作分析 → 评分建议的真实视频链路。

骨架提取与动作评价需要分别验收：本次 13 个视频都产出了骨架，12 个运动视频中 6 个满足当前规则的评分条件，6 个返回数据不足，另 1 个多人场景只做骨架测试。该结果证明接口和流程可运行，不能证明计数、姿态或评分准确率达标。

## 已核对的模型与运行环境

模型为 [movenet_lightning_fp16.tflite](../models/movenet_lightning_fp16.tflite)，从用户原后端复制，未改动原件。

| 项目 | 实测值 |
| --- | --- |
| 模型大小 | 4,758,512 字节 |
| SHA-256 | `0fac2226112d0371903ca86e3853cec24ef603a0b2f96f589b180f0ebdd135ab` |
| 输入 | RGB，`uint8 [1,192,192,3]`，像素范围 0–255 |
| 输出 | `float32 [1,1,17,3]`，每点为模型坐标中的 `[y,x,confidence]` |
| 模型运行时 | `ai-edge-litert 2.2.0`，CPU，2 线程 |
| Python | 3.13.12，复用已有后端虚拟环境执行测试 |
| 图像依赖 | NumPy 2.4.6、OpenCV Headless 5.0.0.93 |
| JavaScript 环境 | Node.js 24.21.0、Cordis 4.0.0-rc.11 |
| 采样频率 | 请求 10 FPS，使用解码器 PTS |
| 预处理版本 | `adaptive-crop-letterbox@0.1.0` |
| 动作规则版本 | `joint-cycle-squat@0.2.0` / `joint-cycle-push-up@0.2.0` |

`fp16` 文件名不等于输入使用 float16。模型具体上游发布编号未被独立确认，因此保存文件指纹。

采用自动视频旋转、首帧区域细化、后续人体区域自适应裁剪、RGB 补边缩放，并将输出还原到旋转后的原图像素坐标。置信度不足或越界关键点保留在骨架证据中，动作分析不使用它们。

## 素材与结果

输入为用户提供的 13 个本地 MP4，覆盖侧面、正面、远景、遮挡、多人和带 90° 旋转元数据的画面。[测试素材清单](../examples/video-test-set.json)的运动类型经抽帧查看后填写；目标次数统一为演示目标 5，并非逐次人工真值。

原始汇总见 [summary.json](../artifacts/video-evaluation-20261016-v2/summary.json)。下表链接到对应骨架或动作证据；短 ID 为原文件名的前 12 位。

| 视频 ID | 类型 | 采样帧 | 检出周期 | 评分或状态 |
| --- | --- | ---: | ---: | --- |
| [15a5b5775d4d](../artifacts/video-evaluation-20261016-v2/15a5b5775d4db2735579912adac7968f/motion.json) | 俯卧撑 | 108 | 0 | 当前周期规则未满足，未评分 |
| [2f2f0bc1ef82](../artifacts/video-evaluation-20261016-v2/2f2f0bc1ef82754fa31a1031c7ef54e5/motion.json) | 深蹲 | 142 | 2 | 56.38 |
| [3098ca849ef4](../artifacts/video-evaluation-20261016-v2/3098ca849ef45f5b71a4a21ca40475ff/poses.json) | 多人非专项场景 | 32 | — | 仅骨架提取 |
| [3cc74fcd9fd8](../artifacts/video-evaluation-20261016-v2/3cc74fcd9fd873d41b1c8212645ced05/motion.json) | 深蹲 | 138 | 0 | 当前周期规则未满足，未评分 |
| [592aeef1509e](../artifacts/video-evaluation-20261016-v2/592aeef1509e58d016020c9739e59889/motion.json) | 俯卧撑 | 101 | 0 | 当前周期规则未满足，未评分 |
| [631c726ae859](../artifacts/video-evaluation-20261016-v2/631c726ae859c444011c8e4a7a8cc1c4/motion.json) | 俯卧撑 | 98 | 5 | 74.70 |
| [740d89a06b3f](../artifacts/video-evaluation-20261016-v2/740d89a06b3fc047c58a748db8802777/motion.json) | 深蹲 | 104 | 0 | 当前周期规则未满足，未评分 |
| [b02eac6e65d8](../artifacts/video-evaluation-20261016-v2/b02eac6e65d85aaa8da29d6063200624/motion.json) | 俯卧撑 | 101 | 0 | 当前周期规则未满足，未评分 |
| [b2651023cb33](../artifacts/video-evaluation-20261016-v2/b2651023cb33324a55baf13aa6ae04a1/motion.json) | 深蹲 | 101 | 5 | 89.98 |
| [c2359a305399](../artifacts/video-evaluation-20261016-v2/c2359a305399c9b68c4bb3d4577cfaf2/motion.json) | 俯卧撑 | 83 | 3 | 53.32 |
| [e3fa40d65df9](../artifacts/video-evaluation-20261016-v2/e3fa40d65df96669ab56b86b0a626766/motion.json) | 俯卧撑 | 95 | 1 | 50.53 |
| [f477586e5d9b](../artifacts/video-evaluation-20261016-v2/f477586e5d9b359d090d1d954ef5a9a0/motion.json) | 深蹲 | 55 | 3 | 84.98 |
| [fff7f75993be](../artifacts/video-evaluation-20261016-v2/fff7f75993bebe8ac7542aa42571af67/motion.json) | 俯卧撑 | 96 | 1 | 该周期置信度不足 0.6，未评分 |

“0 个周期”仅指当前规则没有检出合格的时序片段，不等于视频没有运动。浅幅度、视角投影、未回到规定伸展位置、遮挡或低置信度都可能影响检出结果。

其中侧面深蹲检出 5 个周期并产出 89.98 分，另一侧面俯卧撑检出 5 个周期并产出 74.70 分。这些是演示规则的计算结果，不能据此评价动作达到了正式体测标准。

## 视觉证据

[骨架叠加图](../artifacts/video-evaluation-20261016-v2/pose-evidence.jpg)包含四个视频各自的关节角高点和低点，覆盖旋转后的竖屏、侧面深蹲、俯卧撑及未能评分的案例。骨架连线只显示两端置信度均不低于 0.3 的边。

已查看叠加图：主体骨架与画面中的肩、髋、膝、肘、腕等位置对应，旋转后坐标方向正确。该检查是样本视觉核对，不是关键点精度的人工标注评测。字幕角度是三帧中值后的运动特征，与当前帧原始关键点角度可能略有差异。

## 性能与验证范围

此次批测每个视频的平均模型调用时间约为每采样帧 10–22ms；首帧包括区域细化的额外推理。每段 3.2–14.2 秒的视频，完整文件链路耗时约 2.8–12.4 秒，包含模型加载、解码、预处理、JSON 校验及证据写入。运行期间有其他验证任务，因此这些数字不是受控性能基准，也不代表手机实时性能。

已执行：

```sh
pnpm check
```

类型检查、48 项 Node.js 测试、ESM 构建通过。覆盖骨架协议、完整/半次动作、浅动作、遮挡间隔、会话独立、服务替换、子进程超时/取消/并发、证据保存和原有 JSON 入口。

```sh
python -m unittest discover -s tests -p test_movenet_worker.py -v
```

在已配置的视觉环境下，6 项 Python 测试通过，覆盖 BGR→RGB、横竖画幅、非整数缩放、裁剪偏移、补边越界和非有限模型输出。

另外已执行真实命令行冒烟测试：源码入口完成深蹲识别与 89.98 分输出，构建后的 JavaScript 入口完成俯卧撑识别与 74.70 分输出，并分别保存中间证据。

## 自审与后续边界

自审检查了输入路径、原视频保护、时间轴、旋转与坐标恢复、置信度过滤、遮挡断帧、插件卸载、子进程清理、输出预算和证据文件覆盖。修复了周期门槛的浮点边界问题，并补充了对应遮挡回归。现有验证未发现阻止该 MVP 链路运行的问题。

尚未验证或尚不支持：

- 没有逐次动作和关键点的人工真值，不能报告准确率、漏检率或评分一致性。
- 二维投影角度对正面与侧面机位差异敏感，当前周期与幅度规则还需要按机位和动作标定。
- 远景、遮挡和多人场景无法保证目标人物稳定；SinglePose 不提供多人身份跟踪。
- 运动类型依赖显式参数，未实现动作类别自动识别或三维骨架。
- 文件入口当前为本地路径；未实现 HTTP 上传、实时摄像头或移动端推理。

下一步最有价值的验证是为这些视频标注动作起止、真实次数和机位，再固定相应机位上的动作规则与评分口径。

官方机制参考：[TensorFlow 姿态估计说明](https://www.tensorflow.org/lite/examples/pose_estimation/overview)、[MoveNet 教程](https://www.tensorflow.org/hub/tutorials/movenet)。
