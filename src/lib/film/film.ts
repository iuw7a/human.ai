/**
 * Film page helpers: extraction, validation, and a hand-written fallback film.
 *
 * The large model is asked to write the whole HTML film. We validate it; if it
 * fails, the router escalates one tier. If every model fails we still deliver,
 * using this fallback engine with the plan's scenes/text/images.
 */

import type { FilmPlan } from "./prompts";
import { BRAND } from "./prompts";

/** Pull the HTML document out of a model reply (strips fences/commentary). */
export function extractHtml(text: string): string {
  let t = text.trim();
  t = t.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const docStart = t.search(/<!doctype\s+html|<html[\s>]/i);
  if (docStart > 0) t = t.slice(docStart);
  const end = t.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) t = t.slice(0, end + 7);
  return t.trim();
}

export interface FilmCheck {
  ok: boolean;
  problems: string[];
}

/** Structural check for a self-contained film page. */
export function validateFilm(html: string): FilmCheck {
  const problems: string[] = [];
  const lower = html.toLowerCase();
  if (html.length < 3000) problems.push("too short to be a full film page");
  if (!/<canvas[\s>]/i.test(html)) problems.push("no <canvas> stage");
  if (!/audiocontext|webkit-?audiocontext/i.test(html)) problems.push("no Web Audio");
  if (!/function\s+render\s*\(|render\s*=\s*(function|\()/i.test(html)) problems.push("no render(t) clock");
  if (!/requestanimationframe/i.test(html)) problems.push("no animation loop");
  if (!/humanai-play/i.test(html)) problems.push("no play message listener");
  if (!lower.includes("</html>")) problems.push("document not closed");
  const open = (html.match(/<script[\s>]/gi) ?? []).length;
  const close = (html.match(/<\/script>/gi) ?? []).length;
  if (open !== close) problems.push(`unbalanced <script> tags (${open}/${close})`);
  return { ok: problems.length === 0, problems };
}

function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

/**
 * A compact, phone-safe film engine (canvas + Web Audio + DOM text) driven by
 * the plan. Used as a guaranteed deliverable when the model's HTML fails.
 */
export function fallbackFilm(plan: FilmPlan, images: { url: string; prompt: string }[], brief: string): string {
  const data = {
    title: plan.title,
    duration: plan.duration,
    palette: plan.palette,
    accent: BRAND.accent,
    ink: BRAND.ink,
    text: BRAND.text,
    scenes: plan.scenes,
    images: images.map((i) => i.url),
    brief,
  };
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${plan.title.replace(/[<>&]/g, "")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:#000;overflow:hidden;font-family:'Cairo',system-ui,sans-serif}
  #stage{position:absolute;top:50%;left:50%;width:1920px;height:1080px;transform-origin:center center;background:#000;overflow:hidden}
  canvas{position:absolute;inset:0;width:100%;height:100%}
  .dom{position:absolute;inset:0;direction:rtl}
  .bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity .8s ease}
  .bg.on{opacity:.42}
  .veil{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%, rgba(9,9,11,.15), rgba(9,9,11,.92) 78%)}
  .scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 140px}
  .scene h1{font-size:96px;font-weight:800;color:#fff;line-height:1.25;text-shadow:0 0 40px rgba(229,72,77,.35)}
  .scene h2{font-size:44px;font-weight:600;color:${BRAND.accentHover};margin-top:22px}
  .brand{position:absolute;top:56px;right:72px;display:flex;align-items:center;gap:14px;font-weight:800;font-size:30px;color:#fff}
  .brand i{width:22px;height:22px;border-radius:50%;background:${BRAND.accent};box-shadow:0 0 28px ${BRAND.accent}}
  .bar{position:absolute;left:0;bottom:0;height:4px;background:${BRAND.accent};width:0}
  #overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;background:rgba(0,0,0,.72);z-index:5}
  #overlay h1{color:#fff;font-size:52px;font-weight:800}
  #overlay p{color:#a1a1aa;font-size:22px}
  #play{border:none;background:${BRAND.accent};color:#fff;font-family:inherit;font-weight:700;font-size:26px;padding:18px 54px;border-radius:999px;cursor:pointer;box-shadow:0 0 40px rgba(229,72,77,.5)}
  .ctrls{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center;gap:10px;z-index:4}
  .ctrls button{background:rgba(20,20,24,.85);color:#fff;border:1px solid rgba(255,255,255,.14);font-family:inherit;font-size:14px;padding:8px 16px;border-radius:999px;cursor:pointer}
</style>
</head>
<body>
<div id="stage">
  <canvas id="cv"></canvas>
  <div class="dom">
    <div class="bg" id="bg0"></div><div class="bg" id="bg1"></div>
    <div class="veil"></div>
    <div class="brand"><i></i>Human AI</div>
    <div class="scene"><h1 id="line"></h1><h2 id="sub"></h2></div>
    <div class="bar" id="bar"></div>
  </div>
  <div class="ctrls">
    <button data-a="play">تشغيل</button>
    <button data-a="pause">إيقاف</button>
    <button data-a="replay">إعادة</button>
    <button data-a="sound">الصوت</button>
    <button data-a="full">ملء الشاشة</button>
  </div>
  <div id="overlay"><h1>${plan.title.replace(/[<>&]/g, "")}</h1><p>إعلان ${plan.duration} ثانية · Human AI</p><button id="play">تشغيل ▶</button></div>
</div>
<script>
(function(){
  var DATA = ${safeJson(data)};
  var stage=document.getElementById('stage'), cv=document.getElementById('cv'), ctx=cv.getContext('2d');
  var lineEl=document.getElementById('line'), subEl=document.getElementById('sub'), barEl=document.getElementById('bar');
  var overlay=document.getElementById('overlay'), bg=[document.getElementById('bg0'),document.getElementById('bg1')];
  var DPR=Math.min(1.5,window.devicePixelRatio||1), scale=1, W=1920, H=1080;
  function fit(){
    scale=Math.min(window.innerWidth/1920, window.innerHeight/1080);
    stage.style.transform='translate(-50%,-50%) scale('+scale+')';
    var cw=Math.round(1920*scale*DPR), ch=Math.round(1080*scale*DPR);
    cv.width=Math.min(1920*DPR, cw); cv.height=Math.min(1080*DPR, ch);
  }
  fit(); window.addEventListener('resize',fit);
  var K=460, parts=[];
  for(var i=0;i<K;i++) parts.push({x:Math.random()*1920,y:Math.random()*1080,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,r:Math.random()*2+.6});
  function glow(){var g=ctx.createRadialGradient(0,0,0,0,0,60);g.addColorStop(0,'rgba(229,72,77,.5)');g.addColorStop(1,'rgba(229,72,77,0)');return g;}
  var sprite=null;
  function makeSprite(){var c=document.createElement('canvas');c.width=c.height=128;var g=c.getContext('2d');var rg=g.createRadialGradient(64,64,0,64,64,64);rg.addColorStop(0,'rgba(229,72,77,.8)');rg.addColorStop(1,'rgba(229,72,77,0)');g.fillStyle=rg;g.fillRect(0,0,128,128);sprite=c;}

  function sceneAt(t){var s=DATA.scenes;for(var i=0;i<s.length;i++){if(t>=s[i].start&&t<s[i].end)return{i:i,s:s[i]};}return{i:s.length-1,s:s[s.length-1]};}
  function activeText(t){var c=sceneAt(t);var local=t-c.s.start, len=Math.max(1,c.s.end-c.s.start);var ch=Math.ceil(c.s.text.length*Math.min(1,local/Math.min(1.6,len)));return c.s.text.slice(0,ch);}

  function render(t){
    var c=sceneAt(t), active=c.i;
    // background images
    var imgIdx=DATA.images.length? active % DATA.images.length : -1;
    for(var b=0;b<2;b++){var on=(imgIdx===b);bg[b].classList.toggle('on',on);}
    lineEl.textContent=activeText(t);
    subEl.textContent=(c.s.visual||'');
    barEl.style.width=(100*t/DATA.duration)+'%';
    // canvas
    var cx=cv.width/2, cy=cv.height/2;
    ctx.fillStyle='#09090b'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.globalCompositeOperation='lighter';
    for(var i=0;i<parts.length;i++){var p=parts[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=1920;if(p.x>1920)p.x=0;if(p.y<0)p.y=1080;if(p.y>1080)p.y=0;}
    ctx.strokeStyle='rgba(229,72,77,.10)';ctx.lineWidth=1;
    for(var i=0;i<parts.length;i++){for(var j=i+1;j<i+4&&j<parts.length;j++){var a=parts[i],b2=parts[j],dx=a.x-b2.x,dy=a.y-b2.y;if(dx*dx+dy*dy<26000){ctx.beginPath();ctx.moveTo(a.x*DPR*scale,a.y*DPR*scale);ctx.lineTo(b2.x*DPR*scale,b2.y*DPR*scale);ctx.stroke();}}}
    if(sprite){var pulse=.5+.5*Math.sin(t*2);for(var i=0;i<parts.length;i+=6){ctx.globalAlpha=.25+pulse*.25;ctx.drawImage(sprite,parts[i].x*DPR*scale-40,parts[i].y*DPR*scale-40,80,80);}ctx.globalAlpha=1;}
    ctx.globalCompositeOperation='source-over';
  }
  function poster(){render(0);}

  var t=0, raf=0, last=0, playing=false, ftAvg=16, quality=1;
  function frame(ts){if(!playing)return;var dt=last?(ts-last)/1000:0;last=ts;ftAvg=ftAvg*.9+((ts-(last-dt*1000))||16)*.1;t+=dt;if(t>DATA.duration)t=DATA.duration;render(t);if(t>=DATA.duration){playing=false;stopAudio();return;}raf=requestAnimationFrame(frame);}
  function play(){if(playing)return;if(t>=DATA.duration)t=0;playing=true;last=0;overlay.style.display='none';startAudio();raf=requestAnimationFrame(frame);}
  function pause(){playing=false;cancelAnimationFrame(raf);last=0;stopAudio();}
  function replay(){pause();t=0;render(0);overlay.style.display='flex';}

  // ---- Web Audio (no files) ----
  var AU=null;
  function startAudio(){try{var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;AU=new AC();var m=AU.createGain();m.gain.value=.5;m.connect(AU.destination);AU._m=m;drone(AU,m);schedule(AU,m);}catch(e){}}
  function stopAudio(){if(AU){try{AU.close();}catch(e){}AU=null;}}
  function tone(AU,dst,type,freq,start,dur,gain){var o=AU.createOscillator(),g=AU.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(gain,start+.02);g.gain.exponentialRampToValueAtTime(.0001,start+dur);o.connect(g);g.connect(dst);o.start(start);o.stop(start+dur+.05);}
  function drone(AU,dst){var now=AU.currentTime;tone(AU,dst,'sine',55,now,DATA.duration+2,.18);tone(AU,dst,'sine',82.4,now+.1,DATA.duration+2,.10);tone(AU,dst,'triangle',110,now+.2,DATA.duration+2,.06);}
  function boom(AU,dst,at){var o=AU.createOscillator(),g=AU.createGain();o.type='sine';o.frequency.setValueAtTime(120,at);o.frequency.exponentialRampToValueAtTime(38,at+.5);g.gain.setValueAtTime(.6,at);g.gain.exponentialRampToValueAtTime(.001,at+.9);o.connect(g);g.connect(dst);o.start(at);o.stop(at+1);}
  function riser(AU,dst,at,dur){var o=AU.createOscillator(),g=AU.createGain();o.type='sawtooth';o.frequency.setValueAtTime(180,at);o.frequency.exponentialRampToValueAtTime(1400,at+dur);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.14,at+dur*.9);g.gain.exponentialRampToValueAtTime(.0001,at+dur);o.connect(g);g.connect(dst);o.start(at);o.stop(at+dur+.05);}
  function schedule(AU,dst){var now=AU.currentTime;var beat=0.5;for(var b=0;b<DATA.duration/beat;b++){var at=now+b*beat;tone(AU,dst,'sine',150,at,.12,.16);tone(AU,dst,'square',6000,at+beat/2,.03,.03);}
    for(var i=0;i<DATA.scenes.length;i++){var s=DATA.scenes[i];tone(AU,dst,'sawtooth',220,now+s.start,.25,.06);var ticks=Math.min(14,Math.floor(s.text.length));for(var k=0;k<ticks;k++)tone(AU,dst,'square',1800,now+s.start+k*.06,.02,.02);}
    var lastS=DATA.scenes[DATA.scenes.length-1];riser(AU,dst,now+Math.max(0,lastS.start-3),3);boom(AU,dst,now+lastS.start);
    [261.6,329.6,392,523.3].forEach(function(f,idx){tone(AU,dst,'sine',f,now+DATA.duration-1.6+idx*.08,1.6,.09);});
  }

  document.querySelectorAll('.ctrls button').forEach(function(b){b.addEventListener('click',function(){var a=b.getAttribute('data-a');if(a==='play')play();else if(a==='pause')pause();else if(a==='replay')replay();else if(a==='sound'){if(AU)stopAudio();else startAudio();}else if(a==='full'){var el=document.documentElement;if(document.fullscreenElement)document.exitFullscreen();else el.requestFullscreen&&el.requestFullscreen();}});});
  document.getElementById('play').addEventListener('click',play);
  document.addEventListener('keydown',function(e){if(e.code==='Space'){e.preventDefault();playing?pause():play();}else if(e.key==='m'||e.key==='M'){if(AU)stopAudio();else startAudio();}else if(e.key==='r'||e.key==='R'){replay();}else if(e.key==='f'||e.key==='F'){var el=document.documentElement;if(document.fullscreenElement)document.exitFullscreen();else el.requestFullscreen&&el.requestFullscreen();}});
  window.addEventListener('message',function(e){if(e&&e.data&&e.data.type==='humanai-play')play();});
  makeSprite(); poster();
  // adaptive quality
  setInterval(function(){if(ftAvg>38&&quality>0.5){quality-=0.1;DPR=Math.min(1.5,window.devicePixelRatio||1)*quality;cv.width=Math.round(1920*scale*DPR);cv.height=Math.round(1080*scale*DPR);}},
  1500);
})();
</script>
</body>
</html>`;
}
