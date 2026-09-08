import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  DEFAULT_SIMULATION,
  SIMULATABLE_STAGES,
  type ClaimType,
  type CreateClaimRequest,
  type SimulationConfig,
  type StageId,
} from '@claims/shared';
import { api } from '../lib/api';
import { useToasts } from '../hooks/useToasts';
import { titleCase } from '../lib/format';

const CLAIM_TYPES: ClaimType[] = ['auto', 'home', 'health', 'travel'];

interface Preset {
  id: string;
  label: string;
  hint: string;
  simulation: Partial<SimulationConfig>;
}

/** One-click failure scenarios; each one is executed by the activities, never by workflow code. */
const PRESETS: Preset[] = [
  {
    id: 'happy',
    label: 'Happy path',
    hint: 'Everything succeeds; the claim parks in human review.',
    simulation: {},
  },
  {
    id: 'transient',
    label: 'Transient failure',
    hint: 'Damage assessment fails twice, then succeeds — watch the activity retries.',
    simulation: { transientFailureStage: 'damage-assessment', transientFailureAttempts: 2 },
  },
  {
    id: 'permanent',
    label: 'Permanent failure',
    hint: 'Payment throws a non-retryable failure; the claim waits for retry or abandon.',
    simulation: { permanentFailureStage: 'payment' },
  },
  {
    id: 'slow',
    label: 'Slow external service',
    hint: 'Damage estimator takes 30s and heartbeats while it works.',
    simulation: { slowStage: 'damage-assessment', slowMs: 30_000 },
  },
  {
    id: 'fraud',
    label: 'High fraud risk',
    hint: 'Forces a fraud score of 90 so the claim is flagged for investigation.',
    simulation: { forceFraudScore: 90 },
  },
];

