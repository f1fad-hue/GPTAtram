const $ = (s) => document.querySelector(s);
const fmt = (v, digits = 1) => `${Number(v).toFixed(digits)}%`;

const themeToggle = $('#theme-toggle');
themeToggle.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  themeToggle.textContent = dark ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-pressed', String(dark));
});

const heading = (text) => [...document.querySelectorAll('.section-heading')].find(node => node.textContent.includes(text));
const tabGroups = {
  overview: [$('.metrics'), heading('Constrained maximum-growth allocation'), $('.allocation-grid')],
  macro: [heading('Only drivers that change these allocations'), $('.heatmap-wrap'), heading('Allocation by sentiment band'), $('#scenario-grid')],
  research: [heading('Research slides'), $('.slides'), heading('10-year range of outcomes'), $('.simulation')],
  monitor: [heading('When each holding stops earning a place'), $('.monitor')],
  sources: [$('.report')]
};
const tabs = [...document.querySelectorAll('[data-tab]')];
function selectTab(name) {
  Object.entries(tabGroups).forEach(([group, nodes]) => nodes.filter(Boolean).forEach(node => { node.hidden = group !== name; }));
  tabs.forEach(tab => { const active = tab.dataset.tab === name; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  history.replaceState(null, '', `#${name}`);
}
tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
const requestedTab = location.hash.slice(1);
selectTab(Object.hasOwn(tabGroups, requestedTab) ? requestedTab : 'overview');

fetch('data/portfolio.json').then(r => r.json()).then(data => {
  const p = data.portfolio;
  $('#portfolio-rate').textContent = p.rate.toFixed(2);
  $('#rate-detail').textContent = `3–12m macro composite · ${p.drawdownCap}% drawdown cap`;
  $('#allocation-total').textContent = `${p.allocation.reduce((a,x) => a + x.weight, 0)}%`;
  $('#cagr-forecast').textContent = fmt(p.netCagrForecast);
  $('#drawdown').textContent = fmt(data.scenarios[1].dd);
  $('#as-of').textContent = new Date(data.asOf + 'T00:00:00').toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'});
  renderDonut($('#active-donut'), p.allocation);
  $('#active-allocation').innerHTML = p.allocation.map(x => `<div class="legend-row"><span><i class="dot" style="background:${x.color}"></i>${x.name}</span><b>${x.weight}%</b></div>`).join('');

  const heat = $('#heatmap tbody');
  heat.innerHTML = data.drivers.map(d => `<tr><td>${d.name}</td>${d.values.map(v => `<td><div class="heat" style="background:${heatColor(v)}">${v.toFixed(1)}</div></td>`).join('')}<td>${d.relevance}</td></tr>`).join('');
  const colors = p.allocation.map(x => x.color);
  $('#scenario-grid').innerHTML = data.scenarios.map((s,i) => `<article class="scenario panel"><header><div><p class="eyebrow">RATE ${s.rate}</p><h3>${s.label}</h3></div><b>${s.cap}% cap</b></header><div class="donut" data-label="${s.dd}%\A composite DD"></div><p>Money ${s.allocation[0]}% · Tech ${s.allocation[1]}% · Nasdaq income ${s.allocation[2]}%</p></article>`).join('');
  [...document.querySelectorAll('.scenario .donut')].forEach((node,i) => renderDonut(node, data.scenarios[i].allocation.map((weight,j) => ({weight,color:colors[j]}))));

  const track = $('#slides-track');
  track.innerHTML = data.slides.map(s => `<article class="slide"><div><p class="eyebrow">${s.tag}</p><h3>${s.title}</h3><p>${s.thesis}</p><a href="${s.source}" target="_blank" rel="noreferrer">Open primary source ↗</a></div><div class="facts">${s.facts.map(f => `<div class="fact"><span>${f[0]}</span><b>${f[1]}</b><span>${f[2]}</span></div>`).join('')}</div></article>`).join('');
  let slide = 0; const move = n => { slide=(n+data.slides.length)%data.slides.length; track.style.transform=`translateX(-${slide*100}%)`; $('#slide-counter').textContent=`${slide+1} / ${data.slides.length}`; };
  $('#next').onclick=()=>move(1); $('#prev').onclick=()=>move(-1);
  let touchStart=0; track.addEventListener('touchstart',e=>touchStart=e.touches[0].clientX,{passive:true}); track.addEventListener('touchend',e=>{const d=e.changedTouches[0].clientX-touchStart;if(Math.abs(d)>45)move(d<0?1:-1)},{passive:true});

  $('#monitor-table tbody').innerHTML = data.monitor.map(m => `<tr><td>${m.holding}<br><span class="score">Relevance ${m.score}/100</span></td><td>${m.status}</td><td>${m.trigger}</td><td>${m.cadence}</td></tr>`).join('');
  $('#source-list').innerHTML = data.sources.map(s => `<div class="source"><b>${s.name}</b><span>${s.detail}</span><a href="${s.url}" target="_blank" rel="noreferrer">Open source ↗</a></div>`).join('');
  runMonteCarlo(p.netCagrForecast / 100, p.volatility);
});

function renderDonut(node, allocation) {
  let cursor = 0;
  node.style.background = `conic-gradient(${allocation.map(a => { const end = cursor + a.weight; const part = `${a.color} ${cursor}% ${end}%`; cursor = end; return part; }).join(',')})`;
}
function heatColor(v) { const hue = 3 + ((v - 1) / 4) * 125; return `hsl(${hue} 70% 27%)`; }
function rng(seed=20260811) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function normal(random) { let u=0,v=0; while(!u)u=random();while(!v)v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function percentile(xs,p) { const i=(xs.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return xs[lo]+(xs[hi]-xs[lo])*(i-lo); }
function runMonteCarlo(mu,sigma) {
  const random=rng(), values=[]; for(let i=0;i<10000;i++){let v=1;for(let m=0;m<120;m++)v*=Math.exp((mu-sigma*sigma/2)/12+sigma*normal(random)/Math.sqrt(12));values.push(v);} values.sort((a,b)=>a-b);
  const q=[.1,.5,.9].map(x=>percentile(values,x)); $('#sim-output').innerHTML=`<span>10th percentile<br><b>${q[0].toFixed(2)}×</b></span><span>Median<br><b>${q[1].toFixed(2)}×</b></span><span>90th percentile<br><b>${q[2].toFixed(2)}×</b></span><span>Assumed volatility<br><b>${(sigma*100).toFixed(0)}%</b></span>`;
  const c=$('#simulation-chart'),ctx=c.getContext('2d'),W=c.width,H=c.height, bins=32, max=Math.min(percentile(values,.985),5), counts=Array(bins).fill(0); values.forEach(v=>{const i=Math.min(bins-1,Math.floor(Math.min(v,max)/max*bins));counts[i]++}); const peak=Math.max(...counts);ctx.clearRect(0,0,W,H);ctx.fillStyle='#9bb0ca';ctx.font='22px system-ui';ctx.fillText('Terminal value multiple after 10 years',34,38); counts.forEach((n,i)=>{const x=36+i*(W-72)/bins,w=(W-72)/bins-3,h=n/peak*(H-100);ctx.fillStyle=i<bins*.3?'#b9f64c':i<bins*.7?'#47d8e8':'#ffad4d';ctx.fillRect(x,H-42-h,w,h)});ctx.fillStyle='#9bb0ca';ctx.font='16px system-ui';ctx.fillText('0×',32,H-15);ctx.fillText(`${max.toFixed(1)}×`,W-68,H-15);
}
