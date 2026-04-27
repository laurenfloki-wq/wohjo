# What "sealed" means — plain English

> **[VOICE: needs Lauren]** — Cowork voice draft. Lauren rewrites
> in plain Australian construction-worker register. Reading-level
> target: ~Year-10 reader. Length target: 200–300 words.
> Hard constraint: do not use the words "cryptographic", "hash",
> "signature", or "chain" anywhere. Plain-English alternatives
> only — "sealed", "fingerprint", "lock", "permanent record".
>
> Reference: L3.5 worker-facing scaffolding decision; WLES v1.0
> spec at `wles-io/spec/v1.0/index.md`.

**Audience:** the construction worker reading this on their phone,
wanting to know whether they can trust this record of their hours.
**Length:** ~250 words.

---

## Why this matters

[VOICE: needs Lauren] Your hours are your money. If a record of
your hours can be quietly changed after the fact — by anyone —
then a record isn't really a record. It's a guess. FLOSTRUCTION
exists because the construction industry has been guessing for
too long.

## What we do

[VOICE: needs Lauren] The moment you tap CLOCK_IN, FLOSTRUCTION
takes a snapshot of that moment — your phone's time, your GPS
location, your work site. That snapshot gets stamped with a
unique fingerprint. The fingerprint is a long string of letters
and numbers that nobody can guess. It's calculated from the
contents of the snapshot itself. Change one letter of the
record, and the fingerprint stops matching.

Every snapshot is connected to the snapshot before it. This means
your whole shift history is locked together. You can't pull one
shift out without breaking the whole chain.

## What it means for you

[VOICE: needs Lauren] You can show your records anywhere — to
your boss, to a new employer, to Fair Work, to a court. If
someone challenges your hours, anyone can run a quick check that
proves your record hasn't been touched since you tapped it.
That check is free, takes seconds, and works the same whether
the person checking is on your side or not.

## What happens if anyone tries to change your record

[VOICE: needs Lauren] The check fails. Visibly. Loudly. There's
no quiet way to alter a sealed record. If the numbers were ever
changed — by your supervisor, your employer, even FLOSMOSIS — the
fingerprint stops matching. Anyone running the check sees the
break and knows something happened.

So no one tries. Not because we trust them. Because they can't
get away with it.

---

[VOICE: needs Lauren — closing line] Your hours are yours.
Sealed at the moment you worked them. Permanent.
