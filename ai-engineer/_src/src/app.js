(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const PALETTE=()=>["--c1","--c2","--c3","--c4","--c5","--c6"].map(css);

/* ---------- theme ---------- */
const themeBtn=$("#themeBtn");
function applyTheme(t){if(t==="auto")document.documentElement.removeAttribute("data-theme");else document.documentElement.setAttribute("data-theme",t);themeBtn.textContent=t==="dark"?"🌙":t==="light"?"☀️":"🌓";themeBtn.title=t==="auto"?"Motyw: systemowy":t==="light"?"Motyw: jasny":"Motyw: ciemny";redrawAll()}
let theme=store.get("aieng-theme","auto");
themeBtn.addEventListener("click",()=>{theme=theme==="auto"?"light":theme==="light"?"dark":"auto";store.set("aieng-theme",theme);applyTheme(theme)});

/* ---------- nav ---------- */
const modules=$$("section.module");
const nav=$("#navList"), side=$("#sidebar"), scrim=$("#scrim");
let done=store.get("aieng-done",{});
function buildNav(){
  nav.innerHTML="";
  modules.forEach((m,i)=>{
    const a=document.createElement("a");a.href="#"+m.id;a.dataset.id=m.id;
    a.innerHTML=`<span class="num">${m.dataset.num||""}</span><span>${m.dataset.title}</span>${done[m.id]?'<span class="done">✓</span>':""}`;
    a.addEventListener("click",closeNav);nav.appendChild(a);
  });
  $$(".mod-grid a").forEach(a=>{const id=a.getAttribute("href").slice(1);a.classList.toggle("isdone",!!done[id])});
  const cnt=Object.keys(done).filter(k=>done[k]).length, total=modules.filter(m=>m.dataset.num).length;
  const el=$("#doneCount"); if(el) el.textContent=`${cnt} / ${total}`;
}
function openNav(){side.classList.add("open");scrim.classList.add("show")}
function closeNav(){side.classList.remove("open");scrim.classList.remove("show")}
$("#menuBtn").addEventListener("click",openNav);scrim.addEventListener("click",closeNav);

modules.forEach((m,i)=>{
  if(!m.dataset.num) return;
  const foot=document.createElement("div");foot.className="module-foot";
  const btn=document.createElement("button");btn.className="btn"+(done[m.id]?" done":"");
  btn.textContent=done[m.id]?"✓ Ukończony":"Oznacz moduł jako ukończony";
  btn.addEventListener("click",()=>{done[m.id]=!done[m.id];store.set("aieng-done",done);btn.className="btn"+(done[m.id]?" done":"");btn.textContent=done[m.id]?"✓ Ukończony":"Oznacz moduł jako ukończony";buildNav();markActive()});
  foot.appendChild(btn);
  const nx=modules[i+1]; if(nx){const a=document.createElement("a");a.className="btn secondary";a.href="#"+nx.id;a.textContent="Dalej: "+nx.dataset.title+" →";foot.appendChild(a)}
  m.appendChild(foot);
});
buildNav();
const pbar=$("#pbar");
function markActive(){
  let cur=modules[0];const y=window.scrollY+120;
  for(const m of modules){if(m.offsetTop<=y)cur=m}
  $$("#navList a").forEach(a=>a.classList.toggle("active",a.dataset.id===cur.id));
  const h=document.documentElement.scrollHeight-innerHeight;pbar.style.width=(h>0?scrollY/h*100:0)+"%";
}
addEventListener("scroll",()=>requestAnimationFrame(markActive),{passive:true});markActive();

/* ---------- wide diagrams: horizontal scroll on phones ---------- */
$$("figure > svg, .widget > svg").forEach(svg=>{
  const vb=(svg.getAttribute("viewBox")||"").split(/\s+/).map(Number);
  const wrap=document.createElement("div");wrap.className="svg-scroll";
  if(vb[2]>520) wrap.style.setProperty("--minw",Math.round(vb[2]*0.92)+"px");
  svg.parentNode.insertBefore(wrap,svg);wrap.appendChild(svg);
  if(vb[2]>520){const h=document.createElement("div");h.className="swipe-hint";h.textContent="← przesuń diagram →";wrap.after(h)}
});

/* ---------- code blocks ---------- */
$$(".code").forEach(c=>{
  const head=document.createElement("div");head.className="code-head";
  head.innerHTML=`<span>${c.dataset.file||c.dataset.lang||""}</span>`;
  const b=document.createElement("button");b.className="copy";b.textContent="kopiuj";
  b.addEventListener("click",()=>{const t=$("code",c).innerText;
    const ok=()=>{b.textContent="skopiowano ✓";setTimeout(()=>b.textContent="kopiuj",1500)};
    if(navigator.clipboard)navigator.clipboard.writeText(t).then(ok,()=>{});else{const ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand("copy");ok()}catch(e){}ta.remove()}});
  head.appendChild(b);c.prepend(head);
});
function highlight(){if(window.hljs){$$(".code pre code").forEach(el=>{try{window.hljs.highlightElement(el)}catch(e){}})}}
if(window.hljs)highlight();else{const s=$("#hljs-script");if(s)s.addEventListener("load",highlight)}

