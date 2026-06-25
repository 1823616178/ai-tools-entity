<template>
    <div class="app-container">
        <NuxtRouteAnnouncer />
        <header class="app-header">
            <div class="header-main">
                <div>
                    <h1>古籍智能处理平台</h1>
                    <p class="subtitle">前端与文档接口保持一致</p>
                </div>
                <div class="header-links">
                    <NuxtLink to="/qa-search" class="header-link">🔍 问答检索</NuxtLink>
                    <NuxtLink to="/ner-external" class="header-link">🔌 外部NER</NuxtLink>
                    <NuxtLink to="/admin" class="admin-link">⚙️ 配置管理</NuxtLink>
                </div>
            </div>
        </header>

        <nav class="tab-nav">
            <button v-for="tab in tabs" :key="tab.key" :class="['tab-btn', { active: activeTab === tab.key }]"
                @click="activeTab = tab.key">
                <span class="tab-icon">{{ tab.icon }}</span>
                <span class="tab-label">{{ tab.label }}</span>
            </button>
        </nav>

        <section v-if="activeTab === 'translate'" class="api-section">
            <h2>自动翻译</h2>
            <p class="desc">请求参数和返回结构均按文档中的 `/base/trans` 对齐。</p>
            <div class="form-group">
                <label>古文内容</label>
                <textarea v-model="translateForm.content" rows="6" placeholder="请输入需要翻译的古文内容..."></textarea>
            </div>
            <button class="btn-primary" :disabled="translateForm.loading" @click="handleTranslate">
                <span v-if="translateForm.loading" class="spinner"></span>
                {{ translateForm.loading ? '翻译中...' : '开始翻译' }}
            </button>
            <div v-if="translateForm.error" class="error-msg">{{ translateForm.error }}</div>
            <div v-if="translateForm.result" class="result-box">
                <h3>翻译结果</h3>
                <div class="result-content">{{ translateForm.result }}</div>
            </div>
        </section>

        <section v-if="activeTab === 'punctuation'" class="api-section">
            <h2>自动句读</h2>
            <p class="desc">请求参数和返回结构均按文档中的 `/base/parse` 对齐。</p>
            <div class="form-group">
                <label>古文内容（无标点）</label>
                <textarea v-model="punctuationForm.content" rows="6" placeholder="请输入没有标点的古文内容..."></textarea>
            </div>
            <button class="btn-primary" :disabled="punctuationForm.loading" @click="handlePunctuation">
                <span v-if="punctuationForm.loading" class="spinner"></span>
                {{ punctuationForm.loading ? '分析中...' : '开始句读' }}
            </button>
            <div v-if="punctuationForm.error" class="error-msg">{{ punctuationForm.error }}</div>
            <div v-if="punctuationForm.result.length" class="result-box">
                <h3>句读结果</h3>
                <div class="segmented-text">
                    <span v-for="(seg, idx) in segmentedDisplay" :key="idx" class="seg-unit">
                        <span class="char">{{ seg.char }}</span>
                        <span v-if="seg.puncs.length" class="punc-mark">{{ seg.puncs }}</span>
                    </span>
                </div>
                <details>
                    <summary>查看 JSON 详情</summary>
                    <pre class="json-output">{{ JSON.stringify(punctuationForm.result, null, 2) }}</pre>
                </details>
            </div>
        </section>

        <section v-if="activeTab === 'ner'" class="api-section">
            <h2>实体标引</h2>
            <p class="desc">请求参数和返回结构均按文档中的 `/base/ner_rela` 对齐。</p>
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
                <div class="entity-tags">
                    <span v-for="(entity, idx) in nerForm.entities" :key="idx"
                        :class="['entity-tag', getEntityClass(entity.type)]"
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

        <section v-if="activeTab === 'ocr'" class="api-section">
            <h2>拍照智能识别</h2>
            <p class="desc">请求参数和返回结构均按文档中的 `/recognize/auto` 对齐。</p>
            <div class="form-group">
                <label>图片 Base64（data:image/...;base64,...）</label>
                <textarea v-model="ocrForm.image" rows="4" placeholder="粘贴 Base64 图片数据..."></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>或选择图片文件</label>
                    <input type="file" accept="image/*" @change="handleImageUpload" />
                </div>
            </div>
            <div v-if="ocrForm.preview" class="image-preview">
                <img :src="ocrForm.preview" alt="预览" />
            </div>
            <button class="btn-primary" :disabled="ocrForm.loading" @click="handleOcr">
                <span v-if="ocrForm.loading" class="spinner"></span>
                {{ ocrForm.loading ? '识别中...' : '开始识别' }}
            </button>
            <div v-if="ocrForm.error" class="error-msg">{{ ocrForm.error }}</div>
            <div v-if="ocrForm.result" class="result-box">
                <h3>
                    识别结果
                    <span class="type-badge">{{ ocrForm.imageType }}</span>
                </h3>
                <div class="ocr-text">{{ ocrForm.ocrText }}</div>
                <div v-if="ocrForm.imageType === 'couplet' && ocrForm.coupletData" class="couplet-display">
                    <div class="couplet-line top-scroll">{{ ocrForm.coupletData.top_scroll }}</div>
                    <div class="couplet-pair">
                        <div class="couplet-line">{{ ocrForm.coupletData.first_line }}</div>
                        <div class="couplet-line">{{ ocrForm.coupletData.second_line }}</div>
                    </div>
                </div>
                <div v-if="ocrForm.imageType === 'poem' && ocrForm.poemData" class="poem-display">
                    <h4>{{ ocrForm.poemData.title }} · {{ ocrForm.poemData.author }}</h4>
                    <p>{{ ocrForm.poemData.content }}</p>
                </div>
                <details>
                    <summary>查看 JSON 详情</summary>
                    <pre class="json-output">{{ JSON.stringify(ocrForm.result, null, 2) }}</pre>
                </details>
            </div>
        </section>

        <section v-if="activeTab === 'switchType'" class="api-section">
            <h2>识别切换类型</h2>
            <p class="desc">请求参数和返回结构均按文档中的 `/switch_type` 对齐。</p>
            <div class="form-group">
                <label>VL OCR 识别结果</label>
                <textarea v-model="switchForm.vlOcrResult" rows="3" placeholder="视觉模型 OCR 结果..."></textarea>
            </div>
            <div class="form-group">
                <label>古籍 OCR 识别结果</label>
                <textarea v-model="switchForm.gujiOcrResult" rows="3" placeholder="古籍 OCR 结果..."></textarea>
            </div>
            <div class="form-group">
                <label>单字 OCR 识别结果</label>
                <input v-model="switchForm.danziOcrResult" type="text" placeholder="单字 OCR 结果..." />
            </div>
            <div class="form-group">
                <label>目标类型</label>
                <select v-model="switchForm.targetType">
                    <option value="couplet">对联 (couplet)</option>
                    <option value="poem">诗词 (poem)</option>
                    <option value="single_char">单字 (single_char)</option>
                    <option value="ancient_book">古籍 (ancient_book)</option>
                </select>
            </div>
            <button class="btn-primary" :disabled="switchForm.loading" @click="handleSwitchType">
                <span v-if="switchForm.loading" class="spinner"></span>
                {{ switchForm.loading ? '转换中...' : '开始转换' }}
            </button>
            <div v-if="switchForm.error" class="error-msg">{{ switchForm.error }}</div>
            <div v-if="switchForm.result" class="result-box">
                <h3>转换结果</h3>
                <pre class="json-output">{{ JSON.stringify(switchForm.result, null, 2) }}</pre>
            </div>
        </section>

        <section v-if="activeTab === 'poetry'" class="api-section">
            <h2>诗词创作</h2>
            <p class="desc">请求参数和返回结构均按文档中的 `/poetry_creation` 对齐。</p>
            <div class="form-group">
                <label>创作要求</label>
                <textarea v-model="poetryForm.requestText" rows="5"
                    placeholder="请输入主题、关键词、体裁或格式要求，例如：请以春天为主题作一首七言绝句"></textarea>
            </div>
            <button class="btn-primary" :disabled="poetryForm.loading" @click="handlePoetryCreation">
                <span v-if="poetryForm.loading" class="spinner"></span>
                {{ poetryForm.loading ? '创作中...' : '开始创作' }}
            </button>
            <div v-if="poetryForm.error" class="error-msg">{{ poetryForm.error }}</div>
            <div v-if="poetryForm.result" class="result-box poetry-result-box">
                <h3>创作结果</h3>
                <div class="poetry-result">{{ poetryForm.result }}</div>
            </div>
        </section>

        <section v-if="activeTab === 'presetQuestions'" class="api-section">
            <h2>问题预设</h2>
            <p class="desc">请求参数和返回结构均按文档中的 `/preset_questions` 对齐。</p>
            <div class="form-group">
                <label>用户 ID</label>
                <input v-model="presetForm.userId" type="text" placeholder="user_123456" />
            </div>
            <div class="form-group">
                <label>近30天问题历史（每行一个问题）</label>
                <textarea v-model="presetForm.recentQuestionsText" rows="8"
                    placeholder="手机拍照哪个好？&#10;如何快速减肥？&#10;Python入门教程推荐"></textarea>
            </div>
            <div class="form-group">
                <label>最大返回数量（5-10）</label>
                <div class="number-input-wrapper">
                    <div class="slider-container">
                        <input v-model.number="presetForm.maxPresetCount" type="range" min="5" max="10" step="1"
                            class="number-slider" />
                        <div class="slider-value">{{ presetForm.maxPresetCount }}</div>
                    </div>
                    <input v-model.number="presetForm.maxPresetCount" type="number" min="5" max="10"
                        class="number-input" />
                </div>
                <div class="input-hint">推荐5-10个问题，默认8个</div>
            </div>
            <button class="btn-primary" :disabled="presetForm.loading" @click="handlePresetQuestions">
                <span v-if="presetForm.loading" class="spinner"></span>
                {{ presetForm.loading ? '生成中...' : '生成预设问题' }}
            </button>
            <div v-if="presetForm.error" class="error-msg">{{ presetForm.error }}</div>
            <div v-if="presetForm.presetQuestions.length" class="result-box">
                <h3>预设问题结果（{{ presetForm.presetQuestions.length }} 条）</h3>
                <ol class="preset-list">
                    <li v-for="(question, idx) in presetForm.presetQuestions" :key="idx">{{ question }}</li>
                </ol>
            </div>
        </section>

        <section v-if="activeTab === 'followUpQuestions'" class="api-section">
            <h2>问题追问</h2>
            <p class="desc">请求参数和返回结构均按文档中的 `/follow_up_questions` 对齐。</p>
            <div class="form-group">
                <label>当前问题</label>
                <textarea v-model="followUpForm.query" rows="3" placeholder="请输入当前用户问题，例如：推荐一款手机"></textarea>
            </div>
            <div class="form-group">
                <label>历史对话记录（每行一条，格式：用户：xxx 或 助手：xxx）</label>
                <textarea v-model="followUpForm.historyText" rows="5"
                    placeholder="用户：我想要拍照好的手机&#10;助手：拍照好的手机推荐..."></textarea>
            </div>
            <div class="form-group">
                <label>最大追问数量（1-5）</label>
                <div class="number-input-wrapper">
                    <div class="slider-container">
                        <input v-model.number="followUpForm.maxQuestions" type="range" min="1" max="5" step="1"
                            class="number-slider" />
                        <div class="slider-value">{{ followUpForm.maxQuestions }}</div>
                    </div>
                    <input v-model.number="followUpForm.maxQuestions" type="number" min="1" max="5"
                        class="number-input" />
                </div>
                <div class="input-hint">推荐1-5个追问问题，默认3个</div>
            </div>
            <button class="btn-primary" :disabled="followUpForm.loading" @click="handleFollowUpQuestions">
                <span v-if="followUpForm.loading" class="spinner"></span>
                {{ followUpForm.loading ? '生成中...' : '生成追问问题' }}
            </button>
            <div v-if="followUpForm.error" class="error-msg">{{ followUpForm.error }}</div>
            <div v-if="followUpForm.followUpQuestions.length" class="result-box">
                <h3>追问问题结果（{{ followUpForm.followUpQuestions.length }} 条）</h3>
                <ol class="preset-list">
                    <li v-for="(question, idx) in followUpForm.followUpQuestions" :key="idx">{{ question }}</li>
                </ol>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
