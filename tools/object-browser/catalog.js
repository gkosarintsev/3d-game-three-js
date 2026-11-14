import { loadRegistry, loadLevel } from '../visualizer/loader.js';
import { buildModel } from '../visualizer/model.js';
import { mergeChunkData } from '../visualizer/detail.js';

function centerOfBbox(b) {
  if (!b) return null;
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2 };
}

function pointInPolyXZ(x, z, points) {
  // ray casting on XZ
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, zi = points[i].z ?? points[i].y ?? 0;
    const xj = points[j].x, zj = points[j].z ?? points[j].y ?? 0;
    const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInDistrict(c, districtEnt) {
  if (!c || !districtEnt) return false;
  const g = districtEnt.geometry;
  if (!g) return false;
  if ((g.type === 'rect' || g.type === 'polygon') && Array.isArray(g.points) && g.points.length >= 3) {
    return pointInPolyXZ(c.x, c.z, g.points);
  }
  if (g.bbox) {
    const b = g.bbox;
    return c.x >= b.minX && c.x <= b.maxX && c.z >= b.minZ && c.z <= b.maxZ;
  }
  return false;
}

function inferDistrictIdForBuilding(bEnt, districtMap) {
  const raw = bEnt.attrs?.raw || bEnt.raw || {};
  const direct = raw.districtId ?? raw.district ?? bEnt.attrs?.districtId ?? bEnt.attrs?.district;
  if (direct != null && direct !== '') return String(direct);
  // common generated id: b_<district>_N
  const m = /^b_(.+)_\d+$/.exec(String(bEnt.id));
  if (m && districtMap.has(m[1])) return m[1];
  const c = centerOfBbox(bEnt.bbox);
  if (c) {
    for (const [id, d] of districtMap) {
      if (pointInDistrict(c, d)) return id;
    }
  }
  return null;
}

function buildingLabel(b) {
  const a = b.attrs || {};
  const parts = [String(b.id)];
  if (a.houseKind) parts.push(a.houseKind);
  else if (a.floorsCount != null) parts.push(`${a.floorsCount} эт.`);
  return parts.join(' · ');
}

function rawOf(entity) {
  return entity?.attrs?.raw || entity?.raw || null;
}

/**
 * Построить каталог объектов для выбранного уровня.
 * Возвращает также сырые/объединённые данные уровня для детального рендера.
 * @returns {Promise<{level:number, groups:Array, meta:any, warnings:string[], levelData:any}>}
 */
export async function buildCatalog(levelNum) {
  const warnings = [];
  let raw;
  try {
    raw = await loadLevel(levelNum, 'compiled', {});
  } catch (e) {
    // fallback to source
    warnings.push(`compiled недоступен: ${e?.message || e}; пробую source`);
    raw = await loadLevel(levelNum, 'source', {});
  }
  const model = buildModel(raw, levelNum, raw.compiledIndex ? 'compiled' : 'source');
  const districts = model.entities.districts || new Map();
  const buildings = [...(model.entities.buildings || new Map()).values()];
  const merged = (raw?.decodedCells && raw.decodedCells.length)
    ? mergeChunkData(raw.decodedCells)
    : {
        buildings: [...(model.entities.buildings || new Map()).values()].map(rawOf).filter(Boolean),
        roads: [...(model.entities.roads || new Map()).values()].map(rawOf).filter(Boolean),
        props: [...(model.entities.props || new Map()).values()].map(rawOf).filter(Boolean),
        lights: [...(model.entities.lights || new Map()).values()].map(rawOf).filter(Boolean),
        channels: [...(model.entities.channels || new Map()).values()].map(rawOf).filter(Boolean),
        tunnels: [...(model.entities.tunnels || new Map()).values()].map(rawOf).filter(Boolean),
      };

  // group buildings by district
  const byDistrict = new Map(); // districtId|null -> buildings[]
  for (const b of buildings) {
    const did = inferDistrictIdForBuilding(b, districts);
    const key = did != null && (districts.has(did) || did) ? did : null;
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key).push(b);
  }
  // sort buildings inside groups
  for (const arr of byDistrict.values()) arr.sort((a,b)=>String(a.id).localeCompare(String(b.id), 'ru'));

  // order districts: authored/named first, then by id, null last
  const districtIds = [...byDistrict.keys()].filter(k => k != null);
  districtIds.sort((a,b)=>{
    const da = districts.get(a), db = districts.get(b);
    const oa = da?.origin === 'authored' ? 0 : 1;
    const ob = db?.origin === 'authored' ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return String(a).localeCompare(String(b), 'ru', { numeric: true });
  });
  if (byDistrict.has(null)) districtIds.push(null);

  const groups = [];
  for (const did of districtIds) {
    const arr = byDistrict.get(did) || [];
    if (!arr.length) continue;
    const dEnt = did != null ? districts.get(did) : null;
    const title = did == null ? 'Дома · без района'
      : `Район ${did}${dEnt?.attrs?.type ? ' · ' + dEnt.attrs.type : ''}`;
    groups.push({
      id: `district:${did ?? 'none'}`,
      title,
      kind: 'buildings',
      items: arr.map(b => ({
        id: String(b.id),
        type: 'building',
        label: buildingLabel(b),
        meta: b.attrs?.facadeMaterial || (b.origin || ''),
        entity: b,
        rawData: rawOf(b),
        districtId: did,
      })),
    });
  }

  // other level object types
  const otherKinds = [
    ['props', 'Пропсы', 'prop'],
    ['roads', 'Дороги', 'road'],
    ['lights', 'Свет', 'light'],
    ['channels', 'Каналы/вода', 'channel'],
    ['tunnels', 'Туннели', 'tunnel'],
  ];
  for (const [coll, title, type] of otherKinds) {
    const arr = [...(model.entities[coll] || new Map()).values()];
    if (!arr.length) continue;
    arr.sort((a,b)=>String(a.id).localeCompare(String(b.id), 'ru'));
    groups.push({
      id: `coll:${coll}`,
      title,
      kind: coll,
      items: arr.map(e => ({
        id: String(e.id),
        type,
        label: String(e.id),
        meta: e.origin || '',
        entity: e,
        rawData: rawOf(e),
      })),
    });
  }

  // game entity previews (not from level data)
  groups.push({
    id: 'game:enemies',
    title: 'Враги (превью моделей)',
    kind: 'game',
    items: [
      { id: 'enemy:soldier:assault', type: 'enemy_soldier', label: 'Солдат · assault', meta: 'аним.', variant: 'assault', animatable: true },
      { id: 'enemy:soldier:recon', type: 'enemy_soldier', label: 'Солдат · recon', meta: 'аним.', variant: 'recon', animatable: true },
      { id: 'enemy:soldier:heavy', type: 'enemy_soldier', label: 'Солдат · heavy', meta: 'аним.', variant: 'heavy', animatable: true },
      { id: 'enemy:alien', type: 'enemy_alien', label: 'Чужой (ксеноморф)', meta: 'аним.', animatable: true },
    ],
  });

  return {
    level: levelNum,
    model,
    groups,
    levelData: {
      source: raw?.source || null,
      compiledIndex: raw?.compiledIndex || null,
      decodedCells: raw?.decodedCells || null,
      merged,
    },
    meta: {
      level: levelNum,
      buildings: buildings.length,
      districts: districts.size,
      warnings,
    },
  };
}

export { loadRegistry };
