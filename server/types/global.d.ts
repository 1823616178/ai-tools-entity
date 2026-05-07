/// <reference types="node" />

declare namespace NodeJS {
  interface ProcessEnv {
    LLM_BASE_URL?: string
    LLM_API_KEY?: string
    LLM_MODEL?: string
  }
}