type ApiBase = {
    code: number
    message: string
}

type PunctuationItem = {
    pos: number
    punc: string[]
}

type NerEntity = Record<string, any>
type NerRelation = Record<string, any>

type OcrDisplay = {
    ocr_result: string
    image_type: string
    data: Record<string, any>
}

type OcrRecognitionContext = {
    vl_ocr_result?: string
    guji_ocr_result?: string
    danzi_ocr_result?: string
}

type OcrResult = {
    display: OcrDisplay
    recognition_context?: OcrRecognitionContext
}

type TranslateResponse = ApiBase & {
    results: string
}

type PunctuationResponse = ApiBase & {
    results: PunctuationItem[]
}

type NerResponse = ApiBase & {
    results: {
        entity: NerEntity[]
        relation: NerRelation[]
    }
}

type OcrResponse = ApiBase & {
    result: OcrResult | null
}

type SwitchTypeResponse = ApiBase & {
    result: OcrResult | null
}

type PoetryCreationResponse = ApiBase & {
    result: string
}

type PresetQuestionsResponse = ApiBase & {
    preset_questions: string[]
}

type FollowUpQuestionsResponse = ApiBase & {
    follow_up_questions: string[]
}

const activeTab = ref('translate')

const tabs = [
    { key: 'translate', icon: '🌐', label: '自动翻译' },
    { key: 'punctuation', icon: '📖', label: '自动句读' },
    { key: 'ner', icon: '🏷️', label: '实体标引' },
    { key: 'ocr', icon: '📷', label: '拍照识别' },
    { key: 'switchType', icon: '🔄', label: '识别切换类型' },
    { key: 'poetry', icon: '✍️', label: '诗词创作' },
    { key: 'presetQuestions', icon: '💡', label: '问题预设' },
    { key: 'followUpQuestions', icon: '❓', label: '问题追问' },
]

