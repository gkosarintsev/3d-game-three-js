import {
  ROOF_TYPE_LABELS,
  STYLE_LIST,
  STYLES_REGISTRY,
} from '../../core/registries/stylesRegistry';
import {
  HOUSE_CONSTRAINTS,
  type ArchitecturalStyleId,
  type HouseFeatures,
  type RoofTypeId,
} from '../../types/house';

export interface StyleTabProps {
  styleId: ArchitecturalStyleId;
  features: HouseFeatures;
  floors: number;
  roofOverhang: number;
  onSelectStyle: (styleId: ArchitecturalStyleId) => void;
  onChangeFeatures: (patch: Partial<HouseFeatures>) => void;
  onChangeOverhang: (overhang: number) => void;
}

export function StyleTab({
  styleId,
  features,
  floors,
  roofOverhang,
  onSelectStyle,
  onChangeFeatures,
  onChangeOverhang,
}: StyleTabProps) {
  const activeStyle = STYLES_REGISTRY[styleId];
  const isSovietPanel = styleId === 'soviet-panel';
  const isOfficeBuilding = styleId === 'office-building';
  const isSkyscraper = styleId === 'skyscraper';
  const isMegabuilding = styleId === 'megabuilding';
  const isSlumShack = styleId === 'slum-shack';
  const isFactory = styleId === 'factory';
  const isBlastFurnace = styleId === 'blast-furnace';
  const isParkPavilion = styleId === 'park-pavilion';
  const isVilla = styleId === 'villa';
  const isStadium = styleId === 'stadium';
  const isParkingBooth = styleId === 'parking-booth';
  const isSportsGround = styleId === 'sports-ground';
  const isEarly20c = styleId === 'early-20c-house';
  const isAcademic = styleId === 'academic-building';
  const isMarket = styleId === 'market-pavilion';
  const isMarketRow = styleId === 'market-row';
  const isMall = styleId === 'shopping-mall';
  const isWarehouse = styleId === 'warehouse';

  const getRoofOptionLabel = (rType: RoofTypeId): string => {
    if (isMegabuilding) {
      if (rType === 'stepped') return 'Ярусная';
      if (rType === 'flat') return 'Пром-плато';
      if (rType === 'shed') return 'Клин-корона';
    }
    if (isOfficeBuilding) {
      if (rType === 'flat') return 'Плоская';
      if (rType === 'stepped') return 'Террасная';
      if (rType === 'shed') return 'Атриум-скос';
    }
    if (isSlumShack) {
      if (rType === 'shed') return 'Шиферный скат';
      if (rType === 'flat') return 'Настил и бак';
      if (rType === 'stepped') return 'Ярусная хижина';
    }
    if (isFactory) {
      if (rType === 'stepped') return 'Шедовая (пила)';
      if (rType === 'gable') return 'Фонарь-двускат';
      if (rType === 'flat') return 'Плоская цеховая';
    }
    if (isBlastFurnace) {
      if (rType === 'stepped') return 'Копёр и свечи';
      if (rType === 'gable') return 'Шатёр колошника';
      if (rType === 'flat') return 'Открытая домна';
    }
    if (isParkPavilion) {
      if (rType === 'hip') return 'Шатровая';
      if (rType === 'stepped') return 'Купол и фонарь';
      if (rType === 'flat') return 'Пергола и крыло';
    }
    if (isVilla) {
      if (rType === 'hip') return 'Черепичная';
      if (rType === 'flat') return 'Модерн-кантилевер';
      if (rType === 'stepped') return 'Террасная вилла';
    }
    if (isStadium) {
      if (rType === 'stepped') return 'Кольцо-навес';
      if (rType === 'flat') return 'Две трибуны';
      if (rType === 'hip') return 'Крытая арена';
    }
    if (isParkingBooth) {
      if (rType === 'flat') return 'Козырёк + шлагбаум';
      if (rType === 'hip') return 'Шатровая будка';
      if (rType === 'stepped') return 'Навес над полосой';
    }
    if (isSportsGround) {
      if (rType === 'flat') return 'Стритбол / Корт';
      if (rType === 'stepped') return 'Мини-футбол + баскет';
      if (rType === 'gable') return 'Крытый корт-навес';
    }
    if (isEarly20c) {
      if (rType === 'hip') return 'Шатровая + парапет';
      if (rType === 'mansard') return 'Мансарда нач. XX в.';
      if (rType === 'gable') return 'Фронтон + щипец';
    }
    if (isAcademic) {
      if (rType === 'hip') return 'Классика с портиком';
      if (rType === 'flat') return 'Академ-модерн';
      if (rType === 'gable') return 'Кампус-фронтон';
    }
    if (isMarket) {
      if (rType === 'gable') return 'Базилика и фонарь';
      if (rType === 'hip') return 'Шатёр-ярмарка';
      if (rType === 'flat') return 'Модерн-галерея';
    }
    if (isMarketRow) {
      if (rType === 'shed') return 'Торговые киоски';
      if (rType === 'gable') return 'Ряд с навесом';
      if (rType === 'flat') return 'Фуд-корт / ларьки';
    }
    if (isMall) {
      if (rType === 'flat') return 'Световой фонарь';
      if (rType === 'stepped') return 'Террасный молл';
      if (rType === 'gable') return 'Волновой атриум';
    }
    if (isWarehouse) {
      if (rType === 'flat') return 'Мембрана + люки';
      if (rType === 'gable') return 'Двускатный ангар';
      if (rType === 'shed') return 'Односкатный склад';
    }
    if (isSkyscraper && rType === 'shed') return 'Скос короны';
    return ROOF_TYPE_LABELS[rType];
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Left: 24 Architectural style archetypes */}
      <div className="lg:col-span-7">
        <span className="mb-1.5 block text-xs font-semibold text-slate-800">
          Архитектурный стиль
        </span>
        <div className="grid max-h-[234px] grid-cols-2 gap-1 overflow-y-auto pr-0.5 sm:grid-cols-3 lg:grid-cols-4">
          {STYLE_LIST.map((style) => {
            const active = style.id === styleId;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onSelectStyle(style.id)}
                className={`flex flex-col items-start rounded-lg border px-2 py-0.5 text-left transition-colors ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                }`}
              >
                <span className="w-full truncate text-xs font-semibold leading-snug">
                  {style.name}
                </span>
                <span
                  className={`w-full truncate text-[10.5px] leading-tight ${
                    active ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {style.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Middle: Roof shape & Overhang */}
      <div className="flex flex-col justify-between gap-2.5 lg:col-span-2">
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-800">
            {isMegabuilding
              ? 'Корона мегаблока'
              : isSkyscraper
                ? 'Завершение башни'
                : isOfficeBuilding
                  ? 'Кровля здания'
                  : isSlumShack
                    ? 'Крыша постройки'
                    : isFactory
                      ? 'Кровля цеха'
                      : isBlastFurnace
                        ? 'Верх домны'
                        : isParkPavilion
                          ? 'Кровля беседки'
                          : isVilla
                            ? 'Кровля виллы'
                            : isStadium
                              ? 'Кровля арены'
                            : isParkingBooth
                                ? 'Конструкция КПП'
                                : isSportsGround
                                  ? 'Формат площадки'
                                  : isMarket
                                    ? 'Кровля рынка'
                                    : isMarketRow
                                      ? 'Формат рядов'
                                      : isMall
                                        ? 'Кровля молла'
                                        : isWarehouse
                                          ? 'Кровля склада'
                                          : isAcademic
                                            ? 'Завершение корпуса'
                                            : 'Форма кровли'}
          </span>
          <div role="group" aria-label="Форма кровли" className="grid grid-cols-1 gap-1.5">
            {activeStyle.supportedRoofTypes.map((rType: RoofTypeId) => {
              const active = features.roofType === rType;
              const label = getRoofOptionLabel(rType);
              return (
                <button
                  key={rType}
                  type="button"
                  onClick={() => onChangeFeatures({ roofType: rType })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className={`flex flex-col gap-1 ${
            isSovietPanel || isSkyscraper || isMegabuilding ? 'opacity-45' : ''
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="roof-overhang" className="font-medium text-slate-700">
              {isOfficeBuilding
                ? 'Карниз крыши'
                : isStadium
                  ? 'Вылет навеса'
                  : isSportsGround
                    ? 'Бровка поля'
                    : 'Свес крыши'}
            </label>
            <span className="font-mono text-slate-900">{roofOverhang.toFixed(2)} м</span>
          </div>
          <input
            id="roof-overhang"
            type="range"
            min={isStadium ? 0.5 : HOUSE_CONSTRAINTS.roofOverhang.min}
            max={isStadium ? 1.8 : HOUSE_CONSTRAINTS.roofOverhang.max}
            step={HOUSE_CONSTRAINTS.roofOverhang.step}
            value={roofOverhang}
            disabled={isSovietPanel || isSkyscraper || isMegabuilding}
            onChange={(e) => onChangeOverhang(parseFloat(e.target.value))}
            className="arch-slider w-full"
          />
        </div>
      </div>

      {/* Right: Windows & Architectural Details */}
      <div className="flex flex-col justify-between gap-2.5 lg:col-span-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-700">
              {isMegabuilding
                ? 'Плотность секций'
                : isSkyscraper
                  ? 'Плотность рёбер'
                  : isOfficeBuilding
                    ? 'Шаг стоек'
                    : isSlumShack
                      ? 'Плотность окон'
                      : isFactory
                        ? 'Окна цеха'
                        : isBlastFurnace
                          ? 'Плотность труб'
                          : isParkPavilion || isVilla
                            ? 'Остекление'
                            : isParkingBooth
                              ? 'Остекление КПП'
                              : isSportsGround
                                ? 'Стойки сетки'
                                : isStadium
                                  ? 'Рёбра фасада'
                                  : isMarketRow
                                    ? 'Плотность ларьков'
                                    : isMall
                                      ? 'Витрины и экраны'
                                      : isWarehouse
                                        ? 'Число док-ворот'
                                        : isSovietPanel
                                          ? 'Секции окон'
                                          : 'Окна на фасад'}
            </span>
            <div
              role="group"
              aria-label="Количество окон на фасад"
              className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200/70 p-0.5"
            >
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChangeFeatures({ windowDensity: d })}
                  className={`rounded-md py-1 text-xs font-medium transition-colors ${
                    features.windowDensity === d
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-end gap-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="win-scale" className="font-medium text-slate-700">
                {isSportsGround
                  ? 'Размер щитов'
                  : isMarketRow || isMall
                    ? 'Размер витрин'
                    : isWarehouse
                      ? 'Высота ворот'
                      : isMegabuilding
                        ? 'Размер проёмов'
                        : isSkyscraper || isOfficeBuilding
                          ? 'Высота стекла'
                          : 'Размер окон'}
              </label>
              <span className="font-mono text-slate-900">
                {Math.round(features.windowScale * 100)}%
              </span>
            </div>
            <input
              id="win-scale"
              type="range"
              min={HOUSE_CONSTRAINTS.windowScale.min}
              max={HOUSE_CONSTRAINTS.windowScale.max}
              step={HOUSE_CONSTRAINTS.windowScale.step}
              value={features.windowScale}
              onChange={(e) => onChangeFeatures({ windowScale: parseFloat(e.target.value) })}
              className="arch-slider w-full"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700">
            <input
              type="checkbox"
              checked={features.hasPorch}
              onChange={(e) => onChangeFeatures({ hasPorch: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
            />
            <span>
              {isMegabuilding
                ? 'Трасса-стилобат'
                : isOfficeBuilding
                  ? 'Входная группа'
                  : isSlumShack
                    ? 'Навес и лестница'
                    : isFactory
                      ? 'Рампа и ворота'
                      : isBlastFurnace
                        ? 'Литейный двор'
                        : isParkPavilion
                          ? 'Ступени и фонари'
                          : isVilla
                            ? 'Бассейн и терраса'
                            : isStadium
                              ? 'Стилобат и входы'
                              : isParkingBooth
                                ? 'Островок и терминал'
                                : isSportsGround
                                  ? 'Трибуны и скамьи'
                                  : isEarly20c
                                    ? 'Парадное с козырьком'
                                    : isAcademic
                                      ? 'Портик с колоннами'
                                        : isMarket
                                          ? 'Уличные прилавки'
                                          : isMarketRow
                                            ? 'Прилавки и ящики'
                                            : isMall
                                              ? 'Козырёк и площадь'
                                              : isWarehouse
                                                ? 'Рампа и отбойники'
                                                : isSkyscraper
                                                  ? 'Стилобат'
                                                  : isSovietPanel
                                                    ? 'Козырьки'
                                                    : 'Крыльцо'}
            </span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700">
            <input
              type="checkbox"
              checked={features.hasChimney}
              onChange={(e) => onChangeFeatures({ hasChimney: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
            />
            <span>
              {isMegabuilding
                ? 'Вышка связи'
                : isOfficeBuilding
                  ? 'Техблок крыши'
                  : isSlumShack
                    ? 'Бак и трубы'
                    : isFactory || isBlastFurnace
                      ? 'Дымовая труба'
                      : isParkPavilion
                        ? 'Шпиль и фонарь'
                        : isVilla
                          ? 'Каминная башня'
                          : isStadium
                            ? 'Прожекторы и мачты'
                            : isParkingBooth
                              ? 'Мигалка и сплит-блок'
                              : isSportsGround
                                ? 'Мачты освещения'
                                : isEarly20c
                                  ? 'Печные трубы'
                                  : isAcademic
                                    ? 'Башенка с часами'
                                    : isMarket
                                      ? 'Вывеска и фонарь'
                                      : isMarketRow
                                        ? 'Вытяжки и трубы'
                                        : isMall
                                          ? 'Фанкойлы и пилон'
                                          : isWarehouse
                                            ? 'Вентиляция крыши'
                                            : isSkyscraper
                                              ? 'Шпиль'
                                              : isSovietPanel
                                                ? 'Надстройки'
                                                : 'Дымоход'}
            </span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700">
            <input
              type="checkbox"
              checked={features.hasCornerAccents}
              onChange={(e) => onChangeFeatures({ hasCornerAccents: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
            />
            <span>
              {isMegabuilding
                ? 'Неон и вывески'
                : isSlumShack
                  ? 'Заплатки и блоки'
                  : isFactory
                    ? 'Силосы и трубы'
                    : isBlastFurnace
                      ? 'Цистерны и обвязка'
                      : isParkPavilion
                        ? 'Вазоны и решётки'
                        : isVilla
                          ? 'Ламели и перголы'
                          : isStadium
                            ? 'Медиафасад и рёбра'
                            : isParkingBooth
                              ? 'Болларды и знаки'
                              : isSportsGround
                                ? 'Воркаут и табло'
                                : isEarly20c
                                  ? 'Руст и пилястры'
                                  : isAcademic
                                    ? 'Пилястры корпуса'
                                    : isMarket
                                      ? 'Контрфорсы и пилястры'
                                      : isMarketRow
                                        ? 'Вывески и рольставни'
                                        : isMall
                                          ? 'Медиа-лайтбоксы'
                                          : isWarehouse
                                            ? 'Болларды и полоса'
                                            : isSkyscraper || isOfficeBuilding
                                              ? 'Рёбра фасада'
                                              : isSovietPanel
                                                ? 'Швы панелей'
                                                : 'Пилястры'}
            </span>
          </label>
          {(floors >= 2 || isParkPavilion || isStadium || isParkingBooth || isSportsGround || isMarket || isMarketRow || isMall || isWarehouse) && features.roofType !== 'aframe' && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700">
              <input
                type="checkbox"
                checked={features.hasBalcony}
                onChange={(e) => onChangeFeatures({ hasBalcony: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
              />
              <span>
                {isMegabuilding
                  ? 'Жилые капсулы'
                  : isOfficeBuilding
                    ? 'Ламели / террасы'
                    : isSlumShack
                      ? 'Настил и перила'
                      : isFactory || isBlastFurnace
                        ? 'Галереи и трапы'
                        : isParkPavilion
                          ? 'Балюстрада'
                          : isVilla
                            ? 'Террасы и балконы'
                            : isStadium
                              ? 'Ограждения ярусов'
                              : isParkingBooth
                                ? 'Поднять шлагбаум'
                                : isSportsGround
                                  ? 'Глухая сетка спереди'
                                  : isEarly20c
                                    ? 'Кованый балкон'
                                    : isAcademic
                                      ? 'Парапет крыши'
                                      : isMarket
                                        ? 'Боковые навесы'
                                        : isMarketRow
                                          ? 'Козырёк променада'
                                          : isMall
                                            ? 'Терраса фуд-корта'
                                            : isWarehouse
                                              ? 'Погрузочный навес'
                                              : isSkyscraper
                                                ? 'Террасы'
                                                : isSovietPanel
                                                  ? 'Балконы'
                                                  : 'Балкон'}
              </span>
            </label>
          )}
          {features.roofType === 'mansard' && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700">
              <input
                type="checkbox"
                checked={features.hasDormers}
                onChange={(e) => onChangeFeatures({ hasDormers: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
              />
              <span>Люкарны</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
