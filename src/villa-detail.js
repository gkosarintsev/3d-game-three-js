import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Вилла» (docs/houses2 villa).
 * Визуал-упрощённый порт (массинг, терраса, бассейн/навес по фичам), коллизии остаются у данных.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.b={wall:[],roof:[],trim:[],door:[],foundation:[],stoneStep:[],glass:[],glassBacking:[],metalAccent:[],timberAccent:[],chimney:[],poolWater:[],warmGlow:[],foliage:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,14); this.sph=new THREE.SphereGeometry(1,12,10);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.s=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(k,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(w,h,d); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addCyl(k,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,14).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addSph(k,rxr,ryr,rzr,x,y,z){const g=this.sph.clone().toNonIndexed(); this.p.set(x,y,z); this.q.identity(); this.s.set(rxr,ryr,rzr); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addGeo(k,raw,x,y,z){const g=raw.index?raw.toNonIndexed():raw.clone(); raw.dispose?.(); if(x||y||z) g.translate(x,y,z); this.b[k].push(g);} 
  build(mats){this.box.dispose(); this.cyl.dispose(); this.sph.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.b)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, mats[k]||mats.wall); mesh.name=`Villa_${k}`; mesh.castShadow = k!=='glass' && k!=='poolWater' && k!=='warmGlow' && k!=='foliage'; mesh.receiveShadow = k!=='glass'; meshes.push(mesh);} return meshes;} 
}
function hipRoof(spanX, spanZ, riseH){ const hx=spanX/2,hz=spanZ/2, alongX=spanX>=spanZ; const ridgeLen=Math.max(0.5, Math.abs(spanX-spanZ)*0.7); const rx=alongX?ridgeLen/2:0, rz=alongX?0:ridgeLen/2; const p0=[-hx,0,hz],p1=[hx,0,hz],p2=[hx,0,-hz],p3=[-hx,0,-hz]; const r0=alongX?[-rx,riseH,0]:[0,riseH,-rz], r1=alongX?[rx,riseH,0]:[0,riseH,rz]; const pos=[],uvs=[]; const tri=(a,b,c)=>{pos.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]); uvs.push(a[0]*0.3,a[2]*0.3,b[0]*0.3,b[2]*0.3,c[0]*0.3,c[2]*0.3);}; if(alongX){tri(p0,p1,r1);tri(p0,r1,r0);tri(p2,p3,r0);tri(p2,r0,r1);tri(p1,p2,r1);tri(p3,p0,r0);} else {tri(p1,p2,r0);tri(p1,r0,r1);tri(p3,p0,r1);tri(p3,r1,r0);tri(p0,p1,r1);tri(p2,p3,r0);} tri(p0,p3,p2); tri(p0,p2,p1); const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2)); g.computeVertexNormals(); return g; }

