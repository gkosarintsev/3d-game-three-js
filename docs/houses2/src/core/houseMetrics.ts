import {
  ACADEMIC_CONSTRAINTS,
  BLAST_FURNACE_CONSTRAINTS,
  EARLY_20C_CONSTRAINTS,
  FACTORY_CONSTRAINTS,
  HOUSE_CONSTRAINTS,
  MARKET_PAVILION_CONSTRAINTS,
  MARKET_ROW_CONSTRAINTS,
  MEGABUILDING_CONSTRAINTS,
  OFFICE_CONSTRAINTS,
  PARK_PAVILION_CONSTRAINTS,
  PARKING_BOOTH_CONSTRAINTS,
  SHOPPING_MALL_CONSTRAINTS,
  SKYSCRAPER_CONSTRAINTS,
  SLUM_SHACK_CONSTRAINTS,
  SOVIET_PANEL_CONSTRAINTS,
  SPORTS_GROUND_CONSTRAINTS,
  STADIUM_CONSTRAINTS,
  VILLA_CONSTRAINTS,
  WAREHOUSE_CONSTRAINTS,
  type ArchitecturalStyleId,
  type ComputedHouseMetrics,
  type HouseConfig,
} from '../types/house';
import { STYLES_REGISTRY } from './registries/stylesRegistry';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function getDimensionsConstraints(styleId: ArchitecturalStyleId) {
  if (styleId === 'soviet-panel') return SOVIET_PANEL_CONSTRAINTS;
  if (styleId === 'office-building') return OFFICE_CONSTRAINTS;
  if (styleId === 'skyscraper') return SKYSCRAPER_CONSTRAINTS;
  if (styleId === 'megabuilding') return MEGABUILDING_CONSTRAINTS;
  if (styleId === 'slum-shack') return SLUM_SHACK_CONSTRAINTS;
  if (styleId === 'factory') return FACTORY_CONSTRAINTS;
  if (styleId === 'blast-furnace') return BLAST_FURNACE_CONSTRAINTS;
  if (styleId === 'park-pavilion') return PARK_PAVILION_CONSTRAINTS;
  if (styleId === 'villa') return VILLA_CONSTRAINTS;
  if (styleId === 'stadium') return STADIUM_CONSTRAINTS;
  if (styleId === 'parking-booth') return PARKING_BOOTH_CONSTRAINTS;
  if (styleId === 'sports-ground') return SPORTS_GROUND_CONSTRAINTS;
  if (styleId === 'early-20c-house') return EARLY_20C_CONSTRAINTS;
  if (styleId === 'academic-building') return ACADEMIC_CONSTRAINTS;
  if (styleId === 'market-pavilion') return MARKET_PAVILION_CONSTRAINTS;
  if (styleId === 'market-row') return MARKET_ROW_CONSTRAINTS;
  if (styleId === 'shopping-mall') return SHOPPING_MALL_CONSTRAINTS;
  if (styleId === 'warehouse') return WAREHOUSE_CONSTRAINTS;
  return HOUSE_CONSTRAINTS;
}

export function cloneHouseConfig(config: HouseConfig): HouseConfig {
  return {
    styleId: config.styleId,
    dimensions: { ...config.dimensions },
    materials: { ...config.materials },
    features: { ...config.features },
  };
}

export function createDefaultConfigForStyle(styleId: ArchitecturalStyleId): HouseConfig {
  const def = STYLES_REGISTRY[styleId] ?? STYLES_REGISTRY['classic-cottage'];
  return cloneHouseConfig(def.defaultConfig);
}

