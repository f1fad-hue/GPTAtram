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
  overview: [$('.metrics'), heading('Constrained maximum-growth allocation'), $('.allocation-grid'), $('#dd-math')],
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

fetch('data/portfolio.json?v=20260812-4', { cache: 'no-store' }).then(r => r.json()).then(data => {
  const p = data.portfolio;
  const macroRate = calculateMacroRate(data);
  const portfolioDd = calculatePortfolioDrawdown(data);
  $('#portfolio-rate').textContent = macroRate.toFixed(2);
  $('.meter i').style.width = `${macroRate / 5 * 100}%`;
  $('.metrics .metric:nth-child(3) small').textContent = `Within the active ${p.drawdownCap}% rating cap`;
  heading('Constrained maximum-growth allocation').querySelector(':scope > p').innerHTML = `Macro score <b>${macroRate.toFixed(2)} / 5</b> maps to the <b>${p.rateBand}</b> band; the drawdown ceiling is therefore <b>${p.drawdownCap}%</b>.`;
  $('#rationale-copy').textContent = `The allocation favours global technology exposure, then uses the income-oriented Nasdaq sleeve and short-duration PHP liquidity to keep the ${portfolioDd.toFixed(2)}% composite estimate within its non-negotiable ${p.drawdownCap}% limit.`;
  $('#sources > p:nth-of-type(2)').innerHTML = `The active model rate is <b>${macroRate.toFixed(2)} / 5</b>, producing the ${p.rateBand} constrained allocation and a ${portfolioDd.toFixed(2)}% composite drawdown estimate. Its expected 10-year net CAGR is a scenario estimate, not an investment recommendation. The primary limitation is concentration: both growth sleeves are technology-sensitive and may move together in a risk-off event. Review suitability, currency exposure, tax, liquidity, and the newest official KIIDS before transacting.`;
  $('#rate-detail').textContent = `3–12m macro composite · ${p.drawdownCap}% drawdown cap`;
  $('#allocation-total').textContent = `${p.allocation.reduce((a,x) => a + x.weight, 0)}%`;
  $('#cagr-forecast').textContent = fmt(p.netCagrForecast);
  $('#drawdown').textContent = fmt(portfolioDd);
  $('#as-of').textContent = new Date(data.asOf + 'T00:00:00').toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'});
  renderDonut($('#active-donut'), p.allocation);
  $('#active-allocation').innerHTML = p.allocation.map(x => `<div class="legend-row"><span><i class="dot" style="background:${x.color}"></i>${x.name}</span><b>${x.weight}%</b></div>`).join('');
  renderDrawdownMath(data, macroRate, portfolioDd);

  const heat = $('#heatmap tbody');
  heat.innerHTML = data.drivers.map(d => `<tr><td>${d.name}</td>${d.values.map(v => `<td><div class="heat" style="background:${heatColor(v)}">${v.toFixed(1)}</div></td>`).join('')}<td><b>${(data.macroModel.driverWeights[d.id] * 100).toFixed(0)}%</b></td><td>${d.relevance}</td></tr>`).join('');
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

fetch('data/monitoring.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject()).then(snapshot => {
  const checked = new Date(snapshot.verifiedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  $('#monitoring-status').innerHTML = `Daily cloud verification: <a href="${snapshot.runUrl}" target="_blank" rel="noreferrer">passed ${checked}</a>`;
}).catch(() => { $('#monitoring-status').textContent = 'Daily cloud verification: awaiting next scheduled run'; });

function calculateMacroRate(data) {
  const h = data.macroModel.horizonWeights;
  return data.drivers.reduce((total, driver) => {
    const composite = driver.values[0] * h.threeMonth + driver.values[1] * h.sixMonth + driver.values[2] * h.twelveMonth;
    return total + composite * data.macroModel.driverWeights[driver.id];
  }, 0);
}
function calculatePortfolioDrawdown(data) {
  const model = data.drawdownModel;
  const composites = Object.fromEntries(model.funds.map(fund => [fund.id, (fund.historical * model.weights.historical + fund.forwardMedian * model.weights.forwardMedian) / 100]));
  const weights = Object.fromEntries(data.portfolio.allocation.map(fund => [fund.id, fund.weight / 100]));
  const ids = Object.keys(weights);
  let variance = 0;
  for (const left of ids) for (const right of ids) variance += weights[left] * composites[left] * weights[right] * composites[right] * model.correlations[left][right];
  return Math.sqrt(variance) * 100;
}
function renderDrawdownMath(data, macroRate, portfolioDd) {
  const model = data.drawdownModel;
  const rows = model.funds.map(fund => {
    const composite = fund.historical * model.weights.historical + fund.forwardMedian * model.weights.forwardMedian;
    const allocation = data.portfolio.allocation.find(item => item.id === fund.id);
    return `<tr><td>${allocation.name}</td><td>${fund.historical.toFixed(2)}%</td><td>${fund.forwardMedian.toFixed(2)}%</td><td><b>${composite.toFixed(2)}%</b></td><td>${allocation.weight}%</td></tr>`;
  }).join('');
  $('#dd-math').innerHTML = `<p class="eyebrow">TRANSPARENT DRAWDOWN MATH</p><h2>${portfolioDd.toFixed(2)}% composite DD <span>vs ${data.portfolio.drawdownCap}% cap</span></h2><p>Macro score = <b>${macroRate.toFixed(2)} / 5</b>; it falls in the ${data.portfolio.rateBand} band, so the optimizer must remain at or below <b>${data.portfolio.drawdownCap}%</b>.</p><div class="scroll"><table><thead><tr><th>Fund</th><th>Historical / proxy DD</th><th>Forward median DD</th><th>60% + 40% composite</th><th>Allocation</th></tr></thead><tbody>${rows}</tbody></table></div><p class="caption">Portfolio equation: sqrt(sum_i sum_j (w_i * DD_i * w_j * DD_j * rho_ij)). Correlations: money/tech 0.10, money/Nasdaq 0.10, tech/Nasdaq 0.80. The Nasdaq historical input is a target-ETF proxy because the ATRAM feeder launched in 2026. Forward medians are 10-year scenario assumptions, not predictions.</p>`;
}

function renderDonut(node, allocation) {
  let cursor = 0;
  node.style.background = `conic-gradient(${allocation.map(a => { const end = cursor + a.weight; const part = `${a.color} ${cursor}% ${end}%`; cursor = end; return part; }).join(',')})`;
  cursor = 0;
  node.innerHTML = allocation.map((item) => {
    const midpoint = cursor + item.weight / 2;
    const angle = midpoint * 3.6 * Math.PI / 180;
    const x = 50 + Math.sin(angle) * 39;
    const y = 50 - Math.cos(angle) * 39;
    cursor += item.weight;
    return `<span class="donut-label" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%">${item.weight}%</span>`;
  }).join('');
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
