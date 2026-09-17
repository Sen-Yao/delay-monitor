import { randomUUID } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
}

export function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? null;
}

export function stddev(values: number[]): number | null {
  if (values.length < 2) return values.length === 1 ? 0 : null;
  const mean = avg(values);
  if (mean === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function round(value: number | null, digits = 1): number | null {
  if (value === null || Number.isNaN(value)) return null;
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
