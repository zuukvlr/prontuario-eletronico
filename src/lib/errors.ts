/** Converte erros do Firebase em mensagens claras em português, sem vazar detalhes internos. */
export function friendlyError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-disabled': 'Este usuário foi desativado. Procure o administrador.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    'auth/network-request-failed': 'Sem conexão com a internet. Verifique sua rede e tente novamente.',
    'auth/email-already-in-use': 'Já existe um usuário com este e-mail.',
    'auth/weak-password': 'A senha é muito fraca (mínimo de 8 caracteres).',
    'auth/requires-recent-login': 'Por segurança, entre novamente para concluir esta ação.',
    'auth/id-token-expired': 'Sua sessão expirou. Entre novamente.',
    'auth/user-token-expired': 'Sua sessão expirou. Entre novamente.',
    'permission-denied': 'Você não tem permissão para realizar esta ação.',
    'unauthenticated': 'Sua sessão expirou. Entre novamente.',
    'unavailable': 'Serviço temporariamente indisponível ou sem conexão. Tente novamente.',
    'deadline-exceeded': 'A operação demorou demais. Verifique sua conexão e tente novamente.',
    'not-found': 'Registro não encontrado.',
    'already-exists': 'Este registro já existe.',
    'failed-precondition': 'Operação não permitida no estado atual (ou índice do banco ainda em criação).',
    'resource-exhausted': 'Limite de uso excedido. Tente novamente mais tarde.',
    'storage/unauthorized': 'Você não tem permissão para acessar este arquivo.',
    'storage/canceled': 'Envio cancelado.',
    'storage/retry-limit-exceeded': 'Falha de rede ao enviar o arquivo. Tente novamente.',
    'storage/object-not-found': 'Arquivo não encontrado.',
    'functions/unauthenticated': 'Sua sessão expirou. Entre novamente.',
    'functions/permission-denied': 'Você não tem permissão para esta ação.',
    'functions/failed-precondition': 'A geração com IA não está habilitada ou configurada.',
    'functions/unavailable': 'Serviço de IA indisponível no momento.',
  }
  if (map[code]) return map[code]
  const short = code.replace(/^(auth|storage|functions)\//, '')
  if (map[short]) return map[short]
  if (err instanceof Error && err.message.startsWith('[app] ')) return err.message.slice(6)
  return 'Não foi possível concluir a operação. Tente novamente.'
}

export class AppError extends Error {
  constructor(message: string) {
    super(`[app] ${message}`)
    this.name = 'AppError'
  }
}

export function isAuthExpired(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? ''
  return code === 'unauthenticated' || code === 'auth/id-token-expired' || code === 'auth/user-token-expired'
}
