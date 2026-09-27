export function handle(body: Record<string, unknown>): string {
  return String(body['name']);
}
