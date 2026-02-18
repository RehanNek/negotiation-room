export const AUTH_CHANGED_EVENT = 'room:auth-changed';

export function emitAuthChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

