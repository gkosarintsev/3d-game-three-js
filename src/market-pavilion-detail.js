import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Рыночный павильон» (docs/houses2 market-pavilion).
 * Только картинка — коллизии/навигация остаются у данных здания.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor() {
    this.buckets = {
      wall: [], roof: [], trim: [], door: [], foundation: [], stoneStep: [],
      glass: [], glassBacking: [], metalAccent: [], timberAccent: [],
      awningRed: [], awningAmber: [], lanternGlow: [],
    };
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
    this.mat4 = new THREE.Matrix4(); this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion(); this.scale = new THREE.Vector3(); this.euler = new THREE.Euler();
  }
  addBox(bucket, w, h, d, x, y, z, rx=0, ry=0, rz=0) {
    const g = this.unitBox.clone().toNonIndexed();
    this.pos.set(x,y,z); this.euler.set(rx,ry,rz); this.quat.setFromEuler(this.euler);
    this.scale.set(w,h,d); this.mat4.compose(this.pos,this.quat,this.scale); g.applyMatrix4(this.mat4);
    this.buckets[bucket].push(g);
  }
  addCylinder(bucket, rb, rt, h, x, y, z, rx=0, ry=0, rz=0) {
    const uni = Math.abs(rb-rt)<1e-4;
    const g = uni ? this.unitCyl.clone().toNonIndexed() : new THREE.CylinderGeometry(rt,rb,1,14).toNonIndexed();
    this.pos.set(x,y,z); this.euler.set(rx,ry,rz); this.quat.setFromEuler(this.euler);
    this.scale.set(uni?rb:1,h,uni?rb:1); this.mat4.compose(this.pos,this.quat,this.scale); g.applyMatrix4(this.mat4);
    this.buckets[bucket].push(g);
  }
  addGeometry(bucket, raw, x, y, z) {
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    raw.dispose?.();
    if (x||y||z) g.translate(x,y,z);
    this.buckets[bucket].push(g);
  }
  buildMeshes(materials) {
    this.unitBox.dispose(); this.unitCyl.dispose();
    const meshes = [];
    for (const [key, geos] of Object.entries(this.buckets)) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[key] || materials.wall);
      mesh.name = `MarketPavilion_${key}`;
      mesh.castShadow = key !== 'glass' && key !== 'lanternGlow';
      mesh.receiveShadow = key !== 'glass' && key !== 'lanternGlow';
      meshes.push(mesh);
    }
    return meshes;
  }
}

function hipRoof(spanX, spanZ, riseH) {
  const hx=spanX/2,hz=spanZ/2, ridgeAlongX=spanX>=spanZ;
  const ridgeLen=Math.max(0.4, Math.abs(spanX-spanZ)*0.55);
  const rx=ridgeAlongX?ridgeLen/2:0, rz=ridgeAlongX?0:ridgeLen/2;
  const p0=[-hx,0,hz],p1=[hx,0,hz],p2=[hx,0,-hz],p3=[-hx,0,-hz];
  const r0=ridgeAlongX?[-rx,riseH,0]:[0,riseH,-rz], r1=ridgeAlongX?[rx,riseH,0]:[0,riseH,rz];
  const pos=[], uvs=[];
  const tri=(a,b,c)=>{pos.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]); uvs.push(a[0]*0.4,a[2]*0.4,b[0]*0.4,b[2]*0.4,c[0]*0.4,c[2]*0.4);};
  if(ridgeAlongX){tri(p0,p1,r1);tri(p0,r1,r0);tri(p2,p3,r0);tri(p2,r0,r1);tri(p1,p2,r1);tri(p3,p0,r0);} 
  else {tri(p1,p2,r0);tri(p1,r0,r1);tri(p3,p0,r1);tri(p3,r1,r0);tri(p0,p1,r1);tri(p2,p3,r0);} 
  tri(p0,p3,p2); tri(p0,p2,p1);
  const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2)); g.computeVertexNormals(); return g;
}
function gableGeo(spanX, spanZ, riseH){
  const s=new THREE.Shape(); s.moveTo(-spanX/2,0); s.lineTo(spanX/2,0); s.lineTo(0,riseH); s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:spanZ,bevelEnabled:false}); g.translate(0,0,-spanZ/2); return g;
}

