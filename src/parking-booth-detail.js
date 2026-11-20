import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Будка КПП/шлагбаум» (docs/houses2 parking-booth).
 * Визуал-упрощённый порт, коллизии остаются у данных здания.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.b={wall:[],roof:[],trim:[],door:[],foundation:[],stoneStep:[],glass:[],glassBacking:[],metalAccent:[],timberAccent:[],barrierOrange:[],boomRed:[],boomWhite:[],hazardYellow:[],ledCyan:[],signalLight:[],signBlue:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,14); this.sph=new THREE.SphereGeometry(1,12,10);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.sc=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(k,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.sc.set(w,h,d); this.m4.compose(this.p,this.q,this.sc); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addCyl(k,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,14).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.sc.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.sc); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addSph(k,rxr,ryr,rzr,x,y,z){const g=this.sph.clone().toNonIndexed(); this.p.set(x,y,z); this.q.identity(); this.sc.set(rxr,ryr,rzr); this.m4.compose(this.p,this.q,this.sc); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  build(mats){this.box.dispose(); this.cyl.dispose(); this.sph.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.b)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, mats[k]||mats.wall); mesh.name=`ParkingBooth_${k}`; mesh.castShadow = k!=='glass' && k!=='ledCyan' && k!=='signalLight'; mesh.receiveShadow = k!=='glass' && k!=='ledCyan' && k!=='signalLight'; meshes.push(mesh);} return meshes;} 
}

