import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Детальная визуальная модель «Спортплощадка» (docs/houses2 sports-ground).
 * Визуал-упрощённый порт (корт/разметка, ограждение, турники/снаряды по фичам), коллизии остаются у данных.
 * Локальные координаты: центр XZ в (0,0), низ (основание) в y=0.
 */

class Batcher {
  constructor(){ this.b={wall:[],roof:[],trim:[],foundation:[],stoneStep:[],glass:[],metalAccent:[],timberAccent:[],paintZone:[],lineWhite:[],sportOrange:[],lampGlow:[],ledCyan:[]};
    this.box=new THREE.BoxGeometry(1,1,1); this.cyl=new THREE.CylinderGeometry(1,1,1,12); this.torus=new THREE.TorusGeometry(1,0.06,8,18);
    this.m4=new THREE.Matrix4(); this.p=new THREE.Vector3(); this.q=new THREE.Quaternion(); this.s=new THREE.Vector3(); this.e=new THREE.Euler(); }
  addBox(k,w,h,d,x,y,z,rx=0,ry=0,rz=0){const g=this.box.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(w,h,d); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addCyl(k,rb,rt,h,x,y,z,rx=0,ry=0,rz=0){const u=Math.abs(rb-rt)<1e-4; const g=u?this.cyl.clone().toNonIndexed():new THREE.CylinderGeometry(rt,rb,1,12).toNonIndexed(); this.p.set(x,y,z); this.e.set(rx,ry,rz); this.q.setFromEuler(this.e); this.s.set(u?rb:1,h,u?rb:1); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addRing(k,r,x,y,z){const g=this.torus.clone().toNonIndexed(); this.p.set(x,y,z); this.e.set(Math.PI/2,0,0); this.q.setFromEuler(this.e); this.s.set(r,r,r); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  addBeam(k,ax,ay,az,bx,by,bz,t=0.06){const dx=bx-ax,dy=by-ay,dz=bz-az,len=Math.hypot(dx,dy,dz); if(len<1e-4) return; const g=this.box.clone().toNonIndexed(); const dir=new THREE.Vector3(dx/len,dy/len,dz/len); this.q.setFromUnitVectors(new THREE.Vector3(1,0,0),dir); this.p.set((ax+bx)/2,(ay+by)/2,(az+bz)/2); this.s.set(len,t,t); this.m4.compose(this.p,this.q,this.s); g.applyMatrix4(this.m4); this.b[k].push(g);} 
  build(mats){this.box.dispose(); this.cyl.dispose(); this.torus.dispose(); const meshes=[]; for(const [k,gs] of Object.entries(this.b)){ if(!gs.length) continue; const m=mergeGeometries(gs,false); for(const g of gs) g.dispose(); if(!m) continue; const mesh=new THREE.Mesh(m, mats[k]||mats.wall); mesh.name=`SportsGround_${k}`; mesh.castShadow = k!=='glass' && k!=='lampGlow' && k!=='ledCyan' && k!=='lineWhite' && k!=='paintZone'; mesh.receiveShadow = k!=='glass' && k!=='lampGlow' && k!=='ledCyan'; meshes.push(mesh);} return meshes;} 
}

export function buildDetailedSportsGround(config, materials){
  const width=config.width, depth=config.depth, fenceH=config.floorHeight||3.2;
  const foundationHeight=config.foundationHeight ?? 0.12;
  const roofPitchDeg=config.roofPitchDeg ?? 14;
  const roofOverhang=config.roofOverhang ?? 0.6;
  const roofType=config.roofType ?? 'flat';
  const hasPorch=config.hasPorch !== false;
  const hasChimney=config.hasChimney !== false;
  const hasCornerAccents=config.hasCornerAccents !== false;
  const fullFrontFence=config.hasBalcony !== false;

  const b=new Batcher();
  const baseY=0; const hw=width/2, hd=depth/2;
  const apron=0.6 + roofOverhang*0.8; const totalW=width+apron*2, totalD=depth+apron*2;
  b.addBox('foundation', totalW+0.3, foundationHeight, totalD+0.3, 0, foundationHeight/2, 0);
  b.addBox('roof', totalW, 0.03, totalD, 0, foundationHeight+0.015, 0);
  b.addBox('wall', width, 0.03, depth, 0, foundationHeight+0.035, 0); // court surface

  // markings
  const ly=foundationHeight+0.055; const lw=0.09;
  b.addBox('lineWhite', width, 0.015, lw, 0, ly, hd); b.addBox('lineWhite', width, 0.015, lw, 0, ly, -hd);
  b.addBox('lineWhite', lw, 0.015, depth, hw, ly, 0); b.addBox('lineWhite', lw, 0.015, depth, -hw, ly, 0);
  b.addBox('lineWhite', width, 0.015, lw, 0, ly, 0);
  b.addBox('paintZone', Math.min(width*0.28, 6.0), 0.014, Math.min(depth*0.22, 4.0), 0, foundationHeight+0.05, hd*0.45);
  b.addBox('paintZone', Math.min(width*0.28, 6.0), 0.014, Math.min(depth*0.22, 4.0), 0, foundationHeight+0.05, -hd*0.45);

  // fence
  const fx=hw+0.2, fz=hd+0.2; const postStep=Math.max(2.0, Math.min(3.0, width/6));
  const postsX=[]; for(let x=-fx;x<=fx+0.01;x+=postStep) postsX.push(Math.max(-fx, Math.min(fx,x)));
  const postsZ=[]; for(let z=-fz;z<=fz+0.01;z+=postStep) postsZ.push(Math.max(-fz, Math.min(fz,z)));
  for(const x of postsX){ b.addCyl('trim', 0.05,0.05,fenceH, x, baseY+fenceH/2, fz); b.addCyl('trim', 0.05,0.05,fenceH, x, baseY+fenceH/2, -fz); }
  for(const z of postsZ){ b.addCyl('trim', 0.05,0.05,fenceH, fx, baseY+fenceH/2, z); b.addCyl('trim', 0.05,0.05,fenceH, -fx, baseY+fenceH/2, z); }
  b.addBox('metalAccent', totalW*0.95, 0.04, 0.04, 0, baseY+fenceH, fz); b.addBox('metalAccent', totalW*0.95, 0.04, 0.04, 0, baseY+fenceH, -fz);
  b.addBox('metalAccent', 0.04, 0.04, totalD*0.95, fx, baseY+fenceH, 0); b.addBox('metalAccent', 0.04, 0.04, totalD*0.95, -fx, baseY+fenceH, 0);
  if(fullFrontFence){ b.addBox('metalAccent', Math.min(3.0,width*0.25), 0.04, 0.04, width*0.3, baseY+fenceH*0.7, fz); }

  // hoops/goals (flat or stepped)
  const hoopH=3.05; const backboardY=baseY+hoopH-0.3;
  for(const dir of [-1,1]){
    const hx=dir*(hw*0.15); const hz=dir*(hd - 0.8);
    b.addCyl('trim', 0.07,0.07,hoopH, hx, baseY+hoopH/2, hz);
    b.addBox('glass', 1.4, 0.8, 0.05, hx, backboardY, hz - dir*0.25);
    b.addRing('sportOrange', 0.22, hx, backboardY-0.2, hz - dir*0.5);
    if(roofType==='stepped'){
      // mini goal
      b.addCyl('trim', 0.05,0.05,2.0, hx-1.0, baseY+1.0, hz); b.addCyl('trim', 0.05,0.05,2.0, hx+1.0, baseY+1.0, hz); b.addBeam('trim', hx-1.0,baseY+2.0,hz, hx+1.0,baseY+2.0,hz,0.05);
    }
  }

  // canopy for gable
  if(roofType==='gable'){
    const canopyY=baseY+fenceH+1.2; const rise=Math.max(1.0, Math.tan((roofPitchDeg*Math.PI)/180)*(depth*0.25));
    b.addBox('roof', width*0.9, 0.12, depth*0.55, 0, canopyY+rise*0.4, -depth*0.2, -0.25,0,0);
    b.addBox('roof', width*0.9, 0.12, depth*0.55, 0, canopyY+rise*0.4, depth*0.2, 0.25,0,0);
    b.addBeam('trim', -width*0.4, baseY+fenceH, -fz, -width*0.4, canopyY, 0, 0.08);
    b.addBeam('trim', width*0.4, baseY+fenceH, -fz, width*0.4, canopyY, 0, 0.08);
  }

  if(hasPorch){
    // bleachers
    const sw=Math.min(width*0.5, 10.0), sz=-fz-1.2;
    b.addBox('foundation', sw+0.3, foundationHeight+0.05, 2.2, 0, (foundationHeight+0.05)/2, sz);
    for(let t=0;t<3;t++){ b.addBox('timberAccent', sw, 0.08, 0.45, 0, baseY+0.35+t*0.4, sz+0.6-t*0.6); }
  }

  if(hasChimney){
    const mh=Math.max(fenceH+2.4, 5.5);
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const mx=sx*(fx+0.3), mz=sz*(fz+0.3);
      b.addCyl('trim', 0.07,0.1,mh, mx, baseY+mh/2, mz);
      b.addBox('lampGlow', 0.7, 0.25, 0.15, mx - sx*0.25, baseY+mh-0.1, mz - sz*0.2, 0.3, Math.atan2(-sz,-sx), 0);
    }
  }

  if(hasCornerAccents){
    // workout rig
    const wx=fx+2.0, wz=0.8; const rigH=2.3;
    b.addBox('roof', 2.8, 0.04, 4.2, wx, baseY+0.04, wz);
    for(const [px,pz] of [[wx-0.7,wz-1.2],[wx+0.7,wz-1.2],[wx-0.7,wz+0.2],[wx+0.7,wz+0.2]]) b.addCyl('sportOrange', 0.05,0.05,rigH, px, baseY+rigH/2, pz);
    b.addBeam('metalAccent', wx-0.7, baseY+rigH-0.05, wz-1.2, wx+0.7, baseY+rigH-0.05, wz-1.2, 0.05);
    b.addBeam('metalAccent', wx-0.7, baseY+rigH-0.05, wz+0.2, wx+0.7, baseY+rigH-0.05, wz+0.2, 0.05);
    for(let r=0;r<4;r++){ const rz=wz-1.0 + r*0.4; b.addBeam('metalAccent', wx-0.7, baseY+rigH-0.05, rz, wx+0.7, baseY+rigH-0.05, rz, 0.04); }
    // scoreboard
    b.addBox('trim', 2.4, 0.8, 0.16, 0, baseY+fenceH+0.45, -fz);
    b.addBox('ledCyan', 0.7, 0.4, 0.04, -0.55, baseY+fenceH+0.5, -fz+0.1);
    b.addBox('sportOrange', 0.7, 0.4, 0.04, 0.55, baseY+fenceH+0.5, -fz+0.1);
  }

  return b.build(materials);
}

export function makeSportsGroundMaterials(wallColorHex = '#2f7d32'){
  const mk=(c,r=0.8,m=0.05,e={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...e});
  return { wall: mk(new THREE.Color(wallColorHex),0.9,0.02), roof: mk(0x6b7280,0.8,0.08), trim: mk(0x9ca3af,0.5,0.35), foundation: mk(0x808890,0.88,0.03), stoneStep: mk(0xa0a6ad,0.8,0.04), glass: new THREE.MeshPhysicalMaterial({color:0xaed6f1,transparent:true,opacity:0.3,roughness:0.06,metalness:0,transmission:0.12}), metalAccent: mk(0x59626d,0.45,0.55), timberAccent: mk(0x7a5435,0.72,0.04), paintZone: mk(0x2563eb,0.85,0.02), lineWhite: mk(0xf8fafc,0.72,0.0), sportOrange: mk(0xea580c,0.34,0.38), lampGlow: mk(0xfef9c3,0.2,0,{emissive:0xfde047,emissiveIntensity:1.2}), ledCyan: mk(0x38bdf8,0.25,0,{emissive:0x0ea5e9,emissiveIntensity:1.1}) };
}
