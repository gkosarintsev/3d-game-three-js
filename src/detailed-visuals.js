/**
 * Реестр детальных визуалов зданий: сопоставляет `detailedVisual` из данных
 * главы билдеру мешей. Вынесен из json-map.js (REF-001), чтобы держать
 * диспетчеризацию и импорты билдеров отдельно от оркестрации карты.
 *
 * Поведение/дефолты сохранены 1:1 с прежним dispatch в JsonMap.
 */
import { buildDetailedSovietPanel, makeSovietPanelMaterials } from './soviet-panel-detail.js';
import { buildDetailedSkyscraper, makeSkyscraperMaterials } from './skyscraper-detail.js';
import { buildDetailedOfficeBuilding, makeOfficeBuildingMaterials } from './office-building-detail.js';
import { buildDetailedMegabuilding, makeMegabuildingMaterials } from './megabuilding-detail.js';
import { buildDetailedSlumShack, makeSlumShackMaterials } from './slum-shack-detail.js';
import { buildDetailedGenericHouse, makeGenericHouseMaterials } from './generic-house-detail.js';
import { buildDetailedEarly20cHouse, makeEarly20cHouseMaterials } from './early-20c-house-detail.js';
import { buildDetailedAcademicBuilding, makeAcademicBuildingMaterials } from './academic-building-detail.js';
import { buildDetailedMarketPavilion, makeMarketPavilionMaterials } from './market-pavilion-detail.js';
import { buildDetailedMarketRow, makeMarketRowMaterials } from './market-row-detail.js';
import { buildDetailedShoppingMall, makeShoppingMallMaterials } from './shopping-mall-detail.js';
import { buildDetailedWarehouse, makeWarehouseMaterials } from './warehouse-detail.js';
import { buildDetailedFactory, makeFactoryMaterials } from './factory-detail.js';
import { buildDetailedBlastFurnace, makeBlastFurnaceMaterials } from './blast-furnace-detail.js';
import { buildDetailedParkPavilion, makeParkPavilionMaterials } from './park-pavilion-detail.js';
import { buildDetailedVilla, makeVillaMaterials } from './villa-detail.js';
import { buildDetailedStadium, makeStadiumMaterials } from './stadium-detail.js';
import { buildDetailedParkingBooth, makeParkingBoothMaterials } from './parking-booth-detail.js';
import { buildDetailedSportsGround, makeSportsGroundMaterials } from './sports-ground-detail.js';