/* ---------- quiz ---------- */
$$(".quiz").forEach(q=>{
  const ans=+q.dataset.answer;const opts=$$("button.opt",q);
  opts.forEach((o,i)=>o.addEventListener("click",()=>{
    if(q.classList.contains("answered"))return;q.classList.add("answered");
    o.classList.add(i===ans?"right":"wrong");opts[ans].classList.add("right");
  }));
});
/* ---------- flip cards ---------- */
$$(".flip").forEach(f=>f.addEventListener("click",()=>f.classList.toggle("flipped")));
/* ---------- checklists ---------- */
const checks=store.get("aieng-checks",{});
$$(".checklist input[type=checkbox]").forEach((cb,i)=>{const id=cb.dataset.id||("c"+i);cb.checked=!!checks[id];cb.addEventListener("change",()=>{checks[id]=cb.checked;store.set("aieng-checks",checks)})});

/* ---------- widgets ---------- */
const redrawers=[];
function redrawAll(){redrawers.forEach(f=>{try{f()}catch(e){}})}
const W={};

/* tokenizer (symulacja BPE) */
W.tokenizer=function(el){
  const common=new Set("the of and to a in is it you that he was for on are as with his they i at be this have from or one had by word but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first been call who oil its now find long down day did get come made may part hello world model data token language large learn api user prompt engineer".split(" "));
  const ta=$("textarea",el), out=$(".out",el);
  function tokenize(text){
    const parts=text.match(/ ?[A-Za-zÀ-ž]+| ?\d{1,3}| ?[^\sA-Za-zÀ-ž\d]|\s+/g)||[];
    const toks=[];
    parts.forEach(p=>{
      const w=p.trim().toLowerCase();
      if(/^\s+$/.test(p)){toks.push(p);return}
      if(/^[a-z]+$/.test(w)&&(common.has(w)||w.length<=4)){toks.push(p);return}
      const pl=/[ąćęłńóśźż]/i.test(p)||!/^[ -~]+$/.test(p);
      const size=pl?3:(w.length>8?4:5);
      let s=p, first=true;
      while(s.length){const n=first&&s[0]===" "?size+1:size;toks.push(s.slice(0,n));s=s.slice(n);first=false}
    });
    return toks;
  }
  function run(){
    const t=tokenize(ta.value), pal=PALETTE();
    const html=t.map((x,i)=>`<span class="tok" style="background:color-mix(in srgb,${pal[i%6]} 22%,transparent)">${x.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\n/g,"↵\n")}</span>`).join("");
    const chars=ta.value.length;
    out.innerHTML=`<div>${html}</div><div style="margin-top:8px"><span class="stat">Znaki: <b>${chars}</b></span><span class="stat">Tokeny (≈): <b>${t.length}</b></span><span class="stat">Znaków / token: <b>${t.length?(chars/t.length).toFixed(2):0}</b></span></div>`;
  }
  ta.addEventListener("input",run);
  $$("[data-sample]",el).forEach(b=>b.addEventListener("click",()=>{ta.value=b.dataset.sample;run()}));
  run();redrawers.push(run);
};

