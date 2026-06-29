<template>
    <div class="paddle-ocr-page">
        <header class="page-header">
            <div class="header-inner">
                <div class="header-title">
                    <div class="title-icon">📜</div>
                    <div>
                        <h1>古籍文档识别</h1>
                        <p class="header-subtitle">基于 PaddleOCR · 图片 / PDF / Office 文档文字识别</p>
                    </div>
                </div>
                <NuxtLink to="/" class="back-link">
                    <span class="back-arrow">←</span>
                    <span>返回首页</span>
                </NuxtLink>
            </div>
        </header>

        <main class="page-main">
            <!-- 上传区域 -->
            <section class="card upload-card">
                <div class="card-header">
                    <span class="card-icon">📤</span>
                    <h2>上传文档</h2>
                </div>

                <div :class="['drop-zone', { dragging: isDragging, disabled: loading }]"
                    @dragenter.prevent="isDragging = true" @dragleave.prevent="isDragging = false" @dragover.prevent
                    @drop.prevent="handleDrop" @click="triggerFileInput">
                    <input ref="fileInput" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        style="display: none" @change="handleFileSelect" />
                    <div class="drop-content">
                        <div class="upload-illustration">
                            <div class="paper-stack">
                                <div class="paper paper-3"></div>
                                <div class="paper paper-2"></div>
                                <div class="paper paper-1">
                                    <span class="paper-text">文</span>
                                </div>
                            </div>
                            <div class="upload-arrow">⬆</div>
                        </div>
                        <p class="drop-title">点击或拖拽文件到此处</p>
                        <p class="drop-desc">支持 JPG、PNG、BMP、WEBP、PDF、Word、Excel、PPT</p>
                    </div>
                </div>

                <div v-if="selectedFile" class="file-info-card">
                    <div class="file-thumb">{{ getFileIcon(selectedFile) }}</div>
                    <div class="file-detail">
                        <div class="file-name" :title="selectedFile.name">{{ selectedFile.name }}</div>
                        <div class="file-meta">
                            <span class="file-tag file-type">{{ formatFileType(selectedFile) }}</span>
                            <span class="file-tag file-size">{{ formatSize(selectedFile.size) }}</span>
                        </div>
                    </div>
                    <button class="btn-icon" @click.stop="clearFile" title="移除文件">✕</button>
                </div>

                <div v-if="previewUrl && isImage" class="preview-section">
                    <div class="preview-label">图片预览</div>
                    <div class="image-preview-frame">
                        <img :src="previewUrl" alt="预览" />
                    </div>
                </div>

                <div class="action-row">
                    <button class="btn-primary btn-recognize" :disabled="!selectedFile || loading"
                        @click.stop="handleRecognize">
                        <span v-if="loading" class="spinner"></span>
                        <span v-else class="btn-icon-text">🔍</span>
                        <span>{{ loading ? '识别中...' : '开始识别' }}</span>
                    </button>
                </div>

                <div v-if="error" class="error-toast">
                    <span class="error-icon">⚠</span>
                    <span>{{ error }}</span>
                </div>
            </section>

            <!-- 识别结果 -->
            <section v-if="result" class="result-panel">
                <div class="result-panel-header">
                    <div class="result-panel-title">
                        <span>📖</span>
                        <span>识别结果</span>
                    </div>
                    <div class="result-panel-actions">
                        <span class="stat-badge">
                            <span class="stat-num">{{ result.total_pages }}</span>
                            <span class="stat-label">页</span>
                        </span>
                        <button class="btn-secondary" @click="copyText">
                            <span>📋</span>
                            <span>复制全文</span>
                        </button>
                    </div>
                </div>

                <div class="card fulltext-card">
                    <div class="card-subheader">
                        <span class="subheader-line"></span>
                        <span class="subheader-text">完整文本</span>
                        <span class="subheader-line"></span>
                    </div>
                    <pre class="fulltext-content">{{ result.full_text }}</pre>
                </div>

                <div class="pages-grid">
                    <div v-for="page in result.pages" :key="page.page" class="card page-card">
                        <div class="page-card-header">
                            <div class="page-number">第 {{ page.page }} 页</div>
                            <div class="page-dims">{{ page.image_width }} × {{ page.image_height }}</div>
                        </div>

                        <div class="page-text-block">
                            <pre class="page-text">{{ page.text }}</pre>
                        </div>

                        <details class="lines-details">
                            <summary>
                                <span class="summary-icon">▾</span>
                                <span>逐行详情（共 {{ page.lines.length }} 行）</span>
                            </summary>
                            <div class="lines-table-wrap">
                                <table class="lines-table">
                                    <thead>
                                        <tr>
                                            <th class="col-line">#</th>
                                            <th class="col-text">文本</th>
                                            <th class="col-score">置信度</th>
                                            <th class="col-box">坐标</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(line, idx) in page.lines" :key="idx">
                                            <td class="col-line">{{ idx + 1 }}</td>
                                            <td class="col-text">{{ line.text }}</td>
                                            <td class="col-score">
                                                <div class="score-bar">
                                                    <div class="score-fill"
                                                        :style="{ width: `${line.confidence * 100}%` }"></div>
                                                    <span class="score-text">{{ (line.confidence * 100).toFixed(1)
                                                        }}%</span>
                                                </div>
                                            </td>
                                            <td class="col-box">{{ formatBox(line.box) }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    </div>
                </div>

                <details class="json-block">
                    <summary>
                        <span class="summary-icon">▾</span>
                        <span>查看 JSON 详情</span>
                    </summary>
                    <pre class="json-output">{{ JSON.stringify(result, null, 2) }}</pre>
                </details>
            </section>
        </main>
    </div>
</template>

<script setup lang="ts">
interface OCRBox {
    top_left: { x: number; y: number }
    top_right: { x: number; y: number }
    bottom_right: { x: number; y: number }
    bottom_left: { x: number; y: number }
}

interface OCRLine {
    text: string
    confidence: number
    box: OCRBox
}

interface OCRPage {
    page: number
    text: string
    lines: OCRLine[]
    image_width?: number
    image_height?: number
}

interface OCRFileResult {
    filename: string
    file_type: string
    total_pages: number
    pages: OCRPage[]
    full_text: string
}

interface ApiResponse<T> {
    code: number
    message: string
    result: T
}

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const selectedFile = ref<File | null>(null)
const previewUrl = ref<string>('')
const loading = ref(false)
const error = ref('')
const result = ref<OCRFileResult | null>(null)

const isImage = computed(() => {
    if (!selectedFile.value) return false
    const type = selectedFile.value.type
    return type.startsWith('image/')
})

function triggerFileInput() {
    if (loading.value) return
    fileInput.value?.click()
}

function handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) setFile(file)
}

function handleDrop(e: DragEvent) {
    isDragging.value = false
    const file = e.dataTransfer?.files?.[0]
    if (file) setFile(file)
}

function setFile(file: File) {
    clearFile()
    selectedFile.value = file
    error.value = ''

    if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
            previewUrl.value = reader.result as string
        }
        reader.readAsDataURL(file)
    }
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatFileType(file: File): string {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const map: Record<string, string> = {
        pdf: 'PDF',
        doc: 'Word',
        docx: 'Word',
        xls: 'Excel',
        xlsx: 'Excel',
        ppt: 'PPT',
        pptx: 'PPT',
        png: 'PNG',
        jpg: 'JPG',
        jpeg: 'JPG',
        bmp: 'BMP',
        webp: 'WebP',
    }
    return map[ext] || file.type || '文件'
}

function getFileIcon(file: File): string {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (ext === 'pdf') return '📕'
    if (['doc', 'docx'].includes(ext)) return '📝'
    if (['xls', 'xlsx'].includes(ext)) return '📊'
    if (['ppt', 'pptx'].includes(ext)) return '📽'
    return '🖼'
}

function formatBox(box: OCRBox) {
    const tl = box.top_left
    const br = box.bottom_right
    return `(${Math.round(tl.x)}, ${Math.round(tl.y)}) - (${Math.round(br.x)}, ${Math.round(br.y)})`
}

