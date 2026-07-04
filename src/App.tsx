import { useEffect, useState, useCallback } from 'react';
import {
  listNotes,
  createNote,
  revealNote,
  type CreatedNote,
  type RevealedNote,
} from './api.ts';
import { captureEvent, onAlternateUiFlag } from './posthog.ts';

export default function App() {
  const [notes, setNotes] = useState<CreatedNote[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [alternateUi, setAlternateUi] = useState(false);

  useEffect(() => {
    onAlternateUiFlag(setAlternateUi);
  }, []);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  const [selected, setSelected] = useState<CreatedNote | null>(null);

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      setNotes(await listNotes());
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(false);
    try {
      await createNote({ title, content, key: createKey });
      setTitle('');
      setContent('');
      setCreateKey('');
      setCreateSuccess(true);
      captureEvent('note_created', { ui_variant: alternateUi ? 'B' : 'A' });
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <main className={alternateUi ? 'app theme-b' : 'app'}>
      <h1>🔒 Secret Notes</h1>

      <section className="card">
        <h1>Create a note</h1>
        <form onSubmit={handleCreate}>
          <input
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="Your secret content…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={3}
          />
          <input
            placeholder="Encryption key / passphrase"
            value={createKey}
            onChange={(e) => setCreateKey(e.target.value)}
            required
          />
          <button type="submit">Create</button>
        </form>
        {createSuccess && <p className="ok">Note created and stored securely.</p>}
        {createError && <p className="err">{createError}</p>}
      </section>

      <section className="card">
        <div className="list-head">
          <h2>My notes</h2>
          <button className="ghost" onClick={() => void refresh()}>
            ↻ Refresh
          </button>
        </div>
        {listError && <p className="err">{listError}</p>}
        {notes.length === 0 && !listError && (
          <p className="muted">No notes yet — create one above.</p>
        )}
        <ul className="note-list">
          {notes.map((note) => (
            <li key={note.noteId}>
              <button className="note-item" onClick={() => setSelected(note)}>
                <span className="note-title">{note.title || '(untitled)'}</span>
                <span className="note-date">
                  {new Date(note.createdAt).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <RevealModal
          note={selected}
          uiVariant={alternateUi ? 'B' : 'A'}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

function RevealModal({
  note,
  uiVariant,
  onClose,
}: {
  note: CreatedNote;
  uiVariant: 'A' | 'B';
  onClose: () => void;
}) {
  const [key, setKey] = useState('');
  const [revealed, setRevealed] = useState<RevealedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setRevealed(await revealNote(note.noteId, key));
      captureEvent('note_revealed', { ui_variant: uiVariant });
    } catch (err) {
      captureEvent('note_reveal_failed', { ui_variant: uiVariant });
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{note.title || '(untitled)'}</h2>

        {revealed ? (
          <pre className="revealed">{revealed.content}</pre>
        ) : (
          <form onSubmit={handleReveal}>
            <p className="muted">Enter the key to decrypt this note.</p>
            <input
              autoFocus
              placeholder="Decryption key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Decrypting…' : 'Decrypt'}
            </button>
          </form>
        )}
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  );
}
