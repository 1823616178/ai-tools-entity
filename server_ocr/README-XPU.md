# PaddleOCR Intel GPU 本地适配说明（Intel Arc A770 / Data Center GPU Flex / Max）

本项目已预留 Intel GPU 适配能力，基于 [PaddleCustomDevice intel_gpu 后端](https://github.com/PaddlePaddle/PaddleCustomDevice/blob/develop/backends/intel_gpu/README.md)。

**注意**：当前服务默认在本地（非 Docker）运行。

## 支持的硬件

| 硬件 | 说明 |
|---|---|
| Intel Arc A770 | 消费级独立显卡 |
| Intel Data Center GPU Flex | 数据中心级 GPU |
| Intel Data Center GPU Max | 数据中心级 GPU |

## 前置条件

1. **操作系统**：Ubuntu 20.04 / 22.04 / 24.04（推荐）
2. **驱动**：已安装 Intel GPU 驱动（i915 / xe）
3. **Runtime**：已安装 Intel oneAPI Base Toolkit
4. **Python**：3.10 或 3.11
5. **PaddlePaddle**：CPU develop 版本 + 自定义编译 `paddle_custom_intel_gpu`

## 本地启用 Intel GPU 步骤

### 1. 安装 oneAPI Base Toolkit

参考 Intel 官方文档：https://www.intel.com/content/www/us/en/developer/tools/oneapi/base-toolkit.html

安装后激活环境：

```bash
source /opt/intel/oneapi/setvars.sh
```

### 2. 克隆 PaddleCustomDevice 源码

```bash
git clone --recursive https://github.com/PaddlePaddle/PaddleCustomDevice
cd PaddleCustomDevice
git submodule sync
git submodule update --remote --init --recursive
```

### 3. 安装 PaddlePaddle CPU develop 版本

```bash
python -m pip install paddlepaddle==0.0.0 -f https://www.paddlepaddle.org.cn/whl/linux/cpu-mkl/develop.html
```

### 4. 编译安装 paddle_custom_intel_gpu 插件

```bash
cd backends/intel_gpu

# 激活 oneAPI 环境（如果 load.sh 存在，优先使用）
test -f load.sh && source load.sh

mkdir build && cd build
cmake ..
make -j $(nproc)
python -m pip install dist/paddle_custom_intel_gpu*.whl
```

### 5. 验证插件安装

```bash
python -c "import paddle; print('intel_gpu' in paddle.device.get_all_custom_device_type())"
# 应输出 True
```

### 6. 配置 OCR 服务环境变量

编辑项目根目录 `.env` 文件：

```env
PADDLE_OCR_URL=http://localhost:8000/ocr
OCR_USE_XPU=true
OCR_USE_GPU=true
SYCL_DEVICE_FILTER=level_zero:gpu
ONEAPI_DEVICE_SELECTOR=level_zero:gpu
ZE_AFFINITY_MASK=0
```

### 7. 启动 OCR 服务

```bash
cd server_ocr
python main.py
```

或者使用根目录启动脚本：

```bash
./start-ocr.sh
```

> 提示：`server_ocr/Dockerfile.xpu` 仅作为容器化参考，当前服务默认本地运行。

启动成功后，日志中应出现：

```
启用 XPU (Intel GPU) 加速
可用的 custom device 类型: ['intel_gpu']
已设置 paddle device 为 intel_gpu
```

## 验证 Intel GPU 是否被使用

在 `server_ocr` 目录下执行：

```bash
python -c "import paddle; print(paddle.device.get_all_custom_device_type())"
```

应输出包含 `intel_gpu` 的列表。

## 常见问题

### 1. XPU 未生效，仍走 CPU

- 检查插件是否安装成功：`python -c "import paddle; print('intel_gpu' in paddle.device.get_all_custom_device_type())"`
- 检查 `OCR_USE_XPU` 是否设置为 `true`
- 检查 oneAPI 环境变量是否已加载

### 2. 编译失败

- 确认 oneAPI 环境已激活
- 确认 cmake、build-essential 已安装
- 查看 PaddleCustomDevice 官方 issue：https://github.com/PaddlePaddle/PaddleCustomDevice/issues

### 3. 启动脚本找不到 Intel GPU

确保运行启动脚本前已激活 oneAPI：

```bash
source /opt/intel/oneapi/setvars.sh
./start-ocr.sh
```
