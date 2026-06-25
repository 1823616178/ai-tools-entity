<template>
    <div class="app-container">
        <NuxtRouteAnnouncer />
        <header class="app-header">
            <div class="header-main">
                <div>
                    <h1>问答式检索</h1>
                    <p class="subtitle">对齐 /text_search 流式接口，由本地大模型驱动</p>
                </div>
                <NuxtLink to="/" class="back-link">← 返回首页</NuxtLink>
            </div>
        </header>

        <nav class="tab-nav">
            <button v-for="tab in tabs" :key="tab.key" :class="['tab-btn', { active: activeTab === tab.key }]"
                @click="activeTab = tab.key">
                <span class="tab-icon">{{ tab.icon }}</span>
                <span class="tab-label">{{ tab.label }}</span>
            </button>
        </nav>

        <!-- 标准问答式检索 -->
        <section v-if="activeTab === 'standard'" class="api-section">
            <h2>标准问答式检索</h2>
            <p class="desc">对齐文档 `POST /text_search/questionStream`，SSE 流式输出 reason / answer / cite。</p>

            <div class="form-group">
                <label>用户问题 <span class="req">*</span></label>
                <textarea v-model="standard.question" rows="3" placeholder="例如：《楝亭书目》里记录了哪些内容？"></textarea>
            </div>
            <div class="form-row">
                <div class="form-group flex-1">
                    <label>会话 ID（session_id）</label>
                    <input v-model="standard.sessionId" type="text" placeholder="可留空，自动生成" />
                </div>
                <div class="form-group flex-1">
                    <label>模型模式（mode）</label>
                    <input v-model="standard.mode" type="text" placeholder="例如 deepseek" />
                </div>
            </div>

            <details class="opt-block">
                <summary>可选：上下文约束 context（书籍 / 章节）</summary>
                <div class="opt-body">
                    <div class="form-row">
                        <div class="form-group flex-1">
                            <label>书名</label>
                            <input v-model="standard.bookTitle" type="text" placeholder="书名" />
                        </div>
                        <div class="form-group flex-1">
                            <label>作者</label>
                            <input v-model="standard.bookAuthor" type="text" placeholder="作者" />
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1">
                            <label>馆藏 library</label>
                            <input v-model="standard.bookLibrary" type="text" placeholder="国家图书馆" />
                        </div>
                        <div class="form-group flex-1">
                            <label>四部分类 four-fold</label>
                            <input v-model="standard.bookFourFold" type="text" placeholder="经部 / 史部 ..." />
                        </div>
                        <div class="form-group flex-1">
                            <label>书籍类型 type</label>
                            <input v-model="standard.bookType" type="text" placeholder="敦煌遺書" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label>书籍补充内容 content</label>
                        <textarea v-model="standard.bookContent" rows="2" placeholder="书籍补充内容..."></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1">
                            <label>章节标题</label>
                            <input v-model="standard.chapterTitle" type="text" placeholder="章节标题" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label>章节内容</label>
                        <textarea v-model="standard.chapterContent" rows="2" placeholder="章节内容..."></textarea>
                    </div>
                </div>
            </details>

            <details class="opt-block">
                <summary>可选：历史对话 history（每行：用户：xxx / 助手：xxx）</summary>
                <div class="opt-body">
                    <textarea v-model="standard.historyText" rows="3"
                        placeholder="用户：你是谁？&#10;助手：我是古汉语大模型"></textarea>
                </div>
            </details>

            <div class="btn-row">
                <button class="btn-primary" :disabled="stream.loading" @click="runStandard">
                    <span v-if="stream.loading" class="spinner"></span>
                    {{ stream.loading ? '检索中...' : '开始检索' }}
                </button>
                <button v-if="stream.loading" class="btn-ghost" @click="abort">停止</button>
            </div>
        </section>

        <!-- 摘要问答式检索 -->
        <section v-if="activeTab === 'summary'" class="api-section">
            <h2>摘要问答式检索</h2>
            <p class="desc">对齐文档 `POST /text_search/summary_questionStream`，流开始会先推送一条 query_result 事件。</p>

            <div class="form-group">
                <label>摘要 / 问题主体（summary）<span class="req">*</span></label>
                <textarea v-model="summary.summary" rows="3" placeholder="例如：一部记录古籍目录的文献"></textarea>
            </div>
            <div class="form-row">
                <div class="form-group flex-1">
                    <label>四部分类 fourFold</label>
                    <input v-model="summary.fourFold" type="text" placeholder="史部" />
                </div>
                <div class="form-group flex-1">
                    <label>书名 title</label>
                    <input v-model="summary.title" type="text" placeholder="楝亭书目" />
                </div>
                <div class="form-group flex-1">
                    <label>作者 author</label>
                    <input v-model="summary.author" type="text" placeholder="[清] 曹寅 藏并编" />
                </div>
            </div>
            <div class="form-row">
                <div class="form-group flex-1">
                    <label>相似度阈值 threshold</label>
                    <input v-model.number="summary.threshold" type="number" step="0.01" min="0" max="1" />
                </div>
                <div class="form-group flex-1">
                    <label>召回条数 topN</label>
                    <input v-model.number="summary.topN" type="number" min="1" max="50" />
                </div>
                <div class="form-group flex-1">
                    <label>模型模式 mode</label>
                    <input v-model="summary.mode" type="text" placeholder="deepseek" />
                </div>
            </div>
            <div class="form-group">
                <label>会话 ID（session_id）</label>
                <input v-model="summary.sessionId" type="text" placeholder="可留空，自动生成" />
            </div>

            <details class="opt-block">
                <summary>可选：历史对话 history（每行：用户：xxx / 助手：xxx）</summary>
                <div class="opt-body">
                    <textarea v-model="summary.historyText" rows="3"
                        placeholder="用户：你是谁？&#10;助手：我是古汉语大模型"></textarea>
                </div>
            </details>

            <div class="btn-row">
                <button class="btn-primary" :disabled="stream.loading" @click="runSummary">
                    <span v-if="stream.loading" class="spinner"></span>
                    {{ stream.loading ? '检索中...' : '开始检索' }}
                </button>
                <button v-if="stream.loading" class="btn-ghost" @click="abort">停止</button>
            </div>
        </section>

        <!-- 流式结果区 -->
        <section v-if="hasOutput" class="api-section result-section">
            <h2>检索结果<span v-if="stream.loading" class="live-dot">● 实时</span></h2>

            <div v-if="stream.error" class="error-msg">{{ stream.error }}</div>

            <!-- query_result -->
            <div v-if="stream.queryResults.length" class="result-block">
                <h3>检索匹配（query_result · {{ stream.queryResults.length }} 条）</h3>
                <table class="qr-table">
                    <thead>
                        <tr>
                            <th>bookId</th>
                            <th>四部分类</th>
                            <th>书名</th>
                            <th>作者</th>
                            <th>得分</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(r, i) in stream.queryResults" :key="i">
                            <td>{{ r.bookId }}</td>
                            <td>{{ r.fourFold }}</td>
                            <td>{{ r.title }}</td>
                            <td>{{ r.author }}</td>
                            <td>{{ r.score }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- reason -->
            <div v-if="stream.reason" class="result-block reason-block">
                <h3>推理过程（reason）</h3>
                <div class="reason-text">{{ stream.reason }}</div>
            </div>

            <!-- answer -->
            <div v-if="stream.answer" class="result-block">
                <h3>回答（answer）</h3>
                <div class="answer-text">{{ stream.answer }}<span v-if="stream.loading" class="caret">▋</span></div>
            </div>

            <!-- cite -->
            <div v-if="stream.cites.length" class="result-block">
                <h3>引用（cite · {{ stream.cites.length }} 条）</h3>
                <div v-for="(c, i) in stream.cites" :key="i" class="cite-card">
                    <div v-if="c.book" class="cite-book">
                        《{{ c.book.title || '未命名' }}》
                        <small v-if="c.book.creator">{{ c.book.creator }}</small>
                        <small v-if="c.book.orgName">· {{ c.book.orgName }}</small>
                    </div>
                    <div v-if="c.text || c.image?.text" class="cite-text">{{ c.text || c.image?.text }}</div>
                </div>
            </div>

            <details v-if="stream.rawEvents.length">
                <summary>查看原始 SSE 事件（{{ stream.rawEvents.length }} 条）</summary>
                <pre class="json-output">{{ rawDump }}</pre>
            </details>
        </section>
    </div>
</template>

<script setup lang="ts">
type HistoryItem = { role: string; content: string }
type QueryResultItem = { bookId: number | string; fourFold: string; title: string; author: string; score: number }
type CiteValue = Record<string, any>

const tabs: Array<{ key: 'standard' | 'summary'; icon: string; label: string }> = [
    { key: 'standard', icon: '🔍', label: '标准问答检索' },
    { key: 'summary', icon: '📚', label: '摘要问答检索' },
]
const activeTab = ref<'standard' | 'summary'>('standard')

const standard = reactive({
    question: '《楝亭书目》里记录了哪些内容？',
    sessionId: '',
    mode: 'deepseek',
    bookTitle: '',
    bookAuthor: '',
    bookLibrary: '',
    bookFourFold: '',
    bookType: '',
    bookContent: '',
    chapterTitle: '',
    chapterContent: '',
    historyText: '',
})

const summary = reactive({
    summary: '一部记录古籍目录的文献',
    sessionId: '',
    fourFold: '史部',
    title: '楝亭书目',
    author: '[清] 曹寅 藏并编',
    threshold: 0.55,
    topN: 5,
    mode: 'deepseek',
    historyText: '',
})

const stream = reactive({
    loading: false,
    error: '',
    started: false,
    done: false,
    reason: '',
    answer: '',
    cites: [] as CiteValue[],
    queryResults: [] as QueryResultItem[],
    rawEvents: [] as Array<{ event: string; data: string }>,
})

let controller: AbortController | null = null

const hasOutput = computed(() =>
    stream.loading || stream.error || stream.started || stream.reason || stream.answer ||
    stream.cites.length > 0 || stream.queryResults.length > 0,
)

const rawDump = computed(() =>
    stream.rawEvents.map(e => (e.event ? `event: ${e.event}\n` : '') + `data: ${e.data}`).join('\n\n'),
)

function parseHistory(text: string): HistoryItem[] {
    return text
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map((l) => {
            const m = l.match(/^(用户|助手|user|assistant)[：:]\s*(.+)$/)
            if (m) return { role: m[1] === '助手' || m[1] === 'assistant' ? 'assistant' : 'user', content: m[2]! }
            return { role: 'user', content: l }
        })
}

function resetStream() {
    stream.error = ''
    stream.started = false
    stream.done = false
    stream.reason = ''
    stream.answer = ''
    stream.cites = []
    stream.queryResults = []
    stream.rawEvents = []
}

function handleData(eventName: string, dataStr: string) {
    stream.rawEvents.push({ event: eventName, data: dataStr })

    if (eventName === 'error') {
        try {
            stream.error = JSON.parse(dataStr).message || dataStr
        } catch {
            stream.error = dataStr
        }
        return
    }

    const trimmed = dataStr.trim()
    if (!trimmed) return
    if (trimmed === '[START]') {
        stream.started = true
        return
    }
    if (trimmed === '[DONE]') return

    let obj: any
    try {
        obj = JSON.parse(trimmed)
    } catch {
        // 非 JSON 内容，按答案文本兜底追加
        stream.answer += trimmed
        return
    }

    switch (obj.type) {
        case 'reason':
            stream.reason += obj.value ?? ''
            break
        case 'answer':
            stream.answer += obj.value ?? ''
            break
        case 'cite':
            if (obj.value) stream.cites.push(obj.value)
            break
        case 'query_result':
            stream.queryResults = Array.isArray(obj.value) ? obj.value : []
            break
        case 'error':
            stream.error = obj.value ?? '检索出错'
            break
        default:
            break
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
    handleData(eventName, dataLines.join('\n'))
}

async function runStream(url: string, body: Record<string, unknown>) {
    abort()
    resetStream()
    stream.loading = true
    controller = new AbortController()

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify(body),
            signal: controller.signal,
        })

        if (!res.ok || !res.body) {
            stream.error = `请求失败（HTTP ${res.status}）`
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
        if (e?.name !== 'AbortError') stream.error = e?.message || '请求异常'
    } finally {
        stream.loading = false
        stream.done = true
        controller = null
    }
}

