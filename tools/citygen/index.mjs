/**
 * City generator v4 orchestrator (TASK-002/003).
 * Runs deterministic stages, produces diagnostics/report; stages progressively
 * populate/validate/emit IR while preserving compilable v4 content.
 */
import { createContext } from './context.mjs';
import { runStage, stage } from './pipeline/stage.mjs';
import { finalizeReport, reportToJson } from './diagnostics.mjs';
import { makeStage1 } from './pipeline/stage-1-landscape.mjs';
import { makeStage2 } from './pipeline/stage-2-transport.mjs';
import { makeStage3 } from './pipeline/stage-3-districts.mjs';
import { makeStage4 } from './pipeline/stage-4-buildings.mjs';
import { makeStage5 } from './pipeline/stage-5-props.mjs';
import { makeStage6 } from './pipeline/stage-6-finalize.mjs';
import { DEFAULT_GENERATOR_VERSION } from './config.mjs';

const STAGES = [
  stage('0_input_space', {}),
  makeStage1(),
  makeStage2(),
  makeStage3(),
  makeStage4(),
  makeStage5(),
  makeStage6(),
];

// R5.4 §3.4: respect locked instances (do not mutate) and stamp generation metadata for generated instances.
function finalizeInstances(engine, meta) {
  const instances = engine?.cityforge?.instances;
  if (!Array.isArray(instances) || instances.length === 0) return;
  const seed = Number.isInteger(meta?.seed) ? meta.seed : 0;
  const generatorVersion = String(meta?.generatorVersion ?? DEFAULT_GENERATOR_VERSION);
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    if (!inst || typeof inst !== 'object') continue;
    if (inst.locked === true) continue; // author override: keep as-is
    const prev = (inst.generation && typeof inst.generation === 'object') ? inst.generation : null;
    const source = prev?.source ?? 'procedural';
    // Stamp/fill provenance for generated (procedural/hybrid/prefab-generated) instances; deterministic and explicit.
    inst.generation = {
      ...(prev ?? {}),
      source,
      seed: Number.isInteger(prev?.seed) ? prev.seed : seed,
      generator: typeof prev?.generator === 'string' && prev.generator ? prev.generator : 'citygen-v4',
      generatorVersion: typeof prev?.generatorVersion === 'string' && prev.generatorVersion ? prev.generatorVersion : generatorVersion,
    };
  }
}

export function runCitygen(raw) {
  const ctx = createContext(raw);
  // Allow generator.stages to disable/override in future; for now run all skeleton stages.
  for (const s of STAGES) runStage(s, ctx);
  // Stages emit into ctx.input/ctx.engine; prefer transformed source for compilation.
  if (!ctx.engine) ctx.engine = ctx.input ?? raw;
  finalizeInstances(ctx.engine, ctx.meta);
  finalizeReport(ctx.report, ctx);
  return { engine: ctx.engine, report: ctx.report, reportJson: reportToJson(ctx.report, ctx), ctx };
}

export { reportToJson, finalizeReport };