/** Реестр детальных визуалов: поведение/дефолты сохранены 1:1 с прежним dispatch. */
export const DETAILED_VISUAL_BUILDERS = {
  'soviet_panel': (b, bw, bd) => {
    const entrances = Math.max(1, Math.round(b.entrances || 3));
    const sectionW = bw / entrances;
    const mats = makeSovietPanelMaterials(b.wallColor || '#d6d0c4');
    return { meshes: buildDetailedSovietPanel({
      width: sectionW, depth: bd, floorHeight: b.floorHeight || 2.8, floors: b.floorsCount || 5,
      entrances, foundationHeight: 0.7, windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      baseY: b.baseY, hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, mats), yOffset: 0 };
  },
  'skyscraper': (b, bw, bd) => {
    const fndH = 1.2;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedSkyscraper({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.6, floors: b.floorsCount || 20,
      foundationHeight: fndH, roofPitchDeg: 28, roofType: b.floorsCount >= 20 ? 'stepped' : 'flat',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.05,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeSkyscraperMaterials(b.wallColor || '#4b5563')) };
  },
  'office-building': (b, bw, bd) => {
    const fndH = 1.0;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedOfficeBuilding({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.5, floors: b.floorsCount || 8,
      foundationHeight: fndH, roofPitchDeg: 10, roofOverhang: 0.35,
      roofType: b.floorsCount >= 8 ? 'stepped' : 'flat',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.08,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeOfficeBuildingMaterials(b.wallColor || '#b8c2cc')) };
  },
  'megabuilding': (b, bw, bd) => {
    const fndH = 1.6;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedMegabuilding({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.4, floors: b.floorsCount || 24,
      foundationHeight: fndH, roofPitchDeg: 14, roofOverhang: 0.5,
      roofType: b.floorsCount >= 30 ? 'stepped' : 'flat',
      windowDensity: b.windowDensity || 3, windowScale: b.windowScale || 1.02,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeMegabuildingMaterials(b.wallColor || '#49505b')) };
  },
  'slum-shack': (b, bw, bd) => {
    const fndH = 0.2;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedSlumShack({
      width: bw, depth: bd, floorHeight: b.floorHeight || 2.7, floors: b.floorsCount || 2,
      foundationHeight: fndH, roofPitchDeg: 18, roofOverhang: 0.5,
      roofType: (b.floorsCount || 2) <= 1 ? 'shed' : 'flat',
      windowDensity: b.windowDensity || 1, windowScale: b.windowScale || 0.9,
      hasPorch: false, hasChimney: true, hasCornerAccents: false, hasBalcony: false,
    }, makeSlumShackMaterials(b.wallColor || '#8d949b')) };
  },
  'early-20c-house': (b, bw, bd) => {
    const fndH = 0.85;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedEarly20cHouse({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.5, floors: b.floorsCount || 3,
      foundationHeight: fndH, roofPitchDeg: 30, roofOverhang: 0.5, roofType: 'hip',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.05,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeEarly20cHouseMaterials(b.wallColor || '#a6523e')) };
  },
  'academic-building': (b, bw, bd) => {
    const fndH = 1.0;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedAcademicBuilding({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.9, floors: b.floorsCount || 3,
      foundationHeight: fndH, roofPitchDeg: 20, roofOverhang: 0.55, roofType: 'hip',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.08,
      hasPorch: true, hasChimney: false, hasCornerAccents: true, hasBalcony: false,
    }, makeAcademicBuildingMaterials(b.wallColor || '#d5cbb8')) };
  },
  'market-pavilion': (b, bw, bd) => {
    const fndH = 0.5;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedMarketPavilion({
      width: bw, depth: bd, floorHeight: b.floorHeight || 4.2, floors: b.floorsCount || 1,
      foundationHeight: fndH, roofPitchDeg: 22, roofOverhang: 0.7, roofType: 'hip',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.1,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeMarketPavilionMaterials(b.wallColor || '#d8c8ad')) };
  },
  'market-row': (b, bw, bd) => {
    const fndH = 0.25;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedMarketRow({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.2, floors: b.floorsCount || 1,
      foundationHeight: fndH, roofPitchDeg: 18, roofOverhang: 0.5, roofType: 'shed',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: false,
    }, makeMarketRowMaterials(b.wallColor || '#d4c6b0')) };
  },
  'shopping-mall': (b, bw, bd) => {
    const fndH = 0.6;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedShoppingMall({
      width: bw, depth: bd, floorHeight: b.floorHeight || 4.8, floors: b.floorsCount || 2,
      foundationHeight: fndH, roofPitchDeg: 18, roofOverhang: 0.8, roofType: 'flat',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.1,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeShoppingMallMaterials(b.wallColor || '#d9dde3')) };
  },
  'warehouse': (b, bw, bd) => {
    const fndH = 0.45;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedWarehouse({
      width: bw, depth: bd, floorHeight: b.floorHeight || 5.0, floors: b.floorsCount || 1,
      foundationHeight: fndH, roofPitchDeg: 18, roofOverhang: 0.6, roofType: 'shed',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeWarehouseMaterials(b.wallColor || '#b8c0c8')) };
  },
  'factory': (b, bw, bd) => {
    const fndH = 0.7;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedFactory({
      width: bw, depth: bd, floorHeight: b.floorHeight || 5.0, floors: b.floorsCount || 2,
      foundationHeight: fndH, roofPitchDeg: 16, roofOverhang: 0.55, roofType: 'stepped',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeFactoryMaterials(b.wallColor || '#9aa3ad')) };
  },
  'blast-furnace': (b, bw, bd) => {
    const fndH = 1.2;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedBlastFurnace({
      width: bw, depth: bd, floorHeight: b.floorHeight || 5.5, floors: b.floorsCount || 3,
      foundationHeight: fndH, roofPitchDeg: 14, roofOverhang: 0.5, roofType: 'stepped',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeBlastFurnaceMaterials(b.wallColor || '#7a6a58')) };
  },
  'park-pavilion': (b, bw, bd) => {
    const fndH = 0.35;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedParkPavilion({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.4, floors: b.floorsCount || 1,
      foundationHeight: fndH, roofPitchDeg: 24, roofOverhang: 0.7, roofType: 'hip',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeParkPavilionMaterials(b.wallColor || '#e8e1d4')) };
  },
  'villa': (b, bw, bd) => {
    const fndH = 0.45;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedVilla({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.4, floors: b.floorsCount || 2,
      foundationHeight: fndH, roofPitchDeg: 22, roofOverhang: 0.7, roofType: 'hip',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.1,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeVillaMaterials(b.wallColor || '#e9e2d6')) };
  },
  'stadium': (b, bw, bd) => {
    const fndH = 0.8;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedStadium({
      width: bw, depth: bd, floorHeight: b.floorHeight || 4.0, floors: b.floorsCount || 2,
      foundationHeight: fndH, roofPitchDeg: 14, roofOverhang: 1.2, roofType: 'stepped',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeStadiumMaterials(b.wallColor || '#9aa3ad')) };
  },
  'parking-booth': (b, bw, bd) => {
    const fndH = 0.22;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedParkingBooth({
      width: bw, depth: bd, floorHeight: b.floorHeight || 2.8, floors: b.floorsCount || 1,
      foundationHeight: fndH, roofPitchDeg: 12, roofOverhang: 0.4, roofType: 'flat',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: false,
    }, makeParkingBoothMaterials(b.wallColor || '#dde3ea')) };
  },
  'sports-ground': (b, bw, bd) => {
    const fndH = 0.12;
    return { yOffset: b.baseY - fndH, meshes: buildDetailedSportsGround({
      width: bw, depth: bd, floorHeight: b.floorHeight || 3.2, floors: b.floorsCount || 1,
      foundationHeight: fndH, roofPitchDeg: 14, roofOverhang: 0.6, roofType: 'flat',
      windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
      hasPorch: true, hasChimney: true, hasCornerAccents: true, hasBalcony: true,
    }, makeSportsGroundMaterials(b.wallColor || '#2f7d32')) };
  },
};

