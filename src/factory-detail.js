import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Фабрика/завод» (docs/houses2 factory).
 * Визуал-упрощённый порт (основные объёмы: цех, труба, ворота), коллизии остаются у данных.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.buckets={wall:[],roof:[],trim:[],door:[],foundation:[],stoneStep:[],glass:[],glassBacking:[],metalAccent:[],chimney:[],warningRed:[],warningWhite:[],hazardYellow:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,16);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.s=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(b,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(w,h,d); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.buckets[b].push(g);} 
  addCyl(b,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,16).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.buckets[b].push(g);} 
  addGeo(b,raw,x,y,z){const g=raw.index?raw.toNonIndexed():raw.clone(); raw.dispose?.(); if(x||y||z) g.translate(x,y,z); this.buckets[b].push(g);} 
  build(materials){this.box.dispose(); this.cyl.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.buckets)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, materials[k]||materials.wall); mesh.name=`Factory_${k}`; mesh.castShadow=k!=='glass'; mesh.receiveShadow=k!=='glass'; meshes.push(mesh);} return meshes;} 
}
function gable(spanZ,spanX,rise){const sh=new THREE.Shape(); sh.moveTo(-spanZ/2,0); sh.lineTo(spanZ/2,0); sh.lineTo(0,rise); sh.closePath(); const g=new THREE.ExtrudeGeometry(sh,{depth:spanX,bevelEnabled:false}); g.translate(0,0,-spanX/2); g.rotateY(Math.PI/2); return g;}

export function buildDetailedFactory(config, materials){
  const width=config.width, depth=config.depth, floors=config.floors||2, floorHeight=config.floorHeight||5.0;
  const foundationHeight=config.foundationHeight ?? 0.7;
  const roofPitchDeg=config.roofPitchDeg ?? 16;
  const roofOverhang=config.roofOverhang ?? 0.55;
  const roofType=config.roofType ?? 'stepped';
  const windowScale=config.windowScale ?? 1.0;
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const hasBalcony=config.hasBalcony !== false;

  const b=new Batcher();
  const wallH=floors*floorHeight; const baseY=0; const topY=baseY+wallH; const pitch=(roofPitchDeg*Math.PI)/180;
  b.addBox('foundation', width+0.6, foundationHeight, depth+0.6, 0, foundationHeight/2, 0);
  b.addBox('stoneStep', width+0.8, 0.16, depth+0.8, 0, foundationHeight-0.08, 0);
  b.addBox('wall', width, wallH, depth, 0, baseY+wallH/2, 0);

  // Annex
  const annexW=Math.max(6, Math.min(width*0.28, 12));
  const annexD=Math.max(6, depth*0.42);
  const annexH=Math.max(floorHeight*1.2, wallH*0.55);
  const annexX=-width/2 - annexW/2 + 0.4;
  const annexZ=-depth*0.12;
  b.addBox('wall', annexW, annexH, annexD, annexX, baseY+annexH/2, annexZ);
  b.addBox('roof', annexW+0.3, 0.18, annexD+0.3, annexX, baseY+annexH+0.09, annexZ);

  // Cargo gates front
  const frontZ=depth/2; const gateCount=Math.max(2, Math.min(5, Math.round(width/6)));
  const gateW=Math.min(4.2, (width-4)/gateCount*0.7); const gateH=Math.min(wallH*0.6, 4.2*windowScale);
  for(let i=0;i<gateCount;i++){
    const gx=-width/2 + (width/(gateCount+1))*(i+1);
    b.addBox('door', gateW, gateH, 0.1, gx, baseY+gateH/2, frontZ+0.04);
    b.addBox('trim', gateW+0.2, 0.12, 0.14, gx, baseY+gateH+0.08, frontZ+0.06);
    if(hasCornerAccents){ b.addBox('hazardYellow', gateW, 0.12, 0.06, gx, baseY+0.08, frontZ+0.12); }
  }
  // Window strip
  b.addBox('glassBacking', width*0.7, Math.min(1.4,wallH*0.2), 0.05, 0, topY-wallH*0.18, frontZ+0.03);
  b.addBox('glass', width*0.7, Math.min(1.4,wallH*0.2), 0.04, 0, topY-wallH*0.18, frontZ+0.06);

  // Roof
  if(roofType==='gable'){
    const rise=Math.max(1.4, Math.tan(pitch)*(depth*0.45));
    b.addGeo('roof', gable(depth+roofOverhang, width+roofOverhang, rise), 0, topY, 0);
  } else if(roofType==='flat'){
    b.addBox('roof', width+0.3, 0.2, depth+0.3, 0, topY+0.1, 0);
  } else { // stepped sawtooth-ish
    const bays=Math.max(2, Math.min(4, Math.round(depth/8)));
    const bayD=depth/bays; const rise=Math.max(1.0, Math.tan(pitch)*bayD*0.6);
    for(let i=0;i<bays;i++){
      const bz=-depth/2 + bayD*(i+0.5);
      b.addBox('roof', width+0.2, 0.16, bayD+0.1, 0, topY+rise*0.5, bz, -0.28, 0, 0);
    }
  }

  // Chimney
  if(hasChimney){
    const chX=annexX - annexW*0.05, chZ=annexZ - annexD*0.15;
    const chH=wallH*1.1 + 4.5;
    b.addCyl('chimney', 1.0, 0.65, chH, chX, baseY+chH/2, chZ);
    const bandY=baseY + chH*0.78; const bH=1.0;
    b.addCyl('warningRed', 0.8,0.76,bH/3, chX, bandY+bH/6, chZ);
    b.addCyl('warningWhite', 0.76,0.72,bH/3, chX, bandY+bH/2, chZ);
    b.addCyl('warningRed', 0.72,0.68,bH/3, chX, bandY+5*bH/6, chZ);
  }

  if(hasBalcony){ b.addBox('metalAccent', width*0.6, 0.12, 1.6, 0, baseY+gateH+0.9, frontZ+0.8, 0.08,0,0); }
  if(hasPorch){ b.addBox('stoneStep', width*0.5, 0.18, 2.0, 0, foundationHeight*0.45, frontZ+1.0); }

  return b.build(materials);
}

export function makeFactoryMaterials(wallColorHex = '#9aa3ad'){
  const mk=(c,r=0.8,m=0.05,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.8,0.04), roof: mk(0x5f6770,0.72,0.2), trim: mk(0xc7ced6,0.5,0.25), door: mk(0x4b5563,0.55,0.3), foundation: mk(0x737b84,0.88,0.03), stoneStep: mk(0x949aa1,0.82,0.04), glass: new THREE.MeshPhysicalMaterial({color:0xa8c4d8,transparent:true,opacity:0.32,roughness:0.08,metalness:0,transmission:0.12}), glassBacking: mk(0x10161f,0.9,0), metalAccent: mk(0x59626d,0.46,0.55), chimney: mk(0x7a6a58,0.86,0.03), warningRed: mk(0xdc2626,0.5,0.1), warningWhite: mk(0xf8fafc,0.5,0.05), hazardYellow: mk(0xeab308,0.45,0.15) };
}
