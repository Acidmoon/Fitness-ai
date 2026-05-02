# Design: movenet/ Python 3.13 兼容性修复

## 当前状态

```
movenet_processor.py:9:  import tflite_runtime.interpreter as tflite  ← 硬编码，仅 cp310
backend:                 tflite_runtime → tensorflow.lite              ← 缺少 ai_edge_litert
```

## 目标状态

```
movenet_processor.py:  tflite_runtime → ai_edge_litert → tensorflow.lite
backend:               tflite_runtime → ai_edge_litert → tensorflow.lite
```

两边使用一致的 fallback 链。

## API 兼容性

`ai_edge_litert.interpreter.Interpreter` 的 API 与 `tflite_runtime.interpreter.Interpreter` 兼容：
- `Interpreter(model_path=...)` 构造
- `allocate_tensors()`
- `get_input_details()` / `get_output_details()`
- `set_tensor(index, data)` / `get_tensor(index)`
- `invoke()`

movenet_processor.py 通过 `tflite.Interpreter` 使用，只需模块别名指向正确的包即可。

## 不变更项

- `movenet/` 仍为 gitignored 本地沙盒
- CLI 工具业务逻辑不动
- 不引入新的 setup.py/pyproject.toml
