import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Доменная печь» (docs/houses2 blast-furnace).
 * Визуал-упрощённый порт (башня, кауперы, литейный двор), коллизии остаются у данных.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.b={wall:[],roof:[],trim:[],door:[],foundation:[],stoneStep:[],glass:[],glassBacking:[],metalAccent:[],chimney:[],warningRed:[],warningWhite:[],hazardYellow:[],pipeRust:[],cisternPaint:[],furnaceGlow:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,18); this.sph=new THREE.SphereGeometry(1,12,10);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.s=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(k,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(w,h,d); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addCyl(k,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,18).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addSph(k,rxr,ryr,rzr,x,y,z){const g=this.sph.clone().toNonIndexed(); this.p.set(x,y,z); this.q.identity(); this.s.set(rxr,ryr,rzr); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addGeo(k,raw,x,y,z){const g=raw.index?raw.toNonIndexed():raw.clone(); raw.dispose?.(); if(x||y||z) g.translate(x,y,z); this.b[k].push(g);} 
  build(mats){this.box.dispose(); this.cyl.dispose(); this.sph.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.b)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, mats[k]||mats.wall); mesh.name=`BlastFurnace_${k}`; const noShadow=k==='glass'||k==='furnaceGlow'; mesh.castShadow=!noShadow; mesh.receiveShadow=!noShadow; meshes.push(mesh);} return meshes;} 
}

