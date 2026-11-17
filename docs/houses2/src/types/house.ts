export type ArchitecturalStyleId =
  | 'classic-cottage'
  | 'nordic-barn'
  | 'modern-pavilion'
  | 'a-frame'
  | 'alpine-chalet'
  | 'mansard-house'
  | 'soviet-panel'
  | 'office-building'
  | 'skyscraper'
  | 'megabuilding'
  | 'slum-shack'
  | 'factory'
  | 'blast-furnace'
  | 'park-pavilion'
  | 'villa'
  | 'stadium'
  | 'parking-booth'
  | 'sports-ground'
  | 'early-20c-house'
  | 'academic-building'
  | 'market-pavilion'
  | 'market-row'
  | 'shopping-mall'
  | 'warehouse';

export type RoofTypeId =
  | 'gable'
  | 'hip'
  | 'flat'
  | 'shed'
  | 'aframe'
  | 'mansard'
  | 'stepped';

export type WallMaterialId =
  | 'stucco'
  | 'brick'
  | 'timber'
  | 'concrete'
  | 'panel'
  | 'curtain'
  | 'brutalist'
  | 'corrugated';

export type RoofMaterialId = 'shingles' | 'standing-seam' | 'terracotta' | 'membrane';

export type TrimFinishId = 'charcoal' | 'warm-white' | 'natural-oak' | 'bronze';

export type CameraPresetId = 'isometric' | 'front' | 'side' | 'top';

export interface HouseDimensions {
  /** Building width (or section width per entrance for multi-section buildings) along X axis in meters */
  width: number;
  /** Building depth along Z axis in meters */
  depth: number;
  /** Height of a single floor in meters */
  floorHeight: number;
  /** Number of stories */
  floors: number;
  /** Number of entrance sections (подъезды) along X axis */
  entrances?: number;
  /** Foundation plinth height in meters */
  foundationHeight: number;
  /** Roof pitch in degrees (0 for flat roof) */
  roofPitchDeg: number;
  /** Roof eaves overhang in meters */
  roofOverhang: number;
}

export interface HouseMaterials {
  wallMaterial: WallMaterialId;
  wallColor: string;
  roofMaterial: RoofMaterialId;
  roofColor: string;
  trimFinish: TrimFinishId;
}

export interface HouseFeatures {
  roofType: RoofTypeId;
  /** Window density per facade span (1..3) */
  windowDensity: number;
  /** Window vertical scale factor (0.75..1.3) */
  windowScale: number;
  hasPorch: boolean;
  hasChimney: boolean;
  hasCornerAccents: boolean;
  hasBalcony: boolean;
  hasDormers: boolean;
}

export interface HouseConfig {
  styleId: ArchitecturalStyleId;
  dimensions: HouseDimensions;
  materials: HouseMaterials;
  features: HouseFeatures;
}

export interface ComputedHouseMetrics {
  totalWidthM: number;
  entrances: number;
  footprintAreaM2: number;
  grossFloorAreaM2: number;
  wallHeightTotalM: number;
  roofRiseM: number;
  totalRidgeHeightM: number;
  estimatedVolumeM3: number;
}

export interface SavedProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isBuiltInPreset?: boolean;
  config: HouseConfig;
}

export const HOUSE_CONSTRAINTS = {
  width: { min: 5.0, max: 16.0, step: 0.1 },
  depth: { min: 4.5, max: 14.0, step: 0.1 },
  floorHeight: { min: 2.5, max: 3.8, step: 0.1 },
  floors: { min: 1, max: 2, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.25, max: 0.9, step: 0.05 },
  roofPitchDeg: { min: 12, max: 66, step: 1 },
  roofOverhang: { min: 0.15, max: 1.0, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.75, max: 1.25, step: 0.05 },
} as const;

export const SOVIET_PANEL_CONSTRAINTS = {
  width: { min: 10.0, max: 18.0, step: 0.2 },
  depth: { min: 9.0, max: 15.0, step: 0.2 },
  floorHeight: { min: 2.5, max: 3.3, step: 0.1 },
  floors: { min: 3, max: 16, step: 1 },
  entrances: { min: 1, max: 6, step: 1 },
  foundationHeight: { min: 0.4, max: 1.4, step: 0.05 },
  roofPitchDeg: { min: 12, max: 14, step: 1 },
  roofOverhang: { min: 0.15, max: 0.6, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.2, step: 0.05 },
} as const;

