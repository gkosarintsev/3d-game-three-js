import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Складской хаб» (docs/houses2 warehouse).
 * Только картинка — коллизии/навигация остаются у данных здания.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor() {
    this.buckets = {
      wall: [], roof: [], trim: [], door: [], foundation: [], stoneStep: [],
      glass: [], glassBacking: [], metalAccent: [], timberAccent: [],
      safetyYellow: [], rubberBlack: [], accentBlue: [],
    };
    this.unitBox = new THREE.BoxGeometry(1,1,1);
    this.unitCyl = new THREE.CylinderGeometry(1,1,1,12);
    this.mat4 = new THREE.Matrix4(); this.pos=new THREE.Vector3(); this.quat=new THREE.Quaternion(); this.scale=new THREE.Vector3(); this.euler=new THREE.Euler();
  }
  addBox(b,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.unitBox.clone().toNonIndexed(); this.pos.set(x,y,z); this.euler.set(rx,ry,rz); this.quat.setFromEuler(this.euler); this.scale.set(w,h,d); this.mat4.compose(this.pos,this.quat,this.scale); g.applyMatrix4(this.mat4); this.buckets[b].push(g);} 
  addCylinder(b,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.unitCyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,12).toNonIndexed(); this.pos.set(x,y,z); this.euler.set(rx,ry,rz); this.quat.setFromEuler(this.euler); this.scale.set(u?rb:1,h,u?rb:1); this.mat4.compose(this.pos,this.quat,this.scale); g.applyMatrix4(this.mat4); this.buckets[b].push(g);} 
  addGeometry(b,raw,x,y,z){const g=raw.index?raw.toNonIndexed():raw.clone(); raw.dispose?.(); if(x||y||z) g.translate(x,y,z); this.buckets[b].push(g);} 
  buildMeshes(materials){this.unitBox.dispose(); this.unitCyl.dispose(); const meshes=[]; for(const [k,geos] of Object.entries(this.buckets)){ if(!geos.length) continue; const m=mergeGeometries(geos,false); for(const g of geos) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, materials[k]||materials.wall); mesh.name=`Warehouse_${k}`; mesh.castShadow=k!=='glass'; mesh.receiveShadow=k!=='glass'; meshes.push(mesh);} return meshes;} 
}
function shedGeo(spanZ,spanX,rise){const s=new THREE.Shape(); s.moveTo(-spanZ/2,0); s.lineTo(spanZ/2,0); s.lineTo(spanZ/2,rise); s.lineTo(-spanZ/2,rise*0.12); s.closePath(); const g=new THREE.ExtrudeGeometry(s,{depth:spanX,bevelEnabled:false}); g.translate(0,0,-spanX/2); g.rotateY(Math.PI/2); return g;}
function gableGeo(spanZ,spanX,rise){const s=new THREE.Shape(); s.moveTo(-spanZ/2,0); s.lineTo(spanZ/2,0); s.lineTo(0,rise); s.closePath(); const g=new THREE.ExtrudeGeometry(s,{depth:spanX,bevelEnabled:false}); g.translate(0,0,-spanX/2); g.rotateY(Math.PI/2); return g;}

