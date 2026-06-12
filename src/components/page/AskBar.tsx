'use client';

// Ask — the read-only question bar (Phase 3). Every answer is grounded
// in rows the server selected; refs render beside the answer. Cmd/Ctrl+K
// focuses it, per the approved prototype.

import { useEffect, useRef, useState } from 'react';

export default function AskBar() {
  const [q, setQ] = useState('');
  const [state, setState] = useState<'idle' | 'thinking' | 'answered' | 'off' | 'error'>('idle');
  const [answer, setAnswer] = useState('');
  const [refs, setRefs] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function ask(): Promise<void> {
    if (q.trim().length === 0 || state === 'thinking') return;
    setState('thinking');
    setAnswer('');
    setRefs('');
    try {
      const res = await fetch('/api/page/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim() }),
      });
      if (res.status === 503) {
        setState('off');
        return;
      }
      if (!res.ok) {
        setState('error');
        return;
      }
      const data = (await res.json()) as { answer?: string; refs?: string };
      setAnswer(data.answer ?? '');
      setRefs(data.refs ?? '');
      setState('answered');
    } catch {
      setState('error');
    }
  }

  return (
    <>
      <div className="ask">
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask the record anything — or how anything works"
          aria-label="Ask the record"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask();
          }}
        />
        <span className="kbd" aria-hidden="true">
          ⌘K
        </span>
        <button type="button" className="go" onClick={() => void ask()}>
          Ask
        </button>
      </div>
      <div className={`thinking${state === 'thinking' ? ' show' : ''}`} aria-hidden={state !== 'thinking'}>
        reading the sealed records…
      </div>
      <div className={`answer${state === 'answered' ? ' show' : ''}`} aria-live="polite">
        <p>{answer}</p>
        {refs.length > 0 ? <div className="refs">{refs} · grounded in your rows at answer time</div> : null}
      </div>
      {state === 'off' ? (
        <div className="answer show" role="status">
          <p>
            Ask isn&rsquo;t connected yet — it switches on the moment the Anthropic API key is
            added to the deployment. Everything else on this page is live.
          </p>
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="answer show" role="status">
          <p>Ask couldn&rsquo;t read the records just now. The records are fine — try again.</p>
        </div>
      ) : null}
    </>
  );
}
