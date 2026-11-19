import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCitygen } from './citygen/index.mjs';
import { compileCityforge } from './cityforge-compile.mjs';
import { createReport, finalizeReport, reportToJson } from './citygen/diagnostics.mjs';
import { makeRng, mix, hashString } from './citygen/rng.mjs';
import { stableId, stageSubseed, byId } from './citygen/ids.mjs';
import { createSpatialIndex } from './citygen/spatial.mjs';
import { generateOutput } from './build-level.mjs';

function v4Base(over = {}) {
  return {
    $schema: './level-v4.schema.json',
    kind: 'cityforge',
    schemaVersion: 4,
    metadata: { levelName: 't', name: 't', hint: 't', units: 'meters' },
    ground: { y: 0, size: 256 },
    gameplay: { goal: 'exit', spawn: { x: 0, z: 0 }, exit: { x: 10, z: 10 } },
    stream: { chunk: 256, keep: 1, aheadMin: 50, aheadMax: 100, budgetMs: 20 },
    cityforge: {
      format: 'cityforge', version: '0.1',
      world: { units: 'meters', coordinateSystem: { type: 'local', handedness: 'right', up: 'Y' }, bounds: { min: [-128,-128,0], max: [128,128,50] } },
      terrain: { base: { type: 'heightfield', source: 'procedural', resolution: 4 }, modifiers: [] },
      hydrology: { rivers: [], lakes: [] },
      networks: { roads: { nodes: [], segments: [], junctions: [] }, railways: { nodes: [], segments: [], junctions: [] }, paths: { nodes: [], segments: [], junctions: [] } },
      structures: { bridges: [], tunnels: [] },
    },
    generator: { generatorVersion: '0.1.0', seed: 42, deterministic: true, stages: [], layers: [], budgets: {}, districts: [], profiles: {}, catalogs: {}, refs: {}, policies: {} },
    ...over,
  };
}

test('citygen v4: deterministic report for same input', () => {
  const a = runCitygen(v4Base());
  const b = runCitygen(v4Base());
  assert.equal(a.reportJson, b.reportJson);
  assert.equal(a.report.summary.errors, 0);
  assert.equal(a.report.stages.length, 7);
});

test('citygen stage 1: clamps terrain modifiers and records repair', () => {
  const raw = v4Base();
  raw.cityforge.terrain.modifiers = [
    { id: 'm1', type: 'mountain', center: [999, -999], radius: 9999, height: 999 },
  ];
  const out = runCitygen(raw);
  const mods = out.engine.cityforge.terrain.modifiers;
  assert.equal(mods.length, 1);
  assert.equal(mods[0].height, 300);
  assert.equal(mods[0].radius, 512);
  assert.equal(mods[0].center[0], 128);
  assert.equal(mods[0].center[1], -128);
  assert.ok(out.report.repairs.some(r => r.code === 'clamp_height'));
  assert.ok(out.report.repairs.some(r => r.code === 'clamp_radius'));
  assert.ok(out.report.repairs.some(r => r.code === 'clamp_center'));
});

test('citygen stage 1: drops invalid river and renames duplicate ids deterministically', () => {
  const raw = v4Base();
  raw.cityforge.hydrology.rivers = [
    { id: 'r', path: [[0,0,0]], width: 10, depth: 2 }, // too short
    { id: 'dup', path: [[0,0,0],[10,0,10]], width: 5, depth: 1 },
    { id: 'dup', path: [[20,0,0],[30,0,10]], width: 5, depth: 1 },
  ];
  const a = runCitygen(structuredClone(raw));
  const b = runCitygen(structuredClone(raw));
  assert.equal(a.reportJson, b.reportJson);
  const rivers = a.engine.cityforge.hydrology.rivers;
  assert.equal(rivers.length, 2);
  assert.deepEqual(rivers.map(r => r.id), ['dup', 'dup_2']);
  assert.ok(a.report.drops.some(d => d.reason === 'river_too_short'));
  assert.ok(a.report.repairs.some(r => r.code === 'duplicate_id_renamed'));
});

test('citygen stage 1: easement mask records river corridors', () => {
  const raw = v4Base();
  raw.cityforge.hydrology.rivers = [
    { id: 'river1', path: [[-10,0,0],[10,0,0]], width: 12, depth: 2 },
  ];
  const out = runCitygen(raw);
  assert.equal(out.ctx.masks.easement.rivers.length, 1);
  assert.equal(out.ctx.masks.easement.rivers[0].id, 'river1');
  assert.equal(out.ctx.masks.easement.rivers[0].width, 12);
});

test('citygen stage 1: procedural landscape generation is deterministic', () => {
  const base = () => {
    const raw = v4Base();
    raw.generator.seed = 123;
    raw.generator.landscape = {
      generate: true,
      hills: { count: 5, minHeight: 10, maxHeight: 30, minRadius: 60, maxRadius: 120 },
      river: { enabled: true, width: 20, depth: 3, points: 5, axis: 'z' },
    };
    return raw;
  };
  const a = runCitygen(base());
  const b = runCitygen(base());
  assert.equal(a.engine.cityforge.terrain.modifiers.length, 5);
  assert.equal(a.engine.cityforge.hydrology.rivers.length, 1);
  assert.deepEqual(a.engine.cityforge.terrain.modifiers, b.engine.cityforge.terrain.modifiers);
  assert.deepEqual(a.engine.cityforge.hydrology.rivers, b.engine.cityforge.hydrology.rivers);
  assert.equal(a.reportJson, b.reportJson);
  assert.ok(a.report.diagnostics.some(d => d.code === 'landscape_generated'));
});

test('citygen stage 1: clamps river path to bounds and drops self-intersecting river', () => {
  const raw = v4Base();
  raw.cityforge.hydrology.rivers = [
    { id: 'oob', path: [[-200,0,0],[200,0,0],[200,0,50]], width: 8, depth: 2 },
    { id: 'bow', path: [[0,0,0],[20,0,20],[20,0,0],[0,0,20]], width: 8, depth: 2 },
  ];
  const out = runCitygen(raw);
  const rivers = out.engine.cityforge.hydrology.rivers;
  assert.deepEqual(rivers.map(r => r.id), ['oob']);
  assert.equal(rivers[0].path[0][0], -128);
  assert.equal(rivers[0].path[1][0], 128);
  assert.ok(out.report.repairs.some(r => r.code === 'clamp_river_path_bounds' && r.id === 'oob'));
  assert.ok(out.report.drops.some(d => d.id === 'bow' && d.reason === 'river_self_intersection'));
});

test('citygen stage 1: warns on river-anchor conflict', () => {
  const raw = v4Base(); // spawn 0,0 exit 10,10
  raw.cityforge.hydrology.rivers = [
    { id: 'r', path: [[-20,0,-5],[20,0,5]], width: 10, depth: 2 },
  ];
  const out = runCitygen(raw);
  assert.equal(out.engine.cityforge.hydrology.rivers.length, 1);
  assert.ok(out.report.diagnostics.some(d => d.code === 'river_anchor_conflict' && d.severity === 'warn'));
});

test('citygen stage 1: warns on steep river profile and bed above terrain without carving', () => {
  const raw = v4Base();
  raw.cityforge.hydrology.rivers = [
    { id: 'steep', path: [[-20,0,0],[0,20,0],[20,0,0]], width: 8, depth: 2, carveTerrain: true },
    { id: 'floating', path: [[-30,5,-30],[-10,5,-30]], width: 8, depth: 1, carveTerrain: false },
  ];
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'river_steep_profile' && d.severity === 'warn' && d.id === 'steep'));
  assert.ok(out.report.diagnostics.some(d => d.code === 'river_bed_above_terrain' && d.severity === 'warn' && d.id === 'floating'));
});

