/** Saved permission and unsaved draft are separate; an unavailable counter is never shown as on. */
export function analyticsPresentation(registeredGrant: boolean, draft: boolean, ready: boolean) {
  const saved = ready && registeredGrant;
  const checked = ready && draft;
  return {
    checked,
    state: saved === checked ? saved ? "on" : "off" : "pending",
    text: saved === checked
      ? saved ? "Сейчас аналитика включена" : "Сейчас аналитика отключена"
      : checked ? "Аналитика будет включена после сохранения" : "Аналитика будет отключена после сохранения"
  } as const;
}
