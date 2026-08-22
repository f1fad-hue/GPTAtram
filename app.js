const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits=2) => `${Number(value).toFixed(digits)}%`;

const tabs=[...document.querySelectorAll('[data-tab]')];
function selectTab(name) {
  const selected=document.querySelector(`[data-page="${name}"]`) ? name : 'overview';
  document.querySelectorAll('[data-page]').forEach((page)=>{ page.hidden=page.dataset.page!==selected; });
  tabs.forEach((tab)=>{ const active=tab.dataset.tab===selected; tab.classList.toggle('active',active); tab.setAttribute('aria-selected',String(active)); });
  history.replaceState(null,'',`#${selected}`);
}
tabs.forEach((tab)=>tab.addEventListener('click',()=>selectTab(tab.dataset.tab)));
selectTab(location.hash.slice(1));

fetch('data/portfolio.json?v=20260821-cushion',{cache:'no-store'}).then((response)=>{
  if (!response.ok) throw new Error(`Portfolio data unavailable: ${response.status}`);
  return response.json();
}).then((data)=>{
  const weights=data.portfolio.allocation.map((item)=>item.weight);
  const rate=macroRate(data); const cushion=macroCushion(data,rate); const dd=portfolioDd(data,weights); const growth=portfolioCagr(data,weights); const robustGrowth=portfolioRobustCagr(data,weights);
  $('#portfolio-rate').textContent=rate.toFixed(2);
  $('#rating-label').textContent=` / 5 - ${data.portfolio.ratingLabel}`;
  $('.meter i').style.width=`${rate/5*100}%`;
  $('#rate-detail').textContent=`3 / 6 / 12-month composite - ${data.portfolio.operationalDrawdownLimit}% operational / ${data.portfolio.drawdownCap}% user cap`;
  $('#allocation-total').textContent=`${weights.length} / 4`;
  $('#cagr-forecast').textContent=fmt(growth);
  $('#robust-cagr').textContent=fmt(robustGrowth);
  $('#drawdown').textContent=fmt(dd);
  $('#allocation-constraint').innerHTML=`Rate <b>${rate.toFixed(2)}</b> requires at least <b>${cushion}% Money Market</b> and selects a <b>${data.portfolio.operationalDrawdownLimit}%</b> operating limit below the <b>${data.portfolio.drawdownCap}%</b> user cap.`;
  $('#rationale-copy').textContent=`The macro score sets only the liquidity floor; it does not choose the whole portfolio. Above that ${cushion}% minimum, the exhaustive 5% grid maximizes the worst CAGR across three return cases: ${robustGrowth.toFixed(2)}% robust and ${growth.toFixed(2)}% base. Historical DD is ${dd.toFixed(2)}%.`;
  $('#report-summary').innerHTML=`The current broad and correlated macro score is <b>${rate.toFixed(2)} / 5</b>, producing a <b>${cushion}% minimum Money Market cushion</b>. The robust solution has a <b>${robustGrowth.toFixed(2)}% worst documented CAGR</b>, <b>${growth.toFixed(2)}% base CAGR</b>, and <b>${dd.toFixed(2)}% historical maximum-DD proxy</b>. The cushion, return stresses, concentration limit and reserve are transparent model policies. CDaR is not active because synchronized official common-date NAV evidence is incomplete.`;
  $('#as-of').textContent=new Date(`${data.asOf}T00:00:00`).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});

  renderDonut($('#active-donut'),data.portfolio.allocation);
  $('#active-allocation').innerHTML=data.portfolio.allocation.map((item)=>`<div class="legend-row"><span><i class="dot" style="background:${item.color}"></i>${item.name}</span><b>${item.weight}%</b></div>`).join('');
  renderDdMath(data,dd);
  renderRobustMethod(data,robustGrowth);
  renderScenarios(data);
  renderMacro(data);
  renderRegions(data);
  renderFunds(data);
  renderMonitor(data);
  $('#source-list').innerHTML=data.sources.map((source)=>`<div class="source"><b>${source.name}</b><span>${source.detail}</span><a href="${source.url}" target="_blank" rel="noreferrer">Open official source</a></div>`).join('');
  runMonteCarlo(growth/100,data.portfolio.volatility,data.monteCarlo);
}).catch((error)=>{ document.querySelector('main').innerHTML=`<section class="panel report"><h2>Data could not be loaded</h2><p>${error.message}</p></section>`; });