const SAMPLE_CLAIMS: Array<Partial<CreateClaimRequest>> = [
  {
    policyNumber: 'POL-AUTO-4471',
    policyholder: 'Dana Whitfield',
    claimType: 'auto',
    amount: 8400,
    description: 'Rear-ended at a stoplight; bumper, trunk and tail lights damaged.',
    contactEmail: 'dana.whitfield@example.com',
  },
  {
    policyNumber: 'POL-HOME-2210',
    policyholder: 'Marcus Feld',
    claimType: 'home',
    amount: 32500,
    description: 'Burst pipe flooded the basement and damaged flooring and drywall.',
    contactEmail: 'marcus.feld@example.com',
  },
  {
    policyNumber: 'POL-TRVL-8890',
    policyholder: 'Ines Kowalski',
    claimType: 'travel',
    amount: 2400,
    description: 'Checked luggage lost on an international connection; contents claimed.',
    contactEmail: 'ines.k@example.com',
  },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewClaimForm({
  onCreated,
}: {
  onCreated: (workflowId: string, claimId: string) => void;
}) {
  const { push } = useToasts();
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [presetId, setPresetId] = useState('happy');
  const [simulation, setSimulation] = useState<SimulationConfig>({ ...DEFAULT_SIMULATION });
  const [form, setForm] = useState<CreateClaimRequest>({
    policyNumber: 'POL-AUTO-4471',
    policyholder: 'Dana Whitfield',
    claimType: 'auto',
    incidentDate: today(),
    description: 'Rear-ended at a stoplight; bumper, trunk and tail lights damaged.',
    amount: 8400,
    contactEmail: 'dana.whitfield@example.com',
    paymentHoldSeconds: 10,
    reviewReminderSeconds: 30,
  });

  const applyPreset = (preset: Preset) => {
    setPresetId(preset.id);
    setSimulation({ ...DEFAULT_SIMULATION, ...preset.simulation });
  };

  const randomSample = () => {
    const sample = SAMPLE_CLAIMS[Math.floor(Math.random() * SAMPLE_CLAIMS.length)];
    setForm((current) => ({ ...current, ...sample, incidentDate: today() }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await api.createClaim({ ...form, simulation });
      push('success', `Claim ${response.claimId} submitted — workflow ${response.workflowId}`);
      onCreated(response.workflowId, response.claimId);
    } catch (error) {
      push('error', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const activePreset = PRESETS.find((preset) => preset.id === presetId) ?? PRESETS[0];

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-header">
        <h2>Submit a claim</h2>
        <button type="button" className="button ghost small" onClick={randomSample}>
          Use sample data
        </button>
      </div>

      <div className="grid two">
        <label className="field">
          <span>Policyholder</span>
          <input
            required
            value={form.policyholder}
            onChange={(event) => setForm({ ...form, policyholder: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Policy number</span>
          <input
            required
            value={form.policyNumber}
            onChange={(event) => setForm({ ...form, policyNumber: event.target.value })}
          />
          <small>Tip: end it with “-X” to simulate a lapsed policy (automatic denial).</small>
        </label>
        <label className="field">
          <span>Claim type</span>
          <select
            value={form.claimType}
            onChange={(event) => setForm({ ...form, claimType: event.target.value as ClaimType })}
          >
            {CLAIM_TYPES.map((type) => (
              <option key={type} value={type}>
                {titleCase(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Amount (USD)</span>
          <input
            required
            type="number"
            min={1}
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Incident date</span>
          <input
            required
            type="date"
            value={form.incidentDate}
            onChange={(event) => setForm({ ...form, incidentDate: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Contact email</span>
          <input
            type="email"
            value={form.contactEmail ?? ''}
            onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
          />
        </label>
      </div>

      <label className="field">
        <span>Description</span>
        <textarea
          required
          rows={3}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </label>

      <fieldset className="fieldset">
        <legend>Simulation scenario</legend>
        <div className="preset-row">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`chip-button ${preset.id === presetId ? 'is-active' : ''}`}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="hint">{activePreset.hint}</p>

        <button
          type="button"
          className="button ghost small"
          onClick={() => setShowAdvanced((value) => !value)}
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced controls
        </button>

        {showAdvanced && (
          <div className="grid two advanced">
            <StageSelect
              label="Transient failure stage"
              value={simulation.transientFailureStage}
              onChange={(value) => {
                setPresetId('custom');
                setSimulation({ ...simulation, transientFailureStage: value });
              }}
            />
            <label className="field">
              <span>Failing attempts before success</span>
              <input
                type="number"
                min={0}
                max={5}
                value={simulation.transientFailureAttempts}
                onChange={(event) =>
                  setSimulation({
                    ...simulation,
                    transientFailureAttempts: Number(event.target.value),
                  })
                }
              />
            </label>
            <StageSelect
              label="Permanent failure stage"
              value={simulation.permanentFailureStage}
              onChange={(value) => {
                setPresetId('custom');
                setSimulation({ ...simulation, permanentFailureStage: value });
              }}
            />
            <StageSelect
              label="Slow service stage"
              value={simulation.slowStage}
              onChange={(value) => {
                setPresetId('custom');
                setSimulation({ ...simulation, slowStage: value });
              }}
            />
            <label className="field">
              <span>Slow service delay (ms)</span>
              <input
                type="number"
                min={0}
                max={300000}
                step={1000}
                value={simulation.slowMs}
                onChange={(event) =>
                  setSimulation({ ...simulation, slowMs: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              <span>Force fraud score (blank = computed)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={simulation.forceFraudScore ?? ''}
                onChange={(event) =>
                  setSimulation({
                    ...simulation,
                    forceFraudScore: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              <span>Settlement hold (seconds, durable timer)</span>
              <input
                type="number"
                min={0}
                max={3600}
                value={form.paymentHoldSeconds ?? 10}
                onChange={(event) =>
                  setForm({ ...form, paymentHoldSeconds: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              <span>Adjuster reminder interval (seconds)</span>
              <input
                type="number"
                min={5}
                max={3600}
                value={form.reviewReminderSeconds ?? 30}
                onChange={(event) =>
                  setForm({ ...form, reviewReminderSeconds: Number(event.target.value) })
                }
              />
            </label>
          </div>
        )}
      </fieldset>

      <button className="button primary" type="submit" disabled={submitting}>
        {submitting ? 'Starting workflow…' : 'Submit claim'}
      </button>
    </form>
  );
}

function StageSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: StageId | null;
  onChange: (value: StageId | null) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : (event.target.value as StageId))
        }
      >
        <option value="">none</option>
        {SIMULATABLE_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {titleCase(stage)}
          </option>
        ))}
      </select>
    </label>
  );
}
