import { useState } from 'react';
import type { AdjusterNote } from '@claims/shared';
import { api } from '../lib/api';
import { useToasts } from '../hooks/useToasts';
import { formatDateTime } from '../lib/format';

/** Adjuster notes are added with a Temporal *update* (validated, synchronous, returns a value). */
export function NotesPanel({
  workflowId,
  notes,
  author,
  disabled,
  onChanged,
}: {
  workflowId: string;
  notes: AdjusterNote[];
  author: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const { push } = useToasts();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await api.addNote(workflowId, { author, note });
      push('success', `Note recorded (${result.noteCount} total) via workflow update`);
      setNote('');
      onChanged();
    } catch (error) {
      push('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>Adjuster notes</h2>
        <span className="badge small tone-muted">workflow update</span>
      </div>
      {notes.length === 0 ? (
        <p className="empty">No notes yet.</p>
      ) : (
        <ul className="note-list">
          {notes.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className="muted">
                {formatDateTime(entry.at)} · {entry.author}
              </span>
              <p>{entry.note}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="button-row">
        <input
          className="grow"
          value={note}
          disabled={disabled || busy}
          placeholder="Add a note (sent as a validated workflow update)"
          onChange={(event) => setNote(event.target.value)}
        />
        <button
          type="button"
          className="button"
          disabled={disabled || busy || note.trim().length === 0}
          onClick={submit}
        >
          Add note
        </button>
      </div>
    </section>
  );
}
