import { ChatError } from '@/core/agent/errors'

/** Erreur HTTP typée. Le message est destiné à l'utilisateur, jamais un détail interne. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }

  static badRequest(message = 'Requête invalide', details?: Record<string, unknown>) {
    return new AppError('BAD_REQUEST', 400, message, details)
  }
  static unauthorized(message = 'Connexion requise') {
    return new AppError('UNAUTHORIZED', 401, message)
  }
  static forbidden(message = 'Accès refusé') {
    return new AppError('FORBIDDEN', 403, message)
  }
  static notFound(message = 'Introuvable') {
    return new AppError('NOT_FOUND', 404, message)
  }
  static tooLarge(message = 'Requête trop volumineuse') {
    return new AppError('PAYLOAD_TOO_LARGE', 413, message)
  }
  static rateLimited(resetAt: Date) {
    return new AppError('RATE_LIMITED', 429, 'Trop de requêtes, réessaie dans un instant.', { resetAt: resetAt.toISOString() })
  }
  static internal(message = 'Erreur interne') {
    return new AppError('INTERNAL', 500, message)
  }

  static fromChatError(error: ChatError) {
    return new AppError(error.code.toUpperCase(), error.status, error.message, error.details)
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } }
  }
}
