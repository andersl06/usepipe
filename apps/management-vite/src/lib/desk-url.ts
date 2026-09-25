export function urlDaConversaNoDesk(base: string, conversaId: string): string {
  return `${base.replace(/\/+$/, '')}/chat/${encodeURIComponent(conversaId)}`;
}