/* sampling: temperature / top-k / top-p */
W.sampling=function(el){
  const cands=[["TypeScript",3.2],["JavaScript",3.0],["Elm",1.0],["Rust",0.8],["Python",0.6],["Dart",0.5],["PHP",0.2],["COBOL",-1.5]];
  const T=$("[name=temp]",el),K=$("[name=topk]",el),P=$("[name=topp]",el),bars=$(".bars",el),log=$(".log",el);
  let last=null;
  function probs(){
    const t=Math.max(+T.value,0.01);
    const ex=cands.map(([w,l])=>[w,Math.exp(l/t)]);const s=ex.reduce((a,b)=>a+b[1],0);
    let ps=ex.map(([w,e])=>({w,p:e/s,keep:true}));
    ps.sort((a,b)=>b.p-a.p);
    ps.forEach((x,i)=>{if(i>=+K.value)x.keep=false});
    let cum=0;ps.forEach(x=>{if(!x.keep)return;if(cum>=+P.value)x.keep=false;cum+=x.p});
    const ks=ps.filter(x=>x.keep).reduce((a,b)=>a+b.p,0);
    ps.forEach(x=>x.f=x.keep?x.p/ks:0);
    return ps;
  }
  function draw(){
    $(".tv",el).textContent=(+T.value).toFixed(2);$(".kv",el).textContent=K.value;$(".pv",el).textContent=(+P.value).toFixed(2);
    const ps=probs();
    bars.innerHTML=ps.map(x=>`<div class="bar-row ${x.keep?"":"cut"} ${last===x.w?"picked":""}"><span>${x.w}</span><div class="bar-track"><div class="bar-fill" style="width:${(x.f*100).toFixed(1)}%"></div></div><span style="text-align:right;font-variant-numeric:tabular-nums">${(x.f*100).toFixed(1)}%</span></div>`).join("");
  }
  function sample(){const ps=probs();let r=Math.random(),acc=0;for(const x of ps){acc+=x.f;if(r<=acc&&x.f>0)return x.w}return ps[0].w}
  [T,K,P].forEach(i=>i.addEventListener("input",()=>{last=null;draw()}));
  $(".one",el).addEventListener("click",()=>{last=sample();draw();log.textContent="Wylosowano: „Najlepszym językiem do frontendu jest "+last+"”"});
  $(".many",el).addEventListener("click",()=>{const c={};for(let i=0;i<50;i++){const w=sample();c[w]=(c[w]||0)+1}last=null;draw();log.textContent="50 losowań: "+Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([w,n])=>w+" ×"+n).join(", ")});
  draw();
};

