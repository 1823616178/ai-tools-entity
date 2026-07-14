<template>
    <div class="doc-q-page">
        <header class="page-header">
            <div class="header-inner">
                <div class="header-title">
                    <div class="title-icon">💡</div>
                    <div>
                        <h1>文件问题推荐</h1>
                        <p class="header-subtitle">基于文件内容生成推荐问题 · 支持流式 / 非流式</p>
                    </div>
                </div>
                <NuxtLink to="/" class="back-link">
                    <span class="back-arrow">←</span>
                    <span>返回首页</span>
                </NuxtLink>
            </div>
        </header>

        <main class="page-main">
            <!-- 输入区域 -->
            <section class="card input-card">
                <div class="card-header">
                    <span class="card-icon">📄</span>
                    <h2>文件文本</h2>
                    <span class="doc-count">{{ documents.length }} / 50</span>
                </div>

                <div class="doc-list">
                    <div v-for="(doc, idx) in documents" :key="doc.id" class="doc-item">
                        <div class="doc-item-head">
                            <span class="doc-index">文件 {{ idx + 1 }}</span>
                            <input v-model="doc.fileName" class="doc-name-input" type="text"
                                :placeholder="`文件${idx + 1}（可选文件名）`" />
                            <button class="btn-remove" :disabled="documents.length <= 1" title="移除该文件"
                                @click="removeDocument(idx)">✕</button>
                        </div>
                        <textarea v-model="doc.text" class="doc-text-input" rows="5"
                            placeholder="粘贴应用端解析后的纯文本内容..."></textarea>
                    </div>
                </div>

                <div class="input-actions">
                    <button class="btn-secondary" :disabled="documents.length >= 50" @click="addDocument">
                        <span>＋</span><span>添加文件</span>
                    </button>
                    <button class="btn-secondary" @click="triggerFilePick">
                        <span>📁</span><span>导入文本文件</span>
                    </button>
                    <input ref="fileInput" type="file" accept=".txt,.md,.csv,text/*" multiple style="display:none"
                        @change="handleFilePick" />
                    <button class="btn-secondary" @click="loadDemo">
                        <span>✨</span><span>填入示例</span>
                    </button>
                </div>
            </section>

            <!-- 参数区域 -->
            <section class="card param-card">
                <div class="card-header">
                    <span class="card-icon">⚙️</span>
                    <h2>参数</h2>
                </div>
                <div class="param-body">
                    <div class="param-group">
                        <label>推荐问题数量（{{ MIN_COUNT }}-{{ MAX_COUNT }}）</label>
                        <div class="count-row">
                            <input v-model.number="questionCount" type="range" :min="MIN_COUNT" :max="MAX_COUNT"
                                step="1" class="count-slider" />
                            <span class="count-value">{{ questionCount }}</span>
                        </div>
                    </div>
                    <div class="param-group">
                        <label>输出模式</label>
                        <div class="mode-toggle">
                            <button :class="['mode-btn', { active: !useStream }]" @click="useStream = false">
                                非流式 JSON
                            </button>
                            <button :class="['mode-btn', { active: useStream }]" @click="useStream = true">
                                流式 SSE
                            </button>
                        </div>
                    </div>
                </div>

                <div class="run-row">
                    <button class="btn-primary" :disabled="loading || !hasValidDocument" @click="handleRun">
                        <span v-if="loading" class="spinner"></span>
                        <span v-else>🚀</span>
                        <span>{{ loading ? '生成中...' : '生成推荐问题' }}</span>
                    </button>
                    <button v-if="loading && useStream" class="btn-ghost" @click="abort">停止</button>
                </div>

                <div v-if="error" class="error-toast">
                    <span class="error-icon">⚠</span>
                    <span>{{ error }}</span>
                </div>
            </section>

            <!-- 流式实时输出 -->
            <section v-if="useStream && (stream.answer || stream.started)" class="card stream-card">
                <div class="card-subheader">
                    <span class="subheader-line"></span>
                    <span class="subheader-text">模型实时输出</span>
                    <span class="subheader-line"></span>
                </div>
                <pre class="stream-answer">{{ stream.answer || '（等待模型输出...）' }}</pre>
            </section>

            <!-- 推荐问题结果 -->
            <section v-if="recommended.length" class="card result-card">
                <div class="result-head">
                    <h3>推荐问题（{{ recommended.length }} 条）</h3>
                    <button class="btn-secondary" @click="copyQuestions">📋 复制</button>
                </div>
                <ol class="question-list">
                    <li v-for="(q, idx) in recommended" :key="idx">{{ q }}</li>
                </ol>
            </section>

            <!-- 原始事件（流式调试） -->
            <section v-if="useStream && stream.rawEvents.length" class="card">
                <details class="raw-block">
                    <summary>查看原始 SSE 事件（{{ stream.rawEvents.length }} 条）</summary>
                    <pre class="raw-output">{{ rawEventsText }}</pre>
                </details>
            </section>
        </main>
    </div>