const demoContent = '獻平淮夷雅表元和十二年十月癸酉淮蔡平按毛詩江漢注淮夷東國在淮浦而夷行也呉元濟在淮西故亦曰淮夷蓋公擬江漢之詩而作也與韓文公平淮西碑同時作先儒穆伯長云韓元和聖德平淮西柳雅章之類皆辭嚴義偉制述如經能崒然聳唐德於盛漢之表談藪云論柳文者皆以謂封建論退之所無淮西雅韓文不逮'
const defaultNerType = '建筑;山水;时间;地点;动植物;著作;驿站;职官;人物;机构;器物'
const demoPoetryPrompt = '请以春天为主题作一首七言绝句'
const demoPresetQuestions = ['手机拍照哪个好？', '如何快速减肥？', 'Python入门教程推荐', '旅游景点推荐', '如何提高英语口语？', '笔记本电脑选购指南']
const demoFollowUpQuery = '推荐一款手机'
const demoFollowUpHistory = [
    { role: 'user', content: '我想要拍照好的手机', timestamp: '2024-01-01T10:00:00Z' },
]

function createJnEntryId() {
    return `实体标引(${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)})`
}

function getErrorMessage(error: any, fallback: string) {
    return error?.data?.message || error?.message || fallback
}

const translateForm = reactive({
    content: demoContent,
    loading: false,
    error: '',
    result: '',
})

