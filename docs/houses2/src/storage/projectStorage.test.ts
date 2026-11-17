import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfigForStyle } from '../core/houseMetrics';
import { LocalProjectRepository, type StorageAdapter } from './projectStorage';

function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

test('LocalProjectRepository seeds starter presets and persists saved projects', () => {
  const storage = createMemoryStorage();
  const repo = new LocalProjectRepository(storage);

  const initial = repo.listProjects();
  assert.equal(initial.length, 24);
  assert.equal(initial[0].isBuiltInPreset, true);
  assert.ok(initial.some((p) => p.config.styleId === 'soviet-panel'));
  assert.ok(initial.some((p) => p.config.styleId === 'office-building'));
  assert.ok(initial.some((p) => p.config.styleId === 'skyscraper'));
  assert.ok(initial.some((p) => p.config.styleId === 'megabuilding'));
  assert.ok(initial.some((p) => p.config.styleId === 'slum-shack'));
  assert.ok(initial.some((p) => p.config.styleId === 'factory'));
  assert.ok(initial.some((p) => p.config.styleId === 'blast-furnace'));
  assert.ok(initial.some((p) => p.config.styleId === 'park-pavilion'));
  assert.ok(initial.some((p) => p.config.styleId === 'villa'));
  assert.ok(initial.some((p) => p.config.styleId === 'stadium'));
  assert.ok(initial.some((p) => p.config.styleId === 'parking-booth'));
  assert.ok(initial.some((p) => p.config.styleId === 'sports-ground'));
  assert.ok(initial.some((p) => p.config.styleId === 'early-20c-house'));
  assert.ok(initial.some((p) => p.config.styleId === 'academic-building'));
  assert.ok(initial.some((p) => p.config.styleId === 'market-pavilion'));
  assert.ok(initial.some((p) => p.config.styleId === 'market-row'));
  assert.ok(initial.some((p) => p.config.styleId === 'shopping-mall'));
  assert.ok(initial.some((p) => p.config.styleId === 'warehouse'));

  const customConfig = createDefaultConfigForStyle('nordic-barn');
  customConfig.dimensions.width = 9.4;

  const saved = repo.saveProject('Дача у озера', customConfig);
  assert.equal(saved.name, 'Дача у озера');
  assert.equal(saved.isBuiltInPreset, false);

  // Re-instantiate repository with same storage adapter to simulate page reload
  const reloadedRepo = new LocalProjectRepository(storage);
  const reloadedProjects = reloadedRepo.listProjects();
  assert.equal(reloadedProjects.length, 25);
  assert.equal(reloadedProjects[0].name, 'Дача у озера');
  assert.equal(reloadedProjects[0].config.dimensions.width, 9.4);
});

