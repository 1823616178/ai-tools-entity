<template>
  <div class="app-container">
    <NuxtRouteAnnouncer />
    <header class="app-header">
      <div class="header-main">
        <div>
          <h1>摘要生成</h1>
          <p class="subtitle">对齐文档 `POST /summary_generation`：输入文本列表，生成简洁连贯的摘要</p>
        </div>
        <NuxtLink to="/" class="back-link">← 返回首页</NuxtLink>
      </div>
    </header>

    <section class="api-section">
      <h2>输入参数</h2>
      <p class="desc">在下方添加多段文本，按顺序拼接后生成摘要</p>

      <!-- Text List Input -->
      <div class="form-group">
        <div class="text-list-header">
          <label>文本列表（text_list）<span class="req">*</span></label>
          <span class="text-count">{{ textList.length }} / 50</span>
        </div>

        <div v-for="(item, idx) in textList" :key="idx" class="text-item">
          <div class="text-item-header">
            <span class="text-item-index">{{ idx + 1 }}</span>
            <button
              class="btn-remove"
              :disabled="textList.length <= 1"
              @click="removeText(idx)"
              title="删除此项"
            >✕</button>
          </div>
          <textarea
            v-model="textList[idx]"
            :rows="3"
            :placeholder="`请输入第 ${idx + 1} 段文本...`"
          />
        </div>

        <button
          v-if="textList.length < 50"
          class="btn-add-text"
          @click="addText"
        >
          + 添加文本段落
        </button>
      </div>

      <!-- Max Length -->
      <div class="form-group">
        <label>摘要最大长度（max_length）</label>
        <div class="number-input-wrapper">
          <div class="slider-container">
            <input
              v-model.number="maxLength"
              type="range"
              min="50"
              max="500"
              step="10"
              class="number-slider"
            />
            <div class="slider-value">{{ maxLength }}</div>
          </div>
          <input
            v-model.number="maxLength"
            type="number"
            min="50"
            max="500"
            class="number-input"
          />
        </div>
        <div class="input-hint">范围 50-500 字，默认 200 字</div>
      </div>

      <!-- Stream Toggle -->
      <div class="form-group">
        <label>输出模式（stream）</label>
        <div class="toggle-group">
          <button
            :class="['toggle-btn', { active: !useStream }]"
            @click="useStream = false"
          >非流式</button>
          <button
            :class="['toggle-btn', { active: useStream }]"
            @click="useStream = true"
          >流式输出</button>
        </div>
        <div class="input-hint">{{ useStream ? '启用 SSE 流式输出，实时显示生成内容' : '一次性返回完整摘要结果' }}</div>
      </div>

      <!-- Action Buttons -->
      <div class="btn-row">
        <button class="btn-primary" :disabled="loading" @click="generate">
          <span v-if="loading" class="spinner"></span>
          {{ loading ? '生成中...' : '生成摘要' }}
        </button>
        <button v-if="loading && useStream" class="btn-warn" @click="abort">停止</button>
        <button class="btn-ghost" :disabled="loading" @click="reset">清空</button>
      </div>
    </section>

    <!-- Error Display -->
    <section v-if="error" class="api-section result-section">
      <h2>错误信息</h2>
      <div class="error-msg">{{ error }}</div>
    </section>

    <!-- Non-Streaming Result -->
    <section v-if="!useStream && summary" class="api-section result-section">
      <h2>摘要结果</h2>
      <div class="status-row">
        <span class="status-badge ok">code: 200</span>
        <span class="msg-text">message: success</span>
      </div>
      <div class="result-box">
        <h3>summary</h3>
        <div class="result-content">{{ summary }}</div>
      </div>
      <details>
        <summary>查看完整 JSON</summary>
        <pre class="json-output">{{ fullJson }}</pre>
      </details>
    </section>

    <!-- Streaming Result -->
    <section v-if="useStream && hasStreamOutput" class="api-section result-section">
      <h2>流式摘要结果<span v-if="loading" class="live-dot">● 实时</span></h2>

      <!-- Status -->
      <div v-if="streamStarted" class="status-row">
        <span class="status-badge ok">code: 200</span>
        <span class="msg-text">流式接收中...</span>
      </div>

      <!-- Answer / Summary -->
      <div v-if="streamSummary" class="result-box">
        <h3>summary<span v-if="loading && !streamDone" class="caret">▋</span></h3>
        <div class="result-content">{{ streamSummary }}</div>
      </div>

      <!-- Final Result -->
      <div v-if="streamResult" class="result-box final-result">
        <h3>最终结果</h3>
        <div class="result-content">{{ streamResult.summary }}</div>
        <div class="result-meta">
          <span>字数: {{ streamResult.summary.length }}</span>
        </div>
      </div>

      <!-- Raw SSE Events -->
      <details v-if="rawEvents.length">
        <summary>查看原始 SSE 事件（{{ rawEvents.length }} 条）</summary>
        <pre class="json-output">{{ rawDump }}</pre>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
