export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
export const fmt = n => (n>=0? "+" : "") + n.toFixed(2);

export function mulberry32(seedStr){
  let h = 1779033703 ^ seedStr.length;
  for (let i=0;i<seedStr.length;i++){
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h<<13) | (h>>>19);
  }
  return function(){
    h = Math.imul(h ^ (h>>>16), 2246822507);
    h = Math.imul(h ^ (h>>>13), 3266489909);
    const t = (h ^= h>>>16) >>> 0;
    return t / 4294967296;
  };
}
