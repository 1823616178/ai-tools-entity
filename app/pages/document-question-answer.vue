<template>
    <div class="doc-q-page">
        <header class="page-header">
            <div class="header-inner">
                <div class="header-title">
                    <div class="title-icon">💬</div>
                    <div>
                        <h1>文件问答</h1>
                        <p class="header-subtitle">上传图片 / Word / PDF / 文本 · 自动解析后基于内容回答问题</p>
                    </div>
                </div>
                <NuxtLink to="/" class="back-link">
                    <span class="back-arrow">←</span>
                    <span>返回首页</span>
                </NuxtLink>
            </div>
        </header>

        <main class="page-main">
            <!-- 上传 / 文件区域 -->
            <section class="card input-card">
                <div class="card-header">
                    <span class="card-icon">📄</span>
                    <h2>文件</h2>
                    <span class="doc-count">{{ documents.length }} / 50</span>
                </div>

                <div :class="['drop-zone', { dragging: isDragging }]" @dragenter.prevent="isDragging = true"
                    @dragleave.prevent="isDragging = false" @dragover.prevent @drop.prevent="handleDrop"
                    @click="triggerFilePick">
                    <input ref="fileInput" type="file"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,text/*" multiple
                        style="display:none" @change="handleFilePick" />
                    <div class="drop-content">
                        <div class="drop-icon">📤</div>
                        <p class="drop-title">点击或拖拽文件到此处</p>
                        <p class="drop-desc">
                            图片 / Word / PDF / PPT / Excel 将自动 OCR 解析；TXT / MD / CSV 直接读取
                        </p>
                    </div>
                </div>

                <div v-if="documents.length" class="doc-list">
                    <div v-for="(doc, idx) in documents" :key="doc.id" class="doc-item">
                        <div class="doc-item-head">
                            <span class="doc-index">文件 {{ idx + 1 }}</span>
                            <input v-model="doc.fileName" class="doc-name-input" type="text"
                                :placeholder="`文件${idx + 1}（可选文件名）`" />
                            <span :class="['doc-status', `status-${doc.status}`]">{{ statusLabel(doc) }}</span>
                            <button class="btn-remove" title="移除该文件" @click="removeDocument(idx)">✕</button>
                        </div>
                        <textarea v-model="doc.text" class="doc-text-input" rows="5"
                            :placeholder="doc.status === 'parsing' ? '解析中，请稍候...' : '解析后的纯文本（可手动编辑或粘贴）...'"
                            :disabled="doc.status === 'parsing'"></textarea>
                        <p v-if="doc.status === 'error'" class="doc-error">{{ doc.statusMsg || '解析失败' }}</p>
                    </div>
                </div>

                <div class="input-actions">
                    <button class="btn-secondary" :disabled="documents.length >= 50" @click="triggerFilePick">
                        <span>📁</span><span>上传文件</span>
                    </button>
                    <button class="btn-secondary" :disabled="documents.length >= 50" @click="addManualDocument">
                        <span>＋</span><span>手动添加文本</span>
                    </button>
                    <button class="btn-secondary" @click="loadDemo">
                        <span>✨</span><span>填入示例</span>
                    </button>
                    <button v-if="documents.length" class="btn-secondary" @click="clearAll">
                        <span>🗑</span><span>清空</span>
                    </button>
                </div>
            </section>

            <!-- 问题区域 -->
            <section class="card input-card">
                <div class="card-header">
                    <span class="card-icon">❓</span>
                    <h2>问题 / 要求</h2>
                </div>
                <div class="query-body">
                    <textarea v-model="query" class="doc-text-input" rows="3"
                        placeholder="请输入你的问题或要求，例如：请根据文件内容总结故宫的基本情况"></textarea>
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
                        <label>回答长度上限（{{ MIN_LENGTH }}-{{ MAX_LENGTH }}）</label>
                        <div class="count-row">
                            <input v-model.number="answerMaxLength" type="range" :min="MIN_LENGTH" :max="MAX_LENGTH"
                                step="50" class="count-slider" />
                            <span class="count-value">{{ answerMaxLength }}</span>
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
                    <button class="btn-primary" :disabled="loading || parsing || !canRun" @click="handleRun">
                        <span v-if="loading" class="spinner"></span>
                        <span v-else>🚀</span>
                        <span>{{ loading ? '回答中...' : parsing ? '文件解析中...' : '开始问答' }}</span>
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

            <!-- 回答结果 -->
            <section v-if="answer" class="card result-card">
                <div class="result-head">
                    <h3>回答</h3>
                    <button class="btn-secondary" @click="copyAnswer">📋 复制</button>
                </div>
                <pre class="answer-text">{{ answer }}</pre>
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
type DocStatus = 'ready' | 'parsing' | 'error'
type DocSource = 'manual' | 'text-file' | 'ocr'

interface DocItem {
    id: number
    fileName: string
    text: string
    source: DocSource
    status: DocStatus
    statusMsg?: string
}

interface AnswerResult {
    code: number
    message: string
    answer: string
}

interface OcrResponse {
    code: number
    message: string
    result: { full_text?: string } | null
}

const MIN_LENGTH = 100
const MAX_LENGTH = 2000
// 直接按文本读取的扩展名，其余走 OCR
const TEXT_EXT = ['txt', 'md', 'csv', 'json', 'log', 'xml', 'html', 'htm', 'yml', 'yaml']

let docSeq = 0
function makeDoc(fileName = '', text = '', source: DocSource = 'manual', status: DocStatus = 'ready'): DocItem {
    return { id: ++docSeq, fileName, text, source, status }
}

const documents = ref<DocItem[]>([])
const query = ref('')
const answerMaxLength = ref(800)
const useStream = ref(false)
const loading = ref(false)
const error = ref('')
const answer = ref('')

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

const stream = reactive({
    started: false,
    done: false,
    answer: '',
    rawEvents: [] as Array<{ event: string; data: string }>,
})

let controller: AbortController | null = null

const parsing = computed(() => documents.value.some((d) => d.status === 'parsing'))
const hasValidDocument = computed(() =>
    documents.value.some((d) => d.status === 'ready' && d.text.trim().length > 0),
)
const canRun = computed(() => hasValidDocument.value && query.value.trim().length > 0)
const rawEventsText = computed(() =>
    stream.rawEvents.map((e) => `${e.event ? `event: ${e.event}\n` : ''}data: ${e.data}`).join('\n\n'),
)

function statusLabel(doc: DocItem) {
    if (doc.status === 'parsing') return '解析中'
    if (doc.status === 'error') return '解析失败'
    if (doc.source === 'ocr') return 'OCR 已解析'
    if (doc.source === 'text-file') return '文本已读取'
    return '就绪'
}

function isTextFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    return file.type.startsWith('text/') || TEXT_EXT.includes(ext)
}

function triggerFilePick() {
    if (documents.value.length >= 50) return
    fileInput.value?.click()
}

function handleFilePick(e: Event) {
    const files = (e.target as HTMLInputElement).files
    ingestFiles(files)
    if (fileInput.value) fileInput.value.value = ''
}

function handleDrop(e: DragEvent) {
    isDragging.value = false
    ingestFiles(e.dataTransfer?.files ?? null)
}

function ingestFiles(files: FileList | null) {
    if (!files || !files.length) return
    error.value = ''
    for (const file of Array.from(files)) {
        if (documents.value.length >= 50) {
            error.value = '最多支持 50 个文件'
            break
        }
        void ingestFile(file)
    }
}

async function ingestFile(file: File) {
    // 先占位，展示解析状态
    const placeholder = makeDoc(file.name, '', isTextFile(file) ? 'text-file' : 'ocr', 'parsing')
    documents.value.push(placeholder)
    // 取回数组中的响应式实例（直接改原始对象不会触发视图更新）
    const doc = documents.value.find((d) => d.id === placeholder.id)
    if (!doc) return

    try {
        if (isTextFile(file)) {
            doc.text = await readAsText(file)
            doc.status = 'ready'
            return
        }

        // 图片 / Word / PDF / Office → OCR
        const formData = new FormData()
        formData.append('file', file)
        const res = await $fetch<OcrResponse>('/api/paddle-ocr', { method: 'POST', body: formData })
        if (res.code === 200 && res.result?.full_text != null) {
            doc.text = res.result.full_text
            doc.status = 'ready'
            if (!doc.text.trim()) {
                doc.status = 'error'
                doc.statusMsg = 'OCR 未识别到文本，可手动补充'
            }
        } else {
            doc.status = 'error'
            doc.statusMsg = res.message || 'OCR 解析失败'
        }
    } catch (e: any) {
        doc.status = 'error'
        doc.statusMsg = e?.data?.message || e?.message || '解析请求异常'
    }
}

function readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsText(file)
    })
}

function addManualDocument() {
    if (documents.value.length >= 50) return
    documents.value.push(makeDoc())
}

function removeDocument(idx: number) {
    documents.value.splice(idx, 1)
}

function clearAll() {
    documents.value = []
    error.value = ''
}

function loadDemo() {
    documents.value = [
        makeDoc('故宫简介.txt', '故宫博物院，旧称紫禁城，位于北京市中心，是中国明清两代的皇家宫殿。', 'text-file'),
        makeDoc('建筑规模.txt', '故宫占地面积72万平方米，建筑面积约15万平方米，共有大小宫殿七十余座。', 'text-file'),
    ]
    query.value = '请根据文件内容总结故宫的基本情况'
    answerMaxLength.value = 500
}

function buildDocumentsPayload() {
    return documents.value
        .filter((d) => d.status === 'ready' && d.text.trim().length > 0)
        .map((d) => {
            const fileName = d.fileName.trim()
            return fileName ? { file_name: fileName, text: d.text } : { text: d.text }
        })
}

function resetResult() {
    error.value = ''
    answer.value = ''
    stream.started = false
    stream.done = false
    stream.answer = ''
    stream.rawEvents = []
}

async function handleRun() {
    if (loading.value) return
    if (parsing.value) {
        error.value = '文件仍在解析中，请稍候'
        return
    }
    resetResult()

    const payloadDocs = buildDocumentsPayload()
    if (!payloadDocs.length) {
        error.value = '请至少上传或填写一个有正文的文件'
        return
    }
    if (!query.value.trim()) {
        error.value = '请输入你的问题或要求'
        return
    }

    const body = {
        documents: payloadDocs,
        query: query.value.trim(),
        answer_max_length: answerMaxLength.value,
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
        const res = await $fetch<AnswerResult>('/document_question_answer', {
            method: 'POST',
            body,
        })
        if (res.code === 200) {
            answer.value = res.answer || ''
        } else {
            error.value = res.message || '回答失败'
        }
    } catch (e: any) {
        error.value = e?.data?.message || e?.message || '请求异常'
    }
}

async function runStream(body: Record<string, unknown>) {
    abort()
    controller = new AbortController()

    try {
        const res = await fetch('/document_question_answer', {
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
            const value = obj.value as AnswerResult | undefined
            if (value?.code === 200) {
                answer.value = value.answer || ''
            } else if (value && value.code !== 200) {
                error.value = value.message || '回答失败'
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

async function copyAnswer() {
    if (!answer.value) return
    try {
        await navigator.clipboard.writeText(answer.value)
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

.drop-zone {
    margin: 16px 20px 4px;
    border: 2px dashed #c3ccf0;
    border-radius: 12px;
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.25s ease;
    background: linear-gradient(135deg, #fbfcff 0%, #f2f5ff 100%);
}

.drop-zone:hover,
.drop-zone.dragging {
    border-color: #1a2980;
    background: #eef2ff;
}

.drop-content {
    pointer-events: none;
}

.drop-icon {
    font-size: 32px;
    margin-bottom: 8px;
}

.drop-title {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 600;
    color: #1a1a2e;
}

.drop-desc {
    margin: 0;
    font-size: 12px;
    color: #888;
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
    min-width: 0;
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

.doc-status {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 10px;
    white-space: nowrap;
}

.status-ready {
    color: #237804;
    background: #e6ffe6;
}

.status-parsing {
    color: #ad6800;
    background: #fff7e6;
}

.status-error {
    color: #cf1322;
    background: #fff1f0;
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
    flex-shrink: 0;
}

.btn-remove:hover {
    background: #ffe0e0;
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

.doc-text-input:disabled {
    background: #f5f5f7;
    color: #999;
}

.doc-error {
    margin: 8px 0 0;
    font-size: 12px;
    color: #cf1322;
}

.query-body {
    padding: 16px 20px 20px;
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
    min-width: 44px;
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

.stream-answer,
.answer-text {
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
