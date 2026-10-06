import type { StateAgent } from '@pipe/contracts';

/** Valor de `data-status` do ponto de presença; o CSS tem uma cor para cada um. */
export function presenceStatus(state: StateAgent): 'online' | 'pause' | 'invisible' | 'offline' {
  switch (state) {
    case 'Online':
      return 'online';
    case 'Pause':
      return 'pause';
    case 'Invisible':
      return 'invisible';
    default:
      return 'offline';
  }
}
