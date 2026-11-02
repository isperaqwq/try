import type { Bond } from './types.ts';

export const BOND_TIERS = [
  { min: 0, max: 19, label: '陌生' },
  { min: 20, max: 39, label: '熟悉' },
  { min: 40, max: 59, label: '亲近' },
  { min: 60, max: 79, label: '信任' },
  { min: 80, max: 100, label: '挚交' },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundDecimal(value: number, digits = 1): number {
  const factor = 10 ** digits;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

export function formatScore(value: number): string {
  const rounded = roundDecimal(value, 1);
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
}

export function bondScore(bond: Bond): number {
  const total = bond.events.reduce((sum, event) => sum + (Number(event.delta) || 0), 0);
  const raw = (Number(bond.initialScore) || 0) + (Number(bond.manualDelta) || 0) + total;
  return roundDecimal(raw, 1);
}

export function bondRelation(bond: Bond): string {
  return (bond.relation ?? '').trim();
}

export function bondTier(score: number): { min: number; max: number; label: string } {
  return BOND_TIERS.find((tier) => score >= tier.min && score <= tier.max) ?? BOND_TIERS[0];
}