export function clampHouseConfig(config: HouseConfig): HouseConfig {
  const styleDef = STYLES_REGISTRY[config.styleId] ?? STYLES_REGISTRY['classic-cottage'];
  const c = getDimensionsConstraints(styleDef.id);
  const roofType = styleDef.supportedRoofTypes.includes(config.features.roofType)
    ? config.features.roofType
    : styleDef.supportedRoofTypes[0];

  const rawEntrances = config.dimensions.entrances ?? styleDef.defaultConfig.dimensions.entrances ?? 1;

  return {
    styleId: styleDef.id,
    dimensions: {
      width: roundTo(clamp(config.dimensions.width, c.width.min, c.width.max), 2),
      depth: roundTo(clamp(config.dimensions.depth, c.depth.min, c.depth.max), 2),
      floorHeight: roundTo(clamp(config.dimensions.floorHeight, c.floorHeight.min, c.floorHeight.max), 2),
      floors: Math.round(clamp(config.dimensions.floors, c.floors.min, c.floors.max)),
      entrances: Math.round(clamp(rawEntrances, c.entrances.min, c.entrances.max)),
      foundationHeight: roundTo(
        clamp(config.dimensions.foundationHeight, c.foundationHeight.min, c.foundationHeight.max),
        2,
      ),
      roofPitchDeg: Math.round(clamp(config.dimensions.roofPitchDeg, c.roofPitchDeg.min, c.roofPitchDeg.max)),
      roofOverhang: roundTo(clamp(config.dimensions.roofOverhang, c.roofOverhang.min, c.roofOverhang.max), 2),
    },
    materials: { ...config.materials },
    features: {
      roofType,
      windowDensity: Math.round(
        clamp(config.features.windowDensity, c.windowDensity.min, c.windowDensity.max),
      ),
      windowScale: roundTo(clamp(config.features.windowScale, c.windowScale.min, c.windowScale.max), 2),
      hasPorch: Boolean(config.features.hasPorch),
      hasChimney: Boolean(config.features.hasChimney),
      hasCornerAccents: Boolean(config.features.hasCornerAccents),
      hasBalcony: Boolean(config.features.hasBalcony),
      hasDormers: Boolean(config.features.hasDormers),
    },
  };
}