async function handleRecognize() {
    if (!selectedFile.value) return

    loading.value = true
    error.value = ''
    result.value = null

    try {
        const formData = new FormData()
        formData.append('file', selectedFile.value)

        const res = await $fetch<ApiResponse<OCRFileResult>>('/api/paddle-ocr', {
            method: 'POST',
            body: formData,
        })

        if (res.code === 200 && res.result) {
            result.value = res.result
        }
        else {
            error.value = res.message || '识别失败'
        }
    }
    catch (e: any) {
        error.value = e?.data?.message || e?.message || '请求异常'
    }
    finally {
        loading.value = false
    }
}

function copyText() {
    if (!result.value) return
    navigator.clipboard.writeText(result.value.full_text).then(() => {
        alert('已复制到剪贴板')
    })
}

function clearFile() {
    selectedFile.value = null
    previewUrl.value = ''
    result.value = null
    error.value = ''
    if (fileInput.value) fileInput.value.value = ''
}
</script>

<style scoped>
.paddle-ocr-page {
    min-height: 100vh;
    background: #f7f4ed;
    background-image:
        radial-gradient(circle at 20% 10%, rgba(201, 169, 110, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 80% 90%, rgba(139, 90, 43, 0.06) 0%, transparent 40%);
    font-family: 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', 'STSong', serif;
}

.page-header {
    background: linear-gradient(135deg, #2c1810 0%, #4a2c1a 50%, #2c1810 100%);
    color: #f5e6c8;
    padding: 28px 32px;
    border-bottom: 4px solid #c9a96e;
    box-shadow: 0 4px 20px rgba(44, 24, 16, 0.25);
}

.header-inner {
    max-width: 1100px;
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
    font-size: 40px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.page-header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #f5e6c8;
}

.header-subtitle {
    margin: 6px 0 0;
    font-size: 13px;
    color: #c9a96e;
    letter-spacing: 1px;
}

.back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #f5e6c8;
    text-decoration: none;
    padding: 8px 16px;
    border: 1px solid rgba(201, 169, 110, 0.5);
    border-radius: 6px;
    font-size: 14px;
    transition: all 0.2s;
}

.back-link:hover {
    background: rgba(201, 169, 110, 0.15);
    border-color: #c9a96e;
}

.back-arrow {
    font-size: 16px;
}

.page-main {
    max-width: 1000px;
    margin: 0 auto;
    padding: 32px 24px 60px;
}

.card {
    background: #fffef8;
    border-radius: 12px;
    box-shadow:
        0 2px 8px rgba(74, 44, 26, 0.06),
        0 0 0 1px rgba(139, 90, 43, 0.08);
    overflow: hidden;
}

.card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 24px;
    background: linear-gradient(90deg, #faf6ed, #f5efe2);
    border-bottom: 1px solid rgba(139, 90, 43, 0.1);
}

.card-header h2 {
    margin: 0;
    font-size: 18px;
    color: #4a2c1a;
    font-weight: 600;
}

.card-icon {
    font-size: 22px;
}

.upload-card {
    margin-bottom: 28px;
    padding-bottom: 24px;
}

.drop-zone {
    margin: 24px;
    border: 2px dashed #c9a96e;
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    background: linear-gradient(135deg, #fffef8 0%, #f9f3e6 100%);
}

.drop-zone:hover,
.drop-zone.dragging {
    border-color: #8b5a2b;
    background: linear-gradient(135deg, #fff9e6 0%, #f5e6c8 100%);
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(139, 90, 43, 0.12);
}

.drop-zone.disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.drop-content {
    pointer-events: none;
}

.upload-illustration {
    position: relative;
    width: 80px;
    height: 80px;
    margin: 0 auto 16px;
}

.paper-stack {
    position: relative;
    width: 100%;
    height: 100%;
}

.paper {
    position: absolute;
    width: 52px;
    height: 64px;
    border-radius: 4px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.paper-3 {
    background: #e8dcc6;
    transform: translate(-42%, -55%) rotate(6deg);
}

.paper-2 {
    background: #f0e6d2;
    transform: translate(-50%, -50%) rotate(-3deg);
}

.paper-1 {
    background: #fffef8;
    border: 1px solid #d7c49a;
    transform: translate(-58%, -45%) rotate(-8deg);
    display: flex;
    align-items: center;
    justify-content: center;
}

.paper-text {
    font-size: 24px;
    color: #8b5a2b;
    font-weight: 700;
}

.upload-arrow {
    position: absolute;
    right: -4px;
    bottom: 4px;
    width: 28px;
    height: 28px;
    background: #8b5a2b;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.drop-title {
    font-size: 17px;
    color: #4a2c1a;
    margin: 0 0 8px;
    font-weight: 600;
}

.drop-desc {
    font-size: 13px;
    color: #8b7355;
    margin: 0;
}

.file-info-card {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 24px 20px;
    padding: 14px 16px;
    background: #faf6ed;
    border: 1px solid #e8dcc6;
    border-radius: 10px;
}

.file-thumb {
    width: 44px;
    height: 44px;
    background: #fff;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.file-detail {
    flex: 1;
    min-width: 0;
}

.file-name {
    font-size: 14px;
    font-weight: 600;
    color: #4a2c1a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
}

.file-meta {
    display: flex;
    gap: 8px;
}

.file-tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: #e8dcc6;
    color: #6b4423;
}

.btn-icon {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: #a08060;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.btn-icon:hover {
    background: #f5e6c8;
    color: #8b5a2b;
}

.preview-section {
    margin: 0 24px 20px;
}

.preview-label {
    font-size: 12px;
    color: #8b7355;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.image-preview-frame {
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #e8dcc6;
    background: #fff;
    box-shadow: inset 0 0 0 4px #faf6ed;
}

.image-preview-frame img {
    width: 100%;
    max-height: 360px;
    object-fit: contain;
    display: block;
}

.action-row {
    display: flex;
    justify-content: center;
    padding: 0 24px;
}

.btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 32px;
    background: linear-gradient(135deg, #8b5a2b 0%, #6b4423 100%);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(107, 68, 35, 0.25);
}

.btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(107, 68, 35, 0.35);
}

.btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-recognize {
    min-width: 160px;
}

.btn-icon-text {
    font-size: 16px;
}

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
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
    margin: 16px 24px 0;
    padding: 12px 16px;
    background: #fff0f0;
    color: #a94442;
    border-radius: 8px;
    border-left: 4px solid #c0392b;
    font-size: 14px;
}

.error-icon {
    font-size: 16px;
}

/* 结果区域 */
.result-panel {
    animation: fadeUp 0.5s ease;
}

@keyframes fadeUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.result-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
    padding: 0 4px;
}

