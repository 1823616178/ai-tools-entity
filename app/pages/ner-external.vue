<template>
    <div class="app-container">
        <NuxtRouteAnnouncer />
        <header class="app-header">
            <div class="header-main">
                <div>
                    <h1>外部API实体标引</h1>
                    <p class="subtitle">调用 szocr.hw-ai.com:6003/chat 进行实体识别</p>
                </div>
                <NuxtLink to="/" class="back-link">← 返回首页</NuxtLink>
            </div>
        </header>

        <section class="api-section">
            <h2>实体标引（外部API）</h2>
            <p class="desc">请求参数和返回结构均按文档中的 /base/ner_rela 对齐，后端调用外部 http://szocr.hw-ai.com:6003/chat 接口。</p>
            <div class="form-group">
                <label>古文内容</label>
                <textarea v-model="nerForm.content" rows="6" placeholder="请输入需要实体识别的古文内容..."></textarea>
            </div>
            <div class="form-row">
                <div class="form-group flex-1">
                    <label>实体类型（分号分隔）</label>
                    <input v-model="nerForm.nerType" type="text" placeholder="建筑;山水;时间;地点;动植物;著作;驿站;职官;人物;机构;器物" />
                </div>
                <div class="form-group flex-1">
                    <label>条目 ID</label>
                    <input v-model="nerForm.jnEntryId" type="text" placeholder="实体标引(20260507103951)" />
                </div>
            </div>
            <button class="btn-primary" :disabled="nerForm.loading" @click="handleNer">
                <span v-if="nerForm.loading" class="spinner"></span>
                {{ nerForm.loading ? '识别中...' : '开始识别' }}
            </button>
            <div v-if="nerForm.error" class="error-msg">{{ nerForm.error }}</div>
            <div v-if="nerForm.entities.length" class="result-box">
                <h3>实体识别结果（{{ nerForm.entities.length }} 个实体）</h3>

                <!-- 标注原文 -->
                <div class="annotated-text">
                    <template v-for="(seg, idx) in annotatedSegments" :key="idx">
                        <span v-if="seg.isEntity && seg.type" class="annotated-entity"
                            :style="getAnnotatedStyle(seg.type)" :title="`${seg.type} | 位置: ${seg.start}-${seg.end}`">
                            {{ seg.text }}
                        </span>
                        <span v-else>{{ seg.text }}</span>
                    </template>
                </div>

                <div class="entity-tags">
                    <span v-for="(entity, idx) in nerForm.entities" :key="idx" class="entity-tag"
                        :style="getTagStyle(entity.type)"
                        :title="`位置: ${entity.start}-${entity.end} | 类型: ${entity.type}`">
                        {{ entity.value }}
                        <small>{{ entity.type }}</small>
                    </span>
                </div>
                <details>
                    <summary>查看 JSON 详情</summary>
                    <pre class="json-output">{{ JSON.stringify(nerForm.entities, null, 2) }}</pre>
                </details>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
type ApiBase = {
    code: number
    message: string
}

type NerEntity = Record<string, any>
type NerRelation = Record<string, any>

type NerResponse = ApiBase & {
    results: {
        entity: NerEntity[]
        relation: NerRelation[]
    }
}

const defaultNerType = '建筑;山水;时间;地点;动植物;著作;驿站;职官;人物;机构;器物'
const demoContent = '昌黎先生遺文目録聮句有所思遣興贈劒客李園遺詩同竇韋尋劉尊師不遇春雪贈族姪'

function createJnEntryId() {
    return `实体标引(${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)})`
}

function getErrorMessage(error: any, fallback: string) {
    return error?.data?.message || error?.message || fallback
}

// 随机颜色生成器（基于字符串哈希，保证同一类型颜色固定）
function stringToColor(str: string): { bg: string; text: string; border: string } {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }

    // HSL 生成鲜艳颜色：饱和度 70-85%，亮度 45-55%
    const h = Math.abs(hash % 360)
    const s = 70 + Math.abs((hash >> 8) % 15)
    const l = 45 + Math.abs((hash >> 16) % 10)

    const bg = `hsl(${h}, ${s}%, ${l + 35}%)`
    const text = `hsl(${h}, ${s}%, ${l}%)`
    const border = `hsl(${h}, ${s}%, ${l}%)`

    return { bg, text, border }
}

const typeColorMap = new Map<string, { bg: string; text: string; border: string }>()

function getTypeColor(type: string): { bg: string; text: string; border: string } {
    if (!typeColorMap.has(type)) {
        typeColorMap.set(type, stringToColor(type))
    }
    return typeColorMap.get(type)!
}