function abort() {
    if (controller) {
        controller.abort()
        controller = null
    }
}

function runStandard() {
    const body: Record<string, unknown> = {
        question: standard.question,
    }
    if (standard.sessionId) body.session_id = standard.sessionId
    if (standard.mode) body.mode = standard.mode

    const history = parseHistory(standard.historyText)
    if (history.length) body.history = history

    const book: Record<string, string> = {}
    if (standard.bookTitle) book.title = standard.bookTitle
    if (standard.bookAuthor) book.author = standard.bookAuthor
    if (standard.bookLibrary) book.library = standard.bookLibrary
    if (standard.bookFourFold) book['four-fold'] = standard.bookFourFold
    if (standard.bookType) book.type = standard.bookType
    if (standard.bookContent) book.content = standard.bookContent

    const chapter: Record<string, string> = {}
    if (standard.chapterTitle) chapter.title = standard.chapterTitle
    if (standard.chapterContent) chapter.content = standard.chapterContent

    const context: Record<string, unknown> = {}
    if (Object.keys(book).length) context.book = book
    if (Object.keys(chapter).length) context.chapter = chapter
    if (Object.keys(context).length) body.context = context

    runStream('/text_search/questionStream', body)
}

function runSummary() {
    const body: Record<string, unknown> = {
        summary: summary.summary,
        threshold: summary.threshold,
        topN: summary.topN,
    }
    if (summary.sessionId) body.session_id = summary.sessionId
    if (summary.fourFold) body.fourFold = summary.fourFold
    if (summary.title) body.title = summary.title
    if (summary.author) body.author = summary.author
    if (summary.mode) body.mode = summary.mode

    const history = parseHistory(summary.historyText)
    if (history.length) body.history = history

    runStream('/text_search/summary_questionStream', body)
}