test('citygen stage 2: drops degenerate segment and warns on steep slope', () => {
  const raw = v4Base();
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'a', position: [0,0,0], layer: 'ground' },
      { id: 'b', position: [100,0,0], layer: 'ground' },
    ],
    segments: [
      { id: 'bad', from: 'a', to: 'b', type: 'local', layer: 'ground', path: [[0,0,0]] },
      { id: 'steep', from: 'a', to: 'b', type: 'local', layer: 'ground', path: [[0,0,0],[10,20,0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  const segs = out.engine.cityforge.networks.roads.segments;
  assert.deepEqual(segs.map(s => s.id), ['steep']);
  assert.ok(out.report.drops.some(d => d.id === 'bad' && d.reason === 'segment_degenerate'));
  assert.ok(out.report.diagnostics.some(d => d.code === 'segment_steep' && d.stage === '2_transport'));
});

test('citygen stage 2: reports disconnected road graph and anchor distance warning', () => {
  const raw = v4Base();
  raw.gameplay.spawn = { x: -100, z: -100 };
  raw.gameplay.exit = { x: 100, z: 100 };
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'n1', position: [0,0,0], layer: 'ground' },
      { id: 'n2', position: [10,0,0], layer: 'ground' },
      { id: 'n3', position: [0,0,50], layer: 'ground' },
      { id: 'n4', position: [10,0,50], layer: 'ground' },
    ],
    segments: [
      { id: 's1', from: 'n1', to: 'n2', type: 'local', layer: 'ground', path: [[0,0,0],[10,0,0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
      { id: 's2', from: 'n3', to: 'n4', type: 'local', layer: 'ground', path: [[0,0,50],[10,0,50]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const a = runCitygen(structuredClone(raw));
  const b = runCitygen(structuredClone(raw));
  assert.equal(a.reportJson, b.reportJson);
  assert.ok(a.report.diagnostics.some(d => d.code === 'road_graph_disconnected'));
  assert.ok(a.report.diagnostics.some(d => d.code === 'anchor_far_from_roads'));
  // Original 2 segments + repair connectors (spawn-exit + remaining components) now added with easements.
  assert.equal(a.ctx.masks.easement.roads.length, 5);
});

test('citygen stage 2: procedural transport generation is deterministic (emission deferred pending engine-valid geometry)', () => {
  const base = () => {
    const raw = v4Base();
    raw.gameplay.spawn = { x: -100, z: -80 };
    raw.gameplay.exit = { x: 100, z: 90 };
    raw.generator.seed = 77;
    raw.generator.transport = { generate: true, width: 8 };
    return raw;
  };
  const a = runCitygen(base());
  const b = runCitygen(base());
  assert.equal(a.reportJson, b.reportJson);
  const st2 = a.report.stages.find(s => s.id === '2_transport');
  assert.equal(st2?.status, 'ok');
  assert.ok(!a.report.diagnostics.some(d => d.code === 'stage_error' && d.stage === '2_transport'));
  assert.ok(a.report.diagnostics.some(d => d.code === 'transport_generated' && d.stage === '2_transport'));
  // Emission is gated: valid axis/slope-safe networks are emitted, otherwise deferred.
  const segs = a.engine.cityforge.networks.roads.segments;
  const deferred = a.report.diagnostics.some(d => d.code === 'transport_emit_deferred' && d.stage === '2_transport');
  if (deferred) {
    assert.deepEqual(segs, []);
  } else {
    assert.ok(segs.length >= 1);
    assert.ok(segs.every(s => Array.isArray(s.path) && s.path.length >= 2));
    assert.ok(segs.every(s => {
      for (let i = 0; i + 1 < s.path.length; i++) {
        const p = s.path[i], q = s.path[i + 1];
        if (Math.abs(p[0] - q[0]) > 0.01 && Math.abs(p[2] - q[2]) > 0.01) return false;
        const run = Math.hypot(q[0]-p[0], q[2]-p[2]);
        if (run > 1e-9 && Math.abs(q[1]-p[1]) / run > 0.3005) return false;
      }
      return true;
    }));
  }
});

test('citygen stage 3: auto-generates deterministic districts and parcels with diverse types', () => {
  const base = () => {
    const raw = v4Base();
    raw.ground.size = 1280;
    raw.gameplay.spawn = { x: -260, z: 160 };
    raw.gameplay.exit = { x: 560, z: 560 };
    raw.generator.seed = 15;
    return raw;
  };
  const a = runCitygen(base());
  const b = runCitygen(base());
  assert.equal(a.reportJson, b.reportJson);
  assert.ok(a.ctx.districts.length >= 9); // 4x4 grid for >=1024
  assert.ok(a.ctx.parcels.length > a.ctx.districts.length);
  const types = new Set(a.ctx.districts.map(d => d.type));
  assert.ok(types.size >= 4, 'expected several district types');
  assert.ok(a.report.diagnostics.some(d => d.code === 'districts_generated'));
  assert.ok(a.report.diagnostics.some(d => d.code === 'parcels_generated'));
  const districtStage = a.report.stages.find(s => s.id === '3_districts_parcels');
  assert.ok(districtStage && districtStage.status === 'ok');
});

test('citygen v4 end-to-end: generated landscape+transport compiles to open catalog', () => {
  const raw = {
    $schema: './level-v4.schema.json', kind: 'cityforge', schemaVersion: 4,
    metadata: { levelName: 'v4-gen', name: 'V4 gen test', hint: 'reach B', units: 'meters' },
    ground: { y: 0, size: 256, color: 0x6f8f4e },
    gameplay: { goal: 'exit', spawn: { x: -100, z: -100 }, exit: { x: 100, z: 100 }, exitRadius: 4, enemies: { count: 0 }, alienEnemies: { count: 0 } },
    stream: { chunk: 256, keep: 1, aheadMin: 80, aheadMax: 200, budgetMs: 40 },
    cityforge: {
      format: 'cityforge', version: '0.1',
      world: { units: 'meters', coordinateSystem: { type: 'local', handedness: 'right', up: 'Y' }, origin:[0,0,0], bounds: { min: [-128,-128,-50], max: [128,128,100] } },
      assets: [{ id: 'ground.placeholder', kind: 'procedural', generator: 'placeholder.flat', bounds: [256,256,1] }],
      hydrology: { rivers: [], lakes: [] },
      networks: { roads: { nodes: [], segments: [], junctions: [] }, railways: { nodes: [], segments: [], junctions: [] }, paths: { nodes: [], segments: [], junctions: [] } },
      structures: { bridges: [], tunnels: [] },
      instances: [], chunks: []
    },
    generator: {
      generatorVersion: '0.1.0', seed: 16, deterministic: true, stages: [], layers: [], budgets: {}, districts: [], profiles: {}, catalogs: {}, refs: {}, policies: {},
      landscape: { generate: true, hills: { count: 3, minHeight: 8, maxHeight: 20, minRadius: 50, maxRadius: 90 }, river: { enabled: true, width: 16, depth: 3, points: 5, axis: 'z' } },
      transport: { generate: true, width: 8 }
    }
  };
  const out = generateOutput(structuredClone(raw), 'src/levels/v4-gen.json');
  assert.equal(out.kind, 'catalog');
  assert.equal(out.sourceFormat, 'cityforge-v4');
  assert.ok(out.generationReport && out.generationReport.includes('"generatorVersion"'));
  assert.ok(Array.isArray(out.files) && out.files.length >= 2);
  const out2 = generateOutput(structuredClone(raw), 'src/levels/v4-gen.json');
  assert.equal(out.generationReport, out2.generationReport);
  assert.deepEqual(out.files.map(f => f.path), out2.files.map(f => f.path));
  const report = JSON.parse(out.generationReport);
  // Crossing conflicts in generated transport should be detected and handled safely (repaired or degraded).
  assert.ok(report.diagnostics.some(d => d.code === 'road_same_level_conflict' && d.stage === '6_finalize_emit'));
  assert.ok(
    report.diagnostics.some(d => (d.code === 'road_crossing_repaired' || d.code === 'road_crossing_repair_skipped') && d.stage === '6_finalize_emit'),
    'expected safe crossing repair or skip diagnostics in generated e2e case'
  );
  assert.ok(
    report.diagnostics.some(d => (d.code === 'road_conflicts_resolved' || d.code === 'road_conflicts_unresolved') && d.stage === '6_finalize_emit'),
    'expected post-repair crossing conflict summary diagnostic'
  );
});

test('citygen stage 5: generates capped street lights and deterministic district props with provided roads', () => {
  const base = () => {
    const raw = v4Base();
    raw.ground.size = 512;
    raw.gameplay.spawn = { x: -200, z: -200 };
    raw.gameplay.exit = { x: 200, z: 200 };
    raw.stream = { chunk: 256, keep: 1, aheadMin: 80, aheadMax: 200, budgetMs: 40 };
    raw.generator.seed = 33;
    raw.cityforge.networks.roads = {
      nodes: [
        { id: 'n1', position: [-200, 0, -200], layer: 'ground' },
        { id: 'n2', position: [200, 0, -200], layer: 'ground' },
        { id: 'n3', position: [200, 0, 200], layer: 'ground' },
      ],
      segments: [
        { id: 'r1', from: 'n1', to: 'n2', type: 'local', layer: 'ground', path: [[-200, 0, -200], [200, 0, -200]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
        { id: 'r2', from: 'n2', to: 'n3', type: 'local', layer: 'ground', path: [[200, 0, -200], [200, 0, 200]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
      ],
      junctions: [],
    };
    return raw;
  };
  const a = runCitygen(base());
  const b = runCitygen(base());
  assert.equal(a.reportJson, b.reportJson);
  const lights = a.ctx.infrastructure?.lights ?? [];
  const props = a.ctx.infrastructure?.props ?? [];
  assert.ok(lights.length >= 1 && lights.length <= 8, `expected 1..8 lights, got ${lights.length}`);
  assert.ok(lights.every(l => l.type === 'point' && l.position && Number.isFinite(l.position.x)));
  assert.ok(props.length > 0, 'expected district props to be generated');
  assert.ok(props.every(p => p.id && p.model && p.position && p.rotation));
  assert.ok(a.report.diagnostics.some(d => d.code === 'street_lights_generated' && d.stage === '5_infrastructure_props'));
  const propsDiag = a.report.diagnostics.find(d => d.code === 'props_generated' && d.stage === '5_infrastructure_props');
  assert.ok(propsDiag, 'props_generated diagnostic missing');
  assert.ok(propsDiag.byDistrictType && typeof propsDiag.byDistrictType === 'object', 'props_generated.byDistrictType missing');
  assert.ok(Object.keys(propsDiag.byDistrictType).length >= 1, 'props_generated.byDistrictType should have at least one district type');
  const byTypeSum = Object.values(propsDiag.byDistrictType).reduce((s, n) => s + n, 0);
  assert.ok(byTypeSum <= props.length, `byDistrictType sum ${byTypeSum} should not exceed props count ${props.length}`);
  const st5 = a.report.stages.find(s => s.id === '5_infrastructure_props');
  assert.equal(st5?.status, 'ok');
});

test('citygen stage 3: guarantees core MVP district types on 1280m pilot grid', () => {
  const raw = v4Base();
  raw.ground.size = 1280;
  raw.gameplay.spawn = { x: -520, z: -520 };
  raw.gameplay.exit = { x: 520, z: 520 };
  raw.stream = { chunk: 256, keep: 2, aheadMin: 200, aheadMax: 1200, budgetMs: 80 };
  raw.generator.seed = 15;
  const out = runCitygen(raw);
  const types = new Set(out.ctx.districts.map(d => d.type));
  for (const t of ['office', 'residential', 'park', 'industrial', 'slums', 'forest']) {
    assert.ok(types.has(t), `missing core district type: ${t}`);
  }
  assert.ok(types.size >= 6);
});

test('citygen stage 2: errors when road crosses river without bridge', () => {
  const raw = v4Base();
  raw.gameplay.spawn = { x: -50, z: 0 };
  raw.gameplay.exit = { x: 50, z: 0 };
  raw.cityforge.hydrology.rivers = [
    { id: 'r', path: [[0, 0, -40], [0, 0, 40]], width: 12, depth: 3 },
  ];
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'a', position: [-40, 0, 0], layer: 'ground' },
      { id: 'b', position: [40, 0, 0], layer: 'ground' },
    ],
    segments: [
      { id: 'bad_cross', from: 'a', to: 'b', type: 'local', layer: 'ground', path: [[-40, 0, 0], [40, 0, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'road_crosses_river_without_bridge' && d.stage === '2_transport' && d.severity === 'error'));
});

test('citygen v4 build: fails on road crossing river without bridge', () => {
  const raw = v4Base();
  raw.ground.size = 256;
  raw.gameplay.spawn = { x: -80, z: 0 };
  raw.gameplay.exit = { x: 80, z: 0 };
  raw.cityforge.terrain.modifiers = [
    { id: 'm1', type: 'mountain', center: [0, 80], radius: 40, height: 10, falloff: 'smooth', operation: 'add', sourceRef: 'terrain.base', parameters: {} },
  ];
  raw.cityforge.hydrology.rivers = [
    { id: 'r', path: [[0, 0, -40], [0, 0, 40]], width: 12, depth: 3 },
  ];
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'a', position: [-60, 0, 0], layer: 'ground' },
      { id: 'b', position: [60, 0, 0], layer: 'ground' },
    ],
    segments: [
      { id: 'bad_cross', from: 'a', to: 'b', type: 'local', layer: 'ground', path: [[-60, 0, 0], [60, 0, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  assert.throws(
    () => generateOutput(structuredClone(raw), 'src/levels/v4-bad-river.json'),
    (e) => String(e?.message ?? '').includes('road_crosses_river_without_bridge')
      || (e?.errors ?? []).some(x => String(x).includes('road_crosses_river_without_bridge'))
  );
});

test('cityforge v3 build: fails on road crossing river without bridge', () => {
  const raw = {
    $schema: './level-v3.schema.json',
    kind: 'cityforge',
    metadata: { levelName: 't', name: 't', hint: 't', units: 'meters' },
    ground: { y: 0, size: 256 },
    gameplay: { goal: 'exit', spawn: { x: -80, z: 0 }, exit: { x: 80, z: 0 }, exitRadius: 4 },
    stream: { chunk: 256, keep: 1, aheadMin: 50, aheadMax: 100, budgetMs: 20 },
    cityforge: {
      format: 'cityforge', version: '0.1',
      world: { units: 'meters', coordinateSystem: { type: 'local', handedness: 'right', up: 'Y' }, origin: [0,0,0], bounds: { min: [-128,-128,-50], max: [128,128,50] } },
      generation: { seed: 1, generatorVersion: '0.1', deterministic: true },
      assets: [{ id: 'ground.placeholder', kind: 'procedural', generator: 'placeholder.flat', bounds: [256,256,1] }],
      districts: [], blocks: [], parcels: [], instances: [],
      terrain: { base: { type: 'heightfield', source: 'procedural', resolution: 4 }, modifiers: [{ id: 'm1', type: 'mountain', center: [0,80], radius: 40, height: 10, falloff: 'smooth', operation: 'add', sourceRef: 'terrain.base', parameters: {} }] },
      hydrology: { rivers: [{ id: 'r', path: [[-40,0,0],[40,0,0]], width: 12, depth: 3, flow: 'start_to_end', carveTerrain: false }], lakes: [] },
      networks: {
        roads: {
          nodes: [{ id: 'a', position: [0,0,-60], layer: 'ground' }, { id: 'b', position: [0,0,60], layer: 'ground' }],
          segments: [{ id: 'bad', from: 'a', to: 'b', type: 'local', layer: 'ground', path: [[0,0,-60],[0,0,60]], lanes: [{ id: 'l', direction: 'forward', width: 8, type: 'vehicle' }], shoulderWidth: 1, sidewalk: false, surface: 'asphalt' }],
          junctions: [],
        },
        railways: { nodes: [], segments: [], junctions: [] },
        paths: { nodes: [], segments: [], junctions: [] },
      },
      structures: { bridges: [], tunnels: [] },
    },
  };
  assert.throws(
    () => generateOutput(structuredClone(raw), 'src/levels/v3-bad-river.json'),
    (e) => String(e?.message ?? '').includes('без моста') || (e?.errors ?? []).some(x => String(x).includes('без моста'))
  );
});

test('citygen report: deterministic structure with all stages and summary', () => {
  const raw = v4Base();
  const a = runCitygen(structuredClone(raw));
  const b = runCitygen(structuredClone(raw));
  assert.equal(a.reportJson, b.reportJson);
  const r = a.report;
  assert.equal(r.version, 1);
  assert.ok(r.generator && r.generator.seed === raw.generator.seed);
  assert.ok(Array.isArray(r.stages));
  assert.deepEqual(r.stages.map(s => s.id), ['0_input_space','1_landscape_hydrology','2_transport','3_districts_parcels','4_buildings_structures','5_infrastructure_props','6_finalize_emit']);
  assert.ok(r.summary && typeof r.summary.errors === 'number' && typeof r.summary.warnings === 'number');
  assert.ok(Array.isArray(r.diagnostics) && Array.isArray(r.repairs) && Array.isArray(r.drops));
});

test('citygen diagnostics: finalizeReport/reportToJson sort deterministically and summarize', () => {
  const r = createReport({ generatorVersion: '0.1.0', seed: 7, deterministic: true });
  r.stages = [{ id: '2_transport', status: 'ok' }, { id: '1_landscape_hydrology', status: 'ok' }];
  r.diagnostics = [
    { severity: 'info', code: 'b', stage: '2_transport', message: 'm2' },
    { severity: 'error', code: 'a', stage: '1_landscape_hydrology', message: 'm1' },
    { severity: 'warn', code: 'c', stage: '1_landscape_hydrology', message: 'm0' },
  ];
  r.repairs = [{ stage: '2_transport', code: 'z' }, { stage: '1_landscape_hydrology', code: 'a' }];
  r.drops = [{ stage: '2_transport', id: 'b' }, { stage: '1_landscape_hydrology', id: 'a' }];
  const j1 = reportToJson(structuredClone(r));
  const j2 = reportToJson(structuredClone(r));
  assert.equal(j1, j2);
  const out = JSON.parse(j1);
  assert.deepEqual(out.stages.map(s => s.id), ['1_landscape_hydrology', '2_transport']);
  assert.deepEqual(out.diagnostics.map(d => [d.severity, d.code]), [['error','a'], ['warn','c'], ['info','b']]);
  assert.deepEqual(out.repairs.map(x => [x.stage, x.code]), [['1_landscape_hydrology','a'], ['2_transport','z']]);
  assert.deepEqual(out.drops.map(x => [x.stage, x.id]), [['1_landscape_hydrology','a'], ['2_transport','b']]);
  assert.deepEqual(out.summary, { errors: 1, warnings: 1, repairs: 2, drops: 2 });
  assert.equal(out.generator.seed, 7);
});

test('citygen rng/ids: deterministic seeds, rng sequence and stable ids', () => {
  assert.equal(mix(42, '1_landscape_hydrology', 'd1', 0, 0, '', 0), mix(42, '1_landscape_hydrology', 'd1', 0, 0, '', 0));
  assert.notEqual(mix(42, 'stage', 1), mix(42, 'stage', 2));
  assert.equal(hashString('abc'), hashString('abc'));
  assert.equal(stageSubseed(42, '2_transport', 'd1', 1, 2, 'slot', 3), mix(42, '2_transport', 'd1', 1, 2, 'slot', 3));
  const a = makeRng(123), b = makeRng(123);
  const seqA = [a(), a(), a(), a(), a()], seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every(v => v >= 0 && v < 1));
  assert.equal(stableId('stage', 1, 'x'), 'stage_1_x');
  assert.deepEqual([{ id: 'b' }, { id: 'a' }, { id: 'c' }].sort(byId).map(x => x.id), ['a', 'b', 'c']);
});

test('citygen pipeline: all stages complete with status ok on base v4 input', () => {
  const out = runCitygen(v4Base());
  assert.deepEqual(out.report.stages.map(s => ({ id: s.id, status: s.status })), [
    { id: '0_input_space', status: 'ok' },
    { id: '1_landscape_hydrology', status: 'ok' },
    { id: '2_transport', status: 'ok' },
    { id: '3_districts_parcels', status: 'ok' },
    { id: '4_buildings_structures', status: 'ok' },
    { id: '5_infrastructure_props', status: 'ok' },
    { id: '6_finalize_emit', status: 'ok' },
  ]);
});

test('citygen spatial index: inserts and queries AABBs deterministically', () => {
  const idx = createSpatialIndex({ size: 256 }, 64);
  assert.equal(idx.size, 0);
  assert.ok(idx.insert({ id: 'a', minX: -10, maxX: 10, minZ: -10, maxZ: 10 }));
  assert.ok(idx.insert({ id: 'b', minX: 100, maxX: 120, minZ: 100, maxZ: 120 }));
  assert.ok(idx.insert({ id: 'c', minX: 5, maxX: 15, minZ: 5, maxZ: 15 }));
  assert.equal(idx.size, 3);
  const q1 = idx.query({ minX: -5, maxX: 6, minZ: -5, maxZ: 6 }).map(x => x.id).sort();
  assert.deepEqual(q1, ['a', 'c']);
  const q2 = idx.query({ minX: 90, maxX: 110, minZ: 90, maxZ: 110 }).map(x => x.id).sort();
  assert.deepEqual(q2, ['b']);
  const q3 = idx.query({ minX: -200, maxX: -150, minZ: -200, maxZ: -150 });
  assert.equal(q3.length, 0);
  idx.clear();
  assert.equal(idx.size, 0);
});

test('citygen stage 2: clamps road path points outside world bounds (warn + repair)', () => {
  const raw = v4Base();
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'a', position: [-50, 0, 0], layer: 'ground' },
      { id: 'b', position: [50, 0, 0], layer: 'ground' },
    ],
    segments: [
      { id: 'oob_seg', from: 'a', to: 'b', type: 'local', layer: 'ground', path: [[-50, 0, 0], [150, 0, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'road_point_out_of_bounds' && d.stage === '2_transport'));
  assert.ok(out.report.repairs.some(r => r.code === 'clamp_road_path_bounds' && r.stage === '2_transport' && r.id === 'oob_seg'));
  const seg = out.engine.cityforge.networks.roads.segments.find(s => s.id === 'oob_seg');
  assert.ok(seg);
  assert.equal(seg.path[1][0], 128);
});

test('pilot level-16 v4: generateOutput deterministic (report and catalog contents)', () => {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/level-16-pilot.json'), 'utf8'));
  const a = generateOutput(structuredClone(raw), 'src/levels/level-16.json');
  const b = generateOutput(structuredClone(raw), 'src/levels/level-16.json');
  assert.equal(a.kind, 'catalog');
  assert.equal(a.sourceFormat, 'cityforge-v4');
  assert.equal(a.generationReport, b.generationReport);
  assert.deepEqual(a.files.map(f => f.path), b.files.map(f => f.path));
  assert.deepEqual(
    a.files.map(f => f.code ?? Buffer.from(f.bytes).toString('base64')),
    b.files.map(f => f.code ?? Buffer.from(f.bytes).toString('base64'))
  );
  const report = JSON.parse(a.generationReport);
  assert.equal(report.summary.errors, 0);
  assert.equal(raw.windows?.spacing, 12, 'pilot source should keep windows spacing perf tuning');
  const fin = report.diagnostics.find(d => d.code === 'finalize_counts' && d.stage === '6_finalize_emit');
  assert.ok(fin, 'pilot finalize_counts diagnostic missing');
  assert.ok(fin.propsByDistrictType && typeof fin.propsByDistrictType === 'object', 'pilot finalize_counts should include propsByDistrictType');
  assert.ok(fin.roadAccessByType && typeof fin.roadAccessByType === 'object', 'pilot finalize_counts should include roadAccessByType');
  assert.equal(fin.roadComponents, 1);
  assert.equal(fin.roadSegments, 176);
  assert.equal(fin.roadNodes, 146);
  assert.equal(fin.buildings, 415);
  assert.equal(fin.props, 360);
  assert.equal(fin.lights, 8);
  assert.ok(Array.isArray(fin.districtTypes) && fin.districtTypes.length >= 10, 'pilot should retain broad district type coverage');
  for (const t of ['commercial', 'old_town', 'campus', 'market']) {
    assert.ok(fin.districtTypes.includes(t), `pilot should include district type ${t}`);
    assert.ok((fin.propsByDistrictType?.[t] ?? 0) > 0, `pilot should place props in ${t}`);
  }
  assert.ok(!report.diagnostics.some(d => d.code === 'district_type_poor_road_access' && d.stage === '6_finalize_emit'), 'pilot should not have poor road access by district type');
  assert.ok(!report.diagnostics.some(d => d.severity === 'warn' && d.stage === '3_districts_parcels'), 'pilot district assignment should avoid adjacency/representation warnings');
});

test('citygen stage 1: clamps river width/depth and repairs steep terrain modifier', () => {
  const raw = v4Base();
  raw.cityforge.hydrology.rivers = [
    { id: 'wide', path: [[-20, 0, 0], [20, 0, 0]], width: 999, depth: 999 },
  ];
  raw.cityforge.terrain.modifiers = [
    { id: 'steep', type: 'mountain', center: [0, 0], radius: 10, height: 100 },
  ];
  const out = runCitygen(raw);
  const river = out.engine.cityforge.hydrology.rivers[0];
  assert.equal(river.width, 200);
  assert.equal(river.depth, 100);
  assert.ok(out.report.repairs.some(r => r.id === 'wide' && r.code === 'clamp_river_width'));
  assert.ok(out.report.repairs.some(r => r.id === 'wide' && r.code === 'clamp_river_depth'));
  const mod = out.engine.cityforge.terrain.modifiers.find(m => m.id === 'steep');
  assert.ok(mod);
  assert.ok(Math.abs(mod.height) / mod.radius <= 0.8 + 1e-9);
  assert.ok(out.report.repairs.some(r => r.id === 'steep' && (r.code === 'repair_steep_modifier_radius' || r.code === 'repair_steep_modifier_height')));
  assert.ok(out.report.diagnostics.some(d => d.code === 'terrain_steep_modifier_repaired' && d.stage === '1_landscape_hydrology'));
});

test('citygen stage 1: renames duplicate terrain modifier ids deterministically', () => {
  const raw = v4Base();
  raw.cityforge.terrain.modifiers = [
    { id: 'm', type: 'mountain', center: [-20, 0], radius: 20, height: 10 },
    { id: 'm', type: 'valley', center: [20, 0], radius: 20, height: -8 },
  ];
  const a = runCitygen(structuredClone(raw));
  const b = runCitygen(structuredClone(raw));
  assert.equal(a.reportJson, b.reportJson);
  assert.deepEqual(a.engine.cityforge.terrain.modifiers.map(m => m.id), ['m', 'm_2']);
  assert.ok(a.report.repairs.some(r => r.code === 'duplicate_id_renamed' && r.stage === '1_landscape_hydrology' && r.id === 'm' && r.to === 'm_2'));
});

test('citygen stage 3: repairs unknown district profile to fallback', () => {
  const raw = v4Base();
  raw.generator.districts = [
    { id: 'd1', type: 'unknown_weird_type', geometry: { rect: { minX: -64, minZ: -64, maxX: 64, maxZ: 64 } } },
  ];
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'unknown_district_profile' && d.stage === '3_districts_parcels'));
  assert.ok(out.report.repairs.some(r => r.code === 'district_profile_fallback' && r.id === 'd1'));
  const d = out.ctx.districts.find(x => x.id === 'd1');
  assert.ok(d);
  assert.equal(d.type || d.profileId, 'forest');
});

test('citygen stage 3: warns on incompatible adjacent declared districts', () => {
  const raw = v4Base();
  raw.generator.districts = [
    { id: 'd1', type: 'office', geometry: { rect: { minX: -128, minZ: -128, maxX: 0, maxZ: 128 } }, cells: [{ cx: 0, cy: 0 }] },
    { id: 'd2', type: 'forest', geometry: { rect: { minX: 0, minZ: -128, maxX: 128, maxZ: 128 } }, cells: [{ cx: 1, cy: 0 }] },
  ];
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'district_adjacency_fallback' && d.stage === '3_districts_parcels'));
  assert.ok(out.report.diagnostics.some(d => d.code === 'districts_passthrough' && d.stage === '3_districts_parcels'));
});

test('citygen stage 6: emits finalize summary and status', () => {
  const out = runCitygen(v4Base());
  const st6 = out.report.stages.find(s => s.id === '6_finalize_emit');
  assert.equal(st6?.status, 'ok');
  assert.ok(out.report.diagnostics.some(d => d.code === 'finalize_counts' && d.stage === '6_finalize_emit'));
  assert.ok(out.report.diagnostics.some(d => d.code === 'finalize_no_roads' && d.severity === 'warn' && d.stage === '6_finalize_emit'));
  assert.ok(out.report.summary && typeof out.report.summary.errors === 'number');
});

test('citygen stage 4: enterable share stays within 15–25% and carry rooms/stairs (R4.5)', () => {
  const raw = v4Base({ ground: { y: 0, size: 1280 } });
  const out = runCitygen(raw);
  const buildings = out.ctx?.buildings ?? [];
  const enter = buildings.filter(b => b?.isEnterable === true);
  if (buildings.length <= 25) {
    // small worlds can't sustain 20% share deterministically; assert only the invariant tag presence
    assert.ok(Array.isArray(enter));
    return;
  }
  const share = enter.length / buildings.length;
  assert.ok(share >= 0.15 && share <= 0.25, `enterable share ${share}`);
  for (const b of enter.slice(0, 8)) {
    assert.ok(Array.isArray(b.rooms) && b.rooms.length >= 1, `rooms empty on ${b.id}`);
    const floorsN = Math.max(1, Math.floor(Number(b.floorsCount) || 1));
    assert.equal(b.stairs.length, Math.max(0, floorsN - 1), `stairs on ${b.id} must match floors`);
    for (const s of b.stairs) {
      assert.ok([0, 90, 180, 270].includes(Number(s.rotation ?? 0)), `rotation ${s.rotation} on ${b.id}`);
      assert.ok(Array.isArray(s.connectsFloors) && s.connectsFloors.length === 2);
    }
  }
  const diag = (out.report.diagnostics || []).find(d => d.code === 'enterable_share');
  assert.ok(diag && Number.isFinite(diag.share), 'enterable_share diagnostic present');
  assert.ok(diag.share >= 0.15 && diag.share <= 0.25);
});

test('citygen stage 4: repairs duplicate building ids in declared buildings', () => {
  const raw = v4Base();
  raw.buildings = [
    { id: 'dup_b', type: 'residential', isEnterable: false, position: { x: 0, y: 0, z: 0 }, footprint: [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 4 }, { x: -4, z: 4 }], floors: 1, floorHeight: 3, material: 'concrete' },
    { id: 'dup_b', type: 'office', isEnterable: false, position: { x: 20, y: 0, z: 0 }, footprint: [{ x: 16, z: -4 }, { x: 24, z: -4 }, { x: 24, z: 4 }, { x: 16, z: 4 }], floors: 2, floorHeight: 3, material: 'glass' },
  ];
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'buildings_passthrough' && d.stage === '4_buildings_structures'));
  assert.ok(out.report.repairs.some(r => r.code === 'duplicate_building_id' && r.stage === '4_buildings_structures'));
  const ids = (out.engine.buildings ?? []).map(b => b.id);
  assert.deepEqual(ids, ['dup_b', 'dup_b_2']);
});

test('citygen stage 2: repairs spawn-exit connectivity by adding connector segment', () => {
  const raw = v4Base();
  raw.gameplay.spawn = { x: -100, z: -100 };
  raw.gameplay.exit = { x: 100, z: 100 };
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'n1', position: [-100, 0, -100], layer: 'ground' },
      { id: 'n2', position: [-80, 0, -100], layer: 'ground' },
      { id: 'n3', position: [80, 0, 100], layer: 'ground' },
      { id: 'n4', position: [100, 0, 100], layer: 'ground' },
    ],
    segments: [
      { id: 's1', from: 'n1', to: 'n2', type: 'local', layer: 'ground', path: [[-100, 0, -100], [-80, 0, -100]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
      { id: 's2', from: 'n3', to: 'n4', type: 'local', layer: 'ground', path: [[80, 0, 100], [100, 0, 100]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'road_graph_disconnected' && d.stage === '2_transport'));
  assert.ok(out.report.repairs.some(r => r.code === 'connect_spawn_exit_components' && r.stage === '2_transport'));
  assert.ok(out.report.diagnostics.some(d => d.code === 'transport_repaired_connectivity' && d.stage === '2_transport'));
  const segs = out.engine.cityforge.networks.roads.segments;
  assert.ok(segs.length >= 3);
  assert.ok(segs.some(s => s.id === 'tr_repair_connect'));
});

test('citygen: stages build spatial indices (river/road/building) for downstream queries', () => {
  const raw = v4Base();
  raw.cityforge.hydrology.rivers = [
    { id: 'river1', path: [[-10, 0, 0], [10, 0, 0]], width: 12, depth: 2 },
  ];
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'a', position: [-40, 0, 20], layer: 'ground' },
      { id: 'b', position: [40, 0, 20], layer: 'ground' },
    ],
    segments: [
      { id: 's1', from: 'a', to: 'b', type: 'local', layer: 'ground', path: [[-40, 0, 20], [40, 0, 20]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  raw.generator.districts = [
    { id: 'd1', type: 'residential', geometry: { rect: { minX: -60, minZ: -60, maxX: 60, maxZ: -5 } } },
  ];
  raw.generator.buildings = { generate: true, budget: 8 };
  const out = runCitygen(raw);
  assert.ok(out.ctx.spatial?.riverSegments, 'riverSegments index missing');
  assert.ok(out.ctx.spatial.riverSegments.query({ minX: -5, maxX: 5, minZ: -20, maxZ: 20 }).length >= 1, 'river index query near river should hit');
  assert.ok(out.ctx.spatial?.roadEasements, 'roadEasements index missing');
  assert.ok(out.ctx.spatial.roadEasements.query({ minX: -5, maxX: 5, minZ: 10, maxZ: 30 }).length >= 1, 'road index query near road should hit');
  assert.ok(out.ctx.spatial?.buildings, 'buildings index missing');
  if ((out.ctx.buildings?.length ?? 0) > 0) {
    const b = out.ctx.buildings[0];
    const xs = b.footprint.map(p => p.x), zs = b.footprint.map(p => p.z);
    const q = out.ctx.spatial.buildings.query({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
    assert.ok(q.length >= 1, 'building index query over footprint should hit');
  }
});

test('citygen report: districts include reservedParcels and finalize includes road graph components', () => {
  const raw = v4Base();
  raw.generator.districts = [
    { id: 'd1', type: 'residential', geometry: { rect: { minX: -64, minZ: -64, maxX: 64, maxZ: 64 } } },
  ];
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'a', position: [-40, 0, 0], layer: 'ground' },
      { id: 'b', position: [40, 0, 0], layer: 'ground' },
    ],
    segments: [
      { id: 's1', from: 'a', to: 'b', type: 'local', layer: 'ground', path: [[-40, 0, 0], [40, 0, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  assert.ok(Array.isArray(out.report.districts) && out.report.districts.length >= 1);
  for (const d of out.report.districts) {
    assert.equal(typeof d.reservedParcels, 'number');
    assert.ok(d.reservedParcels >= 0 && d.reservedParcels <= d.parcels);
  }
  const fin = out.report.diagnostics.find(d => d.code === 'finalize_counts' && d.stage === '6_finalize_emit');
  assert.ok(fin, 'finalize_counts missing');
  assert.equal(typeof fin.roadComponents, 'number');
  assert.equal(typeof fin.roadGraphNodes, 'number');
  assert.ok(fin.roadComponents >= 1);
  if ((fin.props ?? 0) > 0) {
    assert.ok(fin.propsByDistrictType && typeof fin.propsByDistrictType === 'object', 'finalize_counts.propsByDistrictType missing when props generated');
  }
  assert.ok(fin.roadAccessByType && typeof fin.roadAccessByType === 'object', 'finalize_counts.roadAccessByType missing');
});

test('citygen stage 2/6: repair connects spawn-exit and remaining road components (no disconnected finalize)', () => {
  const raw = v4Base();
  raw.gameplay.spawn = { x: -100, z: -100 };
  raw.gameplay.exit = { x: 100, z: 100 };
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'n1', position: [-100, 0, -100], layer: 'ground' },
      { id: 'n2', position: [-80, 0, -100], layer: 'ground' },
      { id: 'n3', position: [80, 0, 100], layer: 'ground' },
      { id: 'n4', position: [100, 0, 100], layer: 'ground' },
      { id: 'n5', position: [0, 0, 0], layer: 'ground' },
      { id: 'n6', position: [10, 0, 0], layer: 'ground' },
    ],
    segments: [
      { id: 's1', from: 'n1', to: 'n2', type: 'local', layer: 'ground', path: [[-100, 0, -100], [-80, 0, -100]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
      { id: 's2', from: 'n3', to: 'n4', type: 'local', layer: 'ground', path: [[80, 0, 100], [100, 0, 100]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
      { id: 's3', from: 'n5', to: 'n6', type: 'local', layer: 'ground', path: [[0, 0, 0], [10, 0, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  assert.ok(out.report.repairs.some(r => r.code === 'connect_spawn_exit_components' && r.stage === '2_transport'));
  assert.ok(out.report.repairs.some(r => r.code === 'connect_road_component' && r.stage === '2_transport'));
  const fin = out.report.diagnostics.find(d => d.code === 'finalize_counts' && d.stage === '6_finalize_emit');
  assert.ok(fin);
  assert.equal(fin.roadComponents, 1);
  assert.ok(!out.report.diagnostics.some(d => d.code === 'road_graph_disconnected_final' && d.stage === '6_finalize_emit'));
});

test('citygen stage 2 helpers: axis-aligned terrain path rejects diagonal and river-proximate paths', async () => {
  const { buildAxisAlignedTerrainPath, isValidAxisAlignedTerrainPath } = await import('./citygen/pipeline/stage-2-transport.mjs');
  const flat = { heightAt: () => 0 };
  const diag = buildAxisAlignedTerrainPath(0, 0, 10, 10, flat, [], 4);
  assert.equal(diag, null, 'diagonal path must be rejected');
  const straight = buildAxisAlignedTerrainPath(0, 0, 24, 0, flat, [], 12);
  assert.ok(Array.isArray(straight) && straight.length >= 2);
  assert.equal(isValidAxisAlignedTerrainPath(straight, []), true);
  const river = [{ path: [[12, 0, -40], [12, 0, 40]], width: 12 }];
  const nearRiver = buildAxisAlignedTerrainPath(0, 0, 24, 0, flat, river, 12);
  assert.ok(Array.isArray(nearRiver));
  assert.equal(isValidAxisAlignedTerrainPath(nearRiver, river), false, 'path crossing/near river corridor must be rejected');
});

test('citygen stage 2: postprocess mergeCollinearAxisAlignedPoints deterministically collapses collinear runs (R2.2 §7.2)', async () => {
  const { mergeCollinearAxisAlignedPoints } = await import('./citygen/pipeline/stage-2-transport.mjs');
  // Straight horizontal run: collapses to endpoints, slopes remain zero (flat) — safe for IR.
  const straight = [];
  for (let x = 0; x <= 80; x += 4) straight.push([x, 0, 0]);
  const out = mergeCollinearAxisAlignedPoints(straight, 12);
  assert.equal(out.length, 2);
  assert.equal(out[0][0], 0);
  assert.equal(out[out.length - 1][0], 80);
  // Non-collinear points are preserved (z varies).
  const zigzag = [[0,0,0],[4,0,4],[8,0,0],[12,0,4],[16,0,0]];
  const out2 = mergeCollinearAxisAlignedPoints(zigzag, 12);
  assert.equal(out2.length, zigzag.length);
  // Deterministic
  assert.deepEqual(mergeCollinearAxisAlignedPoints(straight, 12), out);
});

test('citygen stage 2: mergeStraightCollinearPoints preserves slope-bounded XZ-collinear runs (R2.2 §7.2)', async () => {
  const { mergeStraightCollinearPoints } = await import('./citygen/pipeline/stage-2-transport.mjs');
  // Collinear red line with interleaved points; own slope is fine (stays under 0.3)
  const input = [];
  for (let x = 0; x <= 100; x += 4) input.push([x, 0, 0]);
  const out = mergeStraightCollinearPoints(input, { rivers: [], maxSlope: 0.3 });
  assert.equal(out.length, 2);
  assert.equal(out[0][0], 0);
  assert.equal(out[out.length - 1][0], 100);
  // Zig-zag must not be merged
  const z = [[0,0,0],[5,0,5],[10,0,0],[15,0,5],[20,0,0]];
  const out2 = mergeStraightCollinearPoints(z, { rivers: [], maxSlope: 0.3 });
  assert.equal(out2.length, 5);
  // Collinear but too steep to merge -> keep points
  const steep = [[0,0,0],[5,2.5,0],[10,0,0]];
  const out3 = mergeStraightCollinearPoints(steep, { rivers: [], maxSlope: 0.3 });
  assert.equal(out3.length, 3);
});

test('citygen cost-path: A* pathfinds around rivers deterministically (R2.2 §7.2)', async () => {
  const { findAxisCostPath } = await import('./citygen/cost-path.mjs');
  // Synthetic sampler: flat ground everywhere.
  const sampler = { heightAt: () => 0, groundY: 0 };
  const river = [{ id: 'r', path: [[0, 0, -40], [0, 0, 40]], width: 12, depth: 2 }];
  const from = { x: -80, z: 0 }, to = { x: 80, z: 0 };
  const r1 = findAxisCostPath({ from, to, sampler, rivers: river, gridStep: 12, searchMargin: 192, slopeK: 6 });
  assert.ok(Array.isArray(r1.points) && r1.points.length >= 2);
  assert.ok(!r1.failure, `A* must find a feasible path (failure=${r1.failure})`);
  // Determinism
  const r2 = findAxisCostPath({ from, to, sampler, rivers: river, gridStep: 12, searchMargin: 192, slopeK: 6 });
  assert.deepEqual(r2.points, r1.points);
  assert.equal(r2.cost, r1.cost);
  // Path must not enter the river corridor: for points within river's z range, |x| must be outside half-width margin.
  const half = (river[0].width || 12) * 0.5 + 8;
  for (const [x, , z] of r1.points) {
    if (Math.abs(z) <= 40 + 0.01) {
      assert.ok(Math.abs(x) >= half - 0.001, `in-corridor point x=${x} z=${z} must avoid river corridor half-width ${half}`);
    }
  }
});

test('citygen rules: tunnel validator flags invalid tunnel structures (R2.6 §8.4 §12.1)', async () => {
  const { evaluateRules } = await import('./citygen/rules.mjs');
  const base = v4Base();
  const tunnels = [
    { id: 't1', type: 'other-type', template: 'x', roadRefs: ['r1'], portals: [{ id: 'p1', position: [0, 0, 0], roadRef: 'r1' }, { id: 'p2', position: [10, 0, 0], roadRef: 'r1' }], parameters: { lining: 'concrete', lighting: true } },
    { id: 't2', type: 'tunnel', template: 'x', roadRefs: ['r2'], portals: [{ id: 'p1', position: [0, 0, 0], roadRef: 'r2' }], parameters: { lining: 'marble', lighting: 'yes' } },
    { id: 't3', type: 'tunnel', template: 'x', roadRefs: [], portals: [{ id: 'p1', position: [0, 0, 0], roadRef: 'r3' }, { id: 'p2', position: [0, 0, 100], roadRef: 'r3' }], parameters: { lining: 'rock', lighting: false } },
    { id: 't4', type: 'tunnel', template: 'x', roadRefs: ['r4'], portals: [{ id: 'p1', position: [0, 0, 0], roadRef: 'r4' }, { id: 'p2', position: [50, 50, 50], roadRef: 'r4' }], parameters: { lining: 'concrete', lighting: false } },
  ];
  const raw = {
    ...base,
    cityforge: { ...base.cityforge, structures: { bridges: [], tunnels } },
  };
  const ctx = {
    input: raw,
    meta: {},
    parcels: [],
    buildings: [],
    networks: { roads: { nodes: [], segments: [] } },
    hydrology: { rivers: [], lakes: [] },
    masks: { easement: { rivers: [], roads: [] }, terrain: {} },
  };
  const out = evaluateRules(ctx);
  const violations = out.rules.violations ?? [];
  const codes = new Set(violations.map(v => String(v?.code)));
  assert.ok(codes.has('tunnel_invalid_type'), 'tunnel_invalid_type must be reported');
  assert.ok(codes.has('tunnel_portals_too_few'), 'tunnel_portals_too_few must be reported');
  assert.ok(codes.has('tunnel_references_empty'), 'tunnel_references_empty must be reported');
  assert.ok(codes.has('tunnel_portals_not_axis_aligned'), 'tunnel_portals_not_axis_aligned must be reported');
  assert.ok(codes.has('tunnel_lining_unknown'), 'tunnel_lining_unknown must be reported');
  const { attachRulesToReport } = await import('./citygen/rules.mjs');
  const report = { diagnostics: [], stages: [], repairs: [], drops: [] };
  attachRulesToReport(report, { ...ctx, report });
  assert.ok((report.rules?.violations ?? []).length >= 5, 'report.rules.violations must be populated');
  assert.ok((report.rules?.summary?.errors ?? 0) >= 2, 'report.rules.summary.errors must count tunnel errors');
});

test('citygen rules: junction type vs adjacent classes read-only validator (R2.8 §8.1 §12.2)', async () => {
  const { evaluateRules } = await import('./citygen/rules.mjs');
  const base = v4Base();
  const raw = {
    ...base,
    cityforge: {
      ...base.cityforge,
      networks: {
        roads: {
          nodes: [
            { id: 'n1', position: [0, 0, 0], layer: 'ground' },
            { id: 'n2', position: [10, 0, 0], layer: 'ground' },
          ],
          segments: [
            { id: 's1', from: 'n1', to: 'n2', type: 'arterial', layer: 'ground', path: [[0, 0, 0], [10, 0, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
            { id: 's2', from: 'n1', to: 'n1b', type: 'arterial', layer: 'ground', path: [[0, 0, 0], [0, 0, 10]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
          ],
          junctions: [
            { id: 'j_n1', type: 'uncontrolled', connections: [{ from: { segment: 's1', lane: 'l1', end: 'from' }, to: { segment: 's2', lane: 'l1', end: 'from' }, movement: 'straight' }] },
          ],
        },
        railways: { nodes: [], segments: [], junctions: [] },
        paths: { nodes: [], segments: [], junctions: [] },
      },
    },
  };
  const ctx = {
    input: raw,
    meta: {},
    parcels: [],
    buildings: [],
    networks: { roads: { nodes: [{ id: 'n1' }], segments: raw.cityforge.networks.roads.segments, junctions: raw.cityforge.networks.roads.junctions } },
    hydrology: { rivers: [], lakes: [] },
    masks: { easement: { rivers: [], roads: [] }, terrain: {} },
  };
  const out = evaluateRules(ctx);
  const codes = new Set((out.rules?.violations ?? []).map(v => String(v?.code)));
  assert.ok(codes.has('junction_type_mismatch_class'), 'arterial x arterial declared uncontrolled must be flagged');
});

test('citygen stage 1: buildCoreCandidates returns bounded deterministic core candidates away from plate edges (R3.1)', async () => {
  const { buildCoreCandidates } = await import('./citygen/pipeline/stage-1-landscape.mjs');
  const base = v4Base();
  base.ground = { ...base.ground, size: 512 };
  base.cityforge.terrain = {
    base: { type: 'heightfield', source: 'procedural', resolution: 4 },
    modifiers: [],
  };
  base.cityforge.hydrology = {
    rivers: [
      { id: 'r1', path: [[0, 0, -256], [0, 0, 256]], width: 18, depth: 3 },
    ],
    lakes: [
      { id: 'l1', area: { type: 'circle', center: [-200, 0], radius: 30 }, waterLevel: 0 },
    ],
  };
  const ctx = {
    input: base,
    meta: { worldBounds: { size: 512 }, seed: 99 },
    hydrology: { rivers: base.cityforge.hydrology.rivers, lakes: base.cityforge.hydrology.lakes },
    masks: { easement: { rivers: [], roads: [] }, terrain: { floodplains: [{ id: 'r1', type: 'river', floodplain: 80, path: [[0, 0, -256], [0, 0, 256]], width: 18 }, { id: 'l1', type: 'lake', floodplain: 32, center: [-200, 0], radius: 30 }] } },
    terrain: { modifiers: [] },
  };
  const crossings = [{ riverId: 'r1', x: 0, z: 64, t: 0.6, width: 18, bankSlope: 0.02, score: 0.02 }];
  const out = buildCoreCandidates(ctx, 0, 512, { step: 16, share: {}, maxSlope: 0.1 }, crossings, []);
  assert.ok(Array.isArray(out) && out.length >= 1 && out.length <= 2);
  for (const c of out) {
    assert.ok(Math.abs(c.x) <= 256 - 128 + 1);
    assert.ok(Math.abs(c.z) <= 256 - 128 + 1);
    assert.ok(Number.isFinite(c.score) && c.score > 0);
  }
  const again = buildCoreCandidates(ctx, 0, 512, { step: 16, share: {}, maxSlope: 0.1 }, crossings, []);
  assert.deepEqual(out, again);
});

test('citygen stage 3: era assignment by access-cost isolines — medieval at core, suburb at far corner, water raises cost (R3.2 §6.2/§6.3)', async () => {
  const { computeAccessCostField, assignErasToDistricts } = await import('./citygen/pipeline/stage-3-districts.mjs');
  const baseCtx = (rivers = []) => ({
    input: { ground: { size: 512, y: 0 } },
    meta: {},
    hydrology: { rivers, lakes: [] },
    networks: { roads: { segments: [] }, railways: { segments: [] } },
    terrain: { modifiers: [], analysis: { coreCandidates: [{ x: 0, z: 0 }] } },
    districts: [
      { id: 'd_center', type: 'downtown', geometry: { rect: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 } }, cells: [{ cx: 0, cy: 0 }] },
      { id: 'd_edge', type: 'residential', geometry: { rect: { minX: 200, maxX: 224, minZ: 200, maxZ: 224 } }, cells: [{ cx: 0, cy: 0 }] },
    ],
    report: { diagnostics: [], stages: [] },
  });
  // 1) flat, no water: cost at core = 0; monotone along +x; deterministic
  const f1 = computeAccessCostField(baseCtx(), 512);
  assert.ok(f1, 'field computed');
  assert.strictEqual(f1.costs[Math.floor(f1.n / 2) * f1.n + Math.floor(f1.n / 2)], 0); // ядро = 0
  assert.ok(Number.isFinite(f1.maxCost) && f1.maxCost > 0);
  const a = computeAccessCostField(baseCtx(), 512);
  assert.deepEqual([...a.costs], [...f1.costs], 'field deterministic');
  // monotone non-decreasing along a +x ray from center on flat axis-aligned terrain
  const j = Math.floor(f1.n / 2);
  let prev = 0;
  for (let i = Math.floor(f1.n / 2); i < f1.n; i++) {
    const v = f1.costs[j * f1.n + i];
    assert.ok(v >= prev, `cost must not decrease along +x ray (i=${i})`);
    prev = v;
  }
  // 2) river across the plate raises cost on/beyond the river line vs dry world
  const river = [{ id: 'r1', path: [[128, 0, -256], [128, 0, 256]], width: 18, depth: 3 }];
  const fDry = computeAccessCostField(baseCtx(), 512);
  const fWet = computeAccessCostField(baseCtx(river), 512);
  const jc = Math.floor((0 + 256) / fWet.actual);
  const ic = Math.floor((128 + 256) / fWet.actual) + 1; // клетка сразу за рекой
  const cWet = fWet.costs[jc * fWet.n + ic];
  const cDry = fDry.costs[jc * fDry.n + ic];
  assert.ok(Number.isFinite(cWet) && Number.isFinite(cDry));
  assert.ok(cWet > cDry, `water path must cost more than dry path at the same cell (wet=${cWet}, dry=${cDry})`);
  // 3) era assignment: center -> medieval, far corner -> modern|suburb
  const ctx = baseCtx([]);
  assignErasToDistricts(ctx, 512);
  const byId = new Map(ctx.districts.map(d => [d.id, d]));
  assert.strictEqual(byId.get('d_center').era, 'medieval');
  assert.notStrictEqual(byId.get('d_edge').era, 'medieval');
  assert.ok(['modern', 'suburb', 'xix'].includes(byId.get('d_edge').era));
  assert.strictEqual(byId.get('d_center').style, 'era_medieval');
  const eraDiag = ctx.report.diagnostics.find(d => d.code === 'era_rings_assigned');
  assert.ok(eraDiag, 'era_rings_assigned diagnostic emitted');
});

test('citygen stage 3: pressure prior D0 clamped and targetB follows B(D)=Bmax−(Bmax−Bmin)·D^0.8 (R3.5 §7.3)', async () => {
  const { targetBDistance, districtPressure } = await import('./citygen/pipeline/stage-3-districts.mjs');
  const opts = { bMin: 60, bMax: 260, gamma: 0.8 };
  assert.strictEqual(targetBDistance(0, opts), 260);
  assert.strictEqual(targetBDistance(1, opts), 60);
  assert.ok(targetBDistance(0.25, opts) >= targetBDistance(0.5, opts), 'B(D) non-increasing in D');
  assert.ok(targetBDistance(0.5, opts) >= targetBDistance(0.75, opts));
  const ctx = {
    input: { ground: { size: 512, y: 0 } },
    meta: {},
    hydrology: { rivers: [], lakes: [] },
    networks: { roads: { segments: [{ id: 'a1', type: 'arterial', path: [[0, 0, 0], [0, 0, 256]] }] }, railways: { segments: [] } },
    terrain: { modifiers: [], analysis: { coreCandidates: [{ x: 0, z: 0 }] } },
    masks: { terrain: { floodplains: [] } },
  };
  const downtown = districtPressure({ type: 'office', buildingDensity: 0.8, heightRange: [3, 12], geometry: { rect: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 } } }, ctx, 512);
  const suburb = districtPressure({ type: 'suburb', buildingDensity: 0.35, heightRange: [1, 3], geometry: { rect: { minX: 200, maxX: 240, minZ: 200, maxZ: 240 } } }, ctx, 512);
  assert.ok(downtown > suburb, `downtown pressure must exceed suburb (${downtown} vs ${suburb})`);
  for (const p of [downtown, suburb]) assert.ok(p >= 0 && p <= 1);
  const out = runCitygen(structuredClone(v4Base()));
  const diag = out.report.diagnostics.find(d => d.code === 'pressure_field');
  assert.ok(diag, 'pressure_field diagnostic emitted');
  for (const d of out.report.districts ?? []) {
    assert.ok(Number.isFinite(d.pressure) && d.pressure >= 0 && d.pressure <= 1, `district ${d.id} pressure in [0,1]`);
    assert.ok(Number.isFinite(d.targetB) && d.targetB >= 60 && d.targetB <= 260, `district ${d.id} targetB within policies bounds`);
  }
});

test('citygen stage 3: park share within profile bounds, diversity guard keeps campus, district frames assigned (R3.4 §6.6/§6.7/§6.8)', () => {
  const raw = v4Base();
  const out = runCitygen(structuredClone(raw));
  const parkShare = out.report.diagnostics.find(d => d.code === 'park_share');
  assert.ok(parkShare, 'park_share diagnostic emitted');
  assert.ok(parkShare.after >= parkShare.min && parkShare.after <= parkShare.max, `park share in bounds (got ${parkShare.after})`);
  assert.ok(out.report.diagnostics.some(d => d.code === 'adjacency_repairs'), 'adjacency_repairs diagnostic emitted');
  assert.ok(out.report.diagnostics.some(d => d.code === 'district_frames_assigned'), 'district_frames_assigned diagnostic emitted');
  for (const d of out.report.districts ?? []) {
    assert.ok('frame' in d, 'district carries frame field (or null)');
  }
  // pilot fixture: diversity guard keeps rare types during adjacency/park mutations (R3.4)
  const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/level-16-pilot.json'), 'utf8'));
  const pilot = runCitygen(structuredClone(fixture));
  const types = new Set((pilot.report.districts ?? []).map(d => d.type));
  assert.ok(types.has('campus'), 'pilot keeps campus type (diversity guard)');
  const fin = pilot.report.diagnostics.find(d => d.code === 'finalize_counts');
  assert.ok(fin?.districtTypes?.includes('campus'), 'pilot finalize districtTypes include campus');
});

test('citygen stage 3: computeLandValue is deterministic and bounded; districts carry density/floors/landValue (R3.3 §6.4/§6.5)', async () => {
  const { computeLandValue } = await import('./citygen/pipeline/stage-3-districts.mjs');
  const ctx = {
    input: { ground: { size: 512, y: 0 } },
    meta: {},
    hydrology: { rivers: [], lakes: [] },
    networks: { roads: { segments: [{ id: 'a1', type: 'arterial', path: [[100, 0, -256], [100, 0, 256]] }] }, railways: { segments: [] } },
    terrain: { modifiers: [], analysis: { coreCandidates: [{ x: 0, z: 0 }] } },
    masks: { terrain: { floodplains: [] } },
  };
  const lvCore = computeLandValue(ctx, 10, 0, 512);
  const lvFar = computeLandValue(ctx, 250, 250, 512);
  assert.ok(lvCore.landValue >= lvFar.landValue, 'LV near core must be >= LV at far corner');
  for (const lv of [lvCore, lvFar]) {
    assert.ok(lv.landValue >= 0 && lv.landValue <= 1);
    assert.ok(Number.isFinite(lv.components.coreProx));
  }
  const lvOnArt = computeLandValue(ctx, 100, 0, 512);
  assert.strictEqual(lvOnArt.components.arterialProx, 1, 'point on arterial must have arterialProx = 1');
  const lvAgain = computeLandValue(ctx, 100, 0, 512);
  assert.deepEqual(lvAgain, lvOnArt, 'land value is deterministic');
  // end-to-end: every district carries density/floors and landValue stays in [0,1]
  const out = runCitygen(structuredClone(v4Base()));
  assert.ok(Array.isArray(out.report.districts) && out.report.districts.length > 0);
  for (const d of out.report.districts) {
    assert.ok(Array.isArray(d.heightRange) && d.heightRange.length === 2, `district ${d.id} has floors range`);
    assert.ok(d.heightRange[0] <= d.heightRange[1], `district ${d.id} floors range is ascending`);
    assert.ok(Number.isFinite(d.buildingDensity) && d.buildingDensity >= 0 && d.buildingDensity <= 1, `district ${d.id} density in [0,1]`);
    assert.ok(d.landValue == null || (d.landValue >= 0 && d.landValue <= 1), `district ${d.id} landValue in [0,1]`);
  }
  const diag = out.report.diagnostics.find(d => d.code === 'land_value_field');
  assert.ok(diag, 'land_value_field diagnostic emitted');
});

test('citygen stage 2: roadSegmentCost is deterministic, monotone-favorable, and river-penalized (R2.2 §7.2)', async () => {
  const { roadSegmentCost } = await import('./citygen/pipeline/stage-2-transport.mjs');
  // Flat straight path vs steep path: flat wins.
  const flat = roadSegmentCost([[0, 0, 0], [10, 0, 0], [20, 0, 0]], []);
  const steep = roadSegmentCost([[0, 0, 0], [10, 2.5, 0], [20, 5, 0]], []);
  assert.ok(flat.cost < steep.cost, `flat cost ${flat.cost} must be lower than steep ${steep.cost}`);
  assert.ok(flat.maxSlope < steep.maxSlope);
  // River penalty dominates for a crossing path vs clear one.
  const river = [{ id: 'r', path: [[9, 0, -20], [9, 0, 20]], width: 12, depth: 2 }];
  const crossing = roadSegmentCost([[0, 0, 0], [20, 0, 0]], river);
  const clear = roadSegmentCost([[0, 0, 0], [20, 0, 0]], []);
  assert.ok(crossing.waterHits >= 1, 'crossing path must register water hits');
  assert.ok(crossing.cost > clear.cost, `water-crossed cost ${crossing.cost} must exceed clear ${clear.cost}`);
  // Determinism
  const again = roadSegmentCost([[0, 0, 0], [20, 0, 0]], river);
  assert.equal(again.cost, crossing.cost);
  assert.equal(again.waterHits, crossing.waterHits);
});

test('citygen stage 2: profiled connector is x-monotone and class-limited on steep synthetic terrain (R2.3)', async () => {
  // Regression for the previously non-monotone creation-time path.
  const { buildProfiledSegment } = await import('./citygen/pipeline/stage-2-transport.mjs');
  const ctx = {
    input: { ground: { y: 0 } },
    meta: {
      worldBounds: { size: 1280 },
      seed: 1,
      policies: { slopeLimitPct: { highway: 6, arterial: 8, collector: 10, local: 12 } },
    },
    terrain: {
      modifiers: [
        { id: 'test_hill', type: 'mountain', center: [0, 0], radius: 90, height: 60, falloff: 'smooth' },
      ],
    },
    hydrology: { rivers: [] },
    report: { diagnostics: [], repairs: [] },
    masks: {},
    spatial: {},
  };
  for (const [klass, limit] of [['local', 0.12], ['arterial', 0.08]]) {
    const path = buildProfiledSegment(ctx, `test_${klass}_steep_connector`, { x: -85, z: 0 }, { x: 85, z: 0 }, 8, null, klass);
    assert.ok(Array.isArray(path) && path.length >= 2, 'path must be created');
    for (let i = 1; i < path.length; i++) {
      assert.ok(path[i][0] > path[i - 1][0], `x must be strictly increasing (index ${i}, klass=${klass})`);
    }
    let maxSegSlope = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (run > 1e-6) maxSegSlope = Math.max(maxSegSlope, Math.abs(b[1] - a[1]) / run);
    }
    assert.ok(maxSegSlope <= limit + 1e-6, `connector slope ${maxSegSlope.toFixed(4)} exceeds class limit ${limit} (klass=${klass})`);
  }
});

test('citygen stage 2: profiled connector across river is x-monotone and within absolute slope limit (R2.3/R2.6)', async () => {
  const { buildProfiledSegment } = await import('./citygen/pipeline/stage-2-transport.mjs');
  const ctx = {
    input: { ground: { y: 0 } },
    meta: {
      worldBounds: { size: 1280 },
      seed: 1,
      policies: { slopeLimitPct: { highway: 6, arterial: 8, collector: 10, local: 12 } },
    },
    terrain: {
      modifiers: [
        { id: 'test_hill', type: 'mountain', center: [0, 0], radius: 90, height: 60, falloff: 'smooth' },
      ],
    },
    hydrology: {
      rivers: [
        { id: 'river_1', path: [[0, 0, -40], [0, 0, 40]], width: 14, depth: 3, waterLevel: 0 },
      ],
    },
    report: { diagnostics: [], repairs: [] },
    masks: {},
    spatial: {},
  };
  const path = buildProfiledSegment(ctx, 'test_river_bridge_connector', { x: -85, z: 0 }, { x: 85, z: 0 }, 8, null, 'local');
  assert.ok(Array.isArray(path) && path.length >= 2, 'bridged connector path must be created');
  for (let i = 1; i < path.length; i++) {
    assert.ok(path[i][0] > path[i - 1][0], `x must be strictly increasing across river (index ${i})`);
  }
  let maxSegSlope = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (run > 1e-6) maxSegSlope = Math.max(maxSegSlope, Math.abs(b[1] - a[1]) / run);
  }
  assert.ok(maxSegSlope <= 0.3005, `bridged connector slope ${maxSegSlope.toFixed(4)} exceeds absolute limit 0.3005`);
});

test('citygen stage 6: detects and safely repairs flat same-layer road crossing', () => {
  const raw = v4Base();
  raw.gameplay.spawn = { x: -80, z: -80 };
  raw.gameplay.exit = { x: 80, z: 80 };
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'a1', position: [-40, 0, 0], layer: 'ground' },
      { id: 'a2', position: [40, 0, 0], layer: 'ground' },
      { id: 'b1', position: [0, 0, -40], layer: 'ground' },
      { id: 'b2', position: [0, 0, 40], layer: 'ground' },
    ],
    segments: [
      { id: 'sx', from: 'a1', to: 'a2', type: 'local', layer: 'ground', path: [[-40, 0, 0], [40, 0, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
      { id: 'sz', from: 'b1', to: 'b2', type: 'local', layer: 'ground', path: [[0, 0, -40], [0, 0, 40]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'road_same_level_conflict' && d.stage === '6_finalize_emit'), 'crossing without shared junction should be detected');
  assert.ok(out.report.repairs.some(r => r.code === 'resolve_road_crossing' && r.stage === '6_finalize_emit'), 'safe flat crossing should be repaired');
  assert.ok(out.report.diagnostics.some(d => d.code === 'road_crossing_repaired' && d.stage === '6_finalize_emit'));
  assert.ok(!out.report.diagnostics.some(d => d.code === 'road_crossing_repair_skipped' && d.stage === '6_finalize_emit'));
});

test('citygen stage 6: skips unsafe crossing repair when no shared junction height is slope-safe', () => {
  const raw = v4Base();
  raw.gameplay.spawn = { x: -80, z: -80 };
  raw.gameplay.exit = { x: 80, z: 80 };
  // Flat segments cross at different elevations with short runs: either shared Y forces >0.3 slope on one pair.
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'a1', position: [-4, 0, 0], layer: 'ground' },
      { id: 'a2', position: [4, 0, 0], layer: 'ground' },
      { id: 'b1', position: [0, 5, -4], layer: 'ground' },
      { id: 'b2', position: [0, 5, 4], layer: 'ground' },
    ],
    segments: [
      { id: 'sx', from: 'a1', to: 'a2', type: 'local', layer: 'ground', path: [[-4, 0, 0], [4, 0, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
      { id: 'sb', from: 'b1', to: 'b2', type: 'local', layer: 'ground', path: [[0, 5, -4], [0, 5, 4]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'road_same_level_conflict' && d.stage === '6_finalize_emit'), 'crossing should be detected');
  assert.ok(!out.report.repairs.some(r => r.code === 'resolve_road_crossing' && r.stage === '6_finalize_emit' && Array.isArray(r.segments) && r.segments.includes('sx') && r.segments.includes('sb')), 'unsafe crossing repair for sx/sb must not be applied');
  assert.ok(out.report.diagnostics.some(d => d.code === 'road_crossing_repair_skipped' && d.stage === '6_finalize_emit' && Array.isArray(d.segments) && d.segments.includes('sx') && d.segments.includes('sb')), 'unsafe crossing repair should be skipped with diagnostic');
});

test('citygen stage 6: warns when junction ramp does not connect ground and elevated nodes', () => {
  const raw = v4Base();
  raw.gameplay.spawn = { x: -80, z: -80 };
  raw.gameplay.exit = { x: 80, z: 80 };
  raw.cityforge.networks.roads = {
    nodes: [
      { id: 'g1', position: [-20, 0, 0], layer: 'ground' },
      { id: 'g2', position: [20, 4, 0], layer: 'ground' },
    ],
    segments: [
      { id: 'jr_bad', from: 'g1', to: 'g2', type: 'local', layer: 'elevated', bridge: true, interchange: 'junction_ramp', path: [[-20, 0, 0], [0, 2, 0], [20, 4, 0]], lanes: [{ id: 'l1', direction: 'forward', width: 8, type: 'vehicle' }] },
    ],
    junctions: [],
  };
  const out = runCitygen(raw);
  assert.ok(out.report.diagnostics.some(d => d.code === 'interchange_ramp_layers' && d.stage === '6_finalize_emit' && d.segmentId === 'jr_bad'), 'junction ramp with invalid endpoint layers should be warned');
});

test('citygen M3 B4: multi-level interchange compiles with correct road types and roadCorridors semantics (pilot level-16)', () => {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/level-16-pilot.json'), 'utf8'));
  const out = runCitygen(structuredClone(raw));
  const source = out.ctx?.engine ?? out.ctx?.input ?? out.input ?? raw;
  const compiled = compileCityforge(source);
  const roads = compiled.engine?.roads ?? [];
  const byId = new Map(roads.map(r => [r.id, r]));
  // Overpass and interchange bridge segments are compiled as bridges; low-clearance parts may be demoted to ground.
  assert.equal(byId.get('tr_sp1_r')?.type, 'bridge');
  assert.equal(byId.get('tr_sp2_r')?.type, 'bridge');
  assert.equal(byId.get('tr_gb_29')?.type, 'bridge');
  assert.equal(byId.get('tr_gb_35')?.type, 'bridge');
  assert.equal(byId.get('tr_gb_80')?.type, 'ground');

  const junctionRamps = roads.filter(r => /^tr_jr_/.test(r.id));
  const junctionConnectors = roads.filter(r => /^tr_jc_/.test(r.id));
  assert.ok(junctionRamps.length > 0, 'expected junction ramp bridge segments');
  assert.ok(junctionConnectors.length > 0, 'expected junction ground connectors');
  assert.ok(junctionRamps.every(r => r.type === 'bridge'), 'all junction ramps should compile as bridge');
  assert.ok(junctionConnectors.every(r => r.type === 'ground'), 'all junction connectors should compile as ground');

  // Terrain cross-leveling corridors apply to ground roads only: connectors included, elevated interchange segments excluded.
  const corridors = compiled.engine?.relief?.roadCorridors ?? [];
  const corridorIds = new Set(corridors.map(c => c.id));
  for (const r of junctionConnectors) assert.ok(corridorIds.has(r.id), `ground connector corridor missing: ${r.id}`);
  for (const r of junctionRamps) assert.ok(!corridorIds.has(r.id), `elevated ramp must not have ground corridor: ${r.id}`);
  assert.ok(corridorIds.has('tr_gb_80'), 'demoted ground segment should have terrain corridor');
  assert.ok(!corridorIds.has('tr_sp1_r'));
  assert.ok(!corridorIds.has('tr_sp2_r'));
  assert.ok(!corridorIds.has('tr_gb_29'));
  assert.ok(!corridorIds.has('tr_gb_35'));
});

test('citygen M3 B2: optional dead-end turnarounds are deterministic and valid (level-16)', () => {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/level-16-pilot.json'), 'utf8'));
  raw.generator = raw.generator || {};
  raw.generator.transport = raw.generator.transport || {};
  raw.generator.transport.turnarounds = { count: 3 };
  const a = runCitygen(structuredClone(raw));
  const b = runCitygen(structuredClone(raw));
  assert.equal(a.reportJson, b.reportJson, 'turnaround generation should be deterministic');
  const roads = a.ctx?.networks?.roads;
  assert.ok(roads && Array.isArray(roads.nodes) && Array.isArray(roads.segments), 'roads network should exist');
  const taSegs = roads.segments.filter(s => String(s.id).startsWith('tr_ta_'));
  assert.ok(taSegs.length >= 3, 'should add turnaround segments when enabled');
  assert.ok(a.report.diagnostics.some(d => d.code === 'transport_turnarounds' && d.stage === '2_transport' && (d.count ?? 0) >= 1), 'should emit transport_turnarounds diagnostic');
  const fin = a.report.diagnostics.find(d => d.code === 'finalize_counts' && d.stage === '6_finalize_emit');
  assert.ok(fin && (fin.turnarounds ?? 0) >= 1, 'finalize_counts should report turnarounds when applied');
  assert.ok(!a.report.diagnostics.some(d => d.code === 'road_conflicts_unresolved' && d.stage === '6_finalize_emit'), 'turnarounds should not introduce unresolved road conflicts');
  // basic geometry/connectivity invariants for added turnaround segments
  const byNode = new Map(roads.nodes.map(n => [n.id, n]));
  for (const s of taSegs) {
    assert.ok(Array.isArray(s.path) && s.path.length >= 2, `turnaround segment ${s.id} should have path`);
    assert.ok(byNode.has(s.from) && byNode.has(s.to), `turnaround segment ${s.id} should have valid endpoints`);
    for (let i = 0; i + 1 < s.path.length; i++) {
      const p = s.path[i], q = s.path[i + 1];
      const dx = Math.abs((q[0] ?? 0) - (p[0] ?? 0));
      const dz = Math.abs((q[2] ?? 0) - (p[2] ?? 0));
      assert.ok(dx < 1e-6 || dz < 1e-6, `turnaround segment ${s.id} must be axis-aligned`);
      const h = Math.hypot((q[0] ?? 0) - (p[0] ?? 0), (q[2] ?? 0) - (p[2] ?? 0));
      if (h > 1e-6) {
        const slope = Math.abs((q[1] ?? 0) - (p[1] ?? 0)) / h;
        assert.ok(slope <= 0.301, `turnaround segment ${s.id} slope should be within limit`);
      }
    }
  }
});

test('citygen M3 B2: level-16 roundabout (v4 json) is deterministic, curved arc elements and connected', () => {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/level-16-pilot.json'), 'utf8'));
  const a = runCitygen(structuredClone(raw));
  const b = runCitygen(structuredClone(raw));
  assert.equal(a.reportJson, b.reportJson, 'roundabout generation should be deterministic');
  assert.ok(a.report.diagnostics.some(d => d.code === 'transport_roundabout' && d.stage === '2_transport'), 'should emit transport_roundabout diagnostic');
  assert.ok(a.report.diagnostics.some(d => d.code === 'transport_roundabout_connected' && d.stage === '2_transport'), 'should emit transport_roundabout_connected diagnostic');
  const roads = a.ctx?.networks?.roads;
  assert.ok(roads && Array.isArray(roads.segments) && Array.isArray(roads.nodes), 'roads network should exist');
  const rbSegs = roads.segments.filter(s => String(s.id).startsWith('tr_rb_360_360_'));
  const rbConn = roads.segments.filter(s => String(s.id).startsWith('tr_rbc_360_360'));
  assert.ok(rbSegs.length >= 4, 'should add curved roundabout ring arc segments');
  assert.ok(rbConn.length >= 1, 'should add roundabout connector segment');
  const byNode = new Map(roads.nodes.map(n => [n.id, n]));
  for (const s of rbSegs) {
    assert.ok(Array.isArray(s.elements) && s.elements.length >= 1, `roundabout ring segment ${s.id} should have arc elements`);
    const arc = s.elements[0]?.arc;
    assert.ok(arc, `roundabout ring segment ${s.id} should be an arc element`);
    assert.equal(arc.cx, 360);
    assert.equal(arc.cz, 360);
    assert.equal(arc.radius, 24);
    assert.ok(Number.isFinite(arc.from) && Number.isFinite(arc.to) && Math.abs(arc.to - arc.from) > 1e-6, `arc ${s.id} should have valid span`);
    assert.ok(Array.isArray(arc.y) && arc.y.length === 2, `arc ${s.id} should have y endpoints`);
    const arcLen = arc.radius * Math.abs((arc.to - arc.from) * Math.PI / 180);
    assert.ok(arcLen > 1e-6, `arc ${s.id} should have positive length`);
    assert.ok(Math.abs(arc.y[1] - arc.y[0]) / arcLen <= 0.301, `arc ${s.id} slope should be within limit`);
    assert.ok(byNode.has(s.from) && byNode.has(s.to), `roundabout segment ${s.id} should have valid endpoints`);
  }
  // ring continuity: arcs form a closed chain
  const toFrom = new Set(rbSegs.map(s => `${s.from}->${s.to}`));
  assert.equal(toFrom.size, rbSegs.length, 'ring segments should form a unique chain');
  for (const s of rbConn) {
    assert.ok(Array.isArray(s.path) && s.path.length >= 2, `roundabout connector ${s.id} should have path`);
    assert.ok(byNode.has(s.from) && byNode.has(s.to), `roundabout connector ${s.id} should have valid endpoints`);
  }
  assert.ok(!a.report.diagnostics.some(d => d.code === 'road_conflicts_unresolved' && d.stage === '6_finalize_emit'), 'roundabout should not introduce unresolved road conflicts');
  const fin = a.report.diagnostics.find(d => d.code === 'finalize_counts' && d.stage === '6_finalize_emit');
  assert.equal(fin?.roadComponents, 1, 'road graph should remain connected with roundabout');
});

test('citygen R1: stage 1 terrain analysis (slope/reservations/crossings) is deterministic', () => {
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../src/levels/level-16.json'), 'utf8'));
  const a = runCitygen(structuredClone(raw));
  const b = runCitygen(structuredClone(raw));
  assert.equal(a.reportJson, b.reportJson, 'report (including R1 analysis diagnostics) should be deterministic');
  const ta = a.ctx?.terrain?.analysis;
  assert.ok(ta && ta.slope, 'terrain.analysis.slope should exist');
  assert.ok(Number.isFinite(ta.slope.maxSlope) && ta.slope.maxSlope >= 0, 'slope.maxSlope should be finite');
  assert.equal(ta.slope.cells, ta.slope.grid * ta.slope.grid, 'slope cell count should match grid');
  assert.ok(ta.slope.share && typeof ta.slope.share === 'object', 'slope.share should exist');
  const shareSum = Object.values(ta.slope.share).reduce((s, v) => s + Number(v || 0), 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-6, 'slope class shares should sum to 1');
  assert.ok(Array.isArray(ta.crossings), 'crossing candidates should be an array');
  assert.ok(Array.isArray(ta.reservations), 'reservations should be an array');
  assert.deepEqual(ta, b.ctx?.terrain?.analysis, 'terrain analysis should be identical across runs');
  assert.ok(a.report.diagnostics.some(d => d.code === 'terrain_slope_analysis' && d.stage === '1_landscape_hydrology'));
  assert.ok(a.report.diagnostics.some(d => d.code === 'terrain_reservations_marked' && d.stage === '1_landscape_hydrology'));
});

test('citygen R1.2: slope grid classification (8-16 m) is deterministic and wall-consistent', () => {
  const base = () => {
    const raw = v4Base();
    raw.generator.seed = 777;
    raw.generator.landscape = {
      generate: true,
      hills: { count: 4, minHeight: 15, maxHeight: 35, minRadius: 70, maxRadius: 140 },
      river: { enabled: true, width: 20, depth: 3, points: 6, axis: 'z' },
    };
    return raw;
  };
  const a = runCitygen(base());
  const slope = a.ctx?.terrain?.analysis?.slope;
  assert.ok(slope && typeof slope === 'object');
  assert.equal(slope.cells, slope.grid * slope.grid);
  assert.ok(slope.step >= 8 && slope.step <= 16);
  assert.ok(Number.isFinite(slope.maxSlope));
  assert.ok(slope.maxSlope >= 0);
  assert.ok(Object.keys(slope.share).length >= 3);
  const sumShares = Object.values(slope.share).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sumShares - 1) < 0.02);
  const countsSum = Object.values(slope.counts).reduce((s, v) => s + v, 0);
  assert.equal(countsSum, slope.cells);
  const b = runCitygen(base());
  assert.deepEqual(a.ctx.terrain.analysis.slope, b.ctx.terrain.analysis.slope);
});

test('citygen R1.3: flat-site reservations and core candidates are selected deterministically', () => {
  const base = () => {
    const raw = v4Base();
    raw.generator.seed = 909;
    raw.generator.landscape = {
      generate: true,
      hills: { count: 5, minHeight: 10, maxHeight: 30, minRadius: 60, maxRadius: 130 },
      river: { enabled: true, width: 18, depth: 2.5, points: 6, axis: 'z' },
    };
    return raw;
  };
  const a = runCitygen(base());
  const reserves = a.ctx?.terrain?.analysis?.reservations ?? [];
  assert.ok(Array.isArray(reserves));
  assert.ok(reserves.length >= 1 && reserves.length <= 16);
  for (const r of reserves) {
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.z));
    assert.ok(Number.isFinite(Number(r.slope ?? 0)));
  }
  const cores = a.ctx?.terrain?.analysis?.coreCandidates ?? [];
  assert.ok(cores.length >= 1 && cores.length <= 4);
  for (const c of cores) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z));
  }
  const b = runCitygen(base());
  assert.deepEqual(a.ctx.terrain.analysis.reservations, b.ctx.terrain.analysis.reservations);
  assert.deepEqual(a.ctx.terrain.analysis.coreCandidates, b.ctx.terrain.analysis.coreCandidates);
});

test('citygen R1.1: ordered procedural terrain (large forms -> terraces/platforms) produces modifiers', () => {
  const base = () => {
    const raw = v4Base();
    raw.generator.seed = 313;
    raw.generator.landscape = {
      generate: true,
      ordered: true,
      hills: { count: 4, minHeight: 8, maxHeight: 24, minRadius: 80, maxRadius: 180 },
      terraces: { count: 2, minRadius: 20, maxRadius: 40 },
      platforms: { count: 1 },
    };
    return raw;
  };
  const a = runCitygen(base());
  const mods = a.engine?.cityforge?.terrain?.modifiers ?? [];
  assert.ok(mods.length >= 2);
  const b = runCitygen(base());
  assert.deepEqual(mods, b.engine.cityforge.terrain.modifiers); // order preserved by deterministic pipeline
  assert.ok(a.report.diagnostics.some(d => d.code === 'landscape_generated'));
});

test('citygen R1.4: procedural river generation is deterministic and carve-enabled', () => {
  const base = () => {
    const raw = v4Base();
    raw.generator.seed = 4242;
    raw.generator.generatorVersion = 'test-0.1.0';
    raw.generator.landscape = {
      generate: true,
      river: { enabled: true, width: 20, depth: 3, points: 6, axis: 'z' },
    };
    return raw;
  };
  const a = runCitygen(base());
  const b = runCitygen(base());
  const rivers = a.engine.cityforge.hydrology.rivers;
  assert.ok(rivers.length >= 1);
  for (const r of rivers) {
    assert.ok(Array.isArray(r.path) && r.path.length >= 2);
    assert.equal(r.carveTerrain, true);
    for (const pt of r.path) {
      assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[2]));
    }
  }
  assert.deepEqual(rivers, b.engine.cityforge.hydrology.rivers);
});

test('citygen R1.4: floodplain/buffer reservations present and deterministic', () => {
  const base = () => {
    const raw = v4Base();
    raw.generator.seed = 2024;
    raw.generator.landscape = {
      generate: true,
      river: { enabled: true, width: 22, depth: 4, points: 6, axis: 'z' },
    };
    return raw;
  };
  const a = runCitygen(base());
  assert.ok(Array.isArray(a.ctx?.masks?.terrain?.floodplains) || Array.isArray(a.ctx?.terrain?.analysis?.floodplains));
  const fps = a.ctx?.masks?.terrain?.floodplains ?? a.ctx?.terrain?.analysis?.floodplains ?? [];
  const fps2 = (() => { const b = runCitygen(base()); return b.ctx?.masks?.terrain?.floodplains ?? b.ctx?.terrain?.analysis?.floodplains ?? []; })();
  assert.deepEqual(fps, fps2);
});

test('citygen R1.5/R1.1: crossing candidates and landmarks deterministic; terrain modifiers present', () => {
  const base = () => {
    const raw = v4Base();
    raw.generator.seed = 101;
    raw.generator.landscape = {
      generate: true,
      hills: { count: 3, minHeight: 10, maxHeight: 26, minRadius: 80, maxRadius: 160 },
      river: { enabled: true, width: 18, depth: 2.5, points: 5, axis: 'z' },
    };
    return raw;
  };
  const a = runCitygen(base());
  const b = runCitygen(base());
  assert.deepEqual(a.ctx.terrain.analysis.crossings, b.ctx.terrain.analysis.crossings);
  assert.deepEqual(a.ctx.terrain.analysis.landmarks, b.ctx.terrain.analysis.landmarks);
  assert.ok(Array.isArray(a.ctx.terrain.analysis.landmarks));
  assert.ok(a.engine.cityforge.terrain.modifiers.length >= 1);
});

test('citygen R2.1: speedLimit defaults filled by segment class (km/h, deterministic)', () => {
  const raw = v4Base();
  raw.cityforge.networks.roads = {
    nodes: [],
    segments: [
      { id: 's_highway', type: 'highway', layer: 'ground', path: [[-128,0,0],[128,0,0]], from: null, to: null },
      { id: 's_arterial', type: 'arterial', layer: 'ground', path: [[-128,0,10],[128,0,10]], from: null, to: null },
      { id: 's_collector', type: 'collector', layer: 'ground', path: [[-128,0,20],[128,0,20]], from: null, to: null },
      { id: 's_local', type: 'local', layer: 'ground', path: [[-128,0,30],[128,0,30]], from: null, to: null },
    ],
    junctions: [],
  };
  raw.generator.seed = 42;
  const out = runCitygen(raw);
  const speeds = new Map((out.engine?.cityforge?.networks?.roads?.segments ?? []).map(s => [s.id, s.speedLimit]));
  assert.equal(speeds.get('s_highway'), 90);
  assert.equal(speeds.get('s_arterial'), 60);
  assert.equal(speeds.get('s_collector'), 40);
  assert.equal(speeds.get('s_local'), 30);
});

test('citygen R2.3: class slope policy is wired (policies from generator.policies and defaults)', () => {
  const raw = v4Base();
  raw.generator.seed = 42;
  raw.generator.policies = { slopeLimitPct: { highway: 6, arterial: 8, collector: 10, local: 12 } };
  const out = runCitygen(raw);
  assert.ok(Number.isFinite(out.ctx?.meta?.policies?.slopeLimitPct?.local));
  const metrics = out.ctx?.report?.metrics ?? out.report?.metrics;
  assert.ok(metrics && metrics.roads && metrics.roads.slopePolicy);
  assert.ok(Number.isFinite(Number(metrics.roads.slopePolicy.local)));
});
