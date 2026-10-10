'use client';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Establishment,
  Season,
  Variety,
  WaterRegime,
  WaterSource,
  type Practices,
} from '@rice/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseNumberInput, withWaterSource } from '@/lib/display/practices';
import th from '@/messages/th.json';

const t = th.results.practices;

const CONTROL =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

function Row({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-base font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <Row label={label} htmlFor={id}>
      <select
        id={id}
        className={CONTROL}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </select>
    </Row>
  );
}

/** Number input that keeps the raw text while typing and commits a clamped number. */
function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  nullable,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  nullable?: boolean;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    // external reset → resync the text
    setLast(value);
    setText(value == null ? '' : String(value));
  }
  return (
    <Row label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        placeholder={nullable ? t.optionalPlaceholder : undefined}
        className={CONTROL}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNumberInput(e.target.value, min, max);
          if (n === null && !nullable) return;
          setLast(n);
          onChange(n);
        }}
        onBlur={() => setText(last == null ? '' : String(last))}
      />
    </Row>
  );
}

/** SPEC §5.4 optional inputs. Every change is applied immediately (client-side recompute). */
export function PracticesForm({
  value,
  onChange,
  onReset,
  defaultOpen = false,
}: {
  value: Practices;
  onChange: (p: Practices) => void;
  onReset: () => void;
  defaultOpen?: boolean;
}) {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const set = <K extends keyof Practices>(k: K, v: Practices[K]) => onChange({ ...value, [k]: v });
  const regimeOptions =
    value.waterSource === 'rainfed' ? (['rainfed'] as const) : (['continuous', 'awd'] as const);

  return (
    <details className="group rounded-xl border" open={defaultOpen}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-base font-semibold [&::-webkit-details-marker]:hidden">
        <span>{t.title}</span>
        <ChevronDown
          className="size-5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4">
        <p className="text-sm text-muted-foreground">{t.hint}</p>
        <SelectField
          id={id('variety')}
          label={t.variety}
          value={value.variety}
          options={Variety.options}
          labels={t.varieties}
          onChange={(v) => set('variety', v)}
        />
        <SelectField
          id={id('season')}
          label={t.season}
          value={value.season}
          options={Season.options}
          labels={t.seasons}
          onChange={(v) => set('season', v)}
        />
        <Row label={t.plantDate} htmlFor={id('plantDate')} hint={t.plantDateHint}>
          <input
            id={id('plantDate')}
            type="date"
            className={CONTROL}
            value={value.plantDate ?? ''}
            onChange={(e) => set('plantDate', e.target.value || null)}
          />
        </Row>
        <SelectField
          id={id('est')}
          label={t.establishment}
          value={value.establishment}
          options={Establishment.options}
          labels={t.establishments}
          onChange={(v) => set('establishment', v)}
        />
        <SelectField
          id={id('wsrc')}
          label={t.waterSource}
          value={value.waterSource}
          options={WaterSource.options}
          labels={t.waterSources}
          onChange={(v) => onChange(withWaterSource(value, v))}
        />
        <fieldset className="flex flex-col gap-1">
          <legend className="text-base font-medium">{t.waterRegime}</legend>
          <div className="flex flex-wrap gap-2">
            {regimeOptions.map((o) => {
              const active = value.waterRegime === o;
              return (
                <label
                  key={o}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-base',
                    active ? 'border-primary bg-primary/10 font-semibold' : 'border-input',
                  )}
                >
                  <input
                    type="radio"
                    name={id('regime')}
                    value={o}
                    checked={active}
                    onChange={() => set('waterRegime', o as (typeof WaterRegime.options)[number])}
                    className="size-5 accent-[var(--color-primary)]"
                  />
                  {t.waterRegimes[o]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <NumberField
          id={id('n')}
          label={t.nKgPerRai}
          value={value.nKgPerRai}
          min={0}
          max={100}
          step={1}
          onChange={(v) => set('nKgPerRai', v ?? 0)}
        />
        <NumberField
          id={id('org')}
          label={t.organicTPerRai}
          value={value.organicTPerRai}
          min={0}
          max={20}
          step={0.1}
          onChange={(v) => set('organicTPerRai', v ?? 0)}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-medium">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-primary)]"
            checked={value.strawBurn}
            onChange={(e) => set('strawBurn', e.target.checked)}
          />
          {t.strawBurn}
        </label>
        <NumberField
          id={id('ecs')}
          label={t.measuredEcSoilDsm}
          value={value.measuredEcSoilDsm}
          min={0}
          max={50}
          step={0.1}
          nullable
          onChange={(v) => set('measuredEcSoilDsm', v)}
        />
        <NumberField
          id={id('ecw')}
          label={t.measuredEcWaterDsm}
          value={value.measuredEcWaterDsm}
          min={0}
          max={50}
          step={0.1}
          nullable
          onChange={(v) => set('measuredEcWaterDsm', v)}
        />
        <NumberField
          id={id('ly')}
          label={t.lastYieldKgPerRai}
          value={value.lastYieldKgPerRai}
          min={0}
          max={2000}
          step={10}
          nullable
          onChange={(v) => set('lastYieldKgPerRai', v)}
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 self-start px-4 text-base"
          onClick={onReset}
        >
          {t.reset}
        </Button>
      </div>
    </details>
  );
}
