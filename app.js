const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits = 1) => `${Number(value).toFixed(digits)}%`;

const themeToggle = $('#theme-toggle');
themeToggle.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  themeToggle.textContent = dark ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-pressed', String(dark));
});

const heading = (text) => [...document.querySelectorAll('.section-heading')].find((node) => node.textContent.includes(text));
const tabGroups = {
  overview: [$('.metrics'), heading('Constrained maximum-growth allocation'), $('.allocation-grid'), $('#dd-math')],
  macro: [heading('Only drivers that can change allocations'), $('.heatmap-wrap'), heading('Optimized allocation scenarios'), $('#scenario-grid')],
  research: [heading('Net CAGR and historical DD'), $('.slides'), heading('10-year Monte Carlo'), $('.simulation')],
  monitor: [heading('When each holding stops earning a place'), $('.monitor')],
  sources: [$('.report')]
};
const tabs = [...document.querySelectorAll('[data-tab]')];
function selectTab(name) {
  Object.entries(tabGroups).forEach(([group, nodes]) => nodes.filter(Boolean).forEach((node) => { node.hidden = group !== name; }));
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  history.replaceState(null, '', `#${name}`);
}
tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
const requestedTab = location.hash.slice(1);
selectTab(Object.hasOwn(tabGroups, requestedTab) ? requestedTab : 'overview');

