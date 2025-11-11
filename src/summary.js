export function drawGraph(canvas, timeline){
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = devicePixelRatio||1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width!==W*dpr || canvas.height!==H*dpr){ canvas.width=W*dpr; canvas.height=H*dpr; }
  ctx.save(); ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle="#f7fafc"; ctx.fillRect(0,0,W,H);
  const mid = H/2; ctx.strokeStyle="#cbd5e0"; ctx.beginPath(); ctx.moveTo(0,mid); ctx.lineTo(W,mid); ctx.stroke();
  if (!timeline?.length){ ctx.restore(); return; }
  let minZ=0,maxZ=0; for (const p of timeline){ if(p.zone<minZ)minZ=p.zone; if(p.zone>maxZ)maxZ=p.zone; }
  minZ-=.4; maxZ+=.4; const xStep = W/Math.max(1,timeline.length-1); const y = z => H - ((z-minZ) * (H-16)/(maxZ-minZ));
  for (let i=1;i<timeline.length;i++){
    const a=timeline[i-1], b=timeline[i];
    ctx.strokeStyle = ((a.zone+b.zone)/2)>=0 ? "#2b6cb0" : "#c53030";
    ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo((i-1)*xStep,y(a.zone)); ctx.lineTo(i*xStep,y(b.zone)); ctx.stroke();
  }
  const last=timeline.at(-1); ctx.fillStyle= last.zone>=0? "#2b6cb0":"#c53030"; ctx.beginPath(); ctx.arc((timeline.length-1)*xStep, y(last.zone),4,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
