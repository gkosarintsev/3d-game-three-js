import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Торговый молл» (docs/houses2 shopping-mall).
 * Визуал-упрощённый порт, коллизии остаются у данных здания.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.b={wall:[],roof:[],trim:[],door:[],foundation:[],stoneStep:[],glass:[],glassBacking:[],metalAccent:[],timberAccent:[],signBlue:[],signCoral:[],signAmber:[],signDark:[],foliageGreen:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,14);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.s=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(k,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(w,h,d); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addCyl(k,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,14).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addGeo(k,raw,x,y,z){const g=raw.index?raw.toNonIndexed():raw.clone(); raw.dispose?.(); if(x||y||z) g.translate(x,y,z); this.b[k].push(g);} 
  build(mats){this.box.dispose(); this.cyl.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.b)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, mats[k]||mats.wall); mesh.name=`ShoppingMall_${k}`; mesh.castShadow = k!=='glass' && k!=='signBlue' && k!=='signCoral' && k!=='signAmber'; mesh.receiveShadow = k!=='glass'; meshes.push(mesh);} return meshes;} 
}
function gable(spanZ,spanX,rise){const sh=new THREE.Shape(); sh.moveTo(-spanZ/2,0); sh.lineTo(spanZ/2,0); sh.lineTo(0,rise); sh.closePath(); const g=new THREE.ExtrudeGeometry(sh,{depth:spanX,bevelEnabled:false}); g.translate(0,0,-spanX/2); g.rotateY(Math.PI/2); return g;}

