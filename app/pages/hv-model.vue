<template>
  <div class="app-container">
    <NuxtRouteAnnouncer />
    <header class="app-header">
      <div class="header-main">
        <div>
          <h1>HV大模型模块</h1>
          <p class="subtitle">对齐文档 `/chat`：输入 prompt，返回 code / msg / data</p>
        </div>
        <NuxtLink to="/" class="back-link">← 返回首页</NuxtLink>
      </div>
    </header>

    <section class="api-section">
      <h2>Chat 推理</h2>
      <p class="desc">
        本模块不调用文档中的外部地址，而是在当前服务内实现相同的传参和出参结构。
      </p>

      <div class="form-group">
        <label>prompt <span class="req">*</span></label>
        <textarea
          v-model="form.prompt"
          rows="8"
          placeholder="请解释一下人工智能的核心原理"
        />
      </div>

      <div class="btn-row">
        <button class="btn-primary" :disabled="form.loading" @click="submit">
          <span v-if="form.loading" class="spinner"></span>
          {{ form.loading ? '推理中...' : '发送请求' }}
        </button>
        <button class="btn-ghost" :disabled="form.loading" @click="reset">清空</button>
      </div>

      <div v-if="form.error" class="error-msg">{{ form.error }}</div>
    </section>

    <section v-if="form.response" class="api-section result-section">
      <h2>响应结果</h2>

      <div class="status-row">
        <span :class="['status-badge', form.response.code === 200 ? 'ok' : 'fail']">
          code: {{ form.response.code }}
        </span>
        <span class="msg-text">msg: {{ form.response.msg }}</span>
      </div>

      <div v-if="form.response.data" class="result-box">
        <h3>data</h3>
        <div class="result-content">{{ form.response.data }}</div>
      </div>

      <details>
        <summary>查看完整 JSON</summary>
        <pre class="json-output">{{ JSON.stringify(form.response, null, 2) }}</pre>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
type HvChatResponse = {
  code: number
  msg: string
  data: string | null
}

const form = reactive({
  prompt: '请解释一下人工智能的核心原理',
  loading: false,
  error: '',
  response: null as HvChatResponse | null,
})

async function submit() {
  form.error = ''
  form.response = null

  if (!form.prompt.trim()) {
    form.response = {
      code: 400,
      msg: "参数'prompt'不能为空",
      data: null,
    }
    return
  }

  form.loading = true
  try {
    form.response = await $fetch<HvChatResponse>('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        prompt: form.prompt,
      },
    })
  } catch (error: any) {
    form.error = error?.message || '请求失败'
  } finally {
    form.loading = false
  }
}

function reset() {
  form.prompt = ''
  form.error = ''
  form.response = null
}
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

.btn-row {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn-primary,
.btn-ghost {
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

.json-output {
  margin-top: 12px;
  padding: 12px;
  background: #111827;
  color: #e5e7eb;
  border-radius: 8px;
  overflow-x: auto;
}
</style>