export function buildDetailedVilla(config, materials){
  const width=config.width, depth=config.depth, floors=config.floors||2, floorHeight=config.floorHeight||3.4;
  const foundationHeight=config.foundationHeight ?? 0.45;
  const roofPitchDeg=config.roofPitchDeg ?? 22;
  const roofOverhang=config.roofOverhang ?? 0.7;
  const roofType=config.roofType ?? 'hip';
  const windowDensity=config.windowDensity ?? 2;
  const windowScale=config.windowScale ?? 1.1;
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const hasBalcony=config.hasBalcony !== false;

  const b=new Batcher();
  const baseY=0; const wallH=floors*floorHeight; const topY=baseY+wallH; const pitch=(roofPitchDeg*Math.PI)/180;

  // terrace/podium
  b.addBox('foundation', width+1.8, foundationHeight*0.8, depth+1.8, 0, foundationHeight*0.4, 0.2);
  b.addBox('stoneStep', width+2.0, foundationHeight*0.25, depth+2.0, 0, foundationHeight*0.9, 0.2);

  // main wing + side wing
  const mainW=width*0.62, mainD=depth*0.9; const mainX=-width*0.12, mainZ=0;
  b.addBox('wall', mainW, wallH, mainD, mainX, baseY+wallH/2, mainZ);
  const wingW=width*0.42, wingD=depth*0.55; const wingX=mainX + mainW/2 + wingW/2 - 0.4; const wingZ=depth*0.05;
  const wingH=floors>=2?floorHeight*1.9:wallH;
  b.addBox('wall', wingW, wingH, wingD, wingX, baseY+wingH/2, wingZ);

  // windows
  const cols=Math.max(3, Math.round(mainW/2.8)+ (windowDensity-1));
  for(let f=0;f<floors;f++){
    const wy=baseY + f*floorHeight + floorHeight*0.55;
    const wh=Math.min(floorHeight*0.5, 1.7*windowScale), ww=Math.min(1.4, (mainW-2)/(cols*1.5));
    for(let i=0;i<cols;i++){
      const wx=mainX - mainW/2 + 1.0 + ((mainW-2)/(cols-1||1))*i;
      b.addBox('glassBacking', ww, wh, 0.05, wx, wy, mainZ + mainD/2 + 0.03);
      b.addBox('glass', ww, wh, 0.03, wx, wy, mainZ + mainD/2 + 0.06);
      b.addBox('trim', ww+0.12, 0.06, 0.06, wx, wy+wh/2+0.02, mainZ + mainD/2 + 0.05);
    }
  }

  // entrance / porch
  if(hasPorch){
    const doorW=1.5, doorH=Math.min(2.5, floorHeight*0.78);
    b.addBox('stoneStep', doorW+1.4, 0.2, 1.6, mainX+mainW*0.12, baseY+0.1, mainZ + mainD/2 + 0.8);
    b.addBox('door', doorW, doorH, 0.08, mainX+mainW*0.12, baseY+doorH/2, mainZ + mainD/2 + 0.04);
    b.addBox('glass', doorW*0.7, doorH*0.25, 0.03, mainX+mainW*0.12, baseY+doorH*0.78, mainZ + mainD/2 + 0.08);
    b.addBox('trim', doorW+2.0, 0.14, 2.2, mainX+mainW*0.12, baseY+doorH+0.2, mainZ + mainD/2 + 1.1);
    // pool
    b.addBox('stoneStep', Math.min(5.5,width*0.35), 0.18, 2.6, wingX, baseY+0.1, mainZ + mainD/2 + 2.4);
    b.addBox('poolWater', Math.min(5.0,width*0.32), 0.12, 2.2, wingX, baseY+0.16, mainZ + mainD/2 + 2.4);
  }

  // balcony/terrace
  if(hasBalcony && floors>=2){
    const by=baseY + floorHeight + 0.12; const bw=mainW*0.45, bd=1.6; const bz=mainZ - mainD/2 - bd/2;
    b.addBox('stoneStep', bw, 0.18, bd, mainX, by, bz);
    b.addBox('glass', bw-0.1, 0.9, 0.05, mainX, by+0.55, bz - bd/2 + 0.05);
    b.addBox('metalAccent', bw, 0.06, 0.08, mainX, by+1.02, bz - bd/2 + 0.05);
  }

  // roofs
  if(roofType==='flat'){
    b.addBox('trim', mainW+roofOverhang*2.2, 0.24, mainD+roofOverhang*2.2, mainX, topY+0.12, mainZ);
    b.addBox('trim', wingW+roofOverhang*1.8, 0.22, wingD+roofOverhang*1.8, wingX, baseY+wingH+0.11, wingZ);
  } else {
    const rise=Math.max(1.1, Math.tan(pitch)*(Math.min(mainW,mainD)/2)*0.85);
    b.addGeo('roof', hipRoof(mainW+roofOverhang*1.8, mainD+roofOverhang*1.8, rise), mainX, topY, mainZ);
    const wrise=Math.max(0.8, Math.tan(pitch)*(Math.min(wingW,wingD)/2)*0.8);
    b.addGeo('roof', hipRoof(wingW+roofOverhang*1.6, wingD+roofOverhang*1.6, wrise), wingX, baseY+wingH, wingZ);
  }

  if(hasChimney){
    const chH=floors*floorHeight + 1.6; b.addBox('chimney', 1.0, chH, 0.9, mainX-mainW*0.28, baseY+chH/2, mainZ-mainD*0.2); b.addBox('stoneStep', 1.2, 0.14, 1.1, mainX-mainW*0.28, baseY+chH+0.07, mainZ-mainD*0.2);
  }
  if(hasCornerAccents){
    for(const [px,pz] of [[mainX-mainW/2-0.4, mainZ+mainD/2+0.4],[mainX+mainW/2+0.4, mainZ+mainD/2+0.4]]){
      b.addBox('stoneStep', 1.0, 0.4, 0.8, px, 0.2, pz); b.addSph('foliage', 0.3,0.26,0.26, px, 0.62, pz);
    }
    b.addBox('timberAccent', 0.08, floorHeight*0.8, 0.2, mainX-mainW/2+0.3, baseY+floorHeight*0.5, mainZ+mainD/2+0.1);
  }

  return b.build(materials);
}

export function makeVillaMaterials(wallColorHex = '#e9e2d6'){
  const mk=(c,r=0.7,m=0.06,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.68,0.04), roof: mk(0x6b5b4b,0.65,0.1), trim: mk(0xf5f0e6,0.45,0.08), door: mk(0x5a3a24,0.5,0.06), foundation: mk(0xb8bdc4,0.78,0.04), stoneStep: mk(0xd1d5db,0.72,0.05), glass: new THREE.MeshPhysicalMaterial({color:0xaed6f1,transparent:true,opacity:0.34,roughness:0.05,metalness:0,transmission:0.18}), glassBacking: mk(0x10161f,0.9,0), metalAccent: mk(0x6b5840,0.4,0.35), timberAccent: mk(0x8b6a45,0.65,0.04), chimney: mk(0x8a7a6a,0.84,0.03), poolWater: mk(0x3bb6d6,0.2,0.02,{transparent:true,opacity:0.7}), warmGlow: mk(0xfff0cc,0.3,0,{emissive:0xf59e0b,emissiveIntensity:0.5}), foliage: mk(0x4d7c4f,0.86,0.02) };
}
