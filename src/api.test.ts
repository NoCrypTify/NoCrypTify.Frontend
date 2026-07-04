import { jest } from '@jest/globals';
import { listNotes, createNote, revealNote } from './api.ts';

const fetchMock = jest.fn<typeof fetch>();
globalThis.fetch = fetchMock;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function brokenJsonResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new Error('not json');
    },
  } as unknown as Response;
}

const NOTE = {
  noteId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  title: 'Test',
  createdAt: '2026-01-15T10:00:00.000Z',
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('listNotes', () => {
  it('returns the parsed note list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [NOTE]));
    await expect(listNotes()).resolves.toEqual([NOTE]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/notes');
  });

  it('throws the server-provided error message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'DB down' }));
    await expect(listNotes()).rejects.toThrow('DB down');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(brokenJsonResponse(502));
    await expect(listNotes()).rejects.toThrow('Request failed (502)');
  });
});

describe('createNote', () => {
  it('POSTs title, content and key as JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, NOTE));
    await createNote({ title: 'Test', content: 'secret', key: 'pw' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/notes');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      title: 'Test',
      content: 'secret',
      key: 'pw',
    });
  });

  it('omits an empty title so the backend stores NULL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, NOTE));
    await createNote({ title: '', content: 'secret', key: 'pw' });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      content: 'secret',
      key: 'pw',
    });
  });

  it('returns the created note metadata', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, NOTE));
    await expect(
      createNote({ title: 'Test', content: 'secret', key: 'pw' }),
    ).resolves.toEqual(NOTE);
  });

  it('throws the validation error from the server', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'body must have required property key' }),
    );
    await expect(
      createNote({ title: '', content: 'secret', key: '' }),
    ).rejects.toThrow('body must have required property key');
  });
});

describe('revealNote', () => {
  it('POSTs the key to the reveal endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...NOTE, content: 'secret' }),
    );
    await revealNote(NOTE.noteId, 'pw');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://localhost:3000/notes/${NOTE.noteId}/reveal`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ key: 'pw' });
  });

  it('returns the decrypted note content', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...NOTE, content: 'secret' }),
    );
    await expect(revealNote(NOTE.noteId, 'pw')).resolves.toEqual({
      ...NOTE,
      content: 'secret',
    });
  });

  it('throws "Invalid key" when the backend rejects the key', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Invalid key' }));
    await expect(revealNote(NOTE.noteId, 'wrong')).rejects.toThrow(
      'Invalid key',
    );
  });

  it('throws "Note not found" for an unknown note', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: 'Note not found' }),
    );
    await expect(revealNote(NOTE.noteId, 'pw')).rejects.toThrow(
      'Note not found',
    );
  });
});