function getEntityClass(type: string) {
    const map: Record<string, string> = {
        人物: 'type-person',
        地点: 'type-location',
        地名: 'type-location',
        时间: 'type-time',
        著作: 'type-work',
        职官: 'type-official',
        建筑: 'type-arch',
        山水: 'type-landscape',
        驿站: 'type-station',
        机构: 'type-org',
        器物: 'type-artifact',
        动植物: 'type-biology',
    }
    return map[type] || 'type-default'
}

const nerForm = reactive({
    content: demoContent,
    nerType: defaultNerType,
    jnEntryId: createJnEntryId(),
    loading: false,
    error: '',
    entities: [] as NerEntity[],
})

function getAnnotatedStyle(type: string) {
    const color = getTypeColor(type)
    return {
        color: color.text,
        borderBottomColor: color.border,
    }
}

function getTagStyle(type: string) {
    const color = getTypeColor(type)
    return {
        background: color.bg,
        color: color.text,
    }
}

interface AnnotatedSegment {
    text: string
    isEntity: boolean
    type?: string
    start?: number
    end?: number
}

const annotatedSegments = computed<AnnotatedSegment[]>(() => {
    const text = nerForm.content
    const entities = nerForm.entities
    if (!text || !entities.length) return [{ text, isEntity: false }]

    // 按 start 排序
    const sorted = [...entities].sort((a, b) => a.start - b.start)
    const segments: AnnotatedSegment[] = []
    let lastPos = 0

    for (const entity of sorted) {
        const start = entity.start
        const end = entity.end

        // 添加实体前的普通文本
        if (start > lastPos) {
            segments.push({
                text: text.slice(lastPos, start),
                isEntity: false,
            })
        }

        // 添加实体文本（红色标注）
        segments.push({
            text: text.slice(start, end),
            isEntity: true,
            type: entity.type,
            start,
            end,
        })

        lastPos = end
    }

    // 添加剩余文本
    if (lastPos < text.length) {
        segments.push({
            text: text.slice(lastPos),
            isEntity: false,
        })
    }

    return segments
})

async function handleNer() {
    nerForm.loading = true
    nerForm.error = ''
    nerForm.entities = []

    try {
        const res = await $fetch<NerResponse>('/base/ner_rela_external', {
            method: 'POST',
            body: {
                jnEntryId: nerForm.jnEntryId,
                content: nerForm.content,
                ner_type: nerForm.nerType,
            },
        })

        if (res.code === 200) {
            nerForm.entities = Array.isArray(res.results?.entity) ? res.results.entity : []
        } else {
            nerForm.error = res.message || '实体识别失败'
        }
    } catch (e: any) {
        nerForm.error = getErrorMessage(e, '请求异常')
    } finally {
        nerForm.loading = false
    }
}
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

.api-section {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
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

textarea,
input[type='text'] {
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
    margin-top: 12px;
    padding: 10px 14px;
    background: #fff2f0;
    border: 1px solid #ffccc7;
    border-radius: 8px;
    color: #cf1322;
    font-size: 13px;
}

.result-box {
    margin-top: 20px;
    padding: 20px;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e8e8e8;
}

.result-box h3 {
    font-size: 15px;
    margin-bottom: 12px;
    color: #1a1a2e;
    display: flex;
    align-items: center;
    gap: 8px;
}

.entity-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.entity-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 14px;
    cursor: default;
}

.entity-tag small {
    font-size: 10px;
    opacity: 0.8;
}

.type-person {
    background: #e8f5e9;
    color: #2e7d32;
}

.type-location {
    background: #e3f2fd;
    color: #1565c0;
}

.type-time {
    background: #fff3e0;
    color: #e65100;
}

.type-work {
    background: #f3e5f5;
    color: #7b1fa2;
}

.type-official {
    background: #fce4ec;
    color: #c62828;
}

.type-arch {
    background: #e0f2f1;
    color: #00695c;
}

.type-landscape {
    background: #e1f5fe;
    color: #0277bd;
}

.type-station {
    background: #fff8e1;
    color: #f57f17;
}

.type-org {
    background: #fbe9e7;
    color: #bf360c;
}

.type-artifact {
    background: #ede7f6;
    color: #4527a0;
}

.type-biology {
    background: #e8f5e9;
    color: #33691e;
}

.type-default {
    background: #f5f5f5;
    color: #616161;
}

.annotated-text {
    font-size: 18px;
    line-height: 2;
    padding: 16px;
    background: #fff;
    border-radius: 8px;
    border: 1px solid #e8e8e8;
    margin-bottom: 16px;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: 'Noto Serif SC', 'SimSun', serif;
}

.annotated-entity {
    font-weight: 700;
    border-bottom: 2px solid;
    cursor: default;
}

.json-output {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 16px;
    border-radius: 6px;
    font-size: 13px;
    overflow-x: auto;
    margin-top: 8px;
}

details {
    margin-top: 12px;
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
