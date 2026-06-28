// One question per screen. Single/band → radio group; states/multi → checkbox
// group. Native controls inside a fieldset/legend so the flow is screen-reader
// sane and keyboard-navigable (acceptance §11). Presentational only — all
// state lives in the parent ExposureCheck.

import type { Question } from '@/lib/exposure/types';

export interface Option {
  value: string;
  label: string;
}

interface Props {
  question: Question;
  /** Options for the `states` question (from canonical LICENCE_STATES). */
  stateOptions?: Option[];
  /** Current answer: string for single/band, string[] for states/multi. */
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
  stepLabel: string;
}

export function QuestionScreen({ question, stateOptions, value, onChange, stepLabel }: Props) {
  const isMulti = question.kind === 'states' || question.kind === 'multi';
  const options: Option[] =
    question.kind === 'states'
      ? (stateOptions ?? [])
      : (question.choices ?? []).map((c) => ({ value: c.value, label: c.label }));

  const selected = new Set(
    Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
  );

  function toggle(optValue: string) {
    if (isMulti) {
      const next = new Set(selected);
      if (next.has(optValue)) next.delete(optValue);
      else next.add(optValue);
      onChange([...next]);
    } else {
      onChange(optValue);
    }
  }

  return (
    <fieldset className="exposure-fieldset exposure-animate">
      <p className="exposure-eyebrow">{stepLabel}</p>
      <legend className="exposure-prompt">{question.prompt}</legend>
      {question.help ? <p className="exposure-help">{question.help}</p> : null}

      <div className="exposure-options" role={isMulti ? 'group' : 'radiogroup'}>
        {options.map((opt) => {
          const isSelected = selected.has(opt.value);
          return (
            <label
              key={opt.value}
              className="exposure-option"
              data-selected={isSelected || undefined}
            >
              <input
                type={isMulti ? 'checkbox' : 'radio'}
                name={question.id}
                value={opt.value}
                checked={isSelected}
                onChange={() => toggle(opt.value)}
              />
              <span className="exposure-option-label">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
