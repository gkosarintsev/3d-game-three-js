import { useMemo } from 'react';
import { TRACK_SAMPLES } from '../game/trackData';

interface TrackMinimapProps {
  carX: number;
  carZ: number;
  carYaw: number;
}

const SIZE = 104;
const PAD = 10;

export function TrackMinimap({ carX, carZ, carYaw }: TrackMinimapProps) {
  const { pathD, startPt, project } = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of TRACK_SAMPLES) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.z < minZ) minZ = s.z;
      if (s.z > maxZ) maxZ = s.z;
    }
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const scale = (SIZE - PAD * 2) / Math.max(spanX, spanZ);
    const offX = (SIZE - spanX * scale) * 0.5 - minX * scale;
    const offY = (SIZE - spanZ * scale) * 0.5 - minZ * scale;

    const proj = (x: number, z: number): [number, number] => [x * scale + offX, z * scale + offY];

    let d = '';
    for (let i = 0; i < TRACK_SAMPLES.length; i += 2) {
      const [px, py] = proj(TRACK_SAMPLES[i].x, TRACK_SAMPLES[i].z);
      d += i === 0 ? `M${px.toFixed(1)},${py.toFixed(1)}` : ` L${px.toFixed(1)},${py.toFixed(1)}`;
    }
    d += ' Z';

    return {
      pathD: d,
      startPt: proj(0, 0),
      project: proj,
    };
  }, []);

  const [cx, cy] = project(carX, carZ);
  // yaw=0 points toward -Z (upward on map: -Y in SVG), yaw=+PI/2 points -X (left: -X in SVG)
  const deg = -(carYaw * 180) / Math.PI;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-label="Карта трассы"
      className="shrink-0 w-16 h-16 md:w-[104px] md:h-[104px]"
    >
      <path d={pathD} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="7" strokeLinejoin="round" />
      <path d={pathD} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={startPt[0]} cy={startPt[1]} r="2.8" fill="#f59e0b" />
      <g transform={`translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) rotate(${deg.toFixed(1)})`}>
        <polygon points="0,-5.5 4,4.5 0,2.5 -4,4.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="1" />
      </g>
    </svg>
  );
}
