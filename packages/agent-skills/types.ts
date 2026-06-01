export interface Skill {
  id: string
  name: string
  description: string
  defaultModel: string
  systemPrompt: string
  config: {
    max_tokens?: number
    temperature?: number
  }
}