.result-panel-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 20px;
    font-weight: 700;
    color: #4a2c1a;
}

.result-panel-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.stat-badge {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    background: #faf6ed;
    border: 1px solid #e8dcc6;
    padding: 6px 14px;
    border-radius: 20px;
    color: #6b4423;
}

.stat-num {
    font-size: 18px;
    font-weight: 700;
}

.stat-label {
    font-size: 12px;
}

.btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #fff;
    color: #6b4423;
    border: 1px solid #c9a96e;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-secondary:hover {
    background: #faf6ed;
    border-color: #8b5a2b;
}

.fulltext-card {
    padding: 24px;
    margin-bottom: 20px;
}

.card-subheader {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.subheader-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, #c9a96e, transparent);
}

.subheader-text {
    font-size: 14px;
    color: #8b7355;
    letter-spacing: 2px;
    text-transform: uppercase;
}

.fulltext-content {
    margin: 0;
    padding: 16px;
    background: #fff;
    border: 1px solid #e8dcc6;
    border-radius: 8px;
    font-size: 15px;
    line-height: 2;
    color: #4a2c1a;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-x: auto;
}

.pages-grid {
    display: grid;
    gap: 16px;
    margin-bottom: 20px;
}

.page-card {
    padding: 20px;
}

.page-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid #f0e6d2;
}

