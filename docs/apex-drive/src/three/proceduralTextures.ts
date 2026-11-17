import * as THREE from 'three';

export interface ProceduralTextures {
  asphaltMap: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  curbMap: THREE.CanvasTexture;
  startLineMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  gaugeClusterMap: THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  const created: THREE.Texture[] = [];
  const register = (tex: THREE.CanvasTexture, srgb: boolean, repeatX = 1, repeatY = 1) => {
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = Math.min(8, maxAnisotropy);
    tex.needsUpdate = true;
    created.push(tex);
    return tex;
  };

  // 1. Asphalt Albedo & Bump
  const aspCanvas = document.createElement('canvas');
  aspCanvas.width = 512;
  aspCanvas.height = 512;
  const actx = aspCanvas.getContext('2d')!;
  actx.fillStyle = '#2b2f36';
  actx.fillRect(0, 0, 512, 512);

  // Subtle tire-wear tracks & aggregate speckle
  const imgData = actx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % 512;
    const py = Math.floor(i / 4 / 512);
    const grain = (Math.sin(px * 12.9898 + py * 78.233) * 43758.5453) % 1;
    const n = (grain < 0 ? grain + 1 : grain) * 18 - 9;
    // Slight darker racing line groove in middle-left and middle-right
    const u = px / 512;
    const groove = Math.exp(-Math.pow((u - 0.36) * 8, 2)) + Math.exp(-Math.pow((u - 0.64) * 8, 2));
    const shade = -groove * 6 + n;
    data[i] = Math.max(0, Math.min(255, 45 + shade));
    data[i + 1] = Math.max(0, Math.min(255, 49 + shade));
    data[i + 2] = Math.max(0, Math.min(255, 56 + shade));
    data[i + 3] = 255;
  }
  actx.putImageData(imgData, 0, 0);

  // Crisp edge white lane lines + faint dashed centerline
  actx.fillStyle = '#d8dee6';
  actx.fillRect(14, 0, 10, 512);
  actx.fillRect(488, 0, 10, 512);
  actx.fillStyle = 'rgba(220, 226, 232, 0.35)';
  actx.fillRect(253, 24, 6, 180);
  actx.fillRect(253, 280, 6, 180);

  const asphaltMap = register(new THREE.CanvasTexture(aspCanvas), true, 1, 1);

  // Bump map
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bctx = bumpCanvas.getContext('2d')!;
  const bData = bctx.createImageData(256, 256);
  for (let i = 0; i < bData.data.length; i += 4) {
    const px = (i / 4) % 256;
    const py = Math.floor(i / 4 / 256);
    const grain = Math.abs((Math.sin(px * 91.7 + py * 37.3) * 19381.17) % 1);
    const v = Math.floor(100 + grain * 110);
    bData.data[i] = v;
    bData.data[i + 1] = v;
    bData.data[i + 2] = v;
    bData.data[i + 3] = 255;
  }
  bctx.putImageData(bData, 0, 0);
  const asphaltBump = register(new THREE.CanvasTexture(bumpCanvas), false, 1, 1);

  // 2. FIA Red & White Curb texture
  const curbCanvas = document.createElement('canvas');
  curbCanvas.width = 128;
  curbCanvas.height = 256;
  const cctx = curbCanvas.getContext('2d')!;
  cctx.fillStyle = '#d93829';
  cctx.fillRect(0, 0, 128, 128);
  cctx.fillStyle = '#eef1f5';
  cctx.fillRect(0, 128, 128, 128);
  const curbMap = register(new THREE.CanvasTexture(curbCanvas), true, 1, 1);

  // 3. Checkered Start/Finish Line
  const startCanvas = document.createElement('canvas');
  startCanvas.width = 512;
  startCanvas.height = 128;
  const sctx = startCanvas.getContext('2d')!;
  const cols = 16;
  const rows = 4;
  const cw = 512 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sctx.fillStyle = (r + c) % 2 === 0 ? '#f1f5f9' : '#181c22';
      sctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const startLineMap = register(new THREE.CanvasTexture(startCanvas), true, 1, 1);
  startLineMap.wrapS = THREE.ClampToEdgeWrapping;
  startLineMap.wrapT = THREE.ClampToEdgeWrapping;

  // 4. Soft Radial Contact Shadow Disc
  const shadCanvas = document.createElement('canvas');
  shadCanvas.width = 256;
  shadCanvas.height = 256;
  const shctx = shadCanvas.getContext('2d')!;
  const grad = shctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0, 'rgba(6, 8, 12, 0.85)');
  grad.addColorStop(0.55, 'rgba(8, 10, 14, 0.45)');
  grad.addColorStop(1, 'rgba(8, 10, 14, 0)');
  shctx.fillStyle = grad;
  shctx.fillRect(0, 0, 256, 256);
  const contactShadowMap = register(new THREE.CanvasTexture(shadCanvas), true, 1, 1);
  contactShadowMap.wrapS = THREE.ClampToEdgeWrapping;
  contactShadowMap.wrapT = THREE.ClampToEdgeWrapping;

  // 5. Cockpit Gauge Cluster (Tachometer + Speedometer + Gear Display)
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 512;
  gCanvas.height = 192;
  const gctx = gCanvas.getContext('2d')!;
  gctx.fillStyle = '#0d1117';
  gctx.fillRect(0, 0, 512, 192);

  const drawDial = (cx: number, cy: number, r: number, redZoneStart: number) => {
    gctx.strokeStyle = '#334155';
    gctx.lineWidth = 4;
    gctx.beginPath();
    gctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    gctx.stroke();

    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
      const isRed = i >= redZoneStart;
      gctx.strokeStyle = isRed ? '#ef4444' : '#e2e8f0';
      gctx.lineWidth = 3;
      gctx.beginPath();
      gctx.moveTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
      gctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
      gctx.stroke();
    }
  };
  drawDial(132, 102, 68, 6);
  drawDial(380, 102, 68, 99);

  // Center telemetry strip
  gctx.fillStyle = '#141b24';
  gctx.fillRect(216, 44, 80, 104);
  gctx.strokeStyle = '#38bdf8';
  gctx.lineWidth = 2;
  gctx.strokeRect(216, 44, 80, 104);
  gctx.fillStyle = '#38bdf8';
  gctx.font = 'bold 16px monospace';
  gctx.textAlign = 'center';
  gctx.fillText('SPORT', 256, 74);
  gctx.fillStyle = '#f8fafc';
  gctx.font = 'bold 34px monospace';
  gctx.fillText('APEX', 256, 118);

  const gaugeClusterMap = register(new THREE.CanvasTexture(gCanvas), true, 1, 1);
  gaugeClusterMap.wrapS = THREE.ClampToEdgeWrapping;
  gaugeClusterMap.wrapT = THREE.ClampToEdgeWrapping;

  // 6. Natural Terrain Grass Texture (organic mottled turf, zero periodic stripes)
  const grCanvas = document.createElement('canvas');
  grCanvas.width = 256;
  grCanvas.height = 256;
  const grctx = grCanvas.getContext('2d')!;
  const grData = grctx.createImageData(256, 256);
  for (let i = 0; i < grData.data.length; i += 4) {
    const px = (i / 4) % 256;
    const py = Math.floor(i / 4 / 256);
    const hash = Math.abs((Math.sin(px * 12.9898 + py * 78.233) * 43758.5453) % 1);
    const broad = Math.sin(px * 0.049) * Math.sin(py * 0.049) * 8;
    const n = (hash - 0.5) * 16 + broad;
    grData.data[i] = Math.max(0, Math.min(255, 74 + n));
    grData.data[i + 1] = Math.max(0, Math.min(255, 108 + n * 1.05));
    grData.data[i + 2] = Math.max(0, Math.min(255, 62 + n * 0.7));
    grData.data[i + 3] = 255;
  }
  grctx.putImageData(grData, 0, 0);
  const grassMap = register(new THREE.CanvasTexture(grCanvas), true, 44, 44);

  return {
    asphaltMap,
    asphaltBump,
    curbMap,
    startLineMap,
    contactShadowMap,
    gaugeClusterMap,
    grassMap,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
