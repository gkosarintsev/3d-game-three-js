import { useCallback, useEffect, useRef, useState } from 'react';
import { DrivingCanvas, GamePhase, TelemetrySnapshot, TouchInputState } from './components/DrivingCanvas';
import { GameHud } from './components/GameHud';
import { TitleOverlay } from './components/TitleOverlay';
import { INITIAL_SPAWN } from './game/trackData';
import { CameraMode, DrivingMode } from './game/vehiclePhysics';
import { CAR_PAINT_SWATCHES } from './three/carBuilder';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  speedKmh: 0,
  rpm: 900,
  gear: 1,
  surface: 'asphalt',
  lap: 1,
  lapTime: 0,
  bestLapTime: null,
  lastLapTime: null,
  driftScore: 0,
  activeDriftPoints: 0,
  absActive: false,
  tcsActive: false,
  x: INITIAL_SPAWN.x,
  z: INITIAL_SPAWN.z,
  yaw: INITIAL_SPAWN.yaw,
  grounded: true,
};

function hasAutostartFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

export default function App() {
  const [gamePhase, setGamePhase] = useState<GamePhase>(() =>
    hasAutostartFlag() ? 'playing' : 'title'
  );
  const [cameraMode, setCameraMode] = useState<CameraMode>('third_person');
  const [drivingMode, setDrivingMode] = useState<DrivingMode>('sport');
  const [paintHex, setPaintHex] = useState<string>(CAR_PAINT_SWATCHES[0].hex);
  const [muted, setMuted] = useState(false);
  const [dockExpanded, setDockExpanded] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);

  const touchInputRef = useRef<TouchInputState>({
    throttle: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
  });

  // Mirror game state to document.body.dataset.state for deterministic verification
  useEffect(() => {
    document.body.dataset.state = gamePhase;
  }, [gamePhase]);

  useEffect(() => {
    document.body.dataset.camera = cameraMode;
  }, [cameraMode]);

  const handleStart = useCallback(() => {
    setGamePhase('playing');
  }, []);

  // Enter / Space starts from Title screen
  useEffect(() => {
    if (gamePhase !== 'title') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gamePhase, handleStart]);

  const handleToggleCamera = useCallback(() => {
    setCameraMode((prev) => {
      if (prev === 'third_person') return 'first_person';
      if (prev === 'first_person') return 'hood';
      return 'third_person';
    });
  }, []);

  const handleTogglePause = useCallback(() => {
    setGamePhase((prev) => {
      if (prev === 'playing') return 'paused';
      if (prev === 'paused') return 'playing';
      return prev;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const handleTriggerReset = useCallback(() => {
    setResetSignal((n) => n + 1);
  }, []);

  const handleToggleDock = useCallback(() => {
    setDockExpanded((d) => !d);
  }, []);

  const handleExitToTitle = useCallback(() => {
    setResetSignal((n) => n + 1);
    setGamePhase('title');
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0d1014]">
      <DrivingCanvas
        gamePhase={gamePhase}
        cameraMode={cameraMode}
        drivingMode={drivingMode}
        paintHex={paintHex}
        muted={muted}
        resetSignal={resetSignal}
        touchInputRef={touchInputRef}
        onTelemetry={setTelemetry}
        onToggleCamera={handleToggleCamera}
        onTogglePause={handleTogglePause}
        onToggleMute={handleToggleMute}
        onTriggerReset={handleTriggerReset}
        onToggleDock={handleToggleDock}
      />

      {gamePhase === 'title' && <TitleOverlay onStart={handleStart} />}

      {gamePhase !== 'title' && (
        <GameHud
          gamePhase={gamePhase}
          telemetry={telemetry}
          cameraMode={cameraMode}
          drivingMode={drivingMode}
          paintHex={paintHex}
          muted={muted}
          dockExpanded={dockExpanded}
          touchInputRef={touchInputRef}
          onSelectCamera={setCameraMode}
          onSelectDrivingMode={setDrivingMode}
          onSelectPaint={setPaintHex}
          onToggleDock={handleToggleDock}
          onToggleMute={handleToggleMute}
          onResetCar={handleTriggerReset}
          onTogglePause={handleTogglePause}
          onExitToTitle={handleExitToTitle}
        />
      )}
    </main>
  );
}
