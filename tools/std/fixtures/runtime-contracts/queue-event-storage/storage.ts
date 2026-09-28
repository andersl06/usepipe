export function readFilter(): string | null {
  return localStorage.getItem('pipe:filtro');
}