// 文本列表
const textList = ref<string[]>([''])

// 参数
const maxLength = ref(200)
const useStream = ref(false)

// 状态
const loading = ref(false)
const error = ref('')

// 非流式响应
const summary = ref('')

// 流式响应
const streamStarted = ref(false)
const streamSummary = ref('')
const streamResult = ref<{ code: number; message: string; summary: string } | null>(null)
const streamDone = ref(false)
const rawEvents: Array<{ event: string; data: string }> = []

// 控制器
let controller: AbortController | null = null

const hasStreamOutput = computed(() =>
  loading.value || streamStarted.value || streamSummary.value || streamResult.value,
)

const fullJson = computed(() =>
  JSON.stringify(
    {
      code: 200,
      message: 'success',
      summary: summary.value,
    },
    null,
    2,
  ),
)

const rawDump = computed(() =>
  rawEvents.map(e => (e.event ? `event: ${e.event}\n` : '') + `data: ${e.data}`).join('\n\n'),
)

function addText() {
  if (textList.value.length < 50) {
    textList.value.push('')
  }
}

function removeText(idx: number) {
  if (textList.value.length > 1) {
    textList.value.splice(idx, 1)
  }
}

function reset() {
  textList.value = ['']
  maxLength.value = 200
  useStream.value = false
  summary.value = ''
  error.value = ''
  streamStarted.value = false
  streamSummary.value = ''
  streamResult.value = null
  streamDone.value = false
  rawEvents.length = 0
}

function abort() {
  if (controller) {
    controller.abort()
    controller = null
  }
}

async function generate() {
  // 验证输入
  const filteredList = textList.value.map(t => t.trim()).filter(t => t.length > 0)
  if (filteredList.length === 0) {
    error.value = '错误：请至少输入一段文本'
    return
  }

  // 重置状态
  error.value = ''
  summary.value = ''
  streamStarted.value = false
  streamSummary.value = ''
  streamResult.value = null
  streamDone.value = false
  rawEvents.length = 0

  loading.value = true

  if (useStream.value) {
    await generateStream(filteredList)
  } else {
    await generateNormal(filteredList)
  }
}

async function generateNormal(texts: string[]) {
  try {
    const res = await $fetch<{ code: number; message: string; summary: string }>('/summary_generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        text_list: texts,
        max_length: maxLength.value,
        stream: false,
      },
    })

    if (res.code === 200) {
      summary.value = res.summary
    } else {
      error.value = res.message
    }
  } catch (e: any) {
    error.value = e?.message || e?.data?.message || '请求失败'
  } finally {
    loading.value = false
  }
}

function handleBlock(block: string) {
  const lines = block.split('\n')
  let eventName = ''
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.replace(/^data:\s?/, ''))
  }

  if (!eventName && !dataLines.length) return

  const dataStr = dataLines.join('\n')
  rawEvents.push({ event: eventName, data: dataStr })

  // Handle markers
  const trimmed = dataStr.trim()
  if (!trimmed) return
  if (trimmed === '[START]') {
    streamStarted.value = true
    return
  }
  if (trimmed === '[DONE]') {
    streamDone.value = true
    return
  }

  // Parse JSON events
  let obj: any
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return
  }

  switch (obj.type) {
    case 'answer':
      streamSummary.value += obj.value ?? ''
      break
    case 'result':
      streamResult.value = obj.value
      streamSummary.value = obj.value?.summary ?? streamSummary.value
      break
    case 'error':
      error.value = obj.value ?? '生成出错'
      break
  }
}