async function handleTranslate() {
    translateForm.loading = true
    translateForm.error = ''
    translateForm.result = ''

    try {
        const res = await $fetch<TranslateResponse>('/base/trans', {
            method: 'POST',
            body: { content: translateForm.content },
        })

        if (res.code === 200) {
            translateForm.result = typeof res.results === 'string' ? res.results : ''
        } else {
            translateForm.error = res.message || '翻译失败'
        }
    } catch (e: any) {
        translateForm.error = getErrorMessage(e, '请求异常')
    } finally {
        translateForm.loading = false
    }
}

const punctuationForm = reactive({
    content: demoContent,
    loading: false,
    error: '',
    result: [] as PunctuationItem[],
})

const segmentedDisplay = computed(() => {
    const text = punctuationForm.content
    const marks = punctuationForm.result
    if (!marks.length) return []

    const sorted = [...marks].sort((a, b) => a.pos - b.pos)
    const segments: Array<{ char: string; puncs: string }> = []
    let lastPos = 0

    for (const mark of sorted) {
        const pos = mark.pos

        if (pos > lastPos) {
            for (let i = lastPos; i < pos && i < text.length; i++) {
                segments.push({ char: text[i] ?? '', puncs: '' })
            }
        }

        if (segments.length && pos > 0 && mark.punc?.length) {
            segments[segments.length - 1]!.puncs += mark.punc.join('')
        } else if (pos === 0 && mark.punc?.length) {
            segments.unshift({ char: '', puncs: mark.punc.join('') })
        }

        lastPos = pos
    }

    for (let i = lastPos; i < text.length; i++) {
        segments.push({ char: text[i] ?? '', puncs: '' })
    }

    return segments
})

