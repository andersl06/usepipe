export async function saveThing(api: { post: (url: string, body: unknown) => Promise<void> }, name: string) {
  await api.post('/v1/x', {
    name: name,
  });
}
