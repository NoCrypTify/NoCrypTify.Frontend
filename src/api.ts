const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface CreatedNote {
  noteId: string;
  title: string | null;
  createdAt: string;
}

export interface RevealedNote extends CreatedNote {
  content: string;
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Request failed (${res.status})`;
}

export async function listNotes(): Promise<CreatedNote[]> {
  const res = await fetch(`${API_URL}/notes`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createNote(input: {
  title: string;
  content: string;
  key: string;
}): Promise<CreatedNote> {
  const res = await fetch(`${API_URL}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title || undefined,
      content: input.content,
      key: input.key,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function revealNote(
  noteId: string,
  key: string,
): Promise<RevealedNote> {
  const res = await fetch(`${API_URL}/notes/${noteId}/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
