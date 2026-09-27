export async function saveThing(api: { post: (url: string, body: unknown) => Promise<void> }, nome: string) {
  await api.post('/v1/x', {
    nome: nome,
  });
}
