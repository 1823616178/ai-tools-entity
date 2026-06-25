export function isDeepseekMode(mode: unknown): boolean {
  return typeof mode === 'string' && mode.toLowerCase().includes('deepseek')
}

export function buildQaOutputFormat(enableThink: boolean): string {
  if (enableThink) {
    return [
      '输出格式（format）：',
      '<think>',
      '{reason}',
      '</think>',
      '{answer}',
      '',
      '格式规则：',
      '- {reason} 用中文输出深度思考过程。',
      '- {answer} 用现代汉语输出正式回答。',
      '- 不要输出 JSON、SSE 标记、Markdown 代码块或格式说明。',
      '- 不要输出 {reason}、{answer} 这些占位符字样。',
    ].join('\n')
  }

  return [
    '输出格式（format）：',
    '{answer}',
    '',
    '格式规则：',
    '- 只输出正式回答。',
    '- 不要输出推理过程、思考过程、JSON、SSE 标记、Markdown 代码块或格式说明。',
    '- 不要输出 {answer} 这个占位符字样。',
  ].join('\n')
}
