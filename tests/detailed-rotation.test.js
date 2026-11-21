/**
 * Регрессия BUG-001/TEST-001: при повороте здания 90/270 мировая AABB меняет
 * местами локальные ширину и глубину. Детальный билдер получает размеры в
 * локальных осях здания, иначе фасад/глубина переворачиваются.
 */
import * as THREE from 'three';
import { detailedLocalDims } from '../src/json-map.js';
import { buildDetailedMarketRow, makeMarketRowMaterials } from '../src/market-row-detail.js';
import { buildDetailedAcademicBuilding, makeAcademicBuildingMaterials } from '../src/academic-building-detail.js';
import { parseLevelFilter, SKIPPED } from './level-filter.js';

function ok(cond, name, info = '') {
  return { passed: !!cond, name, info: String(info) };
}

function meshSize(meshes) {
  const g = new THREE.Group();
  for (const m of meshes) g.add(m);
  const box = new THREE.Box3().setFromObject(g);
  const s = new THREE.Vector3();
  box.getSize(s);
  return { x: s.x, y: s.y, z: s.z };
}

export function runDetailedRotationTests(arg) {
  const filter = parseLevelFilter(arg);
  if (filter) return SKIPPED;
  const results = [];

  // Чистая математика: bounds — мировая AABB, при 90/270 локальные оси меняются местами.
  const b = { minX: 0, maxX: 10, minZ: 0, maxZ: 20 }; // world AABB 10(x) x 20(z)
  const r0 = detailedLocalDims(b, 0);
  results.push(ok(r0.bw === 10 && r0.bd === 20 && r0.rot === 0, 'detailedLocalDims: 0°', JSON.stringify(r0)));
  const r90 = detailedLocalDims(b, 90);
  results.push(ok(r90.bw === 20 && r90.bd === 10 && r90.rot === 90, 'detailedLocalDims: 90° swaps', JSON.stringify(r90)));
  const r180 = detailedLocalDims(b, 180);
  results.push(ok(r180.bw === 10 && r180.bd === 20 && r180.rot === 180, 'detailedLocalDims: 180°', JSON.stringify(r180)));
  const r270 = detailedLocalDims(b, 270);
  results.push(ok(r270.bw === 20 && r270.bd === 10 && r270.rot === 270, 'detailedLocalDims: 270° swaps', JSON.stringify(r270)));
  const r360 = detailedLocalDims(b, 360);
  results.push(ok(r360.bw === 10 && r360.bd === 20 && r360.rot === 0, 'detailedLocalDims: 360° normalizes', JSON.stringify(r360)));
  const rn90 = detailedLocalDims(b, -90);
  results.push(ok(rn90.bw === 20 && rn90.bd === 10 && rn90.rot === 270, 'detailedLocalDims: -90° normalizes to 270°', JSON.stringify(rn90)));
  const rn180 = detailedLocalDims(b, -180);
  results.push(ok(rn180.bw === 10 && rn180.bd === 20 && rn180.rot === 180, 'detailedLocalDims: -180° normalizes to 180°', JSON.stringify(rn180)));
  const rn270 = detailedLocalDims(b, -270);
  results.push(ok(rn270.bw === 20 && rn270.bd === 10 && rn270.rot === 90, 'detailedLocalDims: -270° normalizes to 90°', JSON.stringify(rn270)));
  const r450 = detailedLocalDims(b, 450);
  results.push(ok(r450.bw === 20 && r450.bd === 10 && r450.rot === 90, 'detailedLocalDims: 450° normalizes to 90°', JSON.stringify(r450)));
  const r720 = detailedLocalDims(b, 720);
  results.push(ok(r720.bw === 10 && r720.bd === 20 && r720.rot === 0, 'detailedLocalDims: 720° normalizes to 0°', JSON.stringify(r720)));

  // Регрессия реального кейса: market-row b_d_commercial_49 (level 25) — rotation 90°,
  // world AABB 8.71 x 20.6, значит локальный фасад ~20.6, глубина ~8.71.
  const wb = { minX: -449.91, maxX: -441.2, minZ: -99.9, maxZ: -79.3 };
  const dims90 = detailedLocalDims(wb, 90);
  const row = buildDetailedMarketRow({
    width: dims90.bw, depth: dims90.bd, floorHeight: 3.21, floors: 1,
    foundationHeight: 0.25, roofPitchDeg: 18, roofOverhang: 0.45, roofType: 'shed',
    windowDensity: 1, windowScale: 1.05,
    hasPorch: false, hasChimney: false, hasCornerAccents: true, hasBalcony: false,
  }, makeMarketRowMaterials('#c8ab89'));
  const rs = meshSize(row);
  results.push(ok(Math.abs(rs.x - 20.6) < Math.abs(rs.x - 8.71) && Math.abs(rs.z - 8.71) < Math.abs(rs.z - 20.6),
    'market-row 90°: local bbox aligns with facade/depth (not inverted)',
    `size=${rs.x.toFixed(2)}x${rs.z.toFixed(2)} dims=${JSON.stringify(dims90)}`));
  results.push(ok(rs.x > rs.z * 1.5,
    'market-row 90°: facade wider than depth (not inverted)',
    `ratio=${(rs.x / Math.max(rs.z, 0.01)).toFixed(2)}`));

  // Второй detailed visual для защиты dispatch-пути (не market-row).
  const wb2 = { minX: 0, maxX: 8, minZ: 0, maxZ: 14 }; // world AABB, rotated 270° => local 14x8
  const dims270 = detailedLocalDims(wb2, 270);
  const acad = buildDetailedAcademicBuilding({
    width: dims270.bw, depth: dims270.bd, floorHeight: 3.9, floors: 3,
    foundationHeight: 0.5, roofPitchDeg: 20, roofOverhang: 0.55, roofType: 'hip',
    windowDensity: 2, windowScale: 1.08,
    hasPorch: true, hasChimney: false, hasCornerAccents: true, hasBalcony: false,
  }, makeAcademicBuildingMaterials('#d5cbb8'));
  const asz = meshSize(acad);
  results.push(ok(Math.abs(asz.x - 14) < Math.abs(asz.x - 8) && Math.abs(asz.z - 8) < Math.abs(asz.z - 14),
    'academic-building 270°: local bbox aligns with width/depth (not inverted)',
    `size=${asz.x.toFixed(2)}x${asz.z.toFixed(2)} dims=${JSON.stringify(dims270)}`));
  results.push(ok(asz.x > asz.z,
    'academic-building 270°: width larger than depth (not inverted)',
    `ratio=${(asz.x / Math.max(asz.z, 0.01)).toFixed(2)}`));

  const passed = results.filter(r => r.passed).length;
  return { passed, total: results.length, results };
}