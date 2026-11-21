import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Лавки/ряд магазинов» (docs/houses2 market-row).
 * Визуал-упрощённый порт, коллизии остаются у данных здания.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.b={wall:[],roof:[],trim:[],door:[],foundation:[],stoneStep:[],glass:[],glassBacking:[],metalAccent:[],timberAccent:[],awningRed:[],awningAmber:[],awningTeal:[],awningCream:[],crateGreen:[],crateOrange:[],signDark:[],lanternGlow:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,12);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.s=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(k,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(w,h,d); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addCyl(k,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,12).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  build(mats){this.box.dispose(); this.cyl.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.b)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, mats[k]||mats.wall); mesh.name=`MarketRow_${k}`; mesh.castShadow = k!=='glass' && k!=='lanternGlow'; mesh.receiveShadow = k!=='glass' && k!=='lanternGlow'; meshes.push(mesh);} return meshes;} 
}

export function buildDetailedMarketRow(config, materials){
  const width=config.width, depth=config.depth, floorHeight=config.floorHeight||3.2;
  const foundationHeight=config.foundationHeight ?? 0.25;
  const roofPitchDeg=config.roofPitchDeg ?? 18;
  const roofOverhang=config.roofOverhang ?? 0.5;
  const roofType=config.roofType ?? 'shed';
  const windowDensity=config.windowDensity ?? 2;
  const windowScale=config.windowScale ?? 1.0;
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;

  const b=new Batcher();
  const baseY=0; const pitch=(roofPitchDeg*Math.PI)/180;
  b.addBox('foundation', width+1.2, foundationHeight*0.8, depth+1.4, 0, foundationHeight*0.4, 0.1);
  b.addBox('stoneStep', width+1.4, foundationHeight*0.25, depth+1.6, 0, foundationHeight*0.9, 0.1);

  const units=Math.max(4, Math.min(7, Math.round(width/4.2)+(windowDensity-2)));
  const gap=0.22; const usable=width-gap*(units-1); const uW=usable/units;
  const awnings=['awningRed','awningAmber','awningTeal'];
  for(let i=0;i<units;i++){
    const ux=-width/2 + uW/2 + i*(uW+gap);
    const uH=Math.max(2.6, floorHeight*(0.85 + 0.12*((i%3)-1)));
    const uD=Math.max(3.4, depth*(0.82 + 0.08*(i%2)));
    const frontZ=depth*0.42; const cz=frontZ - uD/2;
    b.addBox('wall', uW, uH, uD, ux, baseY+uH/2, cz);
    // shopfront
    b.addBox('glassBacking', uW*0.55, uH*0.45, 0.05, ux-uW*0.12, baseY+uH*0.42, frontZ+0.03);
    b.addBox('glass', uW*0.55, uH*0.45, 0.03, ux-uW*0.12, baseY+uH*0.42, frontZ+0.06);
    b.addBox('door', uW*0.22, uH*0.62, 0.06, ux+uW*0.28, baseY+uH*0.31, frontZ+0.03);
    // awning
    const awY=baseY + uH - 0.7; const awD=Math.min(1.3, 0.8 + roofOverhang*0.4);
    b.addBox(awnings[i%awnings.length], uW*0.92, 0.08, awD, ux, awY, frontZ+awD/2, 0.24,0,0);
    b.addCyl('lanternGlow', 0.06,0.07,0.1, ux-uW*0.2, awY-0.18, frontZ+0.4);
    b.addCyl('lanternGlow', 0.06,0.07,0.1, ux+uW*0.2, awY-0.18, frontZ+0.4);
    // sign
    if(hasCornerAccents){ b.addBox('signDark', uW*0.7, 0.35, 0.08, ux, baseY+uH-0.3, frontZ+0.05); }
    // roof per unit
    const roofBase=baseY+uH;
    if(roofType==='flat'){ b.addBox('roof', uW+0.1, 0.12, uD+0.2, ux, roofBase+0.06, cz); }
    else { const rise=Math.max(0.4, Math.tan(pitch)*uD*0.35); b.addBox('roof', uW+0.1, 0.12, uD+0.3, ux, roofBase+rise*0.4, cz, roofType==='gable'?0:-0.18,0,0); }
    if(hasPorch && i%2===0){
      b.addBox('timberAccent', Math.min(uW*0.7,2.0), 0.07, 0.6, ux, baseY+0.72, frontZ+0.7);
      b.addBox('crateGreen', 0.4, 0.16, 0.35, ux-0.25, baseY+0.88, frontZ+0.7);
      b.addBox('crateOrange', 0.38, 0.14, 0.32, ux+0.25, baseY+0.86, frontZ+0.7);
    }
    if(hasChimney && i%3===0){ b.addCyl('metalAccent', 0.12,0.14,0.9, ux+uW*0.2, roofBase+0.45, cz-uD*0.2); }
  }

  return b.build(materials);
}

export function makeMarketRowMaterials(wallColorHex = '#d4c6b0'){
  const mk=(c,r=0.8,m=0.05,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.82,0.03), roof: mk(0x6b5b4b,0.72,0.08), trim: mk(0xe8dfd0,0.5,0.08), door: mk(0x5a3a24,0.5,0.06), foundation: mk(0x7b8087,0.86,0.04), stoneStep: mk(0xa0a6ad,0.78,0.04), glass: new THREE.MeshPhysicalMaterial({color:0x9dbbc9,transparent:true,opacity:0.36,roughness:0.06,metalness:0,transmission:0.12}), glassBacking: mk(0x10161f,0.9,0), metalAccent: mk(0x50565d,0.45,0.5), timberAccent: mk(0x7a5435,0.72,0.04), awningRed: mk(0xb9382c,0.86,0.02), awningAmber: mk(0xd97706,0.86,0.02), awningTeal: mk(0x1f6e6c,0.86,0.02), awningCream: mk(0xf4ead7,0.88,0.01), crateGreen: mk(0x5a8f49,0.88,0.02), crateOrange: mk(0xdd6b20,0.88,0.02), signDark: mk(0x1e293b,0.42,0.28), lanternGlow: mk(0xfef3c7,0.25,0.05,{emissive:0xf59e0b,emissiveIntensity:1.1}) };
}
