import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EngineAudio } from '../audio/engineAudio';
import { SurfaceType } from '../game/trackData';
import {
  CameraMode,
  createInitialVehicleState,
  DrivingMode,
  stepVehiclePhysics,
  VehicleInput,
  VehicleState,
} from '../game/vehiclePhysics';
import { buildCarRig } from '../three/carBuilder';
import { createTireSmokePool } from '../three/particles';
import { createProceduralTextures } from '../three/proceduralTextures';
import { buildWorldRig } from '../three/worldBuilder';

export type GamePhase = 'title' | 'playing' | 'paused';

export interface TelemetrySnapshot {
  speedKmh: number;
  rpm: number;
  gear: number;
  surface: SurfaceType;
  lap: number;
  lapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  driftScore: number;
  activeDriftPoints: number;
  absActive: boolean;
  tcsActive: boolean;
  x: number;
  z: number;
  yaw: number;
  grounded: boolean;
}

export interface TouchInputState {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

interface DrivingCanvasProps {
  gamePhase: GamePhase;
  cameraMode: CameraMode;
  drivingMode: DrivingMode;
  paintHex: string;
  muted: boolean;
  resetSignal: number;
  touchInputRef: React.MutableRefObject<TouchInputState>;
  onTelemetry: (snap: TelemetrySnapshot) => void;
  onToggleCamera: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onTriggerReset: () => void;
  onToggleDock: () => void;
}

// Pre-allocated scratch math objects (zero GC in animation loop)
const _camPosTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _camCurrentLook = new THREE.Vector3();
const _headWorldPos = new THREE.Vector3();
const _headWorldQuat = new THREE.Quaternion();
const _forwardVec = new THREE.Vector3();
const _rightVec = new THREE.Vector3();
const _upVec = new THREE.Vector3();
const _lookMat = new THREE.Matrix4();
const _targetQuat = new THREE.Quaternion();
const _smokePos = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export function DrivingCanvas({
  gamePhase,
  cameraMode,
  drivingMode,
  paintHex,
  muted,
  resetSignal,
  touchInputRef,
  onTelemetry,
  onToggleCamera,
  onTogglePause,
  onToggleMute,
  onTriggerReset,
  onToggleDock,
}: DrivingCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store reactive props in refs so WebGLRenderer mounts once and never tears down on UI updates
  const phaseRef = useRef(gamePhase);
  const cameraModeRef = useRef(cameraMode);
  const drivingModeRef = useRef(drivingMode);
  const paintHexRef = useRef(paintHex);
  const mutedRef = useRef(muted);
  const callbacksRef = useRef({
    onTelemetry,
    onToggleCamera,
    onTogglePause,
    onToggleMute,
    onTriggerReset,
    onToggleDock,
  });

  phaseRef.current = gamePhase;
  cameraModeRef.current = cameraMode;
  drivingModeRef.current = drivingMode;
  paintHexRef.current = paintHex;
  mutedRef.current = muted;
  callbacksRef.current = {
    onTelemetry,
    onToggleCamera,
    onTogglePause,
    onToggleMute,
    onTriggerReset,
    onToggleDock,
  };

  const resetReqRef = useRef(resetSignal);
  const carPaintSetterRef = useRef<((hex: string) => void) | null>(null);
  const audioRef = useRef<EngineAudio | null>(null);
  const vehicleStateRef = useRef<VehicleState>(createInitialVehicleState());

  useEffect(() => {
    carPaintSetterRef.current?.(paintHex);
  }, [paintHex]);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (resetSignal !== resetReqRef.current) {
      resetReqRef.current = resetSignal;
      vehicleStateRef.current = createInitialVehicleState();
    }
  }, [resetSignal]);

  useEffect(() => {
    if (gamePhase === 'playing') {
      audioRef.current?.unlock();
    }
  }, [gamePhase]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('data-testid', 'driving-canvas');

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0xc2d8eb);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(skyColor.getHex(), 0.0032);

    const camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.12,
      550
    );

    // Mandatory Studio PBR Reflections (RoomEnvironment + PMREMGenerator) on every device
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Warm directional sunlight + cool hemisphere sky/ground fill
    const hemiLight = new THREE.HemisphereLight(0xcbe4ff, 0x3b4934, 0.72);
    hemiLight.position.set(0, 60, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.15);
    sunLight.position.set(45, 65, 35);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.025;
    const d = 38;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 165;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Build textures, world, car, and smoke particle pool
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAniso);
    const world = buildWorldRig(textures);
    scene.add(world.group);

    const car = buildCarRig(textures, isSoftwareGl, paintHexRef.current);
    carPaintSetterRef.current = car.setPaintColor;
    scene.add(car.root);

    const smoke = createTireSmokePool();
    scene.add(smoke.mesh);

    const audio = new EngineAudio();
    audio.setMuted(mutedRef.current);
    audioRef.current = audio;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Input Hub
    const keysDown = new Set<string>();
    const clearInputs = () => keysDown.clear();

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        if (phaseRef.current === 'playing') {
          e.preventDefault();
        }
      }

      if (!e.repeat) {
        if (phaseRef.current === 'playing') {
          if (code === 'KeyC') callbacksRef.current.onToggleCamera();
          else if (code === 'KeyR') callbacksRef.current.onTriggerReset();
          else if (code === 'KeyM') callbacksRef.current.onToggleMute();
          else if (code === 'KeyH') callbacksRef.current.onToggleDock();
          else if (code === 'Escape' || code === 'KeyP') callbacksRef.current.onTogglePause();
        } else if (phaseRef.current === 'paused') {
          if (code === 'Escape' || code === 'KeyP') callbacksRef.current.onTogglePause();
        }
      }
      keysDown.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // ResizeObserver for crisp full-bleed viewport sizing
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(1, Math.floor(entry.contentRect.width));
      const h = Math.max(1, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(container);

    // WebGL context safety
    let contextLost = false;
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // Initialize camera behind spawn car
    const initCar = vehicleStateRef.current;
    camera.position.set(initCar.x + 5.5, initCar.y + 2.3, initCar.z + 7.2);
    _camCurrentLook.set(initCar.x, initCar.y + 0.8, initCar.z - 4);
    camera.lookAt(_camCurrentLook);

    let disposed = false;
    let frameId = 0;
    let lastTime = performance.now();
    let titleOrbitAngle = 0.65;
    let telemetryTimer = 0;
    let prevPhase: GamePhase = phaseRef.current;
    let prevCamMode: CameraMode = cameraModeRef.current;
    let smokeTimer = 0;
    let trauma = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function readPlayerInput(): VehicleInput {
      const t = touchInputRef.current;
      const up = keysDown.has('KeyW') || keysDown.has('ArrowUp') || t.throttle;
      const down = keysDown.has('KeyS') || keysDown.has('ArrowDown') || t.brake;
      const left = keysDown.has('KeyA') || keysDown.has('ArrowLeft') || t.left;
      const right = keysDown.has('KeyD') || keysDown.has('ArrowRight') || t.right;
      const handbrake = keysDown.has('Space') || t.handbrake;

      return {
        throttle: up ? 1 : 0,
        brake: down ? 1 : 0,
        steer: (left ? 1 : 0) - (right ? 1 : 0),
        handbrake,
      };
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const rawDt = Math.max(0.001, (now - lastTime) / 1000);
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const phase = phaseRef.current;
      const camMode = cameraModeRef.current;
      const st = vehicleStateRef.current;

      // Reset camera smoothing on mode/phase cut so 1st/3rd person transition is crisp
      if (phase !== prevPhase) {
        if (phase === 'playing') {
          clearInputs();
          // Place chase cam directly behind car on Start transition
          const sinY = Math.sin(st.yaw);
          const cosY = Math.cos(st.yaw);
          camera.position.set(st.x + sinY * 6.2, st.y + 2.4, st.z + cosY * 6.2);
          _camCurrentLook.set(st.x - sinY * 5.0, st.y + 0.9, st.z - cosY * 5.0);
        }
        prevPhase = phase;
      }
      if (camMode !== prevCamMode) {
        prevCamMode = camMode;
      }

      let activeInput: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
      if (phase === 'playing') {
        activeInput = readPlayerInput();
        stepVehiclePhysics(st, activeInput, drivingModeRef.current, dt);
      }

      // Sync car & cones 3D transforms
      car.updateVisuals({
        x: st.x,
        y: st.y,
        z: st.z,
        yaw: st.yaw,
        pitch: st.pitch,
        roll: st.roll,
        steerAngle: st.steerAngle,
        wheelSpin: st.wheelSpin,
        wheelCompressions: st.wheelCompressions,
        braking: st.brakingLights,
        reversing: st.reversingLights,
        grounded: st.grounded,
      });
      car.root.updateMatrixWorld(true);
      world.syncCones(st.cones);

      // Keep tight shadow frustum centered around player car
      if (!isSoftwareGl) {
        sunLight.position.set(st.x + 36, st.y + 52, st.z + 28);
        sunLight.target.position.set(st.x, st.y, st.z);
        sunLight.target.updateMatrixWorld();
      }

      // Tire smoke emission during rear slip or hard lockup
      if (phase === 'playing' && st.grounded && st.speedKmh > 14 && st.rearSlip > 0.36) {
        smokeTimer += dt;
        if (smokeTimer > 0.032) {
          smokeTimer = 0;
          const sinY = Math.sin(st.yaw);
          const cosY = Math.cos(st.yaw);
          // Rear left & rear right wheel world contact points
          _smokePos.set(st.x - cosY * 0.78 + sinY * 1.4, st.y, st.z + sinY * 0.78 + cosY * 1.4);
          smoke.emit(_smokePos.x, _smokePos.y, _smokePos.z, st.vx, st.vz, st.rearSlip);
          _smokePos.set(st.x + cosY * 0.78 + sinY * 1.4, st.y, st.z - sinY * 0.78 + cosY * 1.4);
          smoke.emit(_smokePos.x, _smokePos.y, _smokePos.z, st.vx, st.vz, st.rearSlip);
        }
      }
      smoke.update(phase === 'paused' ? 0 : dt);

      // Update procedural engine/tire audio
      audio.update({
        playing: phase === 'playing',
        rpm: st.rpm,
        throttle: activeInput.throttle,
        rearSlip: st.rearSlip,
        speedKmh: st.speedKmh,
        impactIntensity: st.impactIntensity,
      });

      // Trauma shake decay
      trauma = Math.max(trauma, st.impactIntensity * 0.65);
      trauma = Math.max(0, trauma - dt * 1.9);
      const shake = trauma * trauma;

      // Camera Choreography
      if (phase === 'title') {
        titleOrbitAngle += dt * 0.22;
        const r = 7.4;
        _camPosTarget.set(
          st.x + Math.sin(titleOrbitAngle) * r,
          st.y + 2.05 + Math.sin(titleOrbitAngle * 0.7) * 0.25,
          st.z + Math.cos(titleOrbitAngle) * r
        );
        camera.position.lerp(_camPosTarget, 1 - Math.exp(-5 * dt));
        // Bias look target slightly toward camera's left so car sits clearly to the right of the left title panel
        const camLeftX = -Math.cos(titleOrbitAngle) * 1.45;
        const camLeftZ = Math.sin(titleOrbitAngle) * 1.45;
        _camLookTarget.set(st.x + camLeftX, st.y + 0.75, st.z + camLeftZ - 0.3);
        _camCurrentLook.lerp(_camLookTarget, 1 - Math.exp(-6 * dt));
        camera.lookAt(_camCurrentLook);
        if (Math.abs(camera.fov - 52) > 0.1) {
          camera.fov = THREE.MathUtils.damp(camera.fov, 52, 5, dt);
          camera.updateProjectionMatrix();
        }
      } else if (camMode === 'first_person') {
        // Locked cleanly inside cockpit driver eye position (follows car suspension pitch/roll)
        car.cockpitHeadAnchor.getWorldPosition(_headWorldPos);
        car.cockpitHeadAnchor.getWorldQuaternion(_headWorldQuat);

        camera.position.copy(_headWorldPos);
        // Subtle head look-into-turn + G-force shake
        _forwardVec.set(0, 0, -1).applyQuaternion(_headWorldQuat);
        _upVec.set(0, 1, 0).applyQuaternion(_headWorldQuat);
        // Slight look into corner based on steerAngle
        const lookBiasX = -st.steerAngle * 0.28;
        _camLookTarget
          .copy(_headWorldPos)
          .addScaledVector(_forwardVec, 12)
          .addScaledVector(
            _rightVec.set(1, 0, 0).applyQuaternion(_headWorldQuat),
            lookBiasX * 12
          );
        _camLookTarget.y -= 0.45;
        _lookMat.lookAt(camera.position, _camLookTarget, _upVec);
        _targetQuat.setFromRotationMatrix(_lookMat);
        camera.quaternion.copy(_targetQuat);

        if (shake > 0.001) {
          camera.rotation.z += (Math.random() - 0.5) * shake * 0.05;
          camera.rotation.x += (Math.random() - 0.5) * shake * 0.04;
        }
        const targetFov = 68 + Math.min(8, st.speedKmh * 0.045);
        if (Math.abs(camera.fov - targetFov) > 0.08) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 7, dt);
          camera.updateProjectionMatrix();
        }
      } else if (camMode === 'hood') {
        car.hoodCamAnchor.getWorldPosition(_headWorldPos);
        car.hoodCamAnchor.getWorldQuaternion(_headWorldQuat);
        camera.position.copy(_headWorldPos);
        _forwardVec.set(0, 0, -1).applyQuaternion(_headWorldQuat);
        _upVec.set(0, 1, 0).applyQuaternion(_headWorldQuat);
        _camLookTarget.copy(_headWorldPos).addScaledVector(_forwardVec, 16);
        _camLookTarget.y -= 0.3;
        _lookMat.lookAt(camera.position, _camLookTarget, _upVec);
        camera.quaternion.setFromRotationMatrix(_lookMat);

        const targetFov = 66 + Math.min(10, st.speedKmh * 0.055);
        if (Math.abs(camera.fov - targetFov) > 0.08) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 7, dt);
          camera.updateProjectionMatrix();
        }
      } else {
        // 3rd-Person Chase Cam with exponential damping + speed-based pull & FOV
        const sinY = Math.sin(st.yaw);
        const cosY = Math.cos(st.yaw);
        const speedNorm = Math.min(1, st.speedKmh / 180);
        const distBack = 5.6 + speedNorm * 1.15;
        const heightUp = 2.18 + speedNorm * 0.35;

        // Slightly shift camera laterally opposite steer for cinematic apex visibility
        const latShift = -st.steerAngle * 0.75;
        _camPosTarget.set(
          st.x + sinY * distBack + cosY * latShift,
          st.y + heightUp,
          st.z + cosY * distBack - sinY * latShift
        );

        const posLambda = 1 - Math.exp(-8.5 * dt);
        camera.position.lerp(_camPosTarget, posLambda);
        if (camera.position.y < st.y + 0.85) {
          camera.position.y = st.y + 0.85;
        }

        _camLookTarget.set(
          st.x - sinY * 4.8,
          st.y + 0.88,
          st.z - cosY * 4.8
        );
        _camCurrentLook.lerp(_camLookTarget, 1 - Math.exp(-12.5 * dt));
        camera.lookAt(_camCurrentLook);

        if (shake > 0.001) {
          camera.rotation.z += (Math.random() - 0.5) * shake * 0.06;
          camera.rotation.x += (Math.random() - 0.5) * shake * 0.04;
        }

        const targetFov = 60 + speedNorm * 13;
        if (Math.abs(camera.fov - targetFov) > 0.08) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
          camera.updateProjectionMatrix();
        }
      }

      if (!contextLost) {
        renderer.render(scene, camera);
      }

      // Throttle React telemetry HUD updates to ~15Hz
      telemetryTimer += dt;
      if (telemetryTimer >= 0.065) {
        telemetryTimer = 0;
        callbacksRef.current.onTelemetry({
          speedKmh: Math.round(st.speedKmh),
          rpm: Math.round(st.rpm),
          gear: st.gear,
          surface: st.surface,
          lap: st.lap,
          lapTime: st.lapTime,
          bestLapTime: st.bestLapTime,
          lastLapTime: st.lastLapTime,
          driftScore: st.driftScore,
          activeDriftPoints: Math.round(st.activeDriftPoints),
          absActive: st.absActive,
          tcsActive: st.tcsActive,
          x: st.x,
          z: st.z,
          yaw: st.yaw,
          grounded: st.grounded,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      // Render first frame immediately so first paint is crisp, then pace via afterDraw
      renderer.render(scene, camera);
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      car.dispose();
      world.dispose();
      smoke.dispose();
      textures.dispose();
      envRT.dispose();
      audio.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [touchInputRef]);

  return <div ref={mountRef} className="fixed inset-0 w-full h-full overflow-hidden" />;
}
