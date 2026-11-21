import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Парк-павильон» (docs/houses2 park-pavilion).
 * Визуал-упрощённый порт (ротонда/беседка), коллизии остаются у данных.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.b={wall:[],roof:[],trim:[],door:[],foundation:[],stoneStep:[],glass:[],glassBacking:[],metalAccent:[],timberAccent:[],warmLantern:[],foliage:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,16); this.sph=new THREE.SphereGeometry(1,12,10);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.s=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(k,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(w,h,d); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addCyl(k,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,16).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addSph(k,rxr,ryr,rzr,x,y,z){const g=this.sph.clone().toNonIndexed(); this.p.set(x,y,z); this.q.identity(); this.s.set(rxr,ryr,rzr); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addGeo(k,raw,x,y,z){const g=raw.index?raw.toNonIndexed():raw.clone(); raw.dispose?.(); if(x||y||z) g.translate(x,y,z); this.b[k].push(g);} 
  build(mats){this.box.dispose(); this.cyl.dispose(); this.sph.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.b)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, mats[k]||mats.wall); mesh.name=`ParkPavilion_${k}`; mesh.castShadow = k!=='glass' && k!=='warmLantern' && k!=='foliage'; mesh.receiveShadow = k!=='glass' && k!=='warmLantern'; meshes.push(mesh);} return meshes;} 
}

function hipRoof(spanX, spanZ, riseH){
  const hx=spanX/2, hz=spanZ/2, alongX=spanX>=spanZ;
  const ridgeLen=Math.max(0.4, Math.abs(spanX-spanZ)+0.4);
  const rx=alongX?ridgeLen/2:0, rz=alongX?0:ridgeLen/2;
  const p0=[-hx,0,hz],p1=[hx,0,hz],p2=[hx,0,-hz],p3=[-hx,0,-hz];
  const r0=alongX?[-rx,riseH,0]:[0,riseH,-rz], r1=alongX?[rx,riseH,0]:[0,riseH,rz];
  const pos=[], uvs=[]; const tri=(a,b,c)=>{pos.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]); uvs.push(a[0]*0.4,a[2]*0.4,b[0]*0.4,b[2]*0.4,c[0]*0.4,c[2]*0.4);};
  if(alongX){tri(p0,p1,r1);tri(p0,r1,r0);tri(p2,p3,r0);tri(p2,r0,r1);tri(p1,p2,r1);tri(p3,p0,r0);} else {tri(p1,p2,r0);tri(p1,r0,r1);tri(p3,p0,r1);tri(p3,r1,r0);tri(p0,p1,r1);tri(p2,p3,r0);} tri(p0,p3,p2); tri(p0,p2,p1);
  const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2)); g.computeVertexNormals(); return g;
}

