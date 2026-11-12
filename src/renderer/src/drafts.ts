/** Entwürfe der Eingabefelder je Chat; überleben das Neu-Einhängen einer Zelle (z. B. beim Teilen). */
export const drafts = new Map<string, string>()

/** Vorbelegung des Eingabefelds eines Chats (z. B. für die Komponenten-Werkstatt). */
export function setDraft(chatId: string, text: string): void {
  drafts.set(chatId, text)
}