export function buildDetailedParkingBooth(config, materials){
  const width=config.width, depth=config.depth, floorHeight=config.floorHeight||2.8;
  const foundationHeight=config.foundationHeight ?? 0.22;
  const roofPitchDeg=config.roofPitchDeg ?? 12;
  const roofOverhang=config.roofOverhang ?? 0.4;
  const roofType=config.roofType ?? 'flat';
  const windowDensity=config.windowDensity ?? 2;
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const isBarrierOpen = config.hasBalcony === true; // reuse feature flag as "open" visual variant

  const b=new Batcher();
  const baseY=0; const wallH=floorHeight; const topY=baseY+wallH;
  const boothX=-1.6; const hw=width/2, hd=depth/2;
  const gateX=boothX + hw + (hasPorch?0.56:0.44);
  const pitch=(roofPitchDeg*Math.PI)/180;

  // Island
  b.addBox('foundation', width + depth*1.4, foundationHeight, depth+2.2, boothX*0.35, foundationHeight/2, 0);
  b.addBox('hazardYellow', width + depth*1.4 + 0.2, 0.08, 0.12, boothX*0.35, foundationHeight+0.04, (depth+2.2)/2);
  b.addBox('hazardYellow', width + depth*1.4 + 0.2, 0.08, 0.12, boothX*0.35, foundationHeight+0.04, -(depth+2.2)/2);

  // Cabin
  b.addBox('wall', width, wallH, depth, boothX, baseY+wallH/2, 0);
  b.addBox('trim', width+0.16, 0.12, depth+0.16, boothX, baseY+0.06, 0);
  // windows
  const winW=Math.min(width*0.6, 1.6*(0.7+windowDensity*0.15));
  const winH=wallH*0.45;
  b.addBox('glassBacking', winW, winH, 0.05, boothX, baseY+wallH*0.58, hd+0.03);
  b.addBox('glass', winW, winH, 0.03, boothX, baseY+wallH*0.58, hd+0.06);
  b.addBox('glassBacking', 0.05, winH, depth*0.55, boothX+hw+0.03, baseY+wallH*0.58, 0);
  b.addBox('glass', 0.03, winH, depth*0.55, boothX+hw+0.06, baseY+wallH*0.58, 0);
  // door
  b.addBox('door', 0.08, wallH*0.8, 0.9, boothX-hw-0.03, baseY+wallH*0.4, 0.2);

  // Roof
  if(roofType==='hip'){
    const rise=Math.max(0.5, Math.tan(pitch)*(Math.min(width,depth)/2));
    // simple hip as two gable-like boxes approximation? better custom; keep simple stepped cap
    b.addBox('roof', width+roofOverhang*2, 0.16, depth+roofOverhang*2, boothX, topY+0.08, 0);
    b.addBox('roof', width*0.7, 0.12, depth*0.7, boothX, topY+0.22, 0);
  } else {
    b.addBox('roof', width+roofOverhang*2, 0.14, depth+roofOverhang*2, boothX, topY+0.07, 0);
  }

  // Barrier cabinet and boom
  const pivotY=foundationHeight + 0.85; const boomLen=Math.max(3.2, width*0.9);
  b.addBox('barrierOrange', 0.38, 1.2, 0.38, gateX, foundationHeight + 0.6, 0);
  b.addCyl('trim', 0.06,0.06,0.2, gateX, pivotY, 0.22, Math.PI/2,0,0);
  const boomAngle = isBarrierOpen ? -1.35 : 0;
  const segs=8; const segLen=boomLen/segs;
  for(let s=0;s<segs;s++){
    const lx=0.12 + (s+0.5)*segLen;
    const bx=gateX + Math.cos(boomAngle)*lx;
    const by=pivotY + Math.sin(boomAngle)*lx;
    b.addBox(s%2===0?'boomRed':'boomWhite', segLen+0.01, 0.09, 0.06, bx, by, 0, 0,0,boomAngle);
  }
  b.addBox('signalLight', 0.1, 0.1, 0.08, gateX + Math.cos(boomAngle)*(boomLen+0.16), pivotY + Math.sin(boomAngle)*(boomLen+0.16), 0);
  // catch post
  const restX=gateX + boomLen + 0.12;
  b.addCyl('metalAccent', 0.045,0.045, pivotY-0.1, restX, (pivotY-0.1)/2 + 0.08, 0);
  b.addBox('trim', 0.14, 0.05, 0.16, restX, pivotY-0.02, 0);

  if(hasPorch){
    // kiosk
    b.addBox('barrierOrange', 0.34, 1.2, 0.34, gateX-0.04, foundationHeight+0.6, 1.4);
    b.addBox('ledCyan', 0.02, 0.24, 0.18, gateX+0.14, foundationHeight+0.96, 1.4);
  }
  if(hasChimney){
    b.addCyl('barrierOrange', 0.08,0.07,0.18, boothX+0.45, topY+0.16, 0.35);
  }
  if(hasCornerAccents){
    for(const bz of [-hd-0.5, 1.8]) b.addCyl('hazardYellow', 0.085,0.085,0.88, gateX+0.2, foundationHeight+0.44, bz);
    b.addCyl('metalAccent', 0.04,0.04,2.4, boothX-hw-0.45, 1.2, hd+0.5);
    b.addBox('signBlue', 0.5, 0.5, 0.06, boothX-hw-0.45, 2.45, hd+0.5);
  }

  return b.build(materials);
}

export function makeParkingBoothMaterials(wallColorHex = '#dde3ea'){
  const mk=(c,r=0.7,m=0.1,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.72,0.08), roof: mk(0x5f6770,0.6,0.2), trim: mk(0xd9dde3,0.45,0.2), door: mk(0x4b5563,0.5,0.2), foundation: mk(0x808890,0.88,0.03), stoneStep: mk(0xa0a6ad,0.8,0.04), glass: new THREE.MeshPhysicalMaterial({color:0x9fd3ff,transparent:true,opacity:0.38,roughness:0.05,metalness:0,transmission:0.18}), glassBacking: mk(0xc7d0d8,0.6,0.05), metalAccent: mk(0x50565d,0.4,0.55), timberAccent: mk(0x7a5435,0.7,0.04), barrierOrange: mk(0xea580c,0.36,0.35), boomRed: mk(0xdc2626,0.35,0.15), boomWhite: mk(0xf8fafc,0.35,0.1), hazardYellow: mk(0xeab308,0.42,0.25), ledCyan: mk(0xbae6fd,0.25,0.1,{emissive:0x0ea5e9,emissiveIntensity:0.9}), signalLight: mk(0xbbf7d0,0.22,0,{emissive:0x22c55e,emissiveIntensity:1.2}), signBlue: mk(0x1d4ed8,0.38,0.12) };
}
