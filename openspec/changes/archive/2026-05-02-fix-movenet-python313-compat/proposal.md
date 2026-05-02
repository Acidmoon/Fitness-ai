# Proposal: 修复 movenet/ 文件夹 Python 3.13 兼容性

## 动机

`movenet/` 文件夹的工具硬编码 `import tflite_runtime.interpreter as tflite`，但 `tflite-runtime` 在 PyPI 上没有 Python 3.13 的 wheel。项目当前运行 Python 3.13.13，捆绑的 `tflite_runtime-2.18.0-cp310-cp310-win_amd64.whl` 仅支持 Python 3.10。

## 方案

将 TFLite 解释器导入改为 fallback 链：`tflite_runtime` → `ai_edge_litert` → `tensorflow.lite`。

`ai-edge-litert`（2.1.4）是 Google 发布的 `tflite-runtime` 官方继任者，支持 Python 3.13，API 兼容。

同步更新后端 `app/services/pose_analysis_runtime.py` 中的 `_load_optional_dependencies()` 以保持一致。

## 影响范围

- `movenet/movenet_processor.py` — 导入方式
- `movenet/readme.md` — 文档
- `app/services/pose_analysis_runtime.py` — fallback 链
