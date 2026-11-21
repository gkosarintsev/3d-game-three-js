import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Стадион» (docs/houses2 stadium).
 * Визуал-упрощённый порт (чаша, поле, трибуны, мачты), коллизии остаются у данных.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.b={wall:[],roof:[],trim:[],door:[],foundation:[],stoneStep:[],glass:[],glassBacking:[],metalAccent:[],pitchTurf:[],pitchStripe:[],trackClay:[],seatBlue:[],whiteLine:[],ledGlow:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,12);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.s=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(k,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(w,h,d); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addCyl(k,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,12).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  build(mats){this.box.dispose(); this.cyl.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.b)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, mats[k]||mats.wall); mesh.name=`Stadium_${k}`; const glow=k==='ledGlow'; mesh.castShadow = k!=='glass' && k!=='whiteLine' && k!=='pitchStripe' && !glow; mesh.receiveShadow = k!=='glass' && !glow; meshes.push(mesh);} return meshes;} 
}

export function buildDetailedStadium(config, materials){
  const width=config.width, depth=config.depth, floors=config.floors||2, floorHeight=config.floorHeight||4.0;
  const foundationHeight=config.foundationHeight ?? 0.8;
  const roofOverhang=config.roofOverhang ?? 1.2;
  const roofType=config.roofType ?? 'stepped';
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;

  const b=new Batcher();
  const baseY=0; const bowlH=Math.max(floorHeight*floors, 6.0); const rimY=baseY+bowlH;

  // base podium
  b.addBox('foundation', width+1.0, foundationHeight, depth+1.0, 0, foundationHeight/2, 0);
  b.addBox('stoneStep', width+1.4, 0.2, depth+1.4, 0, foundationHeight, 0);

  // outer bowl walls
  const t=2.2;
  b.addBox('wall', width, bowlH, t, 0, baseY+bowlH/2, depth/2 - t/2);
  b.addBox('wall', width, bowlH, t, 0, baseY+bowlH/2, -depth/2 + t/2);
  b.addBox('wall', t, bowlH, depth, width/2 - t/2, baseY+bowlH/2, 0);
  b.addBox('wall', t, bowlH, depth, -width/2 + t/2, baseY+bowlH/2, 0);

  // seating tiers (visual rings approximated by inner walls/steps)
  const tiers=Math.max(2, Math.min(4, floors));
  for(let i=0;i<tiers;i++){
    const inset=3.0 + i*1.6; const h=(i+1)*(bowlH/(tiers+1));
    const iw=width - inset*2, id=depth - inset*2;
    b.addBox('seatBlue', iw, 0.35, 1.0, 0, baseY+h, id/2-0.5);
    b.addBox('seatBlue', iw, 0.35, 1.0, 0, baseY+h, -id/2+0.5);
    b.addBox('seatBlue', 1.0, 0.35, id, iw/2-0.5, baseY+h, 0);
    b.addBox('seatBlue', 1.0, 0.35, id, -iw/2+0.5, baseY+h, 0);
    b.addBox('stoneStep', iw, 0.2, 1.2, 0, baseY+h-0.25, id/2-0.6);
    b.addBox('stoneStep', iw, 0.2, 1.2, 0, baseY+h-0.25, -id/2+0.6);
    b.addBox('stoneStep', 1.2, 0.2, id, iw/2-0.6, baseY+h-0.25, 0);
    b.addBox('stoneStep', 1.2, 0.2, id, -iw/2+0.6, baseY+h-0.25, 0);
  }

  // pitch
  const pitchW=Math.max(20, width*0.55), pitchD=Math.max(12, depth*0.45);
  b.addBox('pitchTurf', pitchW, 0.06, pitchD, 0, baseY+foundationHeight+0.03, 0);
  b.addBox('pitchStripe', pitchW*0.95, 0.065, pitchD*0.18, 0, baseY+foundationHeight+0.035, pitchD*0.25);
  b.addBox('pitchStripe', pitchW*0.95, 0.065, pitchD*0.18, 0, baseY+foundationHeight+0.035, -pitchD*0.25);
  // markings
  b.addBox('whiteLine', pitchW, 0.07, 0.12, 0, baseY+foundationHeight+0.04, pitchD/2);
  b.addBox('whiteLine', pitchW, 0.07, 0.12, 0, baseY+foundationHeight+0.04, -pitchD/2);
  b.addBox('whiteLine', 0.12, 0.07, pitchD, pitchW/2, baseY+foundationHeight+0.04, 0);
  b.addBox('whiteLine', 0.12, 0.07, pitchD, -pitchW/2, baseY+foundationHeight+0.04, 0);
  b.addBox('whiteLine', pitchW, 0.07, 0.12, 0, baseY+foundationHeight+0.04, 0);
  // track
  b.addBox('trackClay', pitchW+6, 0.05, 2.2, 0, baseY+foundationHeight+0.025, pitchD/2 + 2.0);
  b.addBox('trackClay', pitchW+6, 0.05, 2.2, 0, baseY+foundationHeight+0.025, -pitchD/2 - 2.0);

  // roof/canopy
  if(roofType!=='none'){
    const over=roofOverhang; const canopyH=rimY + 0.6;
    b.addBox('roof', width*0.8, 0.35, 3.0+over, 0, canopyH, depth/2 - 1.5);
    b.addBox('roof', width*0.8, 0.35, 3.0+over, 0, canopyH, -depth/2 + 1.5);
    b.addBox('metalAccent', width*0.78, 0.25, 0.25, 0, canopyH-0.2, depth/2 - 2.8);
    b.addBox('metalAccent', width*0.78, 0.25, 0.25, 0, canopyH-0.2, -depth/2 + 2.8);
  }

  // entries / concourse hints
  if(hasPorch){
    b.addBox('door', 4.0, 3.2, 0.2, 0, baseY+1.6, depth/2+0.05);
    b.addBox('trim', 4.4, 0.3, 1.2, 0, baseY+3.4, depth/2+0.6);
  }

  // floodlight masts
  if(hasChimney){
    const mh=Math.max(8.0, bowlH*0.8 + 4.0);
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const mx=sx*(width/2 - 1.2), mz=sz*(depth/2 - 1.2);
      b.addCyl('metalAccent', 0.25,0.18,mh, mx, baseY+mh/2, mz);
      b.addBox('trim', 2.8, 0.8, 0.3, mx - sx*1.2, baseY+mh+0.2, mz, 0.25, Math.atan2(-sz,-sx), 0);
      b.addBox('ledGlow', 2.4, 0.5, 0.12, mx - sx*1.3, baseY+mh+0.12, mz - sz*0.1, 0.25, Math.atan2(-sz,-sx), 0);
    }
  }

  if(hasCornerAccents){
    b.addBox('trim', 3.0, 1.0, 0.2, 0, rimY+0.8, -depth/2+0.2);
    b.addBox('ledGlow', 1.0, 0.5, 0.05, -0.8, rimY+0.85, -depth/2+0.32);
    b.addBox('ledGlow', 1.0, 0.5, 0.05, 0.8, rimY+0.85, -depth/2+0.32);
  }

  return b.build(materials);
}

export function makeStadiumMaterials(wallColorHex = '#9aa3ad'){
  const mk=(c,r=0.7,m=0.1,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.78,0.05), roof: mk(0x6b7280,0.55,0.25), trim: mk(0xd1d5db,0.45,0.2), door: mk(0x4b5563,0.5,0.2), foundation: mk(0x808890,0.88,0.03), stoneStep: mk(0xa0a6ad,0.8,0.04), glass: new THREE.MeshPhysicalMaterial({color:0xaed6f1,transparent:true,opacity:0.3,roughness:0.06,metalness:0,transmission:0.12}), glassBacking: mk(0x10161f,0.9,0), metalAccent: mk(0x59626d,0.42,0.55), pitchTurf: mk(0x2f7d32,0.9,0.02), pitchStripe: mk(0x3e9442,0.9,0.02), trackClay: mk(0xb85c38,0.85,0.02), seatBlue: mk(0x2563eb,0.7,0.05), whiteLine: mk(0xf8fafc,0.6,0.02), ledGlow: mk(0xfef08a,0.2,0,{emissive:0xfde047,emissiveIntensity:1.1}) };
}
