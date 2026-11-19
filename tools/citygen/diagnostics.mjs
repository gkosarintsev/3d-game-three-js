/**
 * Diagnostics and generation report model (ADR-001, TASK-002).
 * Deterministic: no timestamps, stable ordering.
 */
import { byId } from './ids.mjs';
import { attachRulesToReport } from './rules.mjs';
import { finalizeFeatureManifest } from './features.mjs';

export function diag(severity, code, stage, message, extra = {}) {
  return { severity, code, stage, message, ...extra };
}

export function info(code, stage, message, extra) { return diag('info', code, stage, message, extra); }
export function warn(code, stage, message, extra) { return diag('warn', code, stage, message, extra); }
export function error(code, stage, message, extra) { return diag('error', code, stage, message, extra); }

export function createReport(meta = {}) {
  return {
    version: 1,
    generator: {
      generatorVersion: meta.generatorVersion ?? null,
      seed: meta.seed ?? null,
      deterministic: meta.deterministic ?? true,
    },
    stages: [],
    districts: [],
    diagnostics: [],
    repairs: [],
    drops: [],
    summary: { errors: 0, warnings: 0, repairs: 0, drops: 0 },
  };
}

export function finalizeReport(report, ctx = null) {
  // T23.3: finalize feature manifest/report snapshot before deterministic sorting/summary.
  if (ctx) {
    try { finalizeFeatureManifest(ctx, '6_finalize_emit'); } catch { /* keep report robust */ }
  }
  // Stable ordering for determinism
  report.stages = [...(report.stages ?? [])].sort((a, b) => String(a.id ?? a.stage ?? '').localeCompare(String(b.id ?? b.stage ?? '')));
  report.districts = [...(report.districts ?? [])].sort(byId);
  const sevRank = { error: 0, warn: 1, info: 2 };
  report.diagnostics = [...(report.diagnostics ?? [])].sort((a, b) =>
    (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9)
    || String(a.stage ?? '').localeCompare(String(b.stage ?? ''))
    || String(a.code ?? '').localeCompare(String(b.code ?? ''))
    || String(a.message ?? '').localeCompare(String(b.message ?? ''))
  );
  report.repairs = [...(report.repairs ?? [])].sort((a, b) => String(a.stage ?? '').localeCompare(String(b.stage ?? '')) || String(a.code ?? '').localeCompare(String(b.code ?? '')));
  report.drops = [...(report.drops ?? [])].sort((a, b) => String(a.stage ?? '').localeCompare(String(b.stage ?? '')) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
  report.summary = {
    errors: report.diagnostics.filter(d => d.severity === 'error').length,
    warnings: report.diagnostics.filter(d => d.severity === 'warn').length,
    repairs: report.repairs.length,
    drops: report.drops.length,
  };
  // R0.2/R0.3: attach read-only rules/metrics snapshot (deterministic) when context is available.
  if (ctx) {
    try {
      attachRulesToReport(report, ctx);
    } catch {
      // Keep report generation robust; rules layer must not break existing pipeline.
      report.metrics = report.metrics ?? null;
      report.rules = report.rules ?? { version: 1, partial: true, violations: [], summary: { errors: 0, warnings: 0, infos: 0 }, error: 'rules_evaluation_failed' };
    }
  }
  return report;
}

export function reportToJson(report, ctx = null) {
  // If metrics/rules were already attached (e.g. by finalizeReport), avoid mutating again
  // except stable ordering pass; ctx allows first-time attachment.
  if (ctx || !report.metrics || !report.rules) finalizeReport(report, ctx);
  else finalizeReport(report, null);
  return JSON.stringify(report, null, 2).replace(/\r\n/g, '\n') + '\n';
}
