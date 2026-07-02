// In-browser WLES Independent Verifier (audit 2026-07-02).
//
// Verifies pasted WLES v1.0 records entirely client-side: nothing leaves
// the browser. Canonicalisation is imported from the SAME module that
// seals production events (src/lib/wles/v1-canonical.ts); hashing uses
// WebCrypto SHA-256. Spec refs: §5 (canonicalisation), §6 (hash), §8
// (verification protocol). Parity with the server path is asserted in CI
// by src/lib/wles/verifier-parity.test.ts.
'use client';

import { useState } from 'react';
import { canonicaliseEvent } from '@/lib/wles/v1-canonical';
import { ZERO_HASH, isValidEventType, type WlesEvent } from '@/lib/wles/v1-types';
import { SAMPLE_CHAIN } from './verifier-sample';

interface RowResult {
  index: number;
  eventId: string;
  eventType: string;
  ok: boolean;
  recomputed?: string;
  reason?: string;
  expected?: string;
  actual?: string;
}

const HEX64 = /^[0-9a-f]{64}$/;
const REQUIRED = [
  'event_id', 'event_type', 'event_hash', 'previous_event_hash',
  'actor_id', 'subject_id', 'timestamp', 'payload',
] as const;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseInput(raw: string): WlesEvent[] {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed as WlesEvent[];
  if (parsed && Array.isArray(parsed.events)) return parsed.events as WlesEvent[];
  if (parsed && typeof parsed === 'object') return [parsed as WlesEvent];
  throw new Error('Expected a WLES event object, an array of events, or an export containing an "events" array.');
}

async function verify(events: WlesEvent[]): Promise<RowResult[]> {
  const rows: RowResult[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i] as WlesEvent & Record<string, unknown>;
    const row: RowResult = {
      index: i,
      eventId: typeof ev?.event_id === 'string' ? ev.event_id : '<unknown>',
      eventType: typeof ev?.event_type === 'string' ? ev.event_type : '<unknown>',
      ok: false,
    };
    const missing = REQUIRED.find((f) => ev?.[f] === undefined || ev?.[f] === null);
    if (!ev || typeof ev !== 'object' || missing) {
      row.reason = missing ? `missing field: ${missing}` : 'record is not an object';
      rows.push(row);
      continue;
    }
    if (!HEX64.test(String(ev.event_hash))) {
      row.reason = 'event_hash is not 64-char lowercase hex';
      rows.push(row);
      continue;
    }
    if (!HEX64.test(String(ev.previous_event_hash))) {
      row.reason = 'previous_event_hash is not 64-char lowercase hex';
      rows.push(row);
      continue;
    }
    if (!isValidEventType(String(ev.event_type))) {
      row.reason = `event_type "${ev.event_type}" is not a committed type nor a valid X-<ns>-<name> extension`;
      rows.push(row);
      continue;
    }
    // §6 — recompute the seal over the event with event_hash excluded.
    const { event_hash, ...rest } = ev;
    const recomputed = await sha256Hex(canonicaliseEvent(rest as never));
    row.recomputed = recomputed;
    if (recomputed !== event_hash) {
      row.reason = 'HASH_MISMATCH — record does not match its seal';
      row.expected = recomputed;
      row.actual = String(event_hash);
      rows.push(row);
      continue;
    }
    // §8.2 — chain linkage (only meaningful when a chain was supplied).
    if (events.length > 1) {
      if (i === 0) {
        if (ev.previous_event_hash !== ZERO_HASH) {
          row.reason = 'GENESIS_LINK_INVALID — first event must link to the zero hash';
          row.expected = ZERO_HASH;
          row.actual = String(ev.previous_event_hash);
          rows.push(row);
          continue;
        }
      } else if (ev.previous_event_hash !== (events[i - 1] as WlesEvent).event_hash) {
        row.reason = 'PREVIOUS_LINK_BROKEN — does not link to the preceding event';
        row.expected = String((events[i - 1] as WlesEvent).event_hash);
        row.actual = String(ev.previous_event_hash);
        rows.push(row);
        continue;
      }
    }
    row.ok = true;
    rows.push(row);
  }
  return rows;
}

const short = (h?: string) => (h ? `${h.slice(0, 8)}…${h.slice(-8)}` : '');

