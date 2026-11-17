/** 可选模型清单；由部署方按自己接入的服务自定义。 */
export type ModelOption = { id: string; label: string }

export const MODEL_OPTIONS: ModelOption[] = [
  { id: '[0.5]deepseek-v4.1-flash-1017', label: 'DeepSeek 4.1 Flash' },
  { id: 'deepseek-v3.2', label: 'DeepSeek 3.2' },
  { id: '[抗截断][vertex]gemini-4-argon', label: 'Gemini 4（抗截断）' },
]

export const DEFAULT_MODEL = MODEL_OPTIONS[0].id