</template>

<script setup lang="ts">
interface DocItem {
    id: number
    fileName: string
    text: string
}

interface RecommendResult {
    code: number
    message: string
    recommended_questions: string[]
}

const MIN_COUNT = 1
const MAX_COUNT = 10

let docSeq = 0
function makeDoc(fileName = '', text = ''): DocItem {
    return { id: ++docSeq, fileName, text }
}

const documents = ref<DocItem[]>([makeDoc()])
const questionCount = ref(3)
const useStream = ref(false)
const loading = ref(false)
const error = ref('')
const recommended = ref<string[]>([])

const fileInput = ref<HTMLInputElement | null>(null)

const stream = reactive({
    started: false,
    done: false,
    answer: '',
    rawEvents: [] as Array<{ event: string; data: string }>,
})

let controller: AbortController | null = null

const hasValidDocument = computed(() => documents.value.some((d) => d.text.trim().length > 0))
const rawEventsText = computed(() =>
    stream.rawEvents.map((e) => `${e.event ? `event: ${e.event}\n` : ''}data: ${e.data}`).join('\n\n'),
)

function addDocument() {
    if (documents.value.length >= 50) return
    documents.value.push(makeDoc())
}

function removeDocument(idx: number) {
    if (documents.value.length <= 1) return
    documents.value.splice(idx, 1)
}

function triggerFilePick() {
    fileInput.value?.click()
}

function handleFilePick(e: Event) {
    const files = (e.target as HTMLInputElement).files
    if (!files || !files.length) return

    Array.from(files).forEach((file) => {
        const reader = new FileReader()
        reader.onload = () => {
            const text = String(reader.result ?? '')
            const empty = documents.value.find((d) => !d.text.trim() && !d.fileName.trim())
            if (empty) {
                empty.fileName = file.name
                empty.text = text
            } else if (documents.value.length < 50) {
                documents.value.push(makeDoc(file.name, text))
            }
        }
        reader.readAsText(file)
    })

    if (fileInput.value) fileInput.value.value = ''
}

function loadDemo() {
    documents.value = [
        makeDoc('故宫简介.txt', '故宫博物院，旧称紫禁城，位于北京市中心，是中国明清两代的皇家宫殿。'),
        makeDoc('建筑规模.txt', '故宫占地面积72万平方米，建筑面积约15万平方米，共有大小宫殿七十余座。'),
    ]
    questionCount.value = 3
}

function buildDocumentsPayload() {
    return documents.value
        .filter((d) => d.text.trim().length > 0)
        .map((d) => {
            const fileName = d.fileName.trim()
            return fileName ? { file_name: fileName, text: d.text } : { text: d.text }
        })
}

function resetResult() {
    error.value = ''
    recommended.value = []
    stream.started = false
    stream.done = false
    stream.answer = ''
    stream.rawEvents = []
}

async function handleRun() {
    if (loading.value) return
    resetResult()

    const payloadDocs = buildDocumentsPayload()
    if (!payloadDocs.length) {
        error.value = '请至少填写一个文件的文本内容'
        return
    }

    const body = {
        documents: payloadDocs,
        question_count: questionCount.value,
        stream: useStream.value,
    }

    loading.value = true
    try {
        if (useStream.value) {
            await runStream(body)
        } else {
            await runNonStream(body)
        }
    } finally {
        loading.value = false
    }
}

