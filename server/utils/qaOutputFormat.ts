export function buildQaOutputFormat(): string {
  return [
    '输出要求：',
    '- 直接输出正式回答，不要输出推理过程或思考过程。',
    '- 不要输出 JSON、SSE 标记、Markdown 代码块。',
    '- 涉及书名、作者、馆藏等信息时保留原文名称。',
    '- 使用现代汉语，条理清晰。',
  ].join('\n')
}
