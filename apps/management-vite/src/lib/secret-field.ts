export function secretFieldVisualState(visible: boolean) {
  return visible
    ? { type: 'text' as const, icon: 'eye-off' as const, action: 'Ocultar' }
    : { type: 'password' as const, icon: 'eye' as const, action: 'Mostrar' };
}