/* embeddings 2D */
W.embed2d=function(el){
  // ręcznie rozmieszczone punkty: [słowo, grupa, kąt°, promień]
  const raw=[["jabłko",0,12,.85],["banan",0,32,.6],["gruszka",0,44,.92],["truskawka",0,24,1.0],
    ["pies",1,104,.92],["kot",1,118,.72],["chomik",1,132,.95],["koń",1,96,.6],
    ["samochód",2,198,.92],["rower",2,214,.62],["autobus",2,224,.97],["pociąg",2,236,.75],
    ["React",3,292,.92],["TypeScript",3,306,.7],["Python",3,318,.95],["kompilator",3,270,.55],
    ["Apple (firma)",4,334,.78]];
  const pts=raw.map(([w,g,a,r])=>({w,g,x:Math.cos(a*Math.PI/180)*r,y:Math.sin(a*Math.PI/180)*r}));
  const cv=$("canvas",el),out=$(".out",el);let sel=pts.findIndex(p=>p.w==="kot");
  const cos=(a,b)=>(a.x*b.x+a.y*b.y)/(Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y));
  function draw(){
    const dpr=devicePixelRatio||1,W_=cv.clientWidth,H=Math.min(W_,420);cv.width=W_*dpr;cv.height=H*dpr;cv.style.height=H+"px";
    const c=cv.getContext("2d");c.scale(dpr,dpr);const pal=PALETTE();pal.push(css("--muted"));
    const cx=W_/2,cy=H/2,S=Math.min(W_,H)/2*0.85;const X=p=>cx+p.x*S,Y=p=>cy-p.y*S;
    c.strokeStyle=css("--line");c.lineWidth=1;c.beginPath();c.moveTo(0,cy);c.lineTo(W_,cy);c.moveTo(cx,0);c.lineTo(cx,H);c.stroke();
    const q=pts[sel];
    const ranked=pts.map((p,i)=>({i,s:cos(q,p)})).filter(r=>r.i!==sel).sort((a,b)=>b.s-a.s);
    const top=ranked.slice(0,3).map(r=>r.i);
    top.forEach(i=>{c.strokeStyle=css("--accent");c.setLineDash([4,4]);c.beginPath();c.moveTo(X(q),Y(q));c.lineTo(X(pts[i]),Y(pts[i]));c.stroke();c.setLineDash([])});
    c.strokeStyle=css("--accent");c.lineWidth=2;c.beginPath();c.moveTo(cx,cy);c.lineTo(X(q),Y(q));c.stroke();c.lineWidth=1;
    c.font="12px system-ui";c.textAlign="center";
    pts.forEach((p,i)=>{c.fillStyle=pal[p.g];c.beginPath();c.arc(X(p),Y(p),i===sel?8:5.5,0,7);c.fill();
      if(i===sel){c.strokeStyle=css("--text");c.lineWidth=2;c.stroke();c.lineWidth=1}
      c.fillStyle=css("--text");c.fillText(p.w,X(p),Y(p)-10)});
    out.innerHTML=`Zapytanie: <b>${q.w}</b> → najbliżsi sąsiedzi (cosine similarity):<br>`+ranked.slice(0,5).map(r=>`<span class="stat">${pts[r.i].w} <b>${r.s.toFixed(3)}</b></span>`).join("")+`<br><span style="color:var(--muted);font-size:.85rem">Najdalej: ${pts[ranked[ranked.length-1].i].w} (${ranked[ranked.length-1].s.toFixed(3)})</span>`;
    cv._map={X,Y};
  }
  cv.addEventListener("click",e=>{const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;let best=-1,bd=1e9;pts.forEach((p,i)=>{const d=Math.hypot(cv._map.X(p)-mx,cv._map.Y(p)-my);if(d<bd){bd=d;best=i}});if(bd<40){sel=best;draw()}});
  addEventListener("resize",draw);draw();redrawers.push(draw);
};

/* cosine calculator */
W.cosine=function(el){
  const a=$("[name=a]",el),b=$("[name=b]",el),out=$(".out",el);
  function run(){
    const A=a.value.split(/[,;\s]+/).filter(Boolean).map(Number),B=b.value.split(/[,;\s]+/).filter(Boolean).map(Number);
    if(A.length!==B.length||A.some(isNaN)||B.some(isNaN)){out.innerHTML=`<span class="pill bad">Wektory muszą mieć ten sam wymiar i zawierać liczby</span>`;return}
    const dot=A.reduce((s,x,i)=>s+x*B[i],0),na=Math.hypot(...A),nb=Math.hypot(...B),eu=Math.hypot(...A.map((x,i)=>x-B[i]));
    const cs=dot/(na*nb);
    out.innerHTML=`<span class="stat">A·B = <b>${dot.toFixed(3)}</b></span><span class="stat">‖A‖ = <b>${na.toFixed(3)}</b></span><span class="stat">‖B‖ = <b>${nb.toFixed(3)}</b></span><span class="stat">cosine = <b>${cs.toFixed(4)}</b></span><span class="stat">cosine distance = <b>${(1-cs).toFixed(4)}</b></span><span class="stat">euklidesowa = <b>${eu.toFixed(3)}</b></span>`;
  }
  a.addEventListener("input",run);b.addEventListener("input",run);run();
};