export const OFFICE_CONSTRAINTS = {
  width: { min: 18.0, max: 46.0, step: 0.5 },
  depth: { min: 12.0, max: 28.0, step: 0.5 },
  floorHeight: { min: 3.3, max: 4.5, step: 0.1 },
  floors: { min: 3, max: 18, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.4, max: 1.6, step: 0.05 },
  roofPitchDeg: { min: 12, max: 32, step: 1 },
  roofOverhang: { min: 0.2, max: 1.0, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.75, max: 1.25, step: 0.05 },
} as const;

export const SKYSCRAPER_CONSTRAINTS = {
  width: { min: 14.0, max: 32.0, step: 0.5 },
  depth: { min: 14.0, max: 32.0, step: 0.5 },
  floorHeight: { min: 3.1, max: 4.5, step: 0.1 },
  floors: { min: 12, max: 60, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.8, max: 2.4, step: 0.1 },
  roofPitchDeg: { min: 12, max: 48, step: 1 },
  roofOverhang: { min: 0.15, max: 0.8, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;

export const MEGABUILDING_CONSTRAINTS = {
  width: { min: 26.0, max: 56.0, step: 1.0 },
  depth: { min: 24.0, max: 52.0, step: 1.0 },
  floorHeight: { min: 3.0, max: 4.2, step: 0.1 },
  floors: { min: 16, max: 64, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 1.5, max: 4.5, step: 0.25 },
  roofPitchDeg: { min: 12, max: 38, step: 1 },
  roofOverhang: { min: 0.2, max: 0.8, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.75, max: 1.25, step: 0.05 },
} as const;

export const SLUM_SHACK_CONSTRAINTS = {
  width: { min: 5.5, max: 14.0, step: 0.5 },
  depth: { min: 5.0, max: 12.0, step: 0.5 },
  floorHeight: { min: 2.3, max: 3.1, step: 0.1 },
  floors: { min: 1, max: 4, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.2, max: 0.75, step: 0.05 },
  roofPitchDeg: { min: 8, max: 24, step: 1 },
  roofOverhang: { min: 0.2, max: 0.9, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.75, max: 1.25, step: 0.05 },
} as const;

export const FACTORY_CONSTRAINTS = {
  width: { min: 18.0, max: 52.0, step: 1.0 },
  depth: { min: 14.0, max: 36.0, step: 1.0 },
  floorHeight: { min: 3.4, max: 5.5, step: 0.1 },
  floors: { min: 1, max: 4, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.3, max: 1.2, step: 0.05 },
  roofPitchDeg: { min: 14, max: 34, step: 1 },
  roofOverhang: { min: 0.15, max: 0.7, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.75, max: 1.25, step: 0.05 },
} as const;

export const BLAST_FURNACE_CONSTRAINTS = {
  width: { min: 18.0, max: 42.0, step: 1.0 },
  depth: { min: 16.0, max: 34.0, step: 1.0 },
  floorHeight: { min: 4.5, max: 7.5, step: 0.2 },
  floors: { min: 2, max: 5, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.5, max: 1.5, step: 0.05 },
  roofPitchDeg: { min: 18, max: 40, step: 1 },
  roofOverhang: { min: 0.15, max: 0.6, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.75, max: 1.25, step: 0.05 },
} as const;

export const PARK_PAVILION_CONSTRAINTS = {
  width: { min: 6.5, max: 18.0, step: 0.5 },
  depth: { min: 5.5, max: 16.0, step: 0.5 },
  floorHeight: { min: 3.0, max: 4.6, step: 0.1 },
  floors: { min: 1, max: 2, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.3, max: 1.0, step: 0.05 },
  roofPitchDeg: { min: 18, max: 46, step: 1 },
  roofOverhang: { min: 0.35, max: 1.4, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.75, max: 1.25, step: 0.05 },
} as const;

export const VILLA_CONSTRAINTS = {
  width: { min: 14.0, max: 28.0, step: 0.5 },
  depth: { min: 10.0, max: 20.0, step: 0.5 },
  floorHeight: { min: 3.0, max: 4.4, step: 0.1 },
  floors: { min: 1, max: 3, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.35, max: 1.1, step: 0.05 },
  roofPitchDeg: { min: 14, max: 32, step: 1 },
  roofOverhang: { min: 0.4, max: 1.2, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;

export const STADIUM_CONSTRAINTS = {
  width: { min: 56.0, max: 120.0, step: 2.0 },
  depth: { min: 44.0, max: 96.0, step: 2.0 },
  floorHeight: { min: 4.0, max: 7.5, step: 0.2 },
  floors: { min: 1, max: 3, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 1.0, max: 3.5, step: 0.2 },
  roofPitchDeg: { min: 8, max: 28, step: 1 },
  roofOverhang: { min: 0.5, max: 1.8, step: 0.1 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;

export const PARKING_BOOTH_CONSTRAINTS = {
  width: { min: 2.2, max: 4.6, step: 0.1 },
  depth: { min: 2.0, max: 4.0, step: 0.1 },
  floorHeight: { min: 2.4, max: 3.4, step: 0.1 },
  floors: { min: 1, max: 1, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.15, max: 0.5, step: 0.05 },
  roofPitchDeg: { min: 10, max: 32, step: 1 },
  roofOverhang: { min: 0.25, max: 0.9, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;

export const SPORTS_GROUND_CONSTRAINTS = {
  width: { min: 14.0, max: 36.0, step: 1.0 },
  depth: { min: 10.0, max: 24.0, step: 1.0 },
  floorHeight: { min: 2.4, max: 4.8, step: 0.2 },
  floors: { min: 1, max: 1, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.15, max: 0.6, step: 0.05 },
  roofPitchDeg: { min: 10, max: 26, step: 1 },
  roofOverhang: { min: 0.35, max: 1.2, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.85, max: 1.2, step: 0.05 },
} as const;

export const EARLY_20C_CONSTRAINTS = {
  width: { min: 11.0, max: 24.0, step: 0.5 },
  depth: { min: 8.0, max: 15.0, step: 0.5 },
  floorHeight: { min: 3.1, max: 4.2, step: 0.1 },
  floors: { min: 2, max: 4, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.5, max: 1.3, step: 0.05 },
  roofPitchDeg: { min: 20, max: 42, step: 1 },
  roofOverhang: { min: 0.3, max: 0.85, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.2, step: 0.05 },
} as const;

export const ACADEMIC_CONSTRAINTS = {
  width: { min: 24.0, max: 54.0, step: 1.0 },
  depth: { min: 12.0, max: 24.0, step: 1.0 },
  floorHeight: { min: 3.4, max: 4.4, step: 0.1 },
  floors: { min: 2, max: 5, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.6, max: 1.6, step: 0.05 },
  roofPitchDeg: { min: 14, max: 32, step: 1 },
  roofOverhang: { min: 0.35, max: 0.95, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;

export const MARKET_PAVILION_CONSTRAINTS = {
  width: { min: 12.0, max: 32.0, step: 1.0 },
  depth: { min: 9.0, max: 22.0, step: 1.0 },
  floorHeight: { min: 3.4, max: 5.4, step: 0.2 },
  floors: { min: 1, max: 1, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.2, max: 0.75, step: 0.05 },
  roofPitchDeg: { min: 14, max: 32, step: 1 },
  roofOverhang: { min: 0.45, max: 1.4, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;

export const MARKET_ROW_CONSTRAINTS = {
  width: { min: 14.0, max: 38.0, step: 1.0 },
  depth: { min: 4.2, max: 9.0, step: 0.4 },
  floorHeight: { min: 2.8, max: 4.4, step: 0.2 },
  floors: { min: 1, max: 1, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.15, max: 0.5, step: 0.05 },
  roofPitchDeg: { min: 10, max: 28, step: 1 },
  roofOverhang: { min: 0.4, max: 1.3, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;

export const SHOPPING_MALL_CONSTRAINTS = {
  width: { min: 34.0, max: 76.0, step: 2.0 },
  depth: { min: 24.0, max: 54.0, step: 2.0 },
  floorHeight: { min: 4.2, max: 5.8, step: 0.2 },
  floors: { min: 2, max: 5, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.35, max: 1.2, step: 0.05 },
  roofPitchDeg: { min: 10, max: 26, step: 1 },
  roofOverhang: { min: 0.4, max: 1.4, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;

export const WAREHOUSE_CONSTRAINTS = {
  width: { min: 24.0, max: 68.0, step: 2.0 },
  depth: { min: 16.0, max: 42.0, step: 2.0 },
  floorHeight: { min: 5.5, max: 9.0, step: 0.2 },
  floors: { min: 1, max: 2, step: 1 },
  entrances: { min: 1, max: 1, step: 1 },
  foundationHeight: { min: 0.6, max: 1.4, step: 0.05 },
  roofPitchDeg: { min: 6, max: 20, step: 1 },
  roofOverhang: { min: 0.3, max: 1.2, step: 0.05 },
  windowDensity: { min: 1, max: 3, step: 1 },
  windowScale: { min: 0.8, max: 1.25, step: 0.05 },
} as const;