async function runNonStream(body: Record<string, unknown>) {
    try {
        const res = await $fetch<RecommendResult>('/document_recommended_questions', {
            method: 'POST',
            body,
        })
        if (res.code === 200) {
            recommended.value = Array.isArray(res.recommended_questions) ? res.recommended_questions : []
        } else {
            error.value = res.message || '生成失败'
        }
    } catch (e: any) {
        error.value = e?.data?.message || e?.message || '请求异常'
    }
}

async function runStream(body: Record<string, unknown>) {
    abort()
    controller = new AbortController()

    try {
        const res = await fetch('/document_recommended_questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify(body),
            signal: controller.signal,
        })

        // 参数错误在生成前返回 JSON 400
        const contentType = res.headers.get('content-type') || ''
        if (!contentType.includes('text/event-stream')) {
            const json = await res.json().catch(() => null)
            error.value = json?.message || `请求失败（HTTP ${res.status}）`
            return
        }
        if (!res.body) {
            error.value = `请求失败（HTTP ${res.status}）`
            return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            let idx
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
                const block = buffer.slice(0, idx)
                buffer = buffer.slice(idx + 2)
                handleBlock(block)
            }
        }
        if (buffer.trim()) handleBlock(buffer)
    } catch (e: any) {
        if (e?.name !== 'AbortError') error.value = e?.message || '请求异常'
    } finally {
        stream.done = true
        controller = null
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
    const dataStr = dataLines.join('\n')
    if (!eventName && !dataStr) return
    stream.rawEvents.push({ event: eventName, data: dataStr })

    const trimmed = dataStr.trim()
    if (trimmed === '[START]') {
        stream.started = true
        return
    }
    if (trimmed === '[DONE]') return

    let obj: any
    try {
        obj = JSON.parse(trimmed)
    } catch {
        return
    }

    switch (obj.type) {
        case 'answer':
            stream.answer += obj.value ?? ''
            break
        case 'reason':
            // 思维增量此处不单独展示
            break
        case 'result': {
            const value = obj.value as RecommendResult | undefined
            if (value?.code === 200 && Array.isArray(value.recommended_questions)) {
                recommended.value = value.recommended_questions
            } else if (value && value.code !== 200) {
                error.value = value.message || '生成失败'
            }
            break
        }
        case 'error':
            error.value = obj.value ?? '生成出错'
            break
        default:
            break
    }
}

function abort() {
    if (controller) {
        controller.abort()
        controller = null
    }
}

async function copyQuestions() {
    if (!recommended.value.length) return
    const text = recommended.value.map((q, i) => `${i + 1}. ${q}`).join('\n')
    try {
        await navigator.clipboard.writeText(text)
        alert('已复制到剪贴板')
    } catch {
        alert('复制失败，请手动选择复制')
    }
}

onBeforeUnmount(abort)
</script>

<style scoped>
.doc-q-page {
    min-height: 100vh;
    background: #f0f2f5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif;
    color: #333;
}

.page-header {
    background: linear-gradient(135deg, #1a2980 0%, #26306b 60%, #1a1a2e 100%);
    color: #fff;
    padding: 28px 32px;
    box-shadow: 0 4px 20px rgba(26, 41, 128, 0.2);
}

.header-inner {
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
}

.header-title {
    display: flex;
    align-items: center;
    gap: 16px;
}

.title-icon {
    font-size: 38px;
}

.page-header h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 1px;
}

.header-subtitle {
    margin: 6px 0 0;
    font-size: 13px;
    color: #cdd4f5;
}

.back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #fff;
    text-decoration: none;
    padding: 8px 16px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 6px;
    font-size: 14px;
    transition: all 0.2s;
}

.back-link:hover {
    background: rgba(255, 255, 255, 0.12);
}

.page-main {
    max-width: 960px;
    margin: 0 auto;
    padding: 28px 20px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;
}

.card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    background: #f7f8fc;
    border-bottom: 1px solid #eef0f5;
}

.card-header h2 {
    margin: 0;
    font-size: 17px;
    color: #1a1a2e;
    font-weight: 600;
}

.card-icon {
    font-size: 20px;
}

.doc-count {
    margin-left: auto;
    font-size: 12px;
    color: #888;
    background: #eef0f5;
    padding: 3px 10px;
    border-radius: 10px;
}