export function computeRoofRiseMeters(config: HouseConfig): number {
  const { width, depth, roofPitchDeg, floors, floorHeight } = config.dimensions;
  const { roofType, hasChimney } = config.features;

  if (config.styleId === 'soviet-panel') {
    return 0.55; // Parapet wall above roof deck
  }

  if (config.styleId === 'office-building') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const crownRise =
      roofType === 'shed'
        ? Math.max(2.2, Math.tan(rad) * (depth * 0.35))
        : roofType === 'stepped'
          ? 1.4
          : 0.9;
    const penthouseRise = hasChimney ? 1.8 : 0;
    return roundTo(crownRise + penthouseRise, 2);
  }

  if (config.styleId === 'slum-shack') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const roofBase =
      roofType === 'shed'
        ? roundTo(Math.tan(rad) * depth * 0.52, 2)
        : roofType === 'stepped'
          ? roundTo(floorHeight * 0.85, 2)
          : 0.45;
    const tankH = hasChimney ? 1.35 : 0;
    return roundTo(roofBase + tankH, 2);
  }

  if (config.styleId === 'factory') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const baySpan = Math.max(4.2, depth / 4);
    const roofBase =
      roofType === 'stepped'
        ? roundTo(Math.max(1.8, Math.tan(rad) * baySpan), 2)
        : roofType === 'gable'
          ? roundTo(Math.tan(rad) * (depth * 0.48) + 1.35, 2)
          : 1.45; // Flat industrial skylights + rooftop chillers
    // Tall boiler smokestack clears roof ridge proportionally to building height
    const stackAboveRoof = hasChimney ? roundTo(Math.max(5.5, floors * floorHeight * 0.65), 2) : 0;
    return roundTo(Math.max(roofBase, roofBase * 0.4 + stackAboveRoof), 2);
  }

  if (config.styleId === 'blast-furnace') {
    const towerH = floors * floorHeight;
    const crownH =
      roofType === 'stepped'
        ? 5.8 // Charging headframe + gas uptake bleeder pipes
        : roofType === 'gable'
          ? 4.4
          : 2.6;
    const smokestackExtra = hasChimney ? roundTo(Math.max(6.5, towerH * 0.45), 2) : 0;
    return roundTo(Math.max(crownH, smokestackExtra), 2);
  }

  if (config.styleId === 'park-pavilion') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const span = Math.min(width, depth);
    const lanternBonus = hasChimney ? 1.25 : 0;
    if (roofType === 'stepped') {
      return roundTo(Math.max(2.8, span * 0.32) + lanternBonus, 2);
    }
    if (roofType === 'flat') {
      return roundTo(0.65 + (hasChimney ? 0.55 : 0), 2);
    }
    // Classic tented hip pavilion roof
    return roundTo(Math.tan(rad) * (span / 2) + lanternBonus, 2);
  }

  if (config.styleId === 'villa') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const mainSpan = Math.min(width * 0.62, depth * 0.78);
    const chimBonus = hasChimney ? 0.75 : 0;
    if (roofType === 'flat') {
      return roundTo(0.45 + chimBonus, 2);
    }
    if (roofType === 'stepped') {
      return roundTo(1.75 + chimBonus, 2);
    }
    return roundTo(Math.max(1.15, Math.tan(rad) * (mainSpan / 2)) + chimBonus, 2);
  }

  if (config.styleId === 'stadium') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const canopyRise = Math.max(1.2, Math.tan(rad) * (width * 0.1));
    const canopyTop =
      roofType === 'hip'
        ? canopyRise * 2.1 + 0.55
        : roofType === 'flat'
          ? Math.max(canopyRise * 1.15, Math.max(3.6, width * 0.06) + 0.45)
          : canopyRise + 0.55;
    const mastExtra = hasChimney ? Math.max(9.5, floors * floorHeight * 0.72 + 4.5) + 1.1 : 0;
    return roundTo(Math.max(canopyTop, mastExtra), 2);
  }

  if (config.styleId === 'parking-booth') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const beaconExtra = hasChimney ? 0.28 : 0;
    if (roofType === 'hip') {
      const span = Math.min(width, depth) + config.dimensions.roofOverhang * 2.1;
      return roundTo(Math.max(0.5, Math.tan(rad) * (span / 2)) + 0.08 + beaconExtra, 2);
    }
    if (roofType === 'stepped') {
      const clearance = Math.max(0.2, 3.15 - floorHeight);
      return roundTo(clearance + 0.32 + beaconExtra, 2);
    }
    return roundTo(0.25 + beaconExtra, 2);
  }

  if (config.styleId === 'sports-ground') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const floodlightExtra = hasChimney ? 2.6 : 0.75;
    if (roofType === 'gable') {
      const apronMargin = Math.max(0.5, config.dimensions.roofOverhang * 1.15);
      const canopyD = depth + apronMargin * 2 + 0.8;
      const ridgeRise = Math.max(1.4, Math.tan(rad) * (canopyD / 2) * 0.55);
      const canopyClearAboveFence = 1.5 + ridgeRise + 0.08;
      return roundTo(Math.max(canopyClearAboveFence, hasChimney ? 3.4 : 0), 2);
    }
    return roundTo(floodlightExtra, 2);
  }

  if (config.styleId === 'early-20c-house') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const span = Math.min(width, depth) + config.dimensions.roofOverhang * 2;
    const roofBase =
      roofType === 'mansard'
        ? Math.max(2.3, Math.tan(rad) * (Math.min(width, depth) / 2) * 0.95)
        : roofType === 'gable'
          ? Math.max(1.8, Math.tan(rad) * (depth / 2))
          : Math.max(1.6, Math.tan(rad) * (span / 2) * 0.9);
    const chimExtra = hasChimney ? 0.85 : 0;
    return roundTo(roofBase + chimExtra, 2);
  }

  if (config.styleId === 'academic-building') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const mainD = depth * 0.86;
    const cupolaExtra = hasChimney ? 5.95 : 0;
    const baseRoof =
      roofType === 'flat'
        ? 0.98
        : roofType === 'gable'
          ? Math.max(1.8, Math.tan(rad) * (mainD / 2) * 0.88) * 1.05
          : Math.max(1.6, Math.tan(rad) * (mainD / 2) * 0.72) * 1.06;
    return roundTo(baseRoof + Math.max(0, cupolaExtra - 0.35), 2);
  }

  if (config.styleId === 'market-pavilion') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const baseRoof =
      roofType === 'flat'
        ? 1.08
        : roofType === 'hip'
          ? Math.max(1.8, Math.tan(rad) * (Math.min(width, depth) / 2) * 0.82) + 0.08
          : Math.max(2.0, Math.tan(rad) * (depth / 2) * 0.85) * 0.72 + 1.6;
    const lanternExtra = hasChimney ? 2.05 : 0;
    return roundTo(baseRoof + lanternExtra, 2);
  }

  if (config.styleId === 'market-row') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const baseRoof =
      roofType === 'flat'
        ? 0.95
        : roofType === 'gable'
          ? Math.max(0.85, Math.tan(rad) * (depth * 0.45)) + 0.45
          : Math.max(0.75, Math.tan(rad) * (depth * 0.52)) + 0.5;
    const flueExtra = hasChimney ? 1.15 : 0;
    return roundTo(baseRoof + flueExtra, 2);
  }

  if (config.styleId === 'shopping-mall') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const baseRoof =
      roofType === 'stepped'
        ? roundTo(floorHeight * 0.88 + 1.1, 2)
        : roofType === 'gable'
          ? roundTo(Math.max(2.6, Math.tan(rad) * (depth * 0.24)) + 1.1, 2)
          : 2.35; // Central atrium skylight spine + parapet
    const hvacCrown = hasChimney ? 1.4 : 0;
    return roundTo(baseRoof + hvacCrown, 2);
  }

  if (config.styleId === 'warehouse') {
    const rad = (roofPitchDeg * Math.PI) / 180;
    const baseRoof =
      roofType === 'flat'
        ? 0.95
        : roofType === 'gable'
          ? roundTo(Math.max(1.4, Math.tan(rad) * (depth * 0.48)) + 0.65, 2)
          : roundTo(Math.max(1.2, Math.tan(rad) * (depth * 0.62)) + 0.45, 2);
    const ventExtra = hasChimney ? 0.95 : 0;
    return roundTo(baseRoof + ventExtra, 2);
  }

  if (config.styleId === 'skyscraper') {
    const towerH = floors * floorHeight;
    const crownParapet = roofType === 'shed'
      ? Math.max(3.6, Math.tan((roofPitchDeg * Math.PI) / 180) * (depth * 0.48))
      : roofType === 'stepped'
        ? 4.2
        : 2.2;
    const spireH = hasChimney ? roundTo(Math.max(10, towerH * 0.16), 2) : 0;
    return roundTo(crownParapet + spireH, 2);
  }

  if (config.styleId === 'megabuilding') {
    const towerH = floors * floorHeight;
    const crownRise = roofType === 'shed'
      ? Math.max(4.5, Math.tan((roofPitchDeg * Math.PI) / 180) * (depth * 0.42))
      : roofType === 'stepped'
        ? 6.5
        : 3.2;
    const relayMastH = hasChimney ? roundTo(Math.max(12, towerH * 0.16), 2) : 0;
    return roundTo(crownRise + relayMastH, 2);
  }

  if (roofType === 'flat') {
    return 0.35; // Parapet height
  }

  const rad = (roofPitchDeg * Math.PI) / 180;
  if (roofType === 'shed') {
    return roundTo(Math.tan(rad) * depth * 0.55, 2);
  }

  if (roofType === 'aframe') {
    // Steep A-frame spans full width from low knee-wall up to ridge
    const effectivePitch = Math.max(48, roofPitchDeg);
    return roundTo(Math.tan((effectivePitch * Math.PI) / 180) * (width / 2), 2);
  }

  if (roofType === 'mansard') {
    // Two-tier gambrel/mansard attic rise proportional to span and pitch
    const span = Math.min(width, depth);
    return roundTo(Math.max(2.4, Math.tan(rad) * (span / 2) * 1.15), 2);
  }

  // Gable & Hip span across the shorter horizontal axis
  const span = Math.min(width, depth);
  return roundTo(Math.tan(rad) * (span / 2), 2);
}

