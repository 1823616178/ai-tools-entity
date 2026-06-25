<template>
    <div class="admin-container">
        <header class="admin-header">
            <h1>⚙️ LLM 模型配置管理</h1>
            <NuxtLink to="/" class="back-link">← 返回首页</NuxtLink>
        </header>

        <div class="admin-content">
            <!-- 配置列表 -->
            <section class="config-section">
                <div class="section-header">
                    <h2>配置列表</h2>
                    <button class="btn-primary" @click="openCreateModal">
                        <span>+</span> 添加配置
                    </button>
                </div>

                <div v-if="loading" class="loading">加载中...</div>
                <div v-else-if="configs.length === 0" class="empty">暂无配置，请点击上方按钮添加</div>
                <div v-else class="config-table-wrapper">
                    <table class="config-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>名称</th>
                                <th>Base URL</th>
                                <th>模型</th>
                                <th>温度</th>
                                <th>状态</th>
                                <th>默认</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="config in configs" :key="config.id"
                                :class="{ 'row-inactive': !config.isActive }">
                                <td>{{ config.id }}</td>
                                <td>{{ config.name }}</td>
                                <td class="cell-ellipsis" :title="config.baseUrl">{{ config.baseUrl }}</td>
                                <td>{{ config.model }}</td>
                                <td>{{ config.temperature }}</td>
                                <td>
                                    <span
                                        :class="['status-badge', config.isActive ? 'status-active' : 'status-inactive']">
                                        {{ config.isActive ? '启用' : '禁用' }}
                                    </span>
                                </td>
                                <td>
                                    <span v-if="config.isDefault" class="default-badge">默认</span>
                                    <span v-else>-</span>
                                </td>
                                <td class="actions">
                                    <button class="btn-small btn-edit" @click="openEditModal(config)">编辑</button>
                                    <button class="btn-small btn-delete" @click="handleDelete(config.id)">删除</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- 当前默认配置 -->
            <section class="config-section">
                <h2>当前生效配置</h2>
                <div v-if="defaultLoading" class="loading">加载中...</div>
                <div v-else-if="!defaultConfig" class="empty">暂无生效配置</div>
                <div v-else class="default-config-card">
                    <div class="config-item">
                        <label>名称：</label>
                        <span>{{ defaultConfig.name }}</span>
                    </div>
                    <div class="config-item">
                        <label>Base URL：</label>
                        <span>{{ defaultConfig.baseUrl }}</span>
                    </div>
                    <div class="config-item">
                        <label>模型：</label>
                        <span>{{ defaultConfig.model }}</span>
                    </div>
                    <div class="config-item">
                        <label>温度：</label>
                        <span>{{ defaultConfig.temperature }}</span>
                    </div>
                    <div class="config-item">
                        <label>API Key：</label>
                        <span>{{ maskApiKey(defaultConfig.apiKey) }}</span>
                    </div>
                    <div v-if="defaultConfig.fromCache !== undefined" class="cache-hint">
                        {{ defaultConfig.fromCache ? '（来自Redis缓存）' : '（来自数据库）' }}
                    </div>
                </div>
            </section>
        </div>

        <!-- 创建/编辑弹窗 -->
        <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
            <div class="modal">
                <h3>{{ isEdit ? '编辑配置' : '添加配置' }}</h3>
                <div class="form-group">
                    <label>配置名称 <span class="required">*</span></label>
                    <input v-model="form.name" type="text" placeholder="如：OpenAI GPT-4" />
                </div>
                <div class="form-group">
                    <label>Base URL <span class="required">*</span></label>
                    <input v-model="form.baseUrl" type="text" placeholder="https://api.openai.com/v1 或 https://opencode.ai/zen/go/v1/messages" />
                </div>
                <div class="form-group">
                    <label>API Key <span class="required">*</span></label>
                    <input v-model="form.apiKey" type="text" placeholder="sk-..." />
                </div>
                <div class="form-group">
                    <label>模型名称 <span class="required">*</span></label>
                    <input v-model="form.model" type="text" placeholder="gpt-4o" />
                </div>
                <div class="form-group">
                    <label>温度参数 (0-2)</label>
                    <div class="number-input-wrapper">
                        <div class="slider-container">
                            <input v-model.number="form.temperature" type="range" min="0" max="2" step="0.1"
                                class="number-slider" />
                            <div class="slider-value">{{ form.temperature.toFixed(1) }}</div>
                        </div>
                        <input v-model.number="form.temperature" type="number" step="0.1" min="0" max="2"
                            class="number-input" />
                    </div>
                    <div class="input-hint">较低温度使输出更确定，较高温度使输出更随机，默认0.1</div>
                </div>
                <div class="form-row">
                    <div class="form-group checkbox-group">
                        <label>
                            <input v-model="form.isActive" type="checkbox" />
                            启用
                        </label>
                    </div>
                    <div class="form-group checkbox-group">
                        <label>
                            <input v-model="form.isDefault" type="checkbox" />
                            设为默认
                        </label>
                    </div>
                </div>
                <div v-if="formError" class="error-msg">{{ formError }}</div>
                <div class="modal-actions">
                    <button class="btn-secondary" @click="closeModal">取消</button>
                    <button class="btn-primary" :disabled="formSubmitting" @click="handleSubmit">
                        {{ formSubmitting ? '保存中...' : '保存' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
interface LlmConfig {
    id: number
    name: string
    baseUrl: string
    apiKey: string
    model: string
    temperature: number
    isActive: boolean
    isDefault: boolean
    createdAt?: string
    updatedAt?: string
}

interface ApiResponse<T> {
    code: number
    message: string
    data: T
    fromCache?: boolean
}

const configs = ref<LlmConfig[]>([])
const loading = ref(false)
const defaultConfig = ref<(LlmConfig & { fromCache?: boolean }) | null>(null)
const defaultLoading = ref(false)

const showModal = ref(false)
const isEdit = ref(false)
const editId = ref<number | null>(null)
const formSubmitting = ref(false)
const formError = ref('')

const form = reactive({
    name: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.1,
    isActive: true,
    isDefault: false,
})

function maskApiKey(key: string): string {
    if (!key || key.length < 12) return key
    return `${key.slice(0, 8)}...${key.slice(-4)}`
}

async function fetchConfigs() {
    loading.value = true
    try {
        const res = await $fetch<ApiResponse<LlmConfig[]>>('/api/admin/llm-configs')
        if (res.code === 200) {
            configs.value = res.data
        }
    } catch (e: any) {
        alert('获取配置列表失败: ' + (e?.message || '未知错误'))
    } finally {
        loading.value = false
    }
}

async function fetchDefaultConfig() {
    defaultLoading.value = true
    try {
        const res = await $fetch<ApiResponse<LlmConfig & { fromCache?: boolean }>>('/api/admin/llm-configs/default')
        if (res.code === 200) {
            defaultConfig.value = { ...res.data, fromCache: res.fromCache }
        } else {
            defaultConfig.value = null
        }
    } catch (e: any) {
        defaultConfig.value = null
    } finally {
        defaultLoading.value = false
    }
}

function resetForm() {
    form.name = ''
    form.baseUrl = ''
    form.apiKey = ''
    form.model = ''
    form.temperature = 0.1
    form.isActive = true
    form.isDefault = false
    editId.value = null
    formError.value = ''
}

function openCreateModal() {
    resetForm()
    isEdit.value = false
    showModal.value = true
}

function openEditModal(config: LlmConfig) {
    form.name = config.name
    form.baseUrl = config.baseUrl
    form.apiKey = config.apiKey
    form.model = config.model
    form.temperature = config.temperature
    form.isActive = config.isActive
    form.isDefault = config.isDefault
    editId.value = config.id
    isEdit.value = true
    showModal.value = true
}

function closeModal() {
    showModal.value = false
    resetForm()
}

async function handleSubmit() {
    if (!form.name || !form.baseUrl || !form.apiKey || !form.model) {
        formError.value = '请填写所有必填项'
        return
    }

    formSubmitting.value = true
    formError.value = ''

    try {
        if (isEdit.value && editId.value) {
            const res = await $fetch<ApiResponse<LlmConfig>>(`/api/admin/llm-configs/${editId.value}`, {
                method: 'PUT',
                body: { ...form },
            })
            if (res.code !== 200) {
                formError.value = res.message
                return
            }
        } else {
            const res = await $fetch<ApiResponse<LlmConfig>>('/api/admin/llm-configs', {
                method: 'POST',
                body: { ...form },
            })
            if (res.code !== 200) {
                formError.value = res.message
                return
            }
        }

        closeModal()
        await fetchConfigs()
        await fetchDefaultConfig()
    } catch (e: any) {
        formError.value = e?.data?.message || e?.message || '操作失败'
    } finally {
        formSubmitting.value = false
    }
}

async function handleDelete(id: number) {
    if (!confirm('确定要删除这条配置吗？')) return

    try {
        const res = await $fetch<ApiResponse<null>>(`/api/admin/llm-configs/${id}`, {
            method: 'DELETE',
        })
        if (res.code === 200) {
            await fetchConfigs()
            await fetchDefaultConfig()
        } else {
            alert(res.message)
        }
    } catch (e: any) {
        alert('删除失败: ' + (e?.message || '未知错误'))
    }
}

onMounted(() => {
    fetchConfigs()
    fetchDefaultConfig()
})
</script>

<style scoped>
.admin-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px 16px 60px;
}

.admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0 24px;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 24px;
}