onBeforeUnmount(() => abort())
</script>

<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif;
    background: #f0f2f5;
    color: #333;
    line-height: 1.6;
}

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
    align-items: center;
}

.app-header h1 {
    font-size: 28px;
    font-weight: 700;
    color: #1a1a2e;
    margin-bottom: 8px;
}

.subtitle {
    font-size: 14px;
    color: #888;
}

.back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    background: #1a1a2e;
    color: #fff;
    text-decoration: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    transition: background 0.2s;
}

.back-link:hover {
    background: #2d2d4a;
}

.tab-nav {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    background: #fff;
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tab-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 14px;
}

.tab-btn:hover {
    background: #f5f5f5;
}

.tab-btn.active {
    background: #1a1a2e;
    color: #fff;
}

.tab-icon {
    font-size: 18px;
}

.api-section {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.api-section + .api-section {
    margin-top: 24px;
}

.api-section h2 {
    font-size: 20px;
    margin-bottom: 6px;
    color: #1a1a2e;
}

.desc {
    font-size: 13px;
    color: #999;
    margin-bottom: 20px;
}

.form-group {
    margin-bottom: 16px;
}

.form-group label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #555;
    margin-bottom: 6px;
}

.req {
    color: #cf1322;
}

textarea,
input[type='text'],
input[type='number'] {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    transition: border-color 0.2s;
    resize: vertical;
    background: #fafafa;
}