for (const styleId of ['classic-cottage', 'nordic-barn', 'modern-pavilion', 'a-frame', 'alpine-chalet', 'mansard-house']) {
  DETAILED_VISUAL_BUILDERS[styleId] = (b, bw, bd) => {
    const roofByStyle = {
      'classic-cottage': 'gable', 'nordic-barn': 'gable', 'modern-pavilion': 'flat',
      'a-frame': 'aframe', 'alpine-chalet': 'gable', 'mansard-house': 'mansard',
    };
    const fndH = styleId === 'a-frame' ? 0.3 : (styleId === 'modern-pavilion' ? 0.3 : 0.45);
    return { yOffset: b.baseY - fndH, meshes: buildDetailedGenericHouse({
      styleId,
      dimensions: {
        width: bw, depth: bd, floorHeight: b.floorHeight || 3.0, floors: b.floorsCount || 2,
        foundationHeight: fndH, roofPitchDeg: styleId === 'a-frame' ? 62 : (styleId === 'modern-pavilion' ? 4 : 32), roofOverhang: 0.55,
      },
      features: {
        roofType: roofByStyle[styleId] || 'gable',
        windowDensity: b.windowDensity || 2, windowScale: b.windowScale || 1.0,
        hasPorch: styleId !== 'modern-pavilion', hasChimney: true, hasCornerAccents: true,
        hasBalcony: false, hasDormers: styleId === 'mansard-house',
      },
    }, makeGenericHouseMaterials(styleId, b.wallColor)) };
  };
}