export function buildDetailedBlastFurnace(config, materials){
  const width=config.width, depth=config.depth, floors=config.floors||3, floorHeight=config.floorHeight||5.5;
  const foundationHeight=config.foundationHeight ?? 1.2;
  const roofType=config.roofType ?? 'stepped';
  const windowDensity=config.windowDensity ?? 2;
  const windowScale=config.windowScale ?? 1.0;
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const hasBalcony=config.hasBalcony !== false;

  const b=new Batcher();
  const baseY=0; const topY=baseY + floors*floorHeight;
  b.addBox('foundation', width+0.8, foundationHeight, depth+0.8, 0, foundationHeight/2, 0);
  b.addBox('stoneStep', width+1.0, 0.18, depth+1.0, 0, foundationHeight-0.09, 0);

  // Furnace tower
  const fx = width*0.02; const fz = -depth*0.05;
  const towerH = Math.max(floors*floorHeight*0.95, 12.0);
  const rHearth=2.4, rBelly=3.6, rThroat=2.0;
  const hHearth=towerH*0.2, hBosh=towerH*0.12, hBelly=towerH*0.14, hShaft=towerH*0.42, hThroat=towerH*0.12;
  let curY=baseY;
  b.addCyl('wall', rHearth,rHearth,hHearth, fx, curY+hHearth/2, fz); curY+=hHearth;
  b.addCyl('wall', rHearth,rBelly,hBosh, fx, curY+hBosh/2, fz); curY+=hBosh;
  b.addCyl('wall', rBelly,rBelly,hBelly, fx, curY+hBelly/2, fz); curY+=hBelly;
  b.addCyl('wall', rBelly,rThroat,hShaft, fx, curY+hShaft/2, fz); curY+=hShaft;
  b.addCyl('metalAccent', rThroat,rThroat*0.94,hThroat, fx, curY+hThroat/2, fz);
  const towerTop=curY+hThroat;
  for(const frac of [0.2,0.38,0.56,0.74,0.9]){ const ry=baseY+towerH*frac; const rad=frac<0.32?rBelly*0.98:rBelly - ((frac-0.32)/0.58)*(rBelly-rThroat); b.addCyl('trim', rad+0.12,rad+0.12,0.18, fx,ry,fz); }
  // bustle pipe
  const bustleY=baseY + towerH*0.24; const bustleR=rBelly+0.7;
  const torus=new THREE.TorusGeometry(bustleR, 0.22, 10, 24); torus.rotateX(Math.PI/2); b.addGeo('pipeRust', torus, fx,bustleY,fz);
  // tuyere glow hints
  for(let i=0;i<8;i++){ const a=(i/8)*Math.PI*2; b.addSph('furnaceGlow', 0.14,0.14,0.14, fx+Math.cos(a)*(rBelly-0.1), bustleY+0.05, fz+Math.sin(a)*(rBelly-0.1)); }

  // Skip hoist / frame
  const frameH=topY + 4.0; const frameX=fx - rBelly - 1.4; const frameZ=fz - rBelly - 0.8;
  for(const [ox,oz] of [[-0.6,-0.6],[0.6,-0.6],[-0.6,0.6],[0.6,0.6]]) b.addCyl('metalAccent', 0.12,0.12,frameH, frameX+ox, baseY+frameH/2, frameZ+oz);
  for(let l=0;l<8;l++){ const ly=baseY + (l/7)*frameH; b.addBox('trim', 1.4,0.08,0.08, frameX,ly,frameZ-0.6); b.addBox('trim', 1.4,0.08,0.08, frameX,ly,frameZ+0.6); b.addBox('trim', 0.08,0.08,1.4, frameX-0.6,ly,frameZ); b.addBox('trim', 0.08,0.08,1.4, frameX+0.6,ly,frameZ); }
  // skip bridge
  b.addBox('metalAccent', 1.2,0.2, Math.abs(frameZ - (fz - rThroat - 0.4)), frameX, topY+1.2, (frameZ + fz - rThroat - 0.4)/2);

  // Cowper stoves
  const cowperR=2.1, cowperH=Math.max(towerH*0.55, 8.0), cowperZ=fz + rBelly + cowperR + 2.2;
  const centers=[fx + cowperR*1.2, fx + cowperR*3.8];
  for(let i=0;i<centers.length;i++){
    const cx=centers[i];
    b.addCyl('cisternPaint', cowperR,cowperR,cowperH, cx, baseY+cowperH/2, cowperZ);
    b.addCyl('roof', cowperR+0.05,cowperR*0.2,1.1, cx, baseY+cowperH+0.55, cowperZ);
    b.addCyl('trim', cowperR+0.08,cowperR+0.08,0.16, cx, baseY+cowperH*0.3, cowperZ);
    b.addCyl('trim', cowperR+0.08,cowperR+0.08,0.16, cx, baseY+cowperH*0.7, cowperZ);
  }
  // gas pipe to cowpers
  if(centers.length>1){ b.addCyl('trim', 0.45,0.45, centers[1]-centers[0]+cowperR*0.6, (centers[0]+centers[1])/2, baseY+cowperH*0.75, cowperZ - cowperR - 0.2, 0,0,Math.PI/2); }

  // Cast house
  if(hasPorch){
    const castW=Math.min(width*0.42, 12.0), castD=depth*0.32, castH=Math.min(towerH*0.42, 6.5);
    const castX=fx - castW*0.1, castZ=fz + (depth*0.25);
    b.addBox('wall', castW, castH, castD, castX, baseY+castH/2, castZ);
    b.addBox('roof', castW+0.6, 0.18, castD+0.8, castX, baseY+castH+0.5, castZ, 0.22,0,0);
    b.addBox('furnaceGlow', castW*0.35, 0.35, 0.12, castX, baseY+0.3, castZ+castD/2+0.08);
    if(hasCornerAccents){ b.addBox('hazardYellow', 0.2,1.0,0.2, castX-castW*0.4, baseY+0.5, castZ+castD/2+0.25); b.addBox('hazardYellow', 0.2,1.0,0.2, castX+castW*0.4, baseY+0.5, castZ+castD/2+0.25); }
  }

  // Smokestack
  if(hasChimney){
    const sx = centers.length?centers[centers.length-1]+cowperR+1.2 : fx+width*0.3;
    const sz = cowperZ - cowperR - 1.5;
    const stackTop=topY + Math.max(6.0, towerH*0.35);
    b.addBox('chimney', 2.4, 3.0, 2.4, sx, baseY+1.5, sz);
    const shaftH=stackTop-3.2; b.addCyl('chimney', 1.1,0.7,shaftH, sx, baseY+3.2+shaftH/2, sz);
    const bH=3.0; const by=stackTop-bH;
    b.addCyl('warningRed', 0.78,0.74,bH/3, sx, by+bH/6, sz);
    b.addCyl('warningWhite', 0.74,0.71,bH/3, sx, by+bH/2, sz);
    b.addCyl('warningRed', 0.71,0.68,bH/3, sx, by+5*bH/6, sz);
  }

  // roof/platform hint
  if(roofType==='flat' || roofType==='stepped'){ b.addBox('roof', width*0.9, 0.2, depth*0.25, -width*0.05, topY*0.35, -depth*0.3); }

  return b.build(materials);
}

export function makeBlastFurnaceMaterials(wallColorHex = '#7a6a58'){
  const mk=(c,r=0.8,m=0.1,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.84,0.06), roof: mk(0x5f6770,0.7,0.22), trim: mk(0x8a949d,0.5,0.35), door: mk(0x4b5563,0.55,0.3), foundation: mk(0x6b7280,0.9,0.03), stoneStep: mk(0x8f9499,0.82,0.04), glass: new THREE.MeshPhysicalMaterial({color:0x9dbbc9,transparent:true,opacity:0.3,roughness:0.08,metalness:0,transmission:0.1}), glassBacking: mk(0x10161f,0.9,0), metalAccent: mk(0x59626d,0.45,0.55), chimney: mk(0x6b4a3a,0.88,0.03), warningRed: mk(0xdc2626,0.5,0.1), warningWhite: mk(0xf8fafc,0.5,0.05), hazardYellow: mk(0xeab308,0.45,0.15), pipeRust: mk(0x8b5a2b,0.75,0.25), cisternPaint: mk(0x5b7f8f,0.65,0.2), furnaceGlow: mk(0xffc46b,0.3,0,{emissive:0xff7a18,emissiveIntensity:1.1}) };
}