.doc-list {
    padding: 16px 20px 4px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.doc-item {
    border: 1px solid #e8eaf0;
    border-radius: 10px;
    padding: 12px;
    background: #fafbfe;
}

.doc-item-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}

.doc-index {
    font-size: 12px;
    font-weight: 600;
    color: #1a2980;
    background: #eaf0ff;
    padding: 4px 10px;
    border-radius: 6px;
    white-space: nowrap;
}

.doc-name-input {
    flex: 1;
    padding: 8px 12px;
    border: 1.5px solid #e0e0e0;
    border-radius: 8px;
    font-size: 13px;
    background: #fff;
}

.doc-name-input:focus {
    outline: none;
    border-color: #1a2980;
}

.btn-remove {
    width: 30px;
    height: 30px;
    border: none;
    background: #fff0f0;
    color: #e15b5b;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
}

.btn-remove:hover:not(:disabled) {
    background: #ffe0e0;
}

.btn-remove:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.doc-text-input {
    width: 100%;
    padding: 10px 12px;
    border: 1.5px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
    background: #fff;
}

.doc-text-input:focus {
    outline: none;
    border-color: #1a2980;
}

.input-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 16px 20px 20px;
}

.btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #fff;
    color: #1a2980;
    border: 1px solid #c3ccf0;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
    background: #f0f4ff;
    border-color: #1a2980;
}

.btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.param-body {
    padding: 18px 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 28px;
}

.param-group {
    flex: 1;
    min-width: 220px;
}

.param-group label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #555;
    margin-bottom: 10px;
}

.count-row {
    display: flex;
    align-items: center;
    gap: 14px;
}

.count-slider {
    flex: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: #e0e0e0;
    border-radius: 3px;
    outline: none;
}

.count-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #1a2980;
    cursor: pointer;
}

.count-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: #1a2980;
    cursor: pointer;
}

.count-value {
    min-width: 32px;
    text-align: center;
    font-weight: 700;
    color: #1a2980;
    background: #eef1fb;
    padding: 4px 8px;
    border-radius: 6px;
}

.mode-toggle {
    display: inline-flex;
    border: 1px solid #c3ccf0;
    border-radius: 8px;
    overflow: hidden;
}

.mode-btn {
    padding: 9px 18px;
    border: none;
    background: #fff;
    color: #555;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
}

.mode-btn.active {
    background: #1a2980;
    color: #fff;
}

.run-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 20px 20px;
}

.btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 28px;
    background: #1a2980;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
    background: #26306b;
}

.btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.btn-ghost {
    padding: 10px 18px;
    background: transparent;
    color: #e15b5b;
    border: 1px solid #f0c3c3;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
}

.btn-ghost:hover {
    background: #fff0f0;
}

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.error-toast {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 20px 20px;
    padding: 12px 16px;
    background: #fff2f0;
    color: #cf1322;
    border-radius: 8px;
    border-left: 4px solid #cf1322;
    font-size: 14px;
}

.stream-card,
.result-card {
    padding: 20px;
}

.card-subheader {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
}

.subheader-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, #c3ccf0, transparent);
}

.subheader-text {
    font-size: 13px;
    color: #888;
    letter-spacing: 1px;
}

.stream-answer {
    margin: 0;
    padding: 16px;
    background: #f7f8fc;
    border: 1px solid #eef0f5;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.9;
    white-space: pre-wrap;
    word-break: break-word;
    color: #333;
}

.result-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
}

.result-head h3 {
    margin: 0;
    font-size: 16px;
    color: #1a1a2e;
}

.question-list {
    margin: 0;
    padding-left: 22px;
}

.question-list li {
    margin-bottom: 10px;
    line-height: 1.8;
    font-size: 15px;
    color: #2a2a3a;
}

.raw-block summary {
    cursor: pointer;
    color: #666;
    font-size: 13px;
    padding: 16px 20px;
}

.raw-output {
    margin: 0;
    padding: 16px 20px;
    background: #1e1e1e;
    color: #d4d4d4;
    font-size: 12px;
    line-height: 1.6;
    overflow-x: auto;
}

@media (max-width: 640px) {
    .page-header {
        padding: 20px 16px;
    }

    .header-inner {
        flex-direction: column;
        align-items: flex-start;
    }

    .param-body {
        flex-direction: column;
        gap: 18px;
    }
}
</style>