async function handlePunctuation() {
    punctuationForm.loading = true
    punctuationForm.error = ''
    punctuationForm.result = []

    try {
        const res = await $fetch<PunctuationResponse>('/base/parse', {
            method: 'POST',
            body: { content: punctuationForm.content },
        })

        if (res.code === 200) {
            punctuationForm.result = Array.isArray(res.results) ? res.results : []
        } else {
            punctuationForm.error = res.message || '句读失败'
        }
    } catch (e: any) {
        punctuationForm.error = getErrorMessage(e, '请求异常')
    } finally {
        punctuationForm.loading = false
    }
}

const nerForm = reactive({
    content: demoContent,
    nerType: defaultNerType,
    jnEntryId: createJnEntryId(),
    loading: false,
    error: '',
    entities: [] as NerEntity[],
})

function getEntityClass(type: string) {
    const map: Record<string, string> = {
        人物: 'type-person',
        地点: 'type-location',
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

async function handleNer() {
    nerForm.loading = true
    nerForm.error = ''
    nerForm.entities = []

    try {
        const res = await $fetch<NerResponse>('/base/ner_rela', {
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

const ocrForm = reactive({
    image: '',
    preview: '',
    loading: false,
    error: '',
    result: null as OcrResult | null,
    imageType: '',
    ocrText: '',
    coupletData: null as Record<string, any> | null,
    poemData: null as Record<string, any> | null,
})

function resetOcrPresentation() {
    ocrForm.result = null
    ocrForm.imageType = ''
    ocrForm.ocrText = ''
    ocrForm.coupletData = null
    ocrForm.poemData = null
}

function applyOcrPresentation(result: OcrResult | null) {
    resetOcrPresentation()
    ocrForm.result = result

    const display = result?.display
    if (!display) return

    ocrForm.imageType = display.image_type || ''
    ocrForm.ocrText = display.ocr_result || ''

    if (display.image_type === 'couplet') {
        ocrForm.coupletData = display.data || {}
    }

    if (display.image_type === 'poem') {
        ocrForm.poemData = display.data || {}
    }
}

function handleImageUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
        ocrForm.image = reader.result as string
        ocrForm.preview = reader.result as string
    }
    reader.readAsDataURL(file)
}

async function handleOcr() {
    ocrForm.loading = true
    ocrForm.error = ''
    resetOcrPresentation()

    try {
        const res = await $fetch<OcrResponse>('/recognize/auto', {
            method: 'POST',
            body: { image: ocrForm.image },
        })

        if (res.code === 200) {
            applyOcrPresentation(res.result)
        } else {
            ocrForm.error = res.message || '识别失败'
        }
    } catch (e: any) {
        ocrForm.error = getErrorMessage(e, '请求异常')
    } finally {
        ocrForm.loading = false
    }
}

const switchForm = reactive({
    vlOcrResult: '',
    gujiOcrResult: '',
    danziOcrResult: '',
    targetType: 'couplet',
    loading: false,
    error: '',
    result: null as OcrResult | null,
})

async function handleSwitchType() {
    switchForm.loading = true
    switchForm.error = ''
    switchForm.result = null

    try {
        const res = await $fetch<SwitchTypeResponse>('/switch_type', {
            method: 'POST',
            body: {
                recognition_context: {
                    vl_ocr_result: switchForm.vlOcrResult,
                    guji_ocr_result: switchForm.gujiOcrResult,
                    danzi_ocr_result: switchForm.danziOcrResult,
                },
                target_type: switchForm.targetType,
            },
        })

        if (res.code === 200) {
            switchForm.result = res.result
        } else {
            switchForm.error = res.message || '切换失败'
        }
    } catch (e: any) {
        switchForm.error = getErrorMessage(e, '请求异常')
    } finally {
        switchForm.loading = false
    }
}

const poetryForm = reactive({
    requestText: demoPoetryPrompt,
    loading: false,
    error: '',
    result: '',
})

async function handlePoetryCreation() {
    poetryForm.loading = true
    poetryForm.error = ''
    poetryForm.result = ''

    try {
        const res = await $fetch<PoetryCreationResponse>('/poetry_creation', {
            method: 'POST',
            body: {
                request_text: poetryForm.requestText,
            },
        })

        if (res.code === 200) {
            poetryForm.result = typeof res.result === 'string' ? res.result : ''
        } else {
            poetryForm.error = res.message || '诗词创作失败'
        }
    } catch (e: any) {
        poetryForm.error = getErrorMessage(e, '请求异常')
    } finally {
        poetryForm.loading = false
    }
}

const presetForm = reactive({
    userId: 'user_123456',
    recentQuestionsText: demoPresetQuestions.join('\n'),
    maxPresetCount: 8,
    loading: false,
    error: '',
    presetQuestions: [] as string[],
})

async function handlePresetQuestions() {
    presetForm.loading = true
    presetForm.error = ''
    presetForm.presetQuestions = []

    const recentQuestions = presetForm.recentQuestionsText
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)

    try {
        const res = await $fetch<PresetQuestionsResponse>('/preset_questions', {
            method: 'POST',
            body: {
                user_id: presetForm.userId,
                recent_questions: recentQuestions,
                max_preset_count: presetForm.maxPresetCount,
            },
        })

        if (res.code === 200) {
            presetForm.presetQuestions = Array.isArray(res.preset_questions) ? res.preset_questions : []
        } else {
            presetForm.error = res.message || '问题预设失败'
        }
    } catch (e: any) {
        presetForm.error = getErrorMessage(e, '请求异常')
    } finally {
        presetForm.loading = false
    }
}

const followUpForm = reactive({
    query: demoFollowUpQuery,
    historyText: demoFollowUpHistory.map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`).join('\n'),
    maxQuestions: 3,
    loading: false,
    error: '',
    followUpQuestions: [] as string[],
})

function parseConversationHistory(text: string) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            const match = line.match(/^(用户|助手|user|assistant)[：:]\s*(.+)$/)
            if (match) {
                return {
                    role: match[1] === '用户' || match[1] === 'user' ? 'user' : 'assistant',
                    content: match[2],
                    timestamp: new Date().toISOString(),
                }
            }
            return null
        })
        .filter((item): item is { role: string; content: string; timestamp: string } => item !== null)
}

async function handleFollowUpQuestions() {
    followUpForm.loading = true
    followUpForm.error = ''
    followUpForm.followUpQuestions = []

    const conversation_history = parseConversationHistory(followUpForm.historyText)

    try {
        const res = await $fetch<FollowUpQuestionsResponse>('/follow_up_questions', {
            method: 'POST',
            body: {
                query: followUpForm.query,
                conversation_history,
                max_questions: followUpForm.maxQuestions,
            },
        })

        if (res.code === 200) {
            followUpForm.followUpQuestions = Array.isArray(res.follow_up_questions) ? res.follow_up_questions : []
        } else {
            followUpForm.error = res.message || '追问生成失败'
        }
    } catch (e: any) {
        followUpForm.error = getErrorMessage(e, '请求异常')
    } finally {
        followUpForm.loading = false
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

.header-links {
    display: flex;
    align-items: center;
    gap: 10px;
}

.header-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    background: #fff;
    color: #1a1a2e;
    text-decoration: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    border: 1.5px solid #1a1a2e;
    transition: all 0.2s;
}

.header-link:hover {
    background: #1a1a2e;
    color: #fff;
}

.admin-link {
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

.admin-link:hover {
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
    overflow-x: auto;
}

.tab-btn {
    flex: 1;
    min-width: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 12px;
}

.tab-btn:hover {
    background: #f5f5f5;
}

.tab-btn.active {
    background: #1a1a2e;
    color: #fff;
}

.tab-icon {
    font-size: 20px;
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
input[type='text'],
select {
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
input:focus,
select:focus {
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
    transition: background 0.2s;
}

.number-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #1a1a2e;
    cursor: pointer;
    transition: background 0.2s;
}

.number-slider::-webkit-slider-thumb:hover {
    background: #2d2d4a;
}

.number-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 50%;
    background: #1a1a2e;
    cursor: pointer;
    transition: background 0.2s;
}

.number-slider::-moz-range-thumb:hover {
    background: #2d2d4a;
}

.slider-value {
    min-width: 28px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: #1a1a2e;
    background: #f0f2f5;
    padding: 4px 8px;
    border-radius: 6px;
}

.number-input {
    width: 60px;
    padding: 8px 12px;
    border: 1.5px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    text-align: center;
    background: #fafafa;
    transition: border-color 0.2s;
}

.number-input:focus {
    outline: none;
    border-color: #1a1a2e;
    background: #fff;
}

.input-hint {
    margin-top: 6px;
    font-size: 12px;
    color: #888;
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

.result-content {
    font-size: 15px;
    line-height: 1.9;
    white-space: pre-wrap;
    color: #333;
}

.type-badge {
    font-size: 12px;
    background: #1a1a2e;
    color: #fff;
    padding: 2px 10px;
    border-radius: 12px;
    font-weight: 400;
}

.segmented-text {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    font-size: 20px;
    line-height: 2;
    padding: 12px;
    background: #fff;
    border-radius: 6px;
}

.seg-unit {
    display: inline-flex;
}

.seg-unit .char {
    color: #333;
}

.seg-unit .punc-mark {
    color: #e74c3c;
    font-weight: 700;
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

.couplet-display {
    margin-top: 16px;
    text-align: center;
    padding: 20px;
    background: linear-gradient(135deg, #fdf6e3, #f5e6c8);
    border-radius: 8px;
    border: 2px solid #c9a96e;
}

.couplet-line {
    font-size: 22px;
    font-weight: 600;
    color: #5c3d2e;
    padding: 4px 0;
    letter-spacing: 2px;
}

.top-scroll {
    font-size: 26px;
    font-weight: 700;
}

.couplet-pair {
    display: flex;
    justify-content: center;
    gap: 40px;
    margin-top: 12px;
}

.poem-display {
    margin-top: 16px;
    text-align: center;
    padding: 24px;
    background: linear-gradient(135deg, #f8f9fa, #e9ecef);
    border-radius: 8px;
    border-left: 4px solid #1a1a2e;
}

.poem-display h4 {
    font-size: 18px;
    margin-bottom: 12px;
    color: #1a1a2e;
}

.poem-display p {
    font-size: 16px;
    line-height: 2;
    color: #555;
}

.image-preview {
    margin-bottom: 16px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e0e0e0;
}

.image-preview img {
    max-width: 100%;
    max-height: 300px;
    display: block;
}

.ocr-text {
    font-size: 15px;
    line-height: 1.9;
    white-space: pre-wrap;
    color: #333;
    margin-top: 8px;
}

.poetry-result-box {
    background: linear-gradient(135deg, #f5efe2, #efe3c7);
    border: 1px solid #d7c49a;
}

.poetry-result {
    font-size: 20px;
    line-height: 2.1;
    letter-spacing: 1px;
    color: #4a3426;
    white-space: pre-wrap;
    text-align: center;
    padding: 24px 16px;
    background:
        radial-gradient(circle at top, rgba(255, 255, 255, 0.65), transparent 45%),
        linear-gradient(180deg, rgba(255, 248, 230, 0.9), rgba(244, 232, 203, 0.9));
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(126, 90, 50, 0.12);
}

.preset-list {
    margin: 0;
    padding-left: 20px;
}

.preset-list li {
    margin-bottom: 8px;
    line-height: 1.7;
}

@media (max-width: 600px) {
    .form-row {
        flex-direction: column;
        gap: 0;
    }

    .tab-btn {
        font-size: 11px;
    }

    .couplet-pair {
        flex-direction: column;
        gap: 12px;
    }

    .poetry-result {
        font-size: 18px;
        line-height: 1.9;
        padding: 18px 12px;
    }
}
</style>
