// "What happens next" interactive timeline (Move 5).
//
// Each step expands on hover (desktop) or tap (mobile) to reveal a
// second line of detail. Only one step expanded at a time; clicking
// a different step collapses the previous one and expands the new.
//
// Connecting rule on the left draws downward when timeline enters
// viewport — uses scaleY 0→1 with transform-origin top so it feels
// like the rule is being drawn down through the steps. Each numbered
// circle then reveals in sequence with the rule passing past it.
//
// Reduced-motion: rule + all steps appear instantly in expanded
// state. No hover animation.

'use client';

import { useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useInView,
  useReducedMotion,
} from 'framer-motion';
import { D, EASE_OUT_EXPO, EASE_OUT_QUART } from './motion';

// 2026-04-30 palette repaint to canonical mockup language per
// design-branch/supporting-screens.html. Timeline numbered circles
// sit on the page surface (now charcoal); each circle's inner fill
// is charcoal-800 (raised) so the amber border reads cleanly.
const PALETTE = {
  amber:      '#D9A548',  // mockup amber (was burnt orange #c8530a)
  navyDeeper: '#0F0F10',  // charcoal — circle inner fill matches page
  warm:       '#F5F2EA',  // cream — step titles
  mutedSoft:  'rgba(245,242,234,0.55)',  // cream@55% — body copy (AAA pass)
  border:     'rgba(245,242,234,0.10)',  // connecting rule + detail divider
};

interface Step {
  step: string;
  title: string;
  body: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    step: '1',
    title: 'A 15-minute call',
    body: 'We confirm pricing, payroll-export format, and onboarding logistics. Same business day in most cases.',
    detail: 'We confirm worker count, payroll provider (Xero / MYOB / Employment Hero / KeyPay / Micropay), timezone, and any award classifications you need set up.',
  },
  {
    step: '2',
    title: 'Account provisioned',
    body: 'Your sites, workers, and supervisors are loaded. Access credentials sent to you within one business day.',
    detail: 'Your tenant goes live. Site geofences configured. Workers receive sign-in SMS within minutes of provisioning complete.',
  },
  {
    step: '3',
    title: 'First shifts the same day',
    body: 'Workers receive an SMS sign-in link. They can clock their first shift the day onboarding completes.',
    detail: 'Workers tap a link, enter their phone, get a one-time code, and clock on. The first sealed receipt lands within seconds of clock-off.',
  },
  {
    step: '4',
    title: 'Records flow to payroll',
    body: 'Approved shifts export as CSV in the format your payroll provider expects. No format wrestling.',
    detail: 'CSV exports in your provider’s exact format. Bookkeeper drops the file in. No re-keying, no back-and-forth.',
  },
];

export default function Timeline() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: '-50px' });
  const trigger = !!reduced || inView;

  // Default to step 1 expanded under reduced-motion (where the brief
  // says "all steps shown expanded by default" — but we only have
  // room to show one expanded; default the first as a compromise that
  // still serves the no-animation reading mode).
  const [openIdx, setOpenIdx] = useState<number | null>(reduced ? null : null);

  const handleToggle = (idx: number) => {
    setOpenIdx((prev) => (prev === idx ? null : idx));
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {STEPS.map((s, i) => (
        <TimelineRow
          key={s.step}
          step={s}
          index={i}
          isLast={i === STEPS.length - 1}
          open={openIdx === i || (!!reduced && openIdx === null && i === 0)}
          onToggle={() => handleToggle(i)}
          trigger={trigger}
          reduced={!!reduced}
        />
      ))}
    </div>
  );
}

function TimelineRow({
  step, index, isLast, open, onToggle, trigger, reduced,
}: {
  step: Step;
  index: number;
  isLast: boolean;
  open: boolean;
  onToggle: () => void;
  trigger: boolean;
  reduced: boolean;
}) {
  const stepDelay = index * D.staggerTimelineStep;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      {...(trigger ? { animate: { opacity: 1, y: 0 } } : {})}
      transition={{
        duration: D.sectionReveal,
        delay: stepDelay,
        ease: EASE_OUT_EXPO,
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: 24,
        paddingBottom: isLast ? 0 : 28,
        position: 'relative',
        cursor: 'pointer',
      }}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      tabIndex={0}
      role="button"
      aria-expanded={open}
      aria-label={`${step.step}. ${step.title}. ${open ? 'Collapse' : 'Expand'} for detail.`}
    >
      {/* Step number + connecting rule */}
      <div style={{ position: 'relative' }}>
        <motion.div
          initial={reduced ? false : { scale: 0.7, opacity: 0 }}
          {...(trigger ? { animate: { scale: 1, opacity: 1 } } : {})}
          transition={{
            duration: 0.4,
            delay: stepDelay + 0.1,
            ease: EASE_OUT_EXPO,
          }}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: `1.5px solid ${PALETTE.amber}`,
            color: PALETTE.amber,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace',
            fontSize: 14,
            fontWeight: 600,
            background: PALETTE.navyDeeper,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {step.step}
        </motion.div>
        {!isLast && (
          <motion.div
            initial={reduced ? false : { scaleY: 0 }}
            {...(trigger ? { animate: { scaleY: 1 } } : {})}
            transition={{
              duration: 0.4,
              delay: stepDelay + 0.05,
              ease: EASE_OUT_QUART,
            }}
            style={{
              position: 'absolute',
              top: 44,
              bottom: -28,
              left: 19.5,
              width: 1,
              background: PALETTE.border,
              transformOrigin: 'top',
            }}
          />
        )}
      </div>

      <div style={{ paddingTop: 6 }}>
        <h3 style={{
          fontFamily: 'var(--font-archivo-narrow), "Archivo Narrow", system-ui, sans-serif',
          fontSize: 18,
          fontWeight: 500,
          margin: 0,
          marginBottom: 6,
          color: PALETTE.warm,
          letterSpacing: '-0.005em',
        }}>
          {step.title}
        </h3>
        <p style={{
          fontSize: 14,
          lineHeight: 1.65,
          color: PALETTE.mutedSoft,
          margin: 0,
        }}>
          {step.body}
        </p>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={reduced ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{
                duration: reduced ? 0 : 0.25,
                ease: EASE_OUT_QUART,
              }}
              style={{ overflow: 'hidden' }}
            >
              <p style={{
                fontSize: 13,
                lineHeight: 1.65,
                color: PALETTE.warm,
                margin: 0,
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px solid ${PALETTE.border}`,
                opacity: 0.85,
              }}>
                {step.detail}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
