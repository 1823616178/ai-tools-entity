# hj大模型接口说明

> 本文档为 LLM 推理服务的 Chat 接口说明

---

## 接口概述

该接口为基于 Flask 搭建的 LLM 推理服务的核心交互接口，支持通过 JSON 格式发送文本提示词（prompt），获取大模型的推理回复。

## 基本信息

| 项目 | 说明 |
|------|------|
| 请求路径 | `/chat` |
| 请求方法 | `POST` |
| Content-Type | `application/json`（必须） |

## 请求参数

请求体为 JSON 结构，仅包含 `prompt` 一个核心字段。

### 字段说明

| 字段名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| prompt | string | 是 | 大模型的输入提示词，不能为空字符串；服务端会自动去除首尾空格后处理 |

### 请求示例

```json
{
  "prompt": "请解释一下人工智能的核心原理"
}
```

## 响应参数

响应体为统一的 JSON 结构，包含 `code`（状态码）、`msg`（提示信息）、`data`（返回数据）三个字段。

### 响应示例

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": "人工智能的核心原理主要包括数据驱动、算法模型、计算能力三大维度..."
}
```

### 字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| code | int | 响应状态码：<br>• `200` - 推理成功<br>• `400` - 请求参数/格式错误<br>• `500` - 模型推理异常 |
| msg | string | 响应提示信息：成功时返回"操作成功"，失败时返回具体错误原因（如"参数'prompt'不能为空"） |
| data | string | 成功时返回模型推理的文本结果；失败时返回 `null` |

### 响应状态码说明

> **注意**：接口 HTTP 状态码始终返回 `200`，业务结果需以响应体中的 `code` 字段为准。

| 状态码 | 对应场景 |
|--------|----------|
| 200 | 业务层面的成功响应（即使 HTTP 状态码为 200，code 非 200 仍代表业务失败） |
| 400 | 1. 请求 Content-Type 非 `application/json`<br>2. JSON 解析失败<br>3. prompt 缺失/为空字符串 |
| 500 | 模型推理过程中出现异常 |

## 调用示例

### 1. cURL 示例

```bash
curl -X POST http://{服务IP}:{端口}/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "你好，请介绍一下模型的特点"
  }'
```

### 2. Python requests 示例

```python
import requests
import json

# 服务地址（根据实际部署修改）
url = "http://127.0.0.1:16002/chat"

# 请求头
headers = {"Content-Type": "application/json"}

# 请求体
data = {
    "prompt": "你好，请介绍一下模型的特点"
}

# 发送请求
response = requests.post(url, headers=headers, json=data)

# 解析响应
result = response.json()
print(f"状态码: {result['code']}")
print(f"提示信息: {result['msg']}")

if result['code'] == 200:
    print(f"模型回复: {result['data']}")
else:
    print(f"请求失败: {result['msg']}")
```