export function buildDetailedWarehouse(config, materials){
  const width=config.width, depth=config.depth, floors=config.floors||1, floorHeight=config.floorHeight||5.0;
  const foundationHeight=config.foundationHeight ?? 0.45;
  const roofPitchDeg=config.roofPitchDeg ?? 18;
  const roofOverhang=config.roofOverhang ?? 0.6;
  const roofType=config.roofType ?? 'shed';
  const windowDensity=config.windowDensity ?? 2;
  const windowScale=config.windowScale ?? 1.0;
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const hasBalcony=config.hasBalcony !== false;

  const b=new Batcher();
  const wallH=floors*floorHeight; const baseY=0; const roofY=baseY+wallH; const pitch=(roofPitchDeg*Math.PI)/180;

  b.addBox('foundation', width+0.6, foundationHeight, depth+0.6, 0, foundationHeight/2, 0);
  b.addBox('stoneStep', width+0.8, 0.14, depth+0.8, 0, foundationHeight-0.07, 0);
  b.addBox('wall', width, wallH, depth, 0, baseY+wallH/2, 0);

  const officeW=Math.max(6.8, Math.min(width*0.22,11.0));
  const officeD=Math.min(6.4, depth*0.32);
  const officeH=Math.min(wallH*0.84,6.2);
  const officeX=-width/2 + officeW/2 - 0.2;
  const officeZ=depth/2 + officeD*0.36;
  b.addBox('foundation', officeW+0.4, foundationHeight, officeD+0.4, officeX, foundationHeight/2, officeZ);
  b.addBox('stoneStep', officeW, officeH, officeD, officeX, baseY+officeH/2, officeZ);
  b.addBox('accentBlue', officeW+0.24, 0.28, officeD+0.24, officeX, baseY+officeH+0.14, officeZ);
  const offFrontZ=officeZ + officeD/2;
  const offGlassW=officeW*0.72;
  b.addBox('glassBacking', offGlassW, 1.35, 0.06, officeX, baseY+officeH*0.72, offFrontZ+0.03);
  b.addBox('glass', offGlassW, 1.35, 0.04, officeX, baseY+officeH*0.72, offFrontZ+0.065);
  b.addBox('door', 1.2, 2.25, 0.07, officeX-officeW*0.26, baseY+1.125, offFrontZ+0.04);

  const dockStartX=-width/2 + officeW + 1.6;
  const dockEndX=width/2 - 1.6;
  const dockSpanW=Math.max(6.0, dockEndX-dockStartX);
  const bayCount=Math.max(3, Math.min(10, Math.round(dockSpanW/(windowDensity===1?5.6:windowDensity===2?4.3:3.4))));
  const baySpacing=dockSpanW/bayCount;
  const doorW=Math.min(3.0, baySpacing*0.68);
  const doorH=Math.min(wallH*0.68, Math.max(3.2, 3.9*windowScale));
  const frontZ=depth/2;
  for(let i=0;i<bayCount;i++){
    const bx=dockStartX + baySpacing*(i+0.5);
    b.addBox('rubberBlack', doorW+0.44, doorH+0.3, 0.26, bx, baseY+doorH/2+0.12, frontZ+0.08);
    b.addBox('stoneStep', doorW, doorH, 0.08, bx, baseY+doorH/2, frontZ+0.12);
    for(let s=1;s<5;s++) b.addBox('trim', doorW-0.12, 0.06, 0.05, bx, baseY + (s/5)*doorH, frontZ+0.17);
    b.addBox('glassBacking', doorW*0.26, 0.34, 0.03, bx-doorW*0.2, baseY+doorH*0.68, frontZ+0.17);
    b.addBox('glass', doorW*0.26, 0.34, 0.03, bx-doorW*0.2, baseY+doorH*0.68, frontZ+0.195);
    b.addBox('glassBacking', doorW*0.26, 0.34, 0.03, bx+doorW*0.2, baseY+doorH*0.68, frontZ+0.17);
    b.addBox('glass', doorW*0.26, 0.34, 0.03, bx+doorW*0.2, baseY+doorH*0.68, frontZ+0.195);
    if (hasCornerAccents){
      b.addBox('safetyYellow', 0.55, 0.28, 0.12, bx, baseY+doorH+0.48, frontZ+0.14);
      b.addCylinder('safetyYellow', 0.09,0.09,1.05, bx-doorW/2-0.26, 0.525, frontZ+1.55);
      b.addCylinder('safetyYellow', 0.09,0.09,1.05, bx+doorW/2+0.26, 0.525, frontZ+1.55);
    }
  }

  const clereH=Math.min(1.35*windowScale, wallH*0.22);
  const clereY=roofY - clereH*0.9 - 0.45;
  const clereW=dockSpanW*0.86;
  const clereX=(dockStartX+dockEndX)/2;
  b.addBox('trim', clereW+0.2, clereH+0.14, 0.06, clereX, clereY, frontZ+0.03);
  b.addBox('glassBacking', clereW, clereH, 0.04, clereX, clereY, frontZ+0.06);
  b.addBox('glass', clereW, clereH, 0.03, clereX, clereY, frontZ+0.088);
  b.addBox('trim', width*0.78+0.2, clereH+0.14, 0.06, 0, clereY, -depth/2-0.03);
  b.addBox('glassBacking', width*0.78, clereH, 0.04, 0, clereY, -depth/2-0.06);
  b.addBox('glass', width*0.78, clereH, 0.03, 0, clereY, -depth/2-0.088);

  if (hasCornerAccents){
    b.addBox('accentBlue', width+0.22, 0.42, depth+0.22, 0, roofY-0.26, 0);
  }

  if (hasPorch){
    const dockPlatformD=2.2, dockPlatformW=dockSpanW+1.6;
    const dockPlatformX=(dockStartX+dockEndX)/2, dockPlatformZ=frontZ + dockPlatformD/2;
    b.addBox('foundation', dockPlatformW, foundationHeight*0.85, dockPlatformD, dockPlatformX, foundationHeight*0.425, dockPlatformZ);
    b.addBox('stoneStep', dockPlatformW+0.15, 0.16, dockPlatformD+0.15, dockPlatformX, foundationHeight-0.08, dockPlatformZ);
    const rampW=3.6, rampX=dockPlatformX + dockPlatformW/2 + rampW/2 - 0.2;
    const rampAngle=Math.atan2(foundationHeight, rampW);
    b.addBox('stoneStep', rampW, 0.18, dockPlatformD, rampX, foundationHeight*0.46, dockPlatformZ, 0,0,-rampAngle);
    b.addBox('safetyYellow', dockPlatformW, 0.09, 0.14, dockPlatformX, foundationHeight+0.01, frontZ+dockPlatformD-0.06);
  }
  if (hasBalcony){
    const canopyD=Math.max(2.2, 1.8 + roofOverhang*1.4), canopyW=dockSpanW+1.2;
    const canopyX=(dockStartX+dockEndX)/2, canopyY=baseY+doorH+0.85, canopyZ=frontZ + canopyD/2;
    b.addBox('roof', canopyW, 0.18, canopyD, canopyX, canopyY, canopyZ, 0.08,0,0);
  }

  if (roofType === 'flat'){
    b.addBox('roof', width+0.25, 0.2, depth+0.25, 0, roofY+0.1, 0);
  } else if (roofType === 'gable'){
    const rise=Math.max(1.4, Math.tan(pitch)*(depth*0.48));
    b.addGeometry('roof', gableGeo(depth+roofOverhang*1.4, width+roofOverhang*0.8, rise), 0, roofY, 0);
  } else {
    const rise=Math.max(1.2, Math.tan(pitch)*(depth*0.62));
    b.addGeometry('roof', shedGeo(depth+roofOverhang*1.2, width+roofOverhang*0.8, rise), 0, roofY, 0);
  }

  if (hasChimney){
    const rBase=roofType==='flat'?roofY+0.2:roofY+0.85;
    for(const hx of [-width*0.26, width*0.24]) b.addBox('stoneStep', 3.0, 0.75, 2.0, hx, rBase+0.375, -depth*0.18);
  }

  return b.buildMeshes(materials);
}

export function makeWarehouseMaterials(wallColorHex = '#b8c0c8'){
  const mk=(c,r=0.8,m=0.05,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return {
    wall: mk(new THREE.Color(wallColorHex),0.78,0.04),
    roof: mk(0x6b7280,0.7,0.18),
    trim: mk(0xd1d5db,0.5,0.2),
    door: mk(0x4b5563,0.55,0.25),
    foundation: mk(0x7b8087,0.88,0.03),
    stoneStep: mk(0x9aa0a6,0.8,0.04),
    glass: new THREE.MeshPhysicalMaterial({color:0xa8c4d8,transparent:true,opacity:0.35,roughness:0.06,metalness:0,transmission:0.15}),
    glassBacking: mk(0x10161f,0.9,0),
    metalAccent: mk(0x5b6470,0.45,0.55),
    timberAccent: mk(0x7a5435,0.7,0.04),
    safetyYellow: mk(0xeab308,0.42,0.18),
    rubberBlack: mk(0x1f2937,0.88,0.04),
    accentBlue: mk(0x2563eb,0.45,0.25),
  };
}