async function generateStream(texts: string[]) {
  abort()
  controller = new AbortController()

  try {
    const res = await fetch('/summary_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        text_list: texts,
        max_length: maxLength.value,
        stream: true,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      error.value = `请求失败（HTTP ${res.status}）`
      return
    }

    if (!res.body) {
      error.value = '响应体为空'
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleBlock(block)
      }
    }

    if (buffer.trim()) handleBlock(buffer)
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      error.value = e?.message || '请求异常'
    }
  } finally {
    loading.value = false
    controller = null
  }
}

onBeforeUnmount(() => abort())
</script>

<style scoped>
.app-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 16px 60px;
}

.app-header {
  padding: 32px 0 24px;
}

.header-main {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

h1 {
  color: #1f2937;
  font-size: 32px;
  margin-bottom: 8px;
}

.subtitle,
.desc {
  color: #6b7280;
}

.back-link {
  color: #2563eb;
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 8px;
  background: #eff6ff;
  white-space: nowrap;
}

.api-section {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.api-section h2 {
  margin-bottom: 8px;
  color: #1f2937;
}

.form-group {
  margin-top: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #374151;
}

.req {
  color: #dc2626;
}

/* Text List */
.text-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.text-count {
  font-size: 12px;
  color: #9ca3af;
  font-weight: 400;
}

.text-item {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.text-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.text-item-index {
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  border-radius: 50%;
}

.btn-remove {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  border-radius: 4px;
  transition: background 0.2s;
}

.btn-remove:hover:not(:disabled) {
  background: #fee2e2;
}

.btn-remove:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-add-text {
  display: block;
  width: 100%;
  padding: 12px;
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  background: #f9fafb;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-text:hover {
  border-color: #2563eb;
  color: #2563eb;
  background: #eff6ff;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
}

textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

/* Number Input */
.number-input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-container {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.number-slider {
  flex: 1;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: #e0e0e0;
  border-radius: 4px;
  outline: none;
}

.number-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2563eb;
  cursor: pointer;
}

.number-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: #2563eb;
  cursor: pointer;
}

.slider-value {
  min-width: 40px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #2563eb;
  background: #eff6ff;
  padding: 4px 8px;
  border-radius: 6px;
}

.number-input {
  width: 70px;
  padding: 8px 12px;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  text-align: center;
}

.number-input:focus {
  outline: none;
  border-color: #2563eb;
}

.input-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
}

/* Toggle */
.toggle-group {
  display: flex;
  gap: 8px;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 4px;
  width: fit-content;
}

.toggle-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.active {
  background: #2563eb;
  color: #fff;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
}

/* Buttons */
.btn-row {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn-primary,
.btn-ghost,
.btn-warn {
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 14px;
  cursor: pointer;
}

.btn-primary {
  color: #fff;
  background: #2563eb;
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-ghost {
  color: #374151;
  background: #f3f4f6;
}

.btn-warn {
  color: #fff;
  background: #ef4444;
}

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-msg {
  margin-top: 16px;
  padding: 12px;
  color: #991b1b;
  background: #fee2e2;
  border-radius: 8px;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
}

.status-badge.ok {
  color: #166534;
  background: #dcfce7;
}

.status-badge.fail {
  color: #991b1b;
  background: #fee2e2;
}

.msg-text {
  color: #374151;
}

.result-box {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.result-box h3 {
  margin-bottom: 10px;
}

.result-content {
  white-space: pre-wrap;
  line-height: 1.8;
}

.result-meta {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  font-size: 13px;
  color: #6b7280;
}

.final-result {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.caret {
  color: #2563eb;
  animation: blink 1s step-start infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.live-dot {
  font-size: 12px;
  color: #52c41a;
  font-weight: 500;
  animation: blink 1s ease-in-out infinite;
}

.json-output {
  margin-top: 12px;
  padding: 12px;
  background: #111827;
  color: #e5e7eb;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

details {
  margin-top: 8px;
}

details summary {
  cursor: pointer;
  color: #666;
  font-size: 13px;
}
</style>