/* chunker */
W.chunker=function(el){
  const ta=$("textarea",el),size=$("[name=size]",el),ov=$("[name=overlap]",el),st=$("select",el),out=$(".out",el);
  function chunks(text,n,o,mode){
    if(mode==="fixed"){const r=[];const step=Math.max(1,n-o);for(let i=0;i<text.length;i+=step){r.push(text.slice(i,i+n));if(i+n>=text.length)break}return r}
    const units=mode==="para"?text.split(/\n\s*\n/):text.match(/[^.!?]+[.!?]+["”]?\s*|[^.!?]+$/g)||[];
    const r=[];let cur="";
    units.forEach(u=>{u=mode==="para"?u.trim()+"\n\n":u;if(cur&&(cur+u).length>n){r.push(cur.trim());
      const tail=o>0?cur.slice(-o):"";cur=(mode==="sent"&&o>0?tail.slice(tail.indexOf(" ")+1):"")+u}else cur+=u});
    if(cur.trim())r.push(cur.trim());return r;
  }
  function run(){
    $(".sv",el).textContent=size.value;$(".ov",el).textContent=ov.value;
    ov.disabled=st.value==="para";
    const cs=chunks(ta.value,+size.value,+ov.value,st.value),pal=PALETTE();
    out.innerHTML=`<span class="stat">Chunków: <b>${cs.length}</b></span><span class="stat">Śr. długość: <b>${cs.length?Math.round(cs.reduce((a,c)=>a+c.length,0)/cs.length):0}</b> zn.</span>`+
      cs.map((c,i)=>`<div style="border-left:4px solid ${pal[i%6]};background:color-mix(in srgb,${pal[i%6]} 10%,transparent);padding:6px 10px;margin:6px 0;border-radius:0 8px 8px 0;font-size:.85rem"><b style="font-size:.75rem;color:${pal[i%6]}">#${i+1} · ${c.length} zn.</b><br>${c.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</div>`).join("");
  }
  [ta,size,ov,st].forEach(x=>x.addEventListener("input",run));run();redrawers.push(run);
};

/* cost calculator */
W.cost=function(el){
  const f=n=>+$(`[name=${n}]`,el).value||0,out=$(".out",el);
  function run(){
    const inTok=f("in"),outTok=f("out"),pin=f("pin"),pout=f("pout"),rpd=f("rpd"),cache=f("cache")/100,cachedMul=f("cmul")/100;
    const inCost=(inTok*(1-cache)*pin+inTok*cache*pin*cachedMul)/1e6,outCost=outTok*pout/1e6,req=inCost+outCost;
    const fmt=v=>v<0.01?"$"+v.toFixed(5):v<1?"$"+v.toFixed(4):"$"+v.toLocaleString("en-US",{maximumFractionDigits:2,minimumFractionDigits:2});
    out.innerHTML=`<span class="stat">Na request: <b>${fmt(req)}</b></span><span class="stat">Dziennie: <b>${fmt(req*rpd)}</b></span><span class="stat">Miesięcznie (30 dni): <b>${fmt(req*rpd*30)}</b></span><span class="stat">Udział outputu w koszcie: <b>${req?Math.round(outCost/req*100):0}%</b></span>`;
  }
  $$("input",el).forEach(i=>i.addEventListener("input",run));run();
};

/* VRAM calculator */
W.vram=function(el){
  const p=$("[name=params]",el),b=$("select",el),ctx=$("[name=ctx]",el),out=$(".out",el);
  function run(){
    const params=+p.value,bits=+b.value,w=params*bits/8;const kv=0.12*(+ctx.value/1000)*Math.sqrt(params/8); // zgrubnie: ~0,12 GB / 1k tokenów dla modelu 8B z GQA w FP16
    const total=(w+kv)*1.15;
    const fits=[["RTX 4060 (8 GB)",8],["RTX 3060 / 4070 (12 GB)",12],["RTX 4070 Ti / 4080 (16 GB)",16],["RTX 3090/4090 (24 GB)",24],["Mac 36 GB unified",36],["A100/H100 (80 GB)",80]];
    out.innerHTML=`<span class="stat">Wagi: <b>${w.toFixed(1)} GB</b></span><span class="stat">KV cache (≈): <b>${kv.toFixed(1)} GB</b></span><span class="stat">Razem z narzutem: <b>${total.toFixed(1)} GB</b></span><div style="margin-top:8px">`+fits.map(([n,g])=>`<span class="pill ${g>=total?"ok":"bad"}">${g>=total?"✓":"✗"} ${n}</span>`).join("")+`</div>`;
  }
  [p,b,ctx].forEach(x=>x.addEventListener("input",run));run();
};

/* generic stepper (reveal steps) */
W.stepper=function(el){
  const steps=$$(".step",el);let i=0,timer=null;
  function show(){steps.forEach((s,k)=>{s.classList.toggle("on",k<i);s.style.display=k<i?"":"none"});$(".cnt",el).textContent=i+"/"+steps.length}
  $(".next",el).addEventListener("click",()=>{if(i<steps.length){i++;show()}});
  $(".reset",el).addEventListener("click",()=>{clearInterval(timer);i=0;show()});
  $(".auto",el).addEventListener("click",()=>{clearInterval(timer);i=0;show();timer=setInterval(()=>{if(i>=steps.length){clearInterval(timer);return}i++;show()},1300)});
  show();
};

/* svg stepper (highlight parts of diagram) */
W.svgstep=function(el){
  const items=$$(".sdesc li",el),parts=$$("[data-s]",el),desc=$(".sdesc-cur",el);let i=0,timer=null;
  function show(){
    parts.forEach(p=>{const on=p.dataset.s.split(" ").includes(String(i+1));p.style.opacity=on?1:.22;p.style.transition="opacity .35s"});
    desc.innerHTML=`<b>Krok ${i+1}/${items.length}.</b> `+items[i].innerHTML;
  }
  $(".prev",el).addEventListener("click",()=>{i=(i-1+items.length)%items.length;show()});
  $(".next",el).addEventListener("click",()=>{i=(i+1)%items.length;show()});
  $(".auto",el).addEventListener("click",function(){if(timer){clearInterval(timer);timer=null;this.textContent="▶ Auto";return}this.textContent="⏸ Stop";timer=setInterval(()=>{i=(i+1)%items.length;show()},2200)});
  show();
};

/* ANN greedy search on proximity graph */
W.annsearch=function(el){
  const cv=$("canvas",el),out=$(".out",el);let pts=[],edges=[],path=[],query=null,truth=-1,anim=null,seed=42;
  const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
  function build(){pts=[];for(let i=0;i<46;i++)pts.push({x:.05+rnd()*.9,y:.05+rnd()*.9});
    edges=pts.map((p,i)=>pts.map((q,j)=>({j,d:Math.hypot(p.x-q.x,p.y-q.y)})).filter(o=>o.j!==i).sort((a,b)=>a.d-b.d).slice(0,3).map(o=>o.j));
    edges.forEach((ns,i)=>ns.forEach(j=>{if(!edges[j].includes(i))edges[j].push(i)}));
    // kilka długich krawędzi ("autostrady" jak w wyższych warstwach HNSW)
    for(let k=0;k<6;k++){const a=Math.floor(rnd()*pts.length),b=Math.floor(rnd()*pts.length);if(a!==b){edges[a].push(b);edges[b].push(a)}}
    path=[];query=null;}
  function search(q){
    const d=i=>Math.hypot(pts[i].x-q.x,pts[i].y-q.y);let cur=0,p=[0],evals=1;
    while(true){let best=cur;for(const n of edges[cur]){evals++;if(d(n)<d(best))best=n}if(best===cur)break;cur=best;p.push(cur)}
    truth=pts.reduce((b,_,i)=>d(i)<d(b)?i:b,0);return {p,evals};
  }
  function draw(upto){
    const dpr=devicePixelRatio||1,Wd=cv.clientWidth,H=Math.min(Wd*0.75,380);cv.width=Wd*dpr;cv.height=H*dpr;cv.style.height=H+"px";
    const c=cv.getContext("2d");c.scale(dpr,dpr);const X=p=>p.x*Wd,Y=p=>p.y*H;
    c.strokeStyle=css("--line");c.lineWidth=1;edges.forEach((ns,i)=>ns.forEach(j=>{if(j>i){c.beginPath();c.moveTo(X(pts[i]),Y(pts[i]));c.lineTo(X(pts[j]),Y(pts[j]));c.stroke()}}));
    const shown=path.slice(0,upto);
    c.strokeStyle=css("--c2");c.lineWidth=3;c.beginPath();shown.forEach((k,n)=>{n?c.lineTo(X(pts[k]),Y(pts[k])):c.moveTo(X(pts[k]),Y(pts[k]))});c.stroke();
    pts.forEach((p,i)=>{c.fillStyle=i===0?css("--c3"):shown.includes(i)?css("--c2"):css("--muted");c.beginPath();c.arc(X(p),Y(p),i===0?7:4.5,0,7);c.fill()});
    if(query){c.fillStyle=css("--accent");c.beginPath();c.arc(X(query),Y(query),8,0,7);c.fill();c.fillStyle=css("--text");c.font="bold 12px system-ui";c.fillText("query",X(query)+10,Y(query)+4);
      if(upto>=path.length&&truth>=0){c.strokeStyle=css("--c5");c.lineWidth=2.5;c.beginPath();c.arc(X(pts[truth]),Y(pts[truth]),11,0,7);c.stroke()}}
    cv._dims={Wd,H};
  }
  function run(q){query=q;const r=search(q);path=r.p;let k=1;clearInterval(anim);
    anim=setInterval(()=>{draw(k);k++;if(k>path.length){clearInterval(anim);const hit=path[path.length-1]===truth;
      out.innerHTML=`<span class="stat">Skoki: <b>${path.length-1}</b></span><span class="stat">Porównań odległości: <b>${r.evals}</b> (brute force: ${pts.length})</span><span class="pill ${hit?"ok":"warn"}">${hit?"✓ znaleziono prawdziwego najbliższego sąsiada":"≈ znaleziono przybliżony wynik (prawdziwy NN w żółtym kółku)"}</span>`}},350)}
  cv.addEventListener("click",e=>{const r=cv.getBoundingClientRect();run({x:(e.clientX-r.left)/cv._dims.Wd,y:(e.clientY-r.top)/cv._dims.H})});
  $(".rnd",el).addEventListener("click",()=>run({x:rnd(),y:rnd()}));
  $(".regen",el).addEventListener("click",()=>{seed=Math.floor(Math.random()*1e6)+1;build();draw(0);out.textContent="Nowy graf. Kliknij w płótno, aby zadać zapytanie."});
  build();draw(0);addEventListener("resize",()=>draw(path.length));redrawers.push(()=>draw(path.length));
};

/* attention heatmap */
W.attention=function(el){
  const toks=["Kot","nie","przeszedł","przez","ulicę",",","bo","był","zbyt","zmęczony"];
  const special={"był":{"Kot":.48,"był":.14,"zmęczony":.12,"przeszedł":.1,"bo":.08},"zmęczony":{"Kot":.42,"był":.22,"zbyt":.16,"zmęczony":.1},"ulicę":{"przeszedł":.38,"przez":.32,"ulicę":.18},"przeszedł":{"Kot":.35,"nie":.3,"przeszedł":.2,"ulicę":.08},"bo":{"bo":.25,"przeszedł":.25,"nie":.2,","  :.15}};
  const box=$(".att",el),out=$(".out",el);let sel=7;
  function row(t,i){const sp=special[t];let w=toks.map((x,j)=>sp?(sp[x]||0.01):(j===i?.4:Math.abs(j-i)===1?.2:.03));const s=w.reduce((a,b)=>a+b,0);return w.map(x=>x/s)}
  function draw(){const w=row(toks[sel],sel);
    box.innerHTML=toks.map((t,j)=>`<button class="tok" data-j="${j}" style="cursor:pointer;border:${j===sel?"2px solid var(--text)":"1px solid var(--line)"};padding:4px 8px;font-size:.95rem;color:var(--text);background:color-mix(in srgb,var(--c2) ${Math.round(w[j]*170)}%,var(--surface))">${t}</button>`).join("");
    $$("button",box).forEach(b=>b.addEventListener("click",()=>{sel=+b.dataset.j;draw()}));
    out.innerHTML=`Token <b>„${toks[sel]}”</b> „patrzy” najmocniej na: `+toks.map((t,j)=>[t,w[j]]).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,v])=>`<span class="stat">${t} <b>${(v*100).toFixed(0)}%</b></span>`).join("");}
  draw();
};