export default function VerifierTool() {
  const [raw, setRaw] = useState('');
  const [rows, setRows] = useState<RowResult[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onVerify() {
    setBusy(true);
    setParseError(null);
    setRows(null);
    try {
      const events = parseInput(raw);
      if (events.length === 0) throw new Error('No events found in the pasted input.');
      setRows(await verify(events));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse that input as JSON.');
    } finally {
      setBusy(false);
    }
  }

  const failures = rows?.filter((r) => !r.ok) ?? [];
  const allOk = rows !== null && failures.length === 0;

  return (
    <section aria-label="Verify WLES records in your browser" style={{ margin: '40px 0' }}>
      <h2>Verify records now</h2>
      <p>
        Paste one or more WLES v1.0 records below — a single event, a JSON
        array in chain order, or an export containing an{' '}
        <code>events</code> array. Verification runs entirely in your
        browser using the standard&rsquo;s canonical serialisation and
        SHA-256; nothing you paste is transmitted anywhere.
      </p>
      <label htmlFor="wles-verifier-input" style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
        WLES records (JSON)
      </label>
      <textarea
        id="wles-verifier-input"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder='[{"event_id": "…", "event_type": "CLOCK_IN", "event_hash": "…", …}]'
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          lineHeight: 1.5,
          padding: 12,
          border: '1px solid #C9C4B6',
          borderRadius: 6,
          background: '#FFFDF8',
          color: '#1E1E22',
        }}
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onVerify}
          disabled={busy || raw.trim() === ''}
          style={{
            minHeight: 44,
            padding: '0 22px',
            background: '#2D5F3F',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: 15,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {busy ? 'Verifying…' : 'Verify records'}
        </button>
        <button
          type="button"
          onClick={() => {
            setRaw(JSON.stringify(SAMPLE_CHAIN, null, 2));
            setRows(null);
            setParseError(null);
          }}
          style={{
            minHeight: 44,
            padding: '0 18px',
            background: 'transparent',
            color: '#2D5F3F',
            fontWeight: 600,
            fontSize: 15,
            border: '1px solid #2D5F3F',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Load a sample chain
        </button>
      </div>

      <div aria-live="polite">
        {parseError && (
          <p role="alert" style={{ marginTop: 16, padding: '12px 14px', background: '#FBEFEC', color: '#8A3325', borderRadius: 6 }}>
            {parseError}
          </p>
        )}
        {rows && (
          <div style={{ marginTop: 20 }}>
            <p
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                fontWeight: 600,
                background: allOk ? '#EAF2ED' : '#FBEFEC',
                color: allOk ? '#2D5F3F' : '#8A3325',
              }}
            >
              {allOk
                ? `Verified — all ${rows.length} record${rows.length === 1 ? '' : 's'} match their seals${rows.length > 1 ? ' and chain linkage holds' : ''}.`
                : `${failures.length} of ${rows.length} record${rows.length === 1 ? '' : 's'} failed verification.`}
            </p>
            <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
              {rows.map((r) => (
                <li
                  key={r.index}
                  style={{
                    padding: '10px 14px',
                    borderLeft: `4px solid ${r.ok ? '#2D5F3F' : '#C74B3A'}`,
                    background: '#FFFDF8',
                    border: '1px solid #E2DDD0',
                    borderLeftWidth: 4,
                    borderLeftColor: r.ok ? '#2D5F3F' : '#C74B3A',
                    borderRadius: 4,
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  <strong>{r.ok ? 'SEALED' : 'FAILED'}</strong>{' '}
                  · event {r.index + 1} · {r.eventType} ·{' '}
                  <code style={{ fontSize: 12 }}>{r.eventId}</code>
                  {r.ok && r.recomputed && (
                    <div style={{ color: '#55555C', fontSize: 13, marginTop: 4 }}>
                      seal recomputed: <code>{short(r.recomputed)}</code> — matches
                    </div>
                  )}
                  {!r.ok && (
                    <div style={{ color: '#8A3325', fontSize: 13, marginTop: 4 }}>
                      {r.reason}
                      {r.expected && (
                        <div>
                          expected <code>{short(r.expected)}</code>, found <code>{short(r.actual)}</code>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