.admin-header h1 {
    font-size: 24px;
    color: #1a1a2e;
}

.back-link {
    color: #1a1a2e;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
}

.back-link:hover {
    text-decoration: underline;
}

.admin-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.config-section {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.config-section h2 {
    font-size: 18px;
    color: #1a1a2e;
    margin-bottom: 16px;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.section-header h2 {
    margin-bottom: 0;
}

.loading,
.empty {
    text-align: center;
    padding: 40px;
    color: #999;
    font-size: 14px;
}

.config-table-wrapper {
    overflow-x: auto;
}

.config-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.config-table th,
.config-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #f0f0f0;
}

.config-table th {
    background: #fafafa;
    font-weight: 600;
    color: #555;
    white-space: nowrap;
}

.config-table tbody tr:hover {
    background: #fafafa;
}

.row-inactive td {
    color: #999;
}

.cell-ellipsis {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
}

.status-active {
    background: #e8f5e9;
    color: #2e7d32;
}

.status-inactive {
    background: #f5f5f5;
    color: #999;
}

.default-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    background: #1a1a2e;
    color: #fff;
}

.actions {
    white-space: nowrap;
}

.btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    background: #1a1a2e;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
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

.btn-secondary {
    padding: 10px 20px;
    background: #f5f5f5;
    color: #555;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-secondary:hover {
    background: #e8e8e8;
}