fetch('data/monitoring.json',{cache:'no-store'}).then((response)=>response.ok?response.json():Promise.reject()).then((snapshot)=>{
  const checked=new Date(snapshot.verifiedAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  $('#monitoring-status').innerHTML=`Weekend verification: <a href="${snapshot.runUrl}" target="_blank" rel="noreferrer">passed ${checked}</a>`;
}).catch(()=>{ $('#monitoring-status').textContent='Weekend verification: awaiting next run'; });

function macroRate(data) {
  const h=data.macroModel.horizonWeights;
  return data.drivers.reduce((total,driver)=>total+(driver.values[0]*h.threeMonth+driver.values[1]*h.sixMonth+driver.values[2]*h.twelveMonth)*data.macroModel.driverWeights[driver.id],0);
}
function macroCushion(data,rate) {
  const policy=data.optimizer.macroCushion;
  const raw=policy.baseFloor+policy.slopePerRatePoint*(5-rate);
  const rounded=policy.roundUpToGrid?Math.ceil((raw-1e-12)/data.optimizer.gridStep)*data.optimizer.gridStep:raw;
  return Math.min(policy.maximum,Math.max(policy.minimum,rounded));
}
function portfolioDd(data,weights) {
  const inputs=Object.fromEntries(data.drawdownModel.funds.map((fund)=>[fund.id,fund.historical]));
  return data.portfolio.allocation.reduce((total,item,index)=>total+weights[index]/100*inputs[item.id],0);
}
function portfolioCagr(data,weights) {
  const inputs=Object.fromEntries(data.fundModels.map((fund)=>[fund.id,fund.netCagr]));
  return data.portfolio.allocation.reduce((total,item,index)=>total+weights[index]/100*inputs[item.id],0);
}
function portfolioRobustCagr(data,weights) {
  return Math.min(...data.robustMethod.returnScenarios.map((scenario)=>data.portfolio.allocation.reduce((total,item,index)=>total+weights[index]/100*scenario.fundCagr[item.id],0)));
}
function renderDdMath(data,total) {
  const rows=data.drawdownModel.funds.map((fund)=>{
    const item=data.portfolio.allocation.find((allocation)=>allocation.id===fund.id); const contribution=item.weight/100*fund.historical;
    return `<tr><td><b>${item.name}</b><small>${fund.historicalMetric}</small></td><td>${fund.historical.toFixed(2)}%</td><td>${item.weight}%</td><td><b>${contribution.toFixed(2)}%</b></td></tr>`;
  }).join('');
  const formula=data.drawdownModel.funds.map((fund)=>{const item=data.portfolio.allocation.find((allocation)=>allocation.id===fund.id);return `${item.weight}% x ${fund.historical.toFixed(2)}%`;}).join(' + ');
  $('#dd-math').innerHTML=`<p class="eyebrow">HISTORICAL MAX DD MATH</p><h2>${total.toFixed(2)}% <span>vs ${data.portfolio.operationalDrawdownLimit}% operational / ${data.portfolio.drawdownCap}% user cap</span></h2><div class="scroll"><table><thead><tr><th>Fund / target reference</th><th>Max DD</th><th>Weight</th><th>Contribution</th></tr></thead><tbody>${rows}</tbody></table></div><p class="caption"><b>${formula} = ${total.toFixed(2)}%.</b> Simple weighted sum; no forward DD or diversification credit. The one-point reserve reduces boundary risk.</p>`;
}
function renderRobustMethod(data,robustGrowth) {
  const cdar=data.robustMethod.cdar;
  const cushion=macroCushion(data,macroRate(data));
  $('#robust-method').innerHTML=`<p class="eyebrow">ROBUST + MACRO GUARDRAILS</p><div class="robust-grid"><div><b>${robustGrowth.toFixed(2)}% CAGR</b><small>Worst of ${data.robustMethod.returnScenarios.length} return cases</small></div><div><b>${cushion}% cushion</b><small>Current minimum Money Market weight</small></div><div><b>${data.optimizer.maximumFundWeight}% maximum</b><small>Single-fund concentration</small></div><div><b>${data.optimizer.drawdownReserve}-point reserve</b><small>Below the user DD cap</small></div></div><p class="caption">CDaR remains diagnostic only (${cdar.confidence*100}% confidence setting) until synchronized official NAV data are reproducible.</p>`;
}
function renderScenarios(data) {
  const colors=data.portfolio.allocation.map((item)=>item.color);
  $('#scenario-grid').innerHTML=data.scenarios.map((scenario)=>`<article class="scenario panel"><header><div><p class="eyebrow">RATE ${scenario.rate.toFixed(2)}</p><h3>${scenario.label}</h3></div><b>${scenario.operationalCap}% operational</b></header><div class="donut"></div><p>${data.portfolio.allocation.map((item,index)=>`${item.id==='money'?'Money':item.id==='tech'?'Tech':item.id==='nasdaq'?'Nasdaq':'Asia'} ${scenario.allocation[index]}%`).join(' - ')}</p><small>${scenario.macroCushion}% Money floor · ${scenario.dd.toFixed(2)}% DD · ${scenario.robustCagr.toFixed(2)}% robust · ${scenario.netCagr.toFixed(2)}% base</small></article>`).join('');
  document.querySelectorAll('.scenario .donut').forEach((node,index)=>renderDonut(node,data.scenarios[index].allocation.map((weight,colorIndex)=>({weight,color:colors[colorIndex]}))));
}
function renderMacro(data) {
  $('#heatmap-body').innerHTML=data.drivers.map((driver)=>`<tr><td><b>${driver.name}</b><small>${driver.channel}</small></td><td><span class="score">${driver.category}</span><small>${driver.region}</small></td>${driver.values.map((value)=>`<td><div class="heat" style="background:${heatColor(value)}">${value.toFixed(1)}</div></td>`).join('')}<td><b>${(data.macroModel.driverWeights[driver.id]*100).toFixed(0)}%</b></td>${['money','tech','nasdaq','asia'].map((fund)=>`<td><div class="impact" style="background:${impactColor(driver.allocationImpact[fund])}" title="${driver.relevance}">${driver.allocationImpact[fund]>0?'+':''}${driver.allocationImpact[fund]}</div></td>`).join('')}</tr>`).join('');
}
function renderRegions(data) {
  $('#regional-grid').innerHTML=[...data.regionalRankings].sort((a,b)=>a.rank-b.rank).map((row)=>`<article class="panel regional"><span class="rank">#${row.rank}</span><p class="eyebrow">${row.region}</p><h3>${row.score.toFixed(2)} / 5</h3><div class="region-scores"><span>3m <b>${row.values[0].toFixed(2)}</b></span><span>6m <b>${row.values[1].toFixed(2)}</b></span><span>12m <b>${row.values[2].toFixed(2)}</b></span></div><p>${row.rationale}</p></article>`).join('');
}
function renderFunds(data) {
  $('#slides-track').innerHTML=data.slides.map((slide)=>`<article class="slide panel"><div><p class="eyebrow">${slide.tag}</p><h3>${slide.title}</h3><p>${slide.thesis}</p><div class="slide-links">${slide.sources.map((source)=>`<a href="${source.url}" target="_blank" rel="noreferrer">${source.label}</a>`).join('')}</div></div><div class="facts">${slide.facts.map((fact)=>`<div class="fact"><span>${fact[0]}</span><b>${fact[1]}</b><span>${fact[2]}</span></div>`).join('')}</div></article>`).join('');
}
function renderMonitor(data) {
  $('#monitor-body').innerHTML=data.monitor.map((item)=>`<tr><td><b>${item.holding}</b><br><span class="score">Relevance ${item.score}/100</span></td><td>${item.status}</td><td>${item.trigger}</td><td>${item.cadence}</td></tr>`).join('');
}
function renderDonut(node,allocation) {
  let cursor=0; node.style.background=`conic-gradient(${allocation.map((item)=>{const end=cursor+item.weight;const part=`${item.color} ${cursor}% ${end}%`;cursor=end;return part;}).join(',')})`;
  cursor=0; node.innerHTML=allocation.map((item)=>{const midpoint=cursor+item.weight/2;const angle=midpoint*3.6*Math.PI/180;const x=50+Math.sin(angle)*39;const y=50-Math.cos(angle)*39;cursor+=item.weight;return `<span class="donut-label" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%">${item.weight}%</span>`;}).join('');
}
function heatColor(value){const hue=3+(value-1)/4*125;return `hsl(${hue} 70% 43%)`;}
function impactColor(value){return ['#cf5963','#e7a74c','#e8eef4','#9ecf75','#52a834'][value+2];}
function rng(seed){return ()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);}
function normal(random){let u=0,v=0;while(!u)u=random();while(!v)v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function percentile(values,p){const index=(values.length-1)*p;const low=Math.floor(index),high=Math.ceil(index);return values[low]+(values[high]-values[low])*(index-low);}
function runMonteCarlo(mu,sigma,config) {
  const random=rng(config.seed),values=[];
  for(let path=0;path<config.paths;path++){let value=1;for(let month=0;month<config.months;month++)value*=Math.exp((mu-sigma*sigma/2)/12+sigma*normal(random)/Math.sqrt(12));values.push(value);}
  values.sort((a,b)=>a-b);const quantiles=[.1,.5,.9].map((p)=>percentile(values,p));
  $('#sim-output').innerHTML=`<span>10th percentile<br><b>${quantiles[0].toFixed(2)}x</b></span><span>Median<br><b>${quantiles[1].toFixed(2)}x</b></span><span>90th percentile<br><b>${quantiles[2].toFixed(2)}x</b></span><span>Volatility input<br><b>${(sigma*100).toFixed(0)}%</b></span>`;
  const canvas=$('#simulation-chart'),context=canvas.getContext('2d'),bins=32,max=Math.min(percentile(values,.985),5),counts=Array(bins).fill(0);
  values.forEach((value)=>{const index=Math.min(bins-1,Math.floor(Math.min(value,max)/max*bins));counts[index]++;});const peak=Math.max(...counts);context.clearRect(0,0,canvas.width,canvas.height);context.fillStyle='#63758a';context.font='22px system-ui';context.fillText('Terminal value multiple after 10 years',34,38);counts.forEach((count,index)=>{const x=36+index*(canvas.width-72)/bins,barWidth=(canvas.width-72)/bins-3,barHeight=count/peak*(canvas.height-100);context.fillStyle=index<bins*.3?'#79c83d':index<bins*.7?'#12a8c4':'#f29b38';context.fillRect(x,canvas.height-42-barHeight,barWidth,barHeight);});
}
