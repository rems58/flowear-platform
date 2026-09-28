/** Erreurs métier du cœur. La couche API les traduit en réponses HTTP. */
export type ChatErrorCode =
  | 'bad_request'
  | 'onboarding_required'
  | 'conversation_not_found'
  | 'quota_exceeded'
  | 'quota_exceeded_month'
  | 'cost_exceeded'
  | 'cost_exceeded_month'
  | 'no_provider'

export class ChatError extends Error {
  constructor(
    public readonly code: ChatErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ChatError'
  }
}