.btn-small {
    padding: 4px 12px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    margin-right: 6px;
    transition: background 0.2s;
}

.btn-edit {
    background: #e3f2fd;
    color: #1565c0;
}

.btn-edit:hover {
    background: #bbdefb;
}

.btn-delete {
    background: #ffebee;
    color: #c62828;
}

.btn-delete:hover {
    background: #ffcdd2;
}

.default-config-card {
    background: #f9fafb;
    border-radius: 8px;
    padding: 20px;
    border: 1px solid #e8e8e8;
}

.config-item {
    display: flex;
    padding: 8px 0;
    font-size: 14px;
}

.config-item label {
    width: 100px;
    color: #888;
    flex-shrink: 0;
}

.config-item span {
    color: #333;
    word-break: break-all;
}

.cache-hint {
    margin-top: 8px;
    font-size: 12px;
    color: #999;
}

/* 弹窗 */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
}

.modal {
    background: #fff;
    border-radius: 12px;
    padding: 28px;
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
    overflow-y: auto;
}

.modal h3 {
    font-size: 18px;
    color: #1a1a2e;
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

.form-group input[type='text'],
.form-group input[type='number'] {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
    background: #fafafa;
}

.form-group input:focus {
    outline: none;
    border-color: #1a1a2e;
    background: #fff;
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
    min-width: 36px;
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

.required {
    color: #e74c3c;
}

.form-row {
    display: flex;
    gap: 24px;
}

.checkbox-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    cursor: pointer;
}

.checkbox-group input[type='checkbox'] {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

.error-msg {
    margin: 12px 0;
    padding: 10px 14px;
    background: #fff2f0;
    border: 1px solid #ffccc7;
    border-radius: 8px;
    color: #cf1322;
    font-size: 13px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 20px;
}

@media (max-width: 600px) {
    .admin-header {
        flex-direction: column;
        gap: 12px;
        align-items: flex-start;
    }

    .config-table th,
    .config-table td {
        padding: 8px 10px;
        font-size: 13px;
    }

    .cell-ellipsis {
        max-width: 120px;
    }
}
</style>