fetch('data/portfolio.json?v=20260814-01', { cache: 'no-store' }).then((response) => {
  if (!response.ok) throw new Error(`Portfolio data unavailable: ${response.status}`);
  return response.json();
}).then((data) => {
  const portfolio = data.portfolio;
  const macroRate = calculateMacroRate(data);
  const portfolioDd = calculatePortfolioDrawdown(data, portfolio.allocation.map((item) => item.weight));
  const calculatedCagr = calculatePortfolioCagr(data, portfolio.allocation.map((item) => item.weight));

  $('#portfolio-rate').textContent = macroRate.toFixed(2);
  $('#rating-label').textContent = `/ 5 · ${portfolio.ratingLabel}`;
  $('.meter i').style.width = `${macroRate / 5 * 100}%`;
  $('#rate-detail').textContent = `3-12m macro composite · ${portfolio.drawdownCap}% DD cap`;
  $('#allocation-total').textContent = `${portfolio.allocation.length} / 3`;
  $('#cagr-forecast').textContent = fmt(calculatedCagr, 2);
  $('#drawdown').textContent = fmt(portfolioDd, 2);
  $('#allocation-constraint').innerHTML = `Rate <b>${macroRate.toFixed(2)}</b> selects the <b>${portfolio.rateBand}</b> band and <b>${portfolio.drawdownCap}%</b> DD cap.`;
  $('#rationale-copy').textContent = `Highest net CAGR on the 5% grid: ${calculatedCagr.toFixed(2)}% with ${portfolioDd.toFixed(2)}% historical weighted DD.`;
  $('#report-summary').innerHTML = `Rate <b>${macroRate.toFixed(2)} / 5</b> produces <b>${calculatedCagr.toFixed(2)}% net CAGR</b> and <b>${portfolioDd.toFixed(2)}% historical weighted DD</b>. Forecast CAGR is a model assumption; historical results do not predict future losses.`;
  $('#as-of').textContent = new Date(`${data.asOf}T00:00:00`).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });

  renderDonut($('#active-donut'), portfolio.allocation);
  $('#active-allocation').innerHTML = portfolio.allocation.map((item) => `<div class="legend-row"><span><i class="dot" style="background:${item.color}"></i>${item.name}</span><b>${item.weight}%</b></div>`).join('');
  renderDrawdownMath(data, macroRate, portfolioDd);

  $('#heatmap tbody').innerHTML = data.drivers.map((driver) => `<tr><td>${driver.name}</td>${driver.values.map((value) => `<td><div class="heat" style="background:${heatColor(value)}">${value.toFixed(1)}</div></td>`).join('')}<td><b>${(data.macroModel.driverWeights[driver.id] * 100).toFixed(0)}%</b></td><td>${driver.relevance}</td></tr>`).join('');

  const colors = portfolio.allocation.map((item) => item.color);
  $('#scenario-grid').innerHTML = data.scenarios.map((scenario) => `<article class="scenario panel"><header><div><p class="eyebrow">RATE ${scenario.rate}</p><h3>${scenario.label}</h3></div><b>${scenario.cap}% DD cap</b></header><div class="donut" data-label="${scenario.dd.toFixed(2)}% DD · ${scenario.netCagr.toFixed(2)}% CAGR"></div><p>Money ${scenario.allocation[0]}% · Tech ${scenario.allocation[1]}% · Nasdaq ${scenario.allocation[2]}%</p></article>`).join('');
  [...document.querySelectorAll('.scenario .donut')].forEach((node, index) => renderDonut(node, data.scenarios[index].allocation.map((weight, colorIndex) => ({ weight, color: colors[colorIndex] }))));

  const track = $('#slides-track');
  track.innerHTML = data.slides.map((slide) => `<article class="slide panel"><div><p class="eyebrow">${slide.tag}</p><h3>${slide.title}</h3><p>${slide.thesis}</p><div class="slide-links">${slide.sources.map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer">${source.label} ↗</a>`).join('')}</div></div><div class="facts">${slide.facts.map((fact) => `<div class="fact"><span>${fact[0]}</span><b>${fact[1]}</b><span>${fact[2]}</span></div>`).join('')}</div></article>`).join('');

  $('#monitor-table tbody').innerHTML = data.monitor.map((item) => `<tr><td>${item.holding}<br><span class="score">Relevance ${item.score}/100</span></td><td>${item.status}</td><td>${item.trigger}</td><td>${item.cadence}</td></tr>`).join('');
  $('#source-list').innerHTML = data.sources.map((source) => `<div class="source"><b>${source.name}</b><span>${source.detail}</span><a href="${source.url}" target="_blank" rel="noreferrer">Open official source ↗</a></div>`).join('');
  runMonteCarlo(calculatedCagr / 100, portfolio.volatility, data.monteCarlo);
}).catch((error) => {
  document.querySelector('main').innerHTML = `<section class="panel report"><h2>Data could not be loaded</h2><p>${error.message}</p></section>`;
});

fetch('data/monitoring.json', { cache:'no-store' }).then((response) => response.ok ? response.json() : Promise.reject()).then((snapshot) => {
  const checked = new Date(snapshot.verifiedAt).toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' });
  $('#monitoring-status').innerHTML = `Daily verification: <a href="${snapshot.runUrl}" target="_blank" rel="noreferrer">passed ${checked}</a>`;
}).catch(() => { $('#monitoring-status').textContent = 'Daily verification: awaiting next run'; });

function calculateMacroRate(data) {
  const horizons = data.macroModel.horizonWeights;
  return data.drivers.reduce((total, driver) => total + (driver.values[0] * horizons.threeMonth + driver.values[1] * horizons.sixMonth + driver.values[2] * horizons.twelveMonth) * data.macroModel.driverWeights[driver.id], 0);
}

function calculatePortfolioDrawdown(data, allocationValues) {
  const fundDrawdowns = Object.fromEntries(data.drawdownModel.funds.map((fund) => [fund.id, fund.historical / 100]));
  return data.portfolio.allocation.reduce((total, item, index) => total + allocationValues[index] / 100 * fundDrawdowns[item.id], 0) * 100;
}

function calculatePortfolioCagr(data, allocationValues) {
  const netCagr = Object.fromEntries(data.fundModels.map((fund) => [fund.id, fund.netCagr]));
  return data.portfolio.allocation.reduce((total, item, index) => total + netCagr[item.id] * allocationValues[index] / 100, 0);
}

function renderDrawdownMath(data, macroRate, portfolioDd) {
  const rows = data.drawdownModel.funds.map((fund) => {
    const allocation = data.portfolio.allocation.find((item) => item.id === fund.id);
    const contribution = allocation.weight / 100 * fund.historical;
    return `<tr><td>${allocation.name}<br><small>${fund.historicalMetric}</small></td><td><b>${fund.historical.toFixed(2)}%</b></td><td>${allocation.weight}%</td><td><b>${contribution.toFixed(2)}%</b></td></tr>`;
  }).join('');
  const contributions = data.drawdownModel.funds.map((fund) => {
    const allocation = data.portfolio.allocation.find((item) => item.id === fund.id);
    return `${allocation.weight}% × ${fund.historical.toFixed(2)}%`;
  }).join(' + ');
  $('#dd-math').innerHTML = `<p class="eyebrow">HISTORICAL MAX DD MATH</p><h2>${portfolioDd.toFixed(2)}% weighted historical max DD <span>vs ${data.portfolio.drawdownCap}% cap</span></h2><div class="scroll"><table><thead><tr><th>Fund / basis</th><th>Historical max DD</th><th>Allocation</th><th>Weighted DD</th></tr></thead><tbody>${rows}</tbody></table></div><p class="caption"><b>Σ(weight × historical max DD) = ${contributions} = ${portfolioDd.toFixed(2)}%.</b> No forward-looking DD or diversification credit.</p>`;
}

function renderDonut(node, allocation) {
  let cursor = 0;
  node.style.background = `conic-gradient(${allocation.map((item) => { const end = cursor + item.weight; const part = `${item.color} ${cursor}% ${end}%`; cursor = end; return part; }).join(',')})`;
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

function heatColor(value) { const hue = 3 + ((value - 1) / 4) * 125; return `hsl(${hue} 70% 43%)`; }
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function normal(random) { let u = 0; let v = 0; while (!u) u = random(); while (!v) v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function percentile(values, probability) { const index = (values.length - 1) * probability; const low = Math.floor(index); const high = Math.ceil(index); return values[low] + (values[high] - values[low]) * (index - low); }

function runMonteCarlo(mu, sigma, config) {
  const random = rng(config.seed);
  const values = [];
  for (let path = 0; path < config.paths; path++) {
    let value = 1;
    for (let month = 0; month < config.months; month++) value *= Math.exp((mu - sigma * sigma / 2) / 12 + sigma * normal(random) / Math.sqrt(12));
    values.push(value);
  }
  values.sort((left, right) => left - right);
  const quantiles = [0.1, 0.5, 0.9].map((probability) => percentile(values, probability));
  $('#sim-output').innerHTML = `<span>10th percentile<br><b>${quantiles[0].toFixed(2)}×</b></span><span>Median<br><b>${quantiles[1].toFixed(2)}×</b></span><span>90th percentile<br><b>${quantiles[2].toFixed(2)}×</b></span><span>Volatility input<br><b>${(sigma * 100).toFixed(0)}%</b></span>`;
  const canvas = $('#simulation-chart');
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const bins = 32;
  const max = Math.min(percentile(values, 0.985), 5);
  const counts = Array(bins).fill(0);
  values.forEach((value) => { const index = Math.min(bins - 1, Math.floor(Math.min(value, max) / max * bins)); counts[index]++; });
  const peak = Math.max(...counts);
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#63758a';
  context.font = '22px system-ui';
  context.fillText('Terminal value multiple after 10 years', 34, 38);
  counts.forEach((count, index) => {
    const x = 36 + index * (width - 72) / bins;
    const barWidth = (width - 72) / bins - 3;
    const barHeight = count / peak * (height - 100);
    context.fillStyle = index < bins * 0.3 ? '#79c83d' : index < bins * 0.7 ? '#12a8c4' : '#f29b38';
    context.fillRect(x, height - 42 - barHeight, barWidth, barHeight);
  });
  context.fillStyle = '#63758a';
  context.font = '16px system-ui';
  context.fillText('0×', 32, height - 15);
  context.fillText(`${max.toFixed(1)}×`, width - 68, height - 15);
}