export function buildDetailedParkPavilion(config, materials){
  const width=config.width, depth=config.depth, floorHeight=config.floorHeight||3.4, floors=config.floors||1;
  const foundationHeight=config.foundationHeight ?? 0.35;
  const roofPitchDeg=config.roofPitchDeg ?? 24;
  const roofOverhang=config.roofOverhang ?? 0.7;
  const roofType=config.roofType ?? 'hip';
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const hasBalcony=config.hasBalcony !== false;

  const b=new Batcher();
  const baseY=0; const totalH=floorHeight*Math.max(1,floors); const topY=baseY+totalH; const pitch=(roofPitchDeg*Math.PI)/180;

  // Terrace platform
  b.addBox('foundation', width+1.6, foundationHeight*0.8, depth+1.6, 0, foundationHeight*0.4, 0);
  b.addBox('stoneStep', width+1.8, foundationHeight*0.25, depth+1.8, 0, foundationHeight*0.9, 0);
  if(hasPorch){
    const steps=3; for(let s=0;s<steps;s++){ b.addBox('stoneStep', Math.min(width*0.5,4.5)-s*0.25, foundationHeight*0.3, 0.4, 0, foundationHeight*0.15+s*0.12, depth/2 + 1.0 + s*0.32); }
  }

  // Colonnade / open pavilion shell
  const colsX=Math.max(3, Math.round(width/2.4));
  const colsZ=Math.max(2, Math.round(depth/2.6));
  const colR=0.16; const colH=totalH-0.2;
  for(let i=0;i<colsX;i++){
    const x=-width/2 + 0.6 + ((width-1.2)*(i/(colsX-1||1)));
    for(let j=0;j<colsZ;j++){
      const z=-depth/2 + 0.6 + ((depth-1.2)*(j/(colsZ-1||1)));
      const edge = i===0||i===colsX-1||j===0||j===colsZ-1;
      if(!edge) continue;
      b.addCyl('trim', colR,colR*1.05,colH, x, baseY+colH/2, z);
      b.addBox('stoneStep', 0.42, 0.12, 0.42, x, baseY+0.06, z);
      b.addBox('trim', 0.36, 0.1, 0.36, x, baseY+colH+0.05, z);
    }
  }
  // entablature ring
  b.addBox('wall', width-0.2, 0.28, 0.22, 0, topY-0.14, depth/2-0.4);
  b.addBox('wall', width-0.2, 0.28, 0.22, 0, topY-0.14, -depth/2+0.4);
  b.addBox('wall', 0.22, 0.28, depth-0.8, -width/2+0.4, topY-0.14, 0);
  b.addBox('wall', 0.22, 0.28, depth-0.8, width/2-0.4, topY-0.14, 0);
  b.addBox('trim', width+0.1, 0.1, depth+0.1, 0, topY+0.02, 0);

  // low balustrade between some columns
  if(hasBalcony){
    const railY=baseY+0.95; const railH=0.08;
    b.addBox('trim', width-1.2, railH, 0.06, 0, railY, -depth/2+0.6);
    b.addBox('trim', 0.06, railH, depth-1.2, -width/2+0.6, railY, 0);
    b.addBox('trim', 0.06, railH, depth-1.2, width/2-0.6, railY, 0);
  }

  // Roof
  const roofW=width + roofOverhang*2, roofD=depth + roofOverhang*2;
  const rise=Math.max(1.2, Math.tan(pitch)*(Math.min(roofW,roofD)/2));
  if(roofType==='flat'){
    b.addBox('roof', roofW, 0.18, roofD, 0, topY+0.09, 0);
  } else {
    b.addGeo('roof', hipRoof(roofW, roofD, rise), 0, topY, 0);
  }
  if(hasChimney){
    b.addCyl('trim', 0.1,0.04,0.5, 0, topY+rise+0.25, 0);
    b.addSph('metalAccent', 0.08,0.08,0.08, 0, topY+rise+0.12, 0);
  }

  // Lanterns and planters
  b.addBox('warmLantern', 0.18, 0.28, 0.12, -width*0.25, baseY+colH*0.55, depth/2-0.6);
  b.addBox('warmLantern', 0.18, 0.28, 0.12, width*0.25, baseY+colH*0.55, depth/2-0.6);
  if(hasCornerAccents){
    for(const [sx,sz] of [[-1,1],[1,1],[-1,-1],[1,-1]]){
      const px=sx*(width/2-0.6), pz=sz*(depth/2+0.35);
      b.addBox('stoneStep', 0.8, 0.4, 0.6, px, 0.2, pz);
      b.addSph('foliage', 0.28,0.24,0.24, px, 0.58, pz);
      b.addSph('foliage', 0.18,0.18,0.18, px-0.16, 0.52, pz+0.05);
    }
  }

  return b.build(materials);
}

export function makeParkPavilionMaterials(wallColorHex = '#e8e1d4'){
  const mk=(c,r=0.7,m=0.06,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.72,0.04), roof: mk(0x4b5563,0.68,0.12), trim: mk(0xf4efe3,0.5,0.08), door: mk(0x5a3a24,0.5,0.06), foundation: mk(0x9aa0a6,0.82,0.04), stoneStep: mk(0xb8bdc4,0.76,0.05), glass: new THREE.MeshPhysicalMaterial({color:0xaed6f1,transparent:true,opacity:0.3,roughness:0.06,metalness:0,transmission:0.15}), glassBacking: mk(0x10161f,0.9,0), metalAccent: mk(0x6b5840,0.45,0.35), timberAccent: mk(0x7a5435,0.68,0.04), warmLantern: mk(0xfff0cc,0.3,0,{emissive:0xf59e0b,emissiveIntensity:0.8}), foliage: mk(0x4d7c4f,0.86,0.02) };
}