export function buildDetailedShoppingMall(config, materials){
  const width=config.width, depth=config.depth, floors=config.floors||2, floorHeight=config.floorHeight||4.8;
  const foundationHeight=config.foundationHeight ?? 0.6;
  const roofPitchDeg=config.roofPitchDeg ?? 18;
  const roofOverhang=config.roofOverhang ?? 0.8;
  const roofType=config.roofType ?? 'flat';
  const windowDensity=config.windowDensity ?? 2;
  const windowScale=config.windowScale ?? 1.1;
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const hasBalcony=config.hasBalcony !== false;

  const b=new Batcher();
  const wallH=floors*floorHeight; const baseY=0; const roofY=baseY+wallH; const pitch=(roofPitchDeg*Math.PI)/180;
  b.addBox('foundation', width+1.2, foundationHeight*0.75, depth+1.2, 0, foundationHeight*0.375, 0);
  b.addBox('stoneStep', width+1.4, foundationHeight*0.25, depth+1.4, 0, foundationHeight*0.875, 0);

  const atriumW=Math.max(10, Math.min(width*0.34, 20));
  const atriumProj=Math.min(3.8, depth*0.14);
  const atriumD=depth + atriumProj*2;
  const wingW=(width-atriumW)/2;
  // wings
  b.addBox('wall', wingW, wallH, depth, -atriumW/2-wingW/2, baseY+wallH/2, 0);
  b.addBox('wall', wingW, wallH, depth, atriumW/2+wingW/2, baseY+wallH/2, 0);
  // atrium core
  const atriumBonus=1.0;
  b.addBox('stoneStep', atriumW+0.4, wallH+atriumBonus, atriumD, 0, baseY+(wallH+atriumBonus)/2, 0);
  b.addBox('trim', atriumW+0.5, 0.4, atriumD+0.1, 0, baseY+wallH+atriumBonus+0.2, 0);

  // atrium glass front/back
  const glassW=atriumW-1.4, glassH=wallH+atriumBonus-1.0, glassY=baseY+0.4+glassH/2;
  for(const [zF,dir] of [[atriumD/2,1],[-atriumD/2,-1]]){
    b.addBox('glassBacking', glassW, glassH, 0.08, 0, glassY, zF+dir*0.03);
    b.addBox('glass', glassW, glassH, 0.05, 0, glassY, zF+dir*0.07);
    const cols=Math.max(4, Math.round(glassW/2.4)+windowDensity);
    for(let c=0;c<=cols;c++){ const mx=-glassW/2 + (c/cols)*glassW; b.addBox('metalAccent', 0.1, glassH, 0.1, mx, glassY, zF+dir*0.11); }
  }
  // entrance
  const doorBayW=Math.min(6.5, glassW*0.6), doorH=Math.min(3.2, floorHeight*0.72);
  b.addBox('signDark', doorBayW+0.3, doorH+0.2, 0.18, 0, baseY+doorH/2, atriumD/2+0.14);
  b.addBox('glass', doorBayW, doorH, 0.08, 0, baseY+doorH/2, atriumD/2+0.22);

  // wing vitrines
  const bays=Math.max(2, Math.min(5, Math.round(wingW/5.4)+(windowDensity-1)));
  for(const side of [-1,1]){
    const wc=side*(atriumW/2 + wingW/2);
    for(let i=0;i<bays;i++){
      const bx=wc - (wingW-2.4)/2 + ((wingW-2.4)/bays)*(i+0.5);
      const vw=Math.min((wingW-2.4)/bays*0.7, 3.6*windowScale), vh=Math.min(floorHeight*0.62*windowScale, floorHeight-1.0);
      b.addBox('trim', vw+0.14, vh+0.12, 0.07, bx, baseY+0.4+vh/2, depth/2+0.03);
      b.addBox('glassBacking', vw, vh, 0.04, bx, baseY+0.4+vh/2, depth/2+0.06);
      b.addBox('glass', vw, vh, 0.03, bx, baseY+0.4+vh/2, depth/2+0.09);
    }
  }

  if(hasCornerAccents){
    for(const side of [-1,1]){
      const wc=side*(atriumW/2 + wingW/2);
      b.addBox('signDark', Math.min(wingW*0.55,8.0), 1.1, 0.18, wc, baseY+wallH-floorHeight*0.45, depth/2+0.1);
      b.addBox(side<0?'signBlue':'signCoral', Math.min(wingW*0.5,7.4), 0.8, 0.08, wc, baseY+wallH-floorHeight*0.45, depth/2+0.2);
    }
    b.addBox('signDark', Math.min(atriumW*0.7,10.5), 1.2, 0.22, 0, roofY+atriumBonus+0.7, atriumD/2-0.1);
    b.addBox('signAmber', Math.min(atriumW*0.62,9.6), 0.85, 0.1, 0, roofY+atriumBonus+0.7, atriumD/2+0.03);
  }

  // Roof
  b.addBox('roof', width+0.2, 0.2, depth+0.2, 0, roofY+0.1, 0);
  if(roofType==='flat'){
    b.addBox('metalAccent', atriumW*0.62, 0.5, depth*0.8, 0, roofY+0.4, 0);
    b.addBox('glass', atriumW*0.54, 0.9, depth*0.75, 0, roofY+1.0, 0);
  } else if(roofType==='stepped'){
    b.addBox('wall', width*0.54, floorHeight*0.8, depth*0.56, 0, roofY + floorHeight*0.4, -depth*0.06);
    b.addBox('roof', width*0.54+0.4, 0.24, depth*0.56+0.4, 0, roofY + floorHeight*0.8 + 0.12, -depth*0.06);
  } else {
    const rise=Math.max(2.0, Math.tan(pitch)*(depth*0.22));
    b.addGeo('glass', gable(atriumD-0.6, atriumW*0.82, rise), 0, roofY+atriumBonus, 0);
  }

  if(hasPorch){
    const canopyD=Math.min(4.2, 3.0 + roofOverhang*1.0), canopyW=atriumW+2.4, canopyY=baseY+Math.min(3.6, floorHeight*0.75);
    b.addBox('metalAccent', canopyW, 0.22, canopyD, 0, canopyY, atriumD/2 + canopyD/2);
    b.addBox('stoneStep', canopyW+1.6, foundationHeight*0.45, 1.8, 0, foundationHeight*0.22, atriumD/2 + 1.4);
    b.addBox('stoneStep', 1.6, 0.5, 1.0, -atriumW*0.55, 0.25, atriumD/2 + canopyD + 0.8);
    b.addBox('foliageGreen', 1.3, 0.4, 0.8, -atriumW*0.55, 0.65, atriumD/2 + canopyD + 0.8);
    b.addBox('stoneStep', 1.6, 0.5, 1.0, atriumW*0.55, 0.25, atriumD/2 + canopyD + 0.8);
    b.addBox('foliageGreen', 1.3, 0.4, 0.8, atriumW*0.55, 0.65, atriumD/2 + canopyD + 0.8);
  }
  if(hasBalcony){
    b.addBox('stoneStep', atriumW*0.8, 0.22, 2.2, 0, baseY+floorHeight+0.2, atriumD/2 + 1.1);
    b.addBox('glass', atriumW*0.76, 0.9, 0.05, 0, baseY+floorHeight+0.75, atriumD/2 + 2.15);
  }
  if(hasChimney){
    for(const sx of [-1,1]) b.addBox('stoneStep', 3.0, 1.0, 2.0, sx*(atriumW/2 + wingW*0.5), roofY+0.6, -depth*0.18);
  }

  return b.build(materials);
}

export function makeShoppingMallMaterials(wallColorHex = '#d9dde3'){
  const mk=(c,r=0.7,m=0.1,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.7,0.06), roof: mk(0x6b7280,0.6,0.2), trim: mk(0xe5e7eb,0.45,0.15), door: mk(0x4b5563,0.5,0.2), foundation: mk(0x808890,0.86,0.03), stoneStep: mk(0xa8adb3,0.78,0.04), glass: new THREE.MeshPhysicalMaterial({color:0xaed6f1,transparent:true,opacity:0.36,roughness:0.05,metalness:0,transmission:0.18}), glassBacking: mk(0x10161f,0.9,0), metalAccent: mk(0x50565d,0.4,0.55), timberAccent: mk(0x7a5435,0.7,0.04), signBlue: mk(0x38bdf8,0.24,0.12,{emissive:0x0284c7,emissiveIntensity:0.8}), signCoral: mk(0xfb7185,0.24,0.12,{emissive:0xe11d48,emissiveIntensity:0.7}), signAmber: mk(0xfbbf24,0.24,0.12,{emissive:0xd97706,emissiveIntensity:0.7}), signDark: mk(0x1e293b,0.42,0.35), foliageGreen: mk(0x4d7c4f,0.86,0.02) };
}
