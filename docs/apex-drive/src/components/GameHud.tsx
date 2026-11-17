import { Volume2, VolumeX, RotateCcw, Pause, ChevronDown, ChevronUp } from 'lucide-react';
import { CameraMode, DrivingMode } from '../game/vehiclePhysics';
import { CAR_PAINT_SWATCHES } from '../three/carBuilder';
import { GamePhase, TelemetrySnapshot, TouchInputState } from './DrivingCanvas';
import { TrackMinimap } from './TrackMinimap';

interface GameHudProps {
  gamePhase: GamePhase;
  telemetry: TelemetrySnapshot;
  cameraMode: CameraMode;
  drivingMode: DrivingMode;
  paintHex: string;
  muted: boolean;
  dockExpanded: boolean;
  touchInputRef: React.MutableRefObject<TouchInputState>;
  onSelectCamera: (mode: CameraMode) => void;
  onSelectDrivingMode: (mode: DrivingMode) => void;
  onSelectPaint: (hex: string) => void;
  onToggleDock: () => void;
  onToggleMute: () => void;
  onResetCar: () => void;
  onTogglePause: () => void;
  onExitToTitle: () => void;
}

function formatTime(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '--:--.-';
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  const s = Math.floor(rem);
  const tenths = Math.floor((rem - s) * 10);
  return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

const SURFACE_LABELS: Record<TelemetrySnapshot['surface'], string> = {
  asphalt: 'Асфальт',
  curb: 'Поребрик',
  grass: 'Грунт',
  ramp: 'Трамплин',
};

const CAMERA_LABELS: { id: CameraMode; label: string }[] = [
  { id: 'third_person', label: '3-е лицо' },
  { id: 'first_person', label: '1-е лицо' },
  { id: 'hood', label: 'Капот' },
];

const MODE_LABELS: { id: DrivingMode; label: string }[] = [
  { id: 'sport', label: 'Спорт' },
  { id: 'drift', label: 'Дрифт' },
  { id: 'track', label: 'Трек' },
];

export function GameHud({
  gamePhase,
  telemetry,
  cameraMode,
  drivingMode,
  paintHex,
  muted,
  dockExpanded,
  touchInputRef,
  onSelectCamera,
  onSelectDrivingMode,
  onSelectPaint,
  onToggleDock,
  onToggleMute,
  onResetCar,
  onTogglePause,
  onExitToTitle,
}: GameHudProps) {
  const rpmPct = Math.min(100, Math.max(0, (telemetry.rpm / 7400) * 100));
  const isRedline = telemetry.rpm > 6350;
  const gearLabel = telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : String(telemetry.gear);

  const setTouch = (key: keyof TouchInputState, val: boolean) => {
    touchInputRef.current[key] = val;
  };

  return (
    <>
      {gamePhase === 'playing' && (
        <div className="fixed inset-0 z-10 pointer-events-none">
          {/* Top-Left: Minimap + Lap & Drift Timing */}
          <div
            className="absolute top-3 left-3 md:top-4 md:left-4 pointer-events-auto flex items-center gap-2.5 md:gap-3.5 px-2.5 py-2 md:px-3.5 md:py-2.5 rounded-xl border border-white/10"
            style={{ backgroundColor: 'rgba(13, 16, 20, 0.84)' }}
          >
            <TrackMinimap carX={telemetry.x} carZ={telemetry.z} carYaw={telemetry.yaw} />
            <div className="flex flex-col gap-0.5 md:gap-1 pr-0.5">
              <div className="flex items-baseline gap-1.5 text-[11px] md:text-xs text-slate-400 whitespace-nowrap">
                <span>Круг {telemetry.lap}</span>
                <span aria-hidden="true">·</span>
                <span>{SURFACE_LABELS[telemetry.surface]}</span>
              </div>
              <div className="font-mono-num text-base md:text-xl font-bold text-white leading-tight">
                {formatTime(telemetry.lapTime)}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] md:text-xs text-slate-300 font-mono-num whitespace-nowrap">
                <span className="text-slate-400">Лучшее</span>
                <span>{formatTime(telemetry.bestLapTime)}</span>
              </div>
              {(telemetry.driftScore > 0 || telemetry.activeDriftPoints > 0) && (
                <div className="text-xs font-mono-num text-amber-400 font-semibold">
                  Дрифт: {telemetry.driftScore + telemetry.activeDriftPoints}
                </div>
              )}
            </div>
          </div>

          {/* Top-Right: Utility Icon Buttons */}
          <div className="absolute top-4 right-4 pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Включить звук [M]' : 'Выключить звук [M]'}
              title={muted ? 'Включить звук [M]' : 'Выключить звук [M]'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-10 h-10 rounded-lg border border-white/12 flex items-center justify-center text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.84)' }}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Сбросить автомобиль [R]"
              title="Сбросить автомобиль [R]"
              onClick={(e) => {
                e.currentTarget.blur();
                onResetCar();
              }}
              className="w-10 h-10 rounded-lg border border-white/12 flex items-center justify-center text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.84)' }}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Пауза [P / Esc]"
              title="Пауза [P / Esc]"
              onClick={(e) => {
                e.currentTarget.blur();
                onTogglePause();
              }}
              className="w-10 h-10 rounded-lg border border-white/12 flex items-center justify-center text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.84)' }}
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>

          {/* Speedometer, Gear & RPM (top-right below utility bar on mobile, bottom-right on desktop) */}
          <div
            className="absolute top-16 right-3 md:top-auto md:bottom-4 md:right-4 pointer-events-none px-3 py-2 md:px-4 md:py-3 rounded-xl border border-white/10 min-w-[144px] md:min-w-[184px]"
            style={{ backgroundColor: 'rgba(13, 16, 20, 0.86)' }}
          >
            <div className="flex items-end justify-between gap-3 md:gap-4">
              <div>
                <div className="text-[10px] md:text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  КМ/Ч
                </div>
                <div
                  data-testid="hud-speed"
                  className="font-mono-num text-2xl md:text-4xl font-bold text-white leading-none mt-0.5"
                >
                  {telemetry.speedKmh}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] md:text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Пер.
                </div>
                <div
                  data-testid="hud-gear"
                  className="font-display text-2xl md:text-3xl font-bold text-amber-400 leading-none mt-0.5"
                >
                  {gearLabel}
                </div>
              </div>
            </div>

            {/* RPM Gauge Bar */}
            <div className="mt-2.5 h-2 w-full rounded-sm bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-colors duration-100 ${
                  isRedline ? 'bg-red-500' : 'bg-amber-400'
                }`}
                style={{ width: `${rpmPct.toFixed(1)}%` }}
              />
            </div>

            <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono-num text-slate-400">
              <span>{telemetry.rpm} об/м</span>
              <div className="flex items-center gap-2">
                {telemetry.absActive && <span className="text-amber-400 font-bold">ABS</span>}
                {telemetry.tcsActive && <span className="text-sky-400 font-bold">TCS</span>}
                {!telemetry.grounded && <span className="text-amber-300 font-bold">ПРЫЖОК</span>}
              </div>
            </div>
          </div>

          {/* Bottom-Center: Collapsible Control Dock (no backdrop-filter over WebGL) */}
          <div className="hidden md:flex fixed bottom-4 left-1/2 -translate-x-1/2 flex-col items-center pointer-events-auto max-w-[94vw]">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleDock();
              }}
              className="px-3 py-1 rounded-t-lg border border-b-0 border-white/12 text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.90)' }}
            >
              {dockExpanded ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Скрыть [H]</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Панель [H]</span>
                </>
              )}
            </button>

            {dockExpanded && (
              <div
                className="flex items-center gap-3 px-3.5 py-2 rounded-xl border border-white/12 shadow-xl"
                style={{ backgroundColor: 'rgba(13, 16, 20, 0.90)' }}
              >
                {/* Camera Perspective Switcher */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900/90 border border-white/5">
                  {CAMERA_LABELS.map((cam) => {
                    const active = cameraMode === cam.id;
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectCamera(cam.id);
                        }}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-amber-400 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {cam.label}
                      </button>
                    );
                  })}
                </div>

                <div className="h-5 w-px bg-white/12" aria-hidden="true" />

                {/* Physics / Handling Mode Switcher */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900/90 border border-white/5">
                  {MODE_LABELS.map((m) => {
                    const active = drivingMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectDrivingMode(m.id);
                        }}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-slate-100 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                <div className="h-5 w-px bg-white/12" aria-hidden="true" />

                {/* Paint Swatches */}
                <div className="flex items-center gap-1.5" role="group" aria-label="Цвет кузова">
                  {CAR_PAINT_SWATCHES.map((sw) => {
                    const selected = paintHex === sw.hex;
                    return (
                      <button
                        key={sw.id}
                        type="button"
                        tabIndex={-1}
                        aria-label={`Цвет: ${sw.label}`}
                        title={sw.label}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectPaint(sw.hex);
                        }}
                        className={`w-6 h-6 rounded-md border transition-transform cursor-pointer ${
                          selected ? 'border-white scale-110' : 'border-white/25 hover:scale-105'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Mobile Touch Controls (< 768px only) */}
          <div className="md:hidden fixed bottom-4 left-3 flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              aria-label="Поворот влево"
              onPointerDown={() => setTouch('left', true)}
              onPointerUp={() => setTouch('left', false)}
              onPointerCancel={() => setTouch('left', false)}
              onPointerLeave={() => setTouch('left', false)}
              className="w-11 h-11 rounded-lg border border-white/15 text-white font-bold text-base active:bg-amber-400 active:text-slate-950"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.85)' }}
            >
              ◀
            </button>
            <button
              type="button"
              aria-label="Поворот вправо"
              onPointerDown={() => setTouch('right', true)}
              onPointerUp={() => setTouch('right', false)}
              onPointerCancel={() => setTouch('right', false)}
              onPointerLeave={() => setTouch('right', false)}
              className="w-11 h-11 rounded-lg border border-white/15 text-white font-bold text-base active:bg-amber-400 active:text-slate-950"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.85)' }}
            >
              ▶
            </button>
            <button
              type="button"
              aria-label="Сменить камеру"
              onClick={() =>
                onSelectCamera(cameraMode === 'third_person' ? 'first_person' : 'third_person')
              }
              className="px-2.5 h-11 rounded-lg border border-white/15 text-xs font-semibold text-white whitespace-nowrap"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.85)' }}
            >
              {cameraMode === 'first_person' ? '1-е лицо' : '3-е лицо'}
            </button>
          </div>
          <div className="md:hidden fixed bottom-4 right-3 flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              aria-label="Тормоз / Задний ход"
              onPointerDown={() => setTouch('brake', true)}
              onPointerUp={() => setTouch('brake', false)}
              onPointerCancel={() => setTouch('brake', false)}
              onPointerLeave={() => setTouch('brake', false)}
              className="px-3.5 h-11 rounded-lg border border-red-400/40 text-xs font-semibold text-red-200 active:bg-red-500 active:text-white whitespace-nowrap"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.85)' }}
            >
              Тормоз
            </button>
            <button
              type="button"
              aria-label="Газ"
              onPointerDown={() => setTouch('throttle', true)}
              onPointerUp={() => setTouch('throttle', false)}
              onPointerCancel={() => setTouch('throttle', false)}
              onPointerLeave={() => setTouch('throttle', false)}
              className="px-4 h-11 rounded-lg border border-amber-400/50 text-xs font-semibold text-amber-300 active:bg-amber-400 active:text-slate-950 whitespace-nowrap"
              style={{ backgroundColor: 'rgba(13, 16, 20, 0.85)' }}
            >
              Газ
            </button>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {gamePhase === 'paused' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(8, 10, 14, 0.72)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
            className="w-full max-w-sm p-6 rounded-xl border border-white/12 shadow-2xl"
            style={{ backgroundColor: 'rgba(16, 20, 26, 0.96)' }}
          >
            <h2 id="pause-title" className="font-display text-3xl font-bold text-white tracking-tight">
              ПАУЗА
            </h2>
            <p className="text-xs text-slate-400 mt-1">Текущая сессия на автодроме</p>

            <div className="grid grid-cols-3 gap-3 my-5 py-4 border-y border-white/10">
              <div>
                <div className="text-[11px] text-slate-400">Круг</div>
                <div className="font-mono-num text-lg font-bold text-white">{telemetry.lap}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Лучший</div>
                <div className="font-mono-num text-lg font-bold text-white">
                  {formatTime(telemetry.bestLapTime)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Дрифт</div>
                <div className="font-mono-num text-lg font-bold text-amber-400">
                  {telemetry.driftScore}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
              >
                Продолжить
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetCar();
                  onTogglePause();
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
              >
                Сбросить автомобиль
              </button>
              <button
                type="button"
                onClick={onExitToTitle}
                className="w-full py-2.5 px-4 rounded-lg border border-white/12 hover:bg-slate-800/70 text-slate-300 font-medium text-sm transition-colors cursor-pointer"
              >
                В главное меню
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