/* RRF fusion */
W.rrf=function(el){
  const bm=["D3","D1","D7","D2","D9"],vec=["D1","D5","D3","D8","D2"],K=$("[name=k]",el),out=$(".out",el);
  function run(){const k=+K.value;$(".kv",el).textContent=k;const s={};
    bm.forEach((d,i)=>s[d]=(s[d]||0)+1/(k+i+1));vec.forEach((d,i)=>s[d]=(s[d]||0)+1/(k+i+1));
    const r=Object.entries(s).sort((a,b)=>b[1]-a[1]);
    out.innerHTML=`<div class="table-wrap"><table><tr><th>#</th><th>Dokument</th><th>Pozycja BM25</th><th>Pozycja wektorowa</th><th>Wynik RRF</th></tr>`+r.map(([d,v],i)=>`<tr><td>${i+1}</td><td><b>${d}</b></td><td>${bm.indexOf(d)+1||"—"}</td><td>${vec.indexOf(d)+1||"—"}</td><td style="font-variant-numeric:tabular-nums">${v.toFixed(4)}</td></tr>`).join("")+`</table></div>`}
  K.addEventListener("input",run);run();
};

/* context window budget */
W.ctxbudget=function(el){
  const f=n=>+$(`[name=${n}]`,el).value||0,bar=$(".ctxbar",el),out=$(".out",el);
  function run(){const lim=f("lim")*1000,parts=[["System prompt",f("sys"),"--c1"],["Narzędzia (definicje)",f("tools"),"--c4"],["Historia rozmowy",f("hist"),"--c6"],["Dokumenty RAG",f("docs"),"--c3"],["Zarezerwowane na odpowiedź",f("outp"),"--c2"]];
    const tot=parts.reduce((a,p)=>a+p[1],0);
    bar.innerHTML=parts.map(([n,v,c])=>`<div title="${n}: ${v}" style="width:${Math.min(v/Math.max(lim,tot)*100,100)}%;background:var(${c});height:100%"></div>`).join("");
    out.innerHTML=parts.map(([n,v,c])=>`<span class="stat"><span style="color:var(${c})">■</span> ${n}: <b>${v.toLocaleString("pl")}</b></span>`).join("")+`<div style="margin-top:6px"><span class="pill ${tot<=lim?"ok":"bad"}">${tot<=lim?"Mieści się":"Przekroczony limit!"}: ${tot.toLocaleString("pl")} / ${lim.toLocaleString("pl")} tokenów (${(tot/lim*100).toFixed(0)}%)</span></div>`}
  $$("input",el).forEach(i=>i.addEventListener("input",run));run();
};

$$("[data-widget]").forEach(el=>{const f=W[el.dataset.widget];if(f){try{f(el)}catch(e){console.error(el.dataset.widget,e)}}});
applyTheme(theme);
})();
