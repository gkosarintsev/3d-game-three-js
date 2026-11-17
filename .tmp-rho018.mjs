import { runCitygen } from "./tools/citygen/index.mjs";
function makeSynthetic(profileId, seed) {
  return {
    schemaVersion: 4, metadata: { levelName: `etalon-${profileId}-${seed}` },
    ground: { size: 1280, y: 0 },
    stream: { chunk: 256, keep: 1, aheadMin: 200, aheadMax: 900, budgetMs: 120 },
    cityforge: {},
    generator: {
      generatorVersion: "0.18.0", seed, deterministic: true, profile: profileId,
      stages: [{id:"terrain",enabled:true},{id:"hydrology",enabled:true},{id:"settlement",enabled:true},{id:"roads",enabled:true},{id:"parcels",enabled:true},{id:"buildings",enabled:true},{id:"finish",enabled:true}],
      landscape: { generate: true, profileDriven: true },
      transport: { generate: false },
    },
    gameplay: { spawn: { x: 0, z: 0 }, exit: { x: 100, z: 100 } },
  };
}
function agg(nums){ const a=nums.filter(n=>Number.isFinite(n)).sort((x,y)=>x-y); if(!a.length) return null; const sum=a.reduce((s,n)=>s+n,0); const mean=sum/a.length; const med=a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2; const p=(q)=>{ if(a.length===1) return a[0]; const idx=(a.length-1)*q; const lo=Math.floor(idx),hi=Math.ceil(idx); if(lo===hi) return a[lo]; return a[lo]*(hi-idx)+a[hi]*(idx-lo); }; return {n:a.length,min:a[0],p5:p(0.05),median:med,mean:+mean.toFixed(6),p95:p(0.95),max:a[a.length-1],okCount:a.filter(v=>v>=0.6).length}; }
const profiles=["river_trade","hill_town","railway_industrial"];
const out={generatorVersion:"0.18.0",transport:false,seeds:"1..100",profiles:{}};
for(const profile of profiles){ const vals=[]; let missing=0; for(let seed=1; seed<=100; seed++){ const r=runCitygen(structuredClone(makeSynthetic(profile,seed))); const d=(r.report.diagnostics||[]).find(x=>x.code==="pressure_area_spearman"); if(d && Number.isFinite(d.rho)) vals.push(+d.rho); else missing++; } out.profiles[profile]={rho:agg(vals),missing}; }
console.log(JSON.stringify(out,null,2));