export function buildDetailedMarketPavilion(config, materials) {
  const width=config.width, depth=config.depth, floorHeight=config.floorHeight;
  const foundationHeight=config.foundationHeight ?? 0.5;
  const roofPitchDeg=config.roofPitchDeg ?? 22;
  const roofOverhang=config.roofOverhang ?? 0.7;
  const roofType=config.roofType ?? 'hip';
  const windowDensity=config.windowDensity ?? 2;
  const windowScale=config.windowScale ?? 1.1;
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const hasBalcony=config.hasBalcony !== false;

  const batch=new Batcher();
  const baseY=0;
  const totalH=floorHeight;
  const topY=baseY+totalH;
  const hw=width/2, hd=depth/2;

  // Plinth
  batch.addBox('foundation', width+0.6, foundationHeight*0.7, depth+0.6, 0, foundationHeight*0.35, 0);
  batch.addBox('stoneStep', width+0.8, foundationHeight*0.3, depth+0.8, 0, foundationHeight*0.85, 0);

  // Shell
  batch.addBox('wall', width, totalH, depth, 0, baseY + totalH/2, 0);

  // Arcade openings on front and sides
  const bays=Math.max(3, Math.round(width/3.2));
  const bayW=(width-1.2)/bays;
  const archH=totalH*0.78;
  for(let i=0;i<bays;i++){
    const bx=-hw + 0.6 + bayW*(i+0.5);
    // represent opening as dark backing + glazing strip (visual)
    batch.addBox('glassBacking', bayW*0.78, archH, 0.08, bx, baseY+archH/2, hd+0.02);
    batch.addBox('glass', bayW*0.7, archH*0.92, 0.04, bx, baseY+archH/2, hd+0.06);
    batch.addBox('trim', 0.12, archH, 0.1, bx-bayW*0.39, baseY+archH/2, hd+0.04);
    batch.addBox('trim', 0.12, archH, 0.1, bx+bayW*0.39, baseY+archH/2, hd+0.04);
  }
  // Side bays
  const sideBays=Math.max(2, Math.round(depth/3.4));
  for(const sx of [-1,1]){
    for(let i=0;i<sideBays;i++){
      const bz=-hd + 0.8 + ((depth-1.6)/sideBays)*(i+0.5);
      batch.addBox('glassBacking', 0.08, archH*0.9, (depth-1.6)/sideBays*0.72, sx*(hw+0.02), baseY+archH*0.45, bz);
      batch.addBox('glass', 0.04, archH*0.82, (depth-1.6)/sideBays*0.64, sx*(hw+0.06), baseY+archH*0.45, bz);
    }
  }

  // Canopy awnings
  if (hasPorch) {
    const awD=Math.min(1.8, 1.1 + roofOverhang*0.6);
    const awY=baseY + totalH*0.72;
    for(let i=0;i<bays;i++){
      const bx=-hw + 0.6 + bayW*(i+0.5);
      const matKey = (i%2===0)?'awningRed':'awningAmber';
      batch.addBox(matKey, bayW*0.86, 0.08, awD, bx, awY, hd + awD/2, 0.22, 0, 0);
      batch.addBox('timberAccent', bayW*0.86, 0.14, 0.06, bx, awY-0.05, hd + awD*0.92);
    }
  }

  // Timber framing accents
  if (hasCornerAccents) {
    for(const sx of [-1,1]) for(const sz of [-1,1]) batch.addBox('timberAccent', 0.22, totalH, 0.22, sx*(hw-0.12), baseY+totalH/2, sz*(hd-0.12));
    const posts = Math.max(4,bays+1);
    for(let i=0;i<posts;i++){
      const px=-hw + 0.6 + (bayW*bays)*(i/(posts-1));
      batch.addBox('timberAccent', 0.14, totalH, 0.14, px, baseY+totalH/2, hd-0.1);
    }
  }

  // Lanterns / signs
  if (hasChimney) {
    for(let i=0;i<bays;i+=Math.max(1,Math.floor(bays/3))){
      const bx=-hw + 0.6 + bayW*(i+0.5);
      batch.addCylinder('lanternGlow', 0.08, 0.1, 0.18, bx, baseY+totalH*0.78, hd+0.35);
    }
  }

  // Roof
  const roofW=width + roofOverhang*2;
  const roofD=depth + roofOverhang*2;
  const rad=(roofPitchDeg*Math.PI)/180;
  if (roofType === 'gable') {
    const rise=Math.max(1.2, Math.tan(rad)*(depth/2));
    const g=gableGeo(roofD, roofW, rise); g.rotateY(Math.PI/2);
    batch.addGeometry('roof', g, 0, topY, 0);
  } else if (roofType === 'flat') {
    batch.addBox('roof', roofW, 0.22, roofD, 0, topY+0.11, 0);
  } else {
    const rise=Math.max(1.1, Math.tan(rad)*(Math.min(width,depth)/2)*0.85);
    batch.addGeometry('roof', hipRoof(roofW, roofD, rise), 0, topY, 0);
  }

  return batch.buildMeshes(materials);
}

export function makeMarketPavilionMaterials(wallColorHex = '#d8c8ad') {
  const mk=(c,r=0.8,m=0.05,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return {
    wall: mk(new THREE.Color(wallColorHex), 0.82, 0.03),
    roof: mk(0x6b4a3a, 0.72, 0.08),
    trim: mk(0xf0e6d5, 0.5, 0.08),
    door: mk(0x5a3a24, 0.5, 0.06),
    foundation: mk(0x7b8087, 0.86, 0.04),
    stoneStep: mk(0xa0a6ad, 0.76, 0.05),
    glass: new THREE.MeshPhysicalMaterial({color:0x9dbbc9,transparent:true,opacity:0.38,roughness:0.06,metalness:0,transmission:0.15}),
    glassBacking: mk(0x10161f,0.9,0),
    metalAccent: mk(0x50565d,0.45,0.5),
    timberAccent: mk(0x7a5435,0.7,0.04),
    awningRed: mk(0xb9382c,0.86,0.02),
    awningAmber: mk(0xd97706,0.86,0.02),
    lanternGlow: mk(0xffe8b5,0.4,0,{emissive:0xf59e0b,emissiveIntensity:0.7}),
  };
}