.page-number {
    font-size: 16px;
    font-weight: 700;
    color: #6b4423;
}

.page-dims {
    font-size: 12px;
    color: #a08060;
}

.page-text-block {
    background: #fff;
    border: 1px solid #e8dcc6;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
}

.page-text {
    margin: 0;
    font-size: 15px;
    line-height: 2;
    color: #4a2c1a;
    white-space: pre-wrap;
    word-break: break-all;
}

.lines-details {
    border: 1px solid #f0e6d2;
    border-radius: 8px;
    overflow: hidden;
}

.lines-details summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    background: #faf6ed;
    cursor: pointer;
    color: #6b4423;
    font-size: 13px;
    user-select: none;
}

.summary-icon {
    transition: transform 0.2s;
}

.lines-details[open] .summary-icon {
    transform: rotate(180deg);
}

.lines-table-wrap {
    padding: 12px;
    background: #fff;
    overflow-x: auto;
}

.lines-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.lines-table th,
.lines-table td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid #f0e6d2;
}

.lines-table th {
    background: #faf6ed;
    color: #6b4423;
    font-weight: 600;
    white-space: nowrap;
}

.lines-table tbody tr:hover {
    background: #fffbf5;
}

.col-line {
    width: 40px;
    color: #a08060;
    text-align: center;
}

.col-text {
    color: #4a2c1a;
    min-width: 120px;
}

.col-score {
    width: 120px;
    white-space: nowrap;
}

.score-bar {
    position: relative;
    height: 20px;
    background: #f0e6d2;
    border-radius: 10px;
    overflow: hidden;
    min-width: 80px;
}

.score-fill {
    height: 100%;
    background: linear-gradient(90deg, #c9a96e, #8b5a2b);
    border-radius: 10px;
    transition: width 0.4s ease;
}

.score-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 11px;
    color: #4a2c1a;
    font-weight: 600;
}

.col-box {
    color: #8b7355;
    font-size: 12px;
    white-space: nowrap;
    font-family: monospace;
}

.json-block {
    background: #fffef8;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(74, 44, 26, 0.06);
    border: 1px solid rgba(139, 90, 43, 0.08);
    overflow: hidden;
}

.json-block summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 14px 20px;
    background: #faf6ed;
    cursor: pointer;
    color: #6b4423;
    font-size: 13px;
    user-select: none;
}

.json-output {
    margin: 0;
    padding: 20px;
    background: #2c1810;
    color: #f5e6c8;
    font-size: 12px;
    line-height: 1.7;
    overflow-x: auto;
    font-family: 'Consolas', 'Monaco', monospace;
}

@media (max-width: 768px) {
    .page-header {
        padding: 20px 16px;
    }

    .header-inner {
        flex-direction: column;
        align-items: flex-start;
    }

    .page-header h1 {
        font-size: 22px;
    }

    .page-main {
        padding: 20px 16px 40px;
    }

    .drop-zone {
        margin: 16px;
        padding: 36px 16px;
    }

    .file-info-card,
    .preview-section,
    .error-toast {
        margin-left: 16px;
        margin-right: 16px;
    }

    .result-panel-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .lines-table th,
    .lines-table td {
        padding: 8px;
        font-size: 12px;
    }
}
</style>