export function computeHouseMetrics(rawConfig: HouseConfig): ComputedHouseMetrics {
  const config = clampHouseConfig(rawConfig);
  const { width, depth, floorHeight, floors, foundationHeight } = config.dimensions;
  const entrances = config.dimensions.entrances ?? 1;
  const totalWidthM = roundTo(width * entrances, 1);

  const footprintAreaM2 = roundTo(totalWidthM * depth, 1);
  const isMansardAttic = config.features.roofType === 'mansard';
  const isAFrame = config.features.roofType === 'aframe';
  const isSteppedTower = config.styleId === 'skyscraper' && config.features.roofType === 'stepped';
  const isSteppedOffice =
    config.styleId === 'office-building' && config.features.roofType === 'stepped';
  const isSteppedSlum =
    config.styleId === 'slum-shack' && config.features.roofType === 'stepped';
  const isMegabuilding = config.styleId === 'megabuilding';
  const megaFillFactor = config.features.roofType === 'stepped' ? 0.76 : 0.82;
  const effectiveFloors = isMansardAttic
    ? floors + 0.75
    : isAFrame
      ? 1.5
      : isSteppedTower
        ? floors * 0.84
        : isSteppedOffice
          ? floors * 0.88
          : isSteppedSlum
            ? floors + 0.45
            : isMegabuilding
              ? floors * megaFillFactor
              : floors;
  const grossFloorAreaM2 = roundTo(footprintAreaM2 * effectiveFloors, 1);
  const wallHeightTotalM = isAFrame ? 0.45 : roundTo(floorHeight * floors, 2);
  const roofRiseM = computeRoofRiseMeters(config);
  const totalRidgeHeightM = roundTo(foundationHeight + wallHeightTotalM + roofRiseM, 2);

  // Volume includes main box + roof approximation
  const roofVolumeFactor =
    config.features.roofType === 'flat'
      ? 0.25
      : config.features.roofType === 'hip'
        ? 0.38
        : config.features.roofType === 'mansard'
          ? 0.72
          : config.styleId === 'skyscraper' ||
              config.styleId === 'office-building' ||
              config.styleId === 'blast-furnace' ||
              isMegabuilding
            ? 0.22
            : 0.5;
  const wallFillFactor = isSteppedTower
    ? 0.84
    : isSteppedOffice
      ? 0.88
      : config.styleId === 'blast-furnace'
        ? 0.52
        : config.styleId === 'park-pavilion'
          ? 0.72
          : config.styleId === 'villa'
            ? 0.85
            : config.styleId === 'stadium'
              ? 0.42
              : config.styleId === 'sports-ground'
                ? 0.14
                : config.styleId === 'academic-building'
                  ? 0.88
                  : config.styleId === 'market-row'
                    ? 0.72
                    : config.styleId === 'shopping-mall'
                      ? 0.88
                      : config.styleId === 'warehouse'
                        ? 0.95
                        : isMegabuilding
                          ? megaFillFactor
                          : 1;
  const estimatedVolumeM3 = roundTo(
    footprintAreaM2 * (wallHeightTotalM * wallFillFactor + roofRiseM * roofVolumeFactor),
    1,
  );

  return {
    totalWidthM,
    entrances,
    footprintAreaM2,
    grossFloorAreaM2,
    wallHeightTotalM,
    roofRiseM,
    totalRidgeHeightM,
    estimatedVolumeM3,
  };
}

export interface ProjectNameValidationResult {
  valid: boolean;
  trimmedName: string;
  error?: string;
}

export function validateProjectName(name: string): ProjectNameValidationResult {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return {
      valid: false,
      trimmedName,
      error: 'Введите название проекта перед сохранением.',
    };
  }
  if (trimmedName.length < 2) {
    return {
      valid: false,
      trimmedName,
      error: 'Название должно содержать минимум 2 символа.',
    };
  }
  if (trimmedName.length > 60) {
    return {
      valid: false,
      trimmedName,
      error: 'Название не должно превышать 60 символов.',
    };
  }
  return { valid: true, trimmedName };
}
