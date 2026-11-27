export const RECOVERY_STATES = Object.freeze(['RUNNING', 'PAUSED_BY_USER', 'PAUSED_CONNECTION', 'PAUSED_ERROR', 'RECOVERING', 'COMPLETED', 'STOPPED']);

export function recoveryReason(error) {
  const message = String(error?.message || error || 'Falha desconhecida');
  if (/respond|timeout|recebeu|connection/i.test(message)) return 'PAUSED_CONNECTION';
  return 'PAUSED_ERROR';
}

export function createRecoveryCheckpoint(queue, error) {
  return { ...queue, status: recoveryReason(error), lastError: String(error?.message || error), recoveryAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