textarea:focus,
input:focus {
    outline: none;
    border-color: #1a1a2e;
    background: #fff;
}

.form-row {
    display: flex;
    gap: 16px;
}

.flex-1 {
    flex: 1;
}

.opt-block {
    margin-bottom: 16px;
    border: 1px dashed #e0e0e0;
    border-radius: 8px;
    padding: 10px 14px;
}

.opt-block > summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #555;
}

.opt-body {
    margin-top: 14px;
}

.btn-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 28px;
    background: #1a1a2e;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
    background: #2d2d4a;
}

.btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-ghost {
    padding: 10px 18px;
    background: #fff;
    color: #cf1322;
    border: 1.5px solid #ffccc7;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
}

.btn-ghost:hover {
    background: #fff2f0;
}

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.error-msg {
    margin-bottom: 16px;
    padding: 10px 14px;
    background: #fff2f0;
    border: 1px solid #ffccc7;
    border-radius: 8px;
    color: #cf1322;
    font-size: 13px;
}

.result-section h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.live-dot {
    font-size: 12px;
    color: #52c41a;
    font-weight: 500;
    animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
    50% {
        opacity: 0.4;
    }
}

.result-block {
    margin-bottom: 18px;
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e8e8e8;
}

.result-block h3 {
    font-size: 14px;
    margin-bottom: 10px;
    color: #1a1a2e;
}

.reason-block {
    background: #f5f7fa;
    border-left: 3px solid #b0bec5;
}

.reason-text {
    font-size: 14px;
    color: #607d8b;
    white-space: pre-wrap;
    line-height: 1.8;
}

.answer-text {
    font-size: 16px;
    color: #1a1a2e;
    white-space: pre-wrap;
    line-height: 1.9;
}

.caret {
    color: #1a1a2e;
    animation: blink 1s step-start infinite;
}

.qr-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.qr-table th,
.qr-table td {
    border: 1px solid #e8e8e8;
    padding: 8px 10px;
    text-align: left;
}

.qr-table th {
    background: #f0f2f5;
    color: #555;
    font-weight: 600;
}

.cite-card {
    padding: 12px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 6px;
    margin-bottom: 10px;
}

.cite-card:last-child {
    margin-bottom: 0;
}

.cite-book {
    font-weight: 600;
    color: #1a1a2e;
    margin-bottom: 6px;
}

.cite-book small {
    font-weight: 400;
    color: #888;
    font-size: 12px;
}

.cite-text {
    font-size: 13px;
    color: #555;
    line-height: 1.7;
    font-family: 'Noto Serif SC', 'SimSun', serif;
}

.json-output {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 16px;
    border-radius: 6px;
    font-size: 12px;
    overflow-x: auto;
    margin-top: 8px;
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

@media (max-width: 600px) {
    .form-row {
        flex-direction: column;
        gap: 0;
    }
}
</style>
