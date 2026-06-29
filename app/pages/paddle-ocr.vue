<template>
    <div class="paddle-ocr-container">
        <header class="page-header">
            <h1>📄 PaddleOCR 文档识别</h1>
            <NuxtLink to="/" class="back-link">← 返回首页</NuxtLink>
        </header>

        <main class="page-content">
            <section class="upload-section">
                <h2>上传文件</h2>
                <p class="desc">支持图片（JPG / PNG / BMP / WEBP）、扫描版 PDF，以及 Word / Excel / PPT 文档。</p>

                <div :class="['drop-zone', { dragging: isDragging, disabled: loading }]"
                    @dragenter.prevent="isDragging = true" @dragleave.prevent="isDragging = false" @dragover.prevent
                    @drop.prevent="handleDrop" @click="triggerFileInput">
                    <input ref="fileInput" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        style="display: none" @change="handleFileSelect" />
                    <div class="drop-content">
                        <div class="drop-icon">📤</div>
                        <p>点击或拖拽文件到此处</p>
                        <p class="drop-hint">支持 JPG、PNG、BMP、WEBP、PDF、Word、Excel、PPT</p>
                    </div>
                </div>

                <div v-if="selectedFile" class="file-info">
                    <div class="file-meta">
                        <strong>{{ selectedFile.name }}</strong>
                        <span class="file-size">{{ formatSize(selectedFile.size) }}</span>
                        <span class="file-type">{{ formatFileType(selectedFile) }}</span>
                    </div>
                    <button class="btn-text" @click="clearFile">移除</button>
                </div>

                <div v-if="previewUrl && isImage" class="image-preview">
                    <img :src="previewUrl" alt="预览" />
                </div>

                <button class="btn-primary" :disabled="!selectedFile || loading" @click="handleRecognize">
                    <span v-if="loading" class="spinner"></span>
                    {{ loading ? '识别中...' : '开始识别' }}
                </button>

                <div v-if="error" class="error-msg">{{ error }}</div>
            </section>

            <section v-if="result" class="result-section">
                <div class="result-header">
                    <h2>识别结果</h2>
                    <div class="result-actions">
                        <span class="page-badge">共 {{ result.total_pages }} 页</span>
                        <button class="btn-secondary" @click="copyText">复制文本</button>
                    </div>
                </div>

                <div class="result-summary">
                    <h3>完整文本</h3>
                    <pre class="full-text">{{ result.full_text }}</pre>
                </div>

                <div class="pages-list">
                    <div v-for="page in result.pages" :key="page.page" class="page-card">
                        <h4>第 {{ page.page }} 页</h4>
                        <pre class="page-text">{{ page.text }}</pre>

                        <details class="lines-details">
                            <summary>查看逐行详情（{{ page.lines.length }} 行）</summary>
                            <table class="lines-table">
                                <thead>
                                    <tr>
                                        <th>文本</th>
                                        <th>置信度</th>
                                        <th>坐标</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(line, idx) in page.lines" :key="idx">
                                        <td class="line-text">{{ line.text }}</td>
                                        <td class="line-confidence">{{ (line.confidence * 100).toFixed(1) }}%</td>
                                        <td class="line-box">{{ formatBox(line.box) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </details>
                    </div>
                </div>

                <details class="json-details">
                    <summary>查看 JSON 详情</summary>
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

function clearFile() {
    selectedFile.value = null
    previewUrl.value = ''
    result.value = null
    error.value = ''
    if (fileInput.value) fileInput.value.value = ''
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
        png: 'PNG 图片',
        jpg: 'JPG 图片',
        jpeg: 'JPG 图片',
        bmp: 'BMP 图片',
        webp: 'WebP 图片',
    }
    return map[ext] || file.type || '未知文件'
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
</script>

<style scoped>
.paddle-ocr-container {
    min-height: 100vh;
    background: #f5f7fa;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.page-header {
    background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
    color: white;
    padding: 24px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.page-header h1 {
    margin: 0;
    font-size: 24px;
}

.back-link {
    color: white;
    text-decoration: none;
    padding: 8px 16px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 6px;
    transition: all 0.2s;
}

.back-link:hover {
    background: rgba(255, 255, 255, 0.15);
}

.page-content {
    max-width: 1000px;
    margin: 0 auto;
    padding: 32px;
}

.upload-section,
.result-section {
    background: white;
    border-radius: 12px;
    padding: 28px;
    margin-bottom: 24px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.upload-section h2,
.result-section h2 {
    margin: 0 0 8px;
    color: #1a2980;
    font-size: 20px;
}

.desc {
    color: #666;
    margin-bottom: 20px;
}

.drop-zone {
    border: 2px dashed #c0c4cc;
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: #fafbfc;
}

.drop-zone:hover,
.drop-zone.dragging {
    border-color: #1a2980;
    background: #f0f5ff;
}

.drop-zone.disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.drop-icon {
    font-size: 48px;
    margin-bottom: 12px;
}

.drop-content p {
    margin: 4px 0;
    color: #333;
}

.drop-hint {
    color: #999;
    font-size: 13px;
}

.file-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16px;
    padding: 12px 16px;
    background: #f0f5ff;
    border-radius: 8px;
}

.file-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.file-size,
.file-type {
    color: #666;
    font-size: 13px;
    background: white;
    padding: 2px 8px;
    border-radius: 4px;
}

.btn-text {
    background: none;
    border: none;
    color: #f56c6c;
    cursor: pointer;
    font-size: 14px;
}

.btn-text:hover {
    text-decoration: underline;
}

.image-preview {
    margin-top: 16px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e4e7ed;
    max-width: 400px;
}

.image-preview img {
    width: 100%;
    display: block;
}

.btn-primary,
.btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 20px;
}

.btn-primary {
    background: linear-gradient(135deg, #1a2980 0%, #26d0ce 100%);
    color: white;
}

.btn-primary:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
}

.btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-secondary {
    background: white;
    color: #1a2980;
    border: 1px solid #1a2980;
    margin-top: 0;
}

.btn-secondary:hover {
    background: #f0f5ff;
}

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
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
    padding: 12px 16px;
    background: #fff0f0;
    color: #c0392b;
    border-radius: 8px;
    border-left: 4px solid #e74c3c;
}

.result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
}

.result-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.page-badge {
    background: #e6f7ff;
    color: #0066cc;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 13px;
}

.result-summary {
    margin-bottom: 24px;
}

.result-summary h3,
.page-card h4 {
    margin: 0 0 12px;
    color: #333;
}

.full-text,
.page-text {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 14px;
    line-height: 1.8;
    margin: 0;
    overflow-x: auto;
}

.pages-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.page-card {
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    padding: 20px;
    background: #fafbfc;
}

.lines-details,
.json-details {
    margin-top: 16px;
}

.lines-details summary,
.json-details summary {
    cursor: pointer;
    color: #1a2980;
    font-size: 14px;
}

.lines-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 12px;
    font-size: 13px;
}

.lines-table th,
.lines-table td {
    border: 1px solid #e4e7ed;
    padding: 8px 12px;
    text-align: left;
}

.lines-table th {
    background: #f0f5ff;
    color: #1a2980;
}

.line-text {
    max-width: 300px;
    word-break: break-all;
}

.line-confidence {
    white-space: nowrap;
}

.line-box {
    font-size: 12px;
    color: #666;
    white-space: nowrap;
}

.json-output {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.6;
}

@media (max-width: 768px) {
    .page-header {
        flex-direction: column;
        gap: 12px;
        text-align: center;
    }

    .page-content {
        padding: 16px;
    }

    .result-header {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