test('LocalProjectRepository persists all building archetypes including civic, residential, and sports complexes', () => {
  const storage = createMemoryStorage();
  const repo = new LocalProjectRepository(storage);
  const config = createDefaultConfigForStyle('soviet-panel');
  config.dimensions.floors = 12;
  config.dimensions.entrances = 4;

  const saved = repo.saveProject('Серия П-44 Юбилейный', config);
  assert.equal(saved.config.dimensions.floors, 12);
  assert.equal(saved.config.dimensions.entrances, 4);

  const officeConfig = createDefaultConfigForStyle('office-building');
  officeConfig.dimensions.floors = 9;
  officeConfig.features.roofType = 'stepped';
  repo.saveProject('БЦ Премьер-9', officeConfig);

  const towerConfig = createDefaultConfigForStyle('skyscraper');
  towerConfig.dimensions.floors = 45;
  towerConfig.features.roofType = 'shed';
  repo.saveProject('Башня Меркурий-45', towerConfig);

  const megaConfig = createDefaultConfigForStyle('megabuilding');
  megaConfig.dimensions.floors = 50;
  megaConfig.features.roofType = 'flat';
  repo.saveProject('Мегастроение H12', megaConfig);

  const slumConfig = createDefaultConfigForStyle('slum-shack');
  slumConfig.dimensions.floors = 3;
  slumConfig.features.roofType = 'stepped';
  repo.saveProject('Сектор Фавела-3', slumConfig);

  const factoryConfig = createDefaultConfigForStyle('factory');
  factoryConfig.dimensions.floors = 3;
  factoryConfig.features.roofType = 'gable';
  repo.saveProject('Цех Станкостроительный-3', factoryConfig);

  const furnaceConfig = createDefaultConfigForStyle('blast-furnace');
  furnaceConfig.dimensions.floors = 5;
  furnaceConfig.features.roofType = 'gable';
  repo.saveProject('Домна №5 Комбинат', furnaceConfig);

  const parkConfig = createDefaultConfigForStyle('park-pavilion');
  parkConfig.dimensions.floors = 2;
  parkConfig.features.roofType = 'stepped';
  repo.saveProject('Ротонда «Бельведер»', parkConfig);

  const villaConfig = createDefaultConfigForStyle('villa');
  villaConfig.dimensions.floors = 3;
  villaConfig.features.roofType = 'flat';
  repo.saveProject('Вилла «Ривьера»', villaConfig);

  const stadiumConfig = createDefaultConfigForStyle('stadium');
  stadiumConfig.dimensions.floors = 3;
  stadiumConfig.features.roofType = 'hip';
  repo.saveProject('Арена «Лужники»', stadiumConfig);

  const boothConfig = createDefaultConfigForStyle('parking-booth');
  boothConfig.features.roofType = 'stepped';
  boothConfig.features.hasBalcony = true;
  repo.saveProject('КПП Северный въезд', boothConfig);

  const sportsConfig = createDefaultConfigForStyle('sports-ground');
  sportsConfig.features.roofType = 'gable';
  sportsConfig.features.hasBalcony = true;
  repo.saveProject('Крытый корт «Олимп»', sportsConfig);

  const early20cConfig = createDefaultConfigForStyle('early-20c-house');
  early20cConfig.dimensions.floors = 4;
  early20cConfig.features.roofType = 'mansard';
  repo.saveProject('Доходный дом «Модерн»', early20cConfig);

  const academicConfig = createDefaultConfigForStyle('academic-building');
  academicConfig.dimensions.floors = 4;
  academicConfig.features.roofType = 'gable';
  repo.saveProject('Корпус Физтех', academicConfig);

  const marketConfig = createDefaultConfigForStyle('market-pavilion');
  marketConfig.features.roofType = 'hip';
  marketConfig.features.hasBalcony = true;
  repo.saveProject('Центральный рынок', marketConfig);

  const marketRowConfig = createDefaultConfigForStyle('market-row');
  marketRowConfig.features.roofType = 'gable';
  marketRowConfig.features.hasPorch = true;
  repo.saveProject('Базарная аллея 2', marketRowConfig);

  const mallConfig = createDefaultConfigForStyle('shopping-mall');
  mallConfig.dimensions.floors = 4;
  mallConfig.features.roofType = 'stepped';
  repo.saveProject('ТРЦ Галерея', mallConfig);

  const warehouseConfig = createDefaultConfigForStyle('warehouse');
  warehouseConfig.dimensions.floors = 2;
  warehouseConfig.features.roofType = 'gable';
  repo.saveProject('Логистический терминал', warehouseConfig);

  const reloaded = new LocalProjectRepository(storage).listProjects();
  assert.equal(reloaded[0].config.styleId, 'warehouse');
  assert.equal(reloaded[0].config.dimensions.floors, 2);
  assert.equal(reloaded[0].config.features.roofType, 'gable');
  assert.equal(reloaded[1].config.styleId, 'shopping-mall');
  assert.equal(reloaded[1].config.dimensions.floors, 4);
  assert.equal(reloaded[1].config.features.roofType, 'stepped');
  assert.equal(reloaded[2].config.styleId, 'market-row');
  assert.equal(reloaded[2].config.features.roofType, 'gable');
  assert.equal(reloaded[3].config.styleId, 'market-pavilion');
  assert.equal(reloaded[3].config.features.roofType, 'hip');
  assert.equal(reloaded[3].config.features.hasBalcony, true);
  assert.equal(reloaded[4].config.styleId, 'academic-building');
  assert.equal(reloaded[4].config.dimensions.floors, 4);
  assert.equal(reloaded[4].config.features.roofType, 'gable');
  assert.equal(reloaded[5].config.styleId, 'early-20c-house');
  assert.equal(reloaded[5].config.dimensions.floors, 4);
  assert.equal(reloaded[5].config.features.roofType, 'mansard');
  assert.equal(reloaded[6].config.styleId, 'sports-ground');
  assert.equal(reloaded[6].config.features.roofType, 'gable');
  assert.equal(reloaded[6].config.features.hasBalcony, true);
  assert.equal(reloaded[7].config.styleId, 'parking-booth');
  assert.equal(reloaded[7].config.features.roofType, 'stepped');
  assert.equal(reloaded[8].config.styleId, 'stadium');
  assert.equal(reloaded[9].config.styleId, 'villa');
  assert.equal(reloaded[10].config.styleId, 'park-pavilion');
  assert.equal(reloaded[11].config.styleId, 'blast-furnace');
  assert.equal(reloaded[12].config.styleId, 'factory');
  assert.equal(reloaded[13].config.styleId, 'slum-shack');
  assert.equal(reloaded[14].config.styleId, 'megabuilding');
  assert.equal(reloaded[15].config.styleId, 'skyscraper');
  assert.equal(reloaded[16].config.styleId, 'office-building');
  assert.equal(reloaded[17].config.dimensions.floors, 12);
  assert.equal(reloaded[17].config.dimensions.entrances, 4);
});

test('LocalProjectRepository serializes and imports JSON project files safely', () => {
  const repo = new LocalProjectRepository(createMemoryStorage());
  const config = createDefaultConfigForStyle('modern-pavilion');
  const saved = repo.saveProject('Вилла Модерн', config);

  const json = repo.serializeProject(saved);
  const imported = repo.parseImportedProject(json);
  assert.equal(imported.error, undefined);
  assert.ok(imported.project);
  assert.equal(imported.project?.name, 'Вилла Модерн');

  const badImport = repo.parseImportedProject('{broken');
  assert.ok(badImport.error);
});

