'use strict';
// Yahoo Finance chart API is accessed through the companion Cloudflare Worker.
const PROXY_BASE='https://pmc.mcraft-tiger-574.workers.dev';
const $=id=>document.getElementById(id);
const blank='—';
const groups=[
  {label:'미국 증시',items:[
    {id:'nasdaq',no:1,name:'나스닥 종합',ticker:'^IXIC',unit:'index',percentChart:true},
    {id:'sp500',no:2,name:'S&P 500',ticker:'^GSPC',unit:'index',percentChart:true},
    {id:'sox',no:4,name:'필라델피아 반도체 지수',ticker:'^SOX',unit:'index',percentChart:true},
    {id:'nvda-m7',no:3,name:'엔비디아',ticker:'NVDA',unit:'stock',percentChart:true},
    {id:'aapl',no:3,name:'애플',ticker:'AAPL',unit:'stock',percentChart:true},
    {id:'googl',no:3,name:'알파벳 Class A',ticker:'GOOGL',unit:'stock',percentChart:true},
    {id:'msft',no:3,name:'마이크로소프트',ticker:'MSFT',unit:'stock',percentChart:true},
    {id:'amzn',no:3,name:'아마존',ticker:'AMZN',unit:'stock',percentChart:true},
    {id:'tsla',no:3,name:'테슬라',ticker:'TSLA',unit:'stock',percentChart:true},
    {id:'meta',no:3,name:'메타',ticker:'META',unit:'stock',percentChart:true}
  ]},
  {label:'금리·환율·원자재',items:[
    {id:'us2y',no:6,name:'미국 2년물 국채금리',source:'treasury',treasuryField:'BC_2YEAR',unit:'yield',suffix:'%',decimals:3},
    {id:'us10y',no:7,name:'미국 10년물 국채금리',source:'treasury',treasuryField:'BC_10YEAR',unit:'yield',suffix:'%',decimals:3},
    {id:'us30y',no:8,name:'미국 30년물 국채금리',source:'treasury',treasuryField:'BC_30YEAR',unit:'yield',suffix:'%',decimals:3},
    {id:'dxy',no:9,name:'달러인덱스',ticker:'DX-Y.NYB',unit:'index'},
    {id:'usdkRW',no:10,name:'원/달러 환율',ticker:'KRW=X',unit:'fx',suffix:'원',decimals:2},
    {id:'wti',no:11,name:'WTI 유가',ticker:'CL=F',unit:'commodity',suffix:'$',decimals:2},
    {id:'brent',no:12,name:'브렌트유 유가',ticker:'BZ=F',unit:'commodity',suffix:'$',decimals:2},
    {id:'vix',no:13,name:'VIX',ticker:'^VIX',unit:'index',decimals:2}
  ]},
  {label:'국내 증시',items:[
    {id:'kospi200night',no:12,name:'코스피200 야간선물',source:'kredNightFutures',page:'https://kred.dev/ko/kospi-200-night-futures',unit:'futures',decimals:2},
    {id:'kosdaq150night',no:13,name:'코스닥150 야간선물',source:'kredNightFutures',page:'https://kred.dev/ko/kosdaq-150-night-futures',unit:'futures',decimals:2}
  ]}
];
// SOXQ가 추종하는 PHLX Semiconductor Sector Index의 구성 종목 풀(현행 30개 종목).
// 이 중 시가총액 상위 16개만 요약 카드와 개별 차트에 표시합니다.
const SEMICONDUCTOR_UNIVERSE=[
  ['nvda-sox','NVDA','엔비디아'],['avgo','AVGO','브로드컴'],['tsm','TSM','TSMC'],['asml','ASML','ASML'],
  ['amd','AMD','AMD'],['mu','MU','마이크론'],['qcom','QCOM','퀄컴'],['intc','INTC','인텔'],
  ['txn','TXN','텍사스 인스트루먼트'],['adi','ADI','아날로그 디바이시스'],['mrvl','MRVL','마벨 테크놀로지'],
  ['amat','AMAT','어플라이드 머티리얼즈'],['klac','KLAC','KLA'],['lrcx','LRCX','램리서치'],
  ['nxpi','NXPI','NXP 반도체'],['mpwr','MPWR','모놀리식 파워 시스템즈'],['ter','TER','테라다인'],
  ['alab','ALAB','아스테라 랩스'],['cohr','COHR','코히런트'],['mchp','MCHP','마이크로칩 테크놀로지'],
  ['arm','ARM','ARM 홀딩스'],['crdo','CRDO','크레도 테크놀로지'],['on','ON','온세미'],
  ['gfs','GFS','글로벌파운드리스'],['q','Q','큐니티 일렉트로닉스'],['entg','ENTG','엔테그리스'],
  ['tsem','TSEM','타워 세미컨덕터'],['mtsi','MTSI','MACOM 테크놀로지'],['sitm','SITM','SiTime'],['lscc','LSCC','래티스 세미컨덕터']
].map(([id,ticker,name])=>({id,no:4,name,ticker,unit:'stock',semiconductorCandidate:true,summaryActive:false}));
const SKHY_ITEM={id:'skhy',no:5,name:'SK hynix ADR',ticker:'SKHY',unit:'stock',percentChart:true};
// Summary and chart order: indices -> M7 -> SOX -> SOX constituent top 16 (No. 4) -> SK hynix ADR (No. 5).
const firstGroup=groups[0].items;
const byId=new Map(firstGroup.map(item=>[item.id,item]));
groups[0].items=[
  byId.get('nasdaq'),byId.get('sp500'),
  ...['nvda-m7','aapl','googl','msft','amzn','tsla','meta'].map(id=>byId.get(id)),
  byId.get('sox'),
  ...SEMICONDUCTOR_UNIVERSE,SKHY_ITEM
].filter(Boolean);
const all=groups.flatMap(g=>g.items);
const dataById=new Map(),charts=new Map();
let semiconductorExpanded=false;
function updateSemiconductorToggles(){
  document.querySelectorAll('[data-semiconductor-content]').forEach(el=>{el.hidden=!semiconductorExpanded;});
  document.querySelectorAll('[data-semiconductor-toggle]').forEach(button=>{
    button.textContent=semiconductorExpanded?'필라델피아 반도체 지수 구성 종목(시가총액 상위 16종목) 접기 ▲':'필라델피아 반도체 지수 구성 종목(시가총액 상위 16종목) 펼치기 ▼';
    button.setAttribute('aria-expanded',String(semiconductorExpanded));
  });
  if(semiconductorExpanded)requestAnimationFrame(resizeCharts);
}
function createSemiconductorToggle(){
  const button=document.createElement('button');
  button.type='button';button.className='semiconductor-toggle';
  button.dataset.semiconductorToggle='true';button.setAttribute('aria-expanded',String(semiconductorExpanded));
  button.textContent=semiconductorExpanded?'필라델피아 반도체 지수 구성 종목(시가총액 상위 16종목) 접기 ▲':'필라델피아 반도체 지수 구성 종목(시가총액 상위 16종목) 펼치기 ▼';
  button.addEventListener('click',()=>{semiconductorExpanded=!semiconductorExpanded;updateSemiconductorToggles();});
  return button;
}
const M7_IDS=['nvda-m7','aapl','googl','msft','amzn','tsla','meta'];
const M7_TICKERS=['NVDA','AAPL','GOOGL','MSFT','AMZN','TSLA','META'];
function fmt(n,dec=2){if(n===null||n===undefined||!Number.isFinite(n))return blank;return n.toLocaleString('ko-KR',{minimumFractionDigits:0,maximumFractionDigits:dec});}
function signed(n,dec=2){if(n===null||n===undefined||!Number.isFinite(n))return blank;return `${n>0?'+':''}${fmt(n,dec)}`;}
function colorClass(n){return n>0?'up':n<0?'down':'neutral';}
function closeText(item,n){if(n==null)return blank;let suffix=item.suffix||'';if(item.unit==='yield')return `${fmt(n,item.decimals??3)}%`;if(item.unit==='fx')return `${fmt(n,item.decimals??2)}원`;if(item.unit==='commodity')return `$${fmt(n,item.decimals??2)}`;if(item.unit==='stock')return `$${fmt(n,2)}`;return `${fmt(n,item.decimals??2)}${suffix}`;}
function changeText(item,n){if(n==null)return blank;const dec=item.unit==='yield'?3:2;const value=signed(n,dec);if(item.unit==='commodity'||item.unit==='stock')return `$ ${value}`;const suffix=item.unit==='yield'?'%p':item.unit==='fx'?'원':'';return `${value}${suffix}`;}
function pctText(n){return n==null?blank:`${n>0?'+':''}${fmt(n,2)}%`;}
function makeSummary(){
  const root=$('summaryRows');root.innerHTML='';
  const m7Names={'nvda-m7':'엔비디아',aapl:'애플',googl:'알파벳 Class A',msft:'마이크로소프트',amzn:'아마존',tsla:'테슬라',meta:'메타'};
  const m7Items=M7_IDS.map((id,index)=>({id,ticker:M7_TICKERS[index],item:all.find(x=>x.id===id),original:index})).sort((a,b)=>{
    const av=Number.isFinite(a.item?.marketCap)&&a.item.marketCap>0?a.item.marketCap:null;
    const bv=Number.isFinite(b.item?.marketCap)&&b.item.marketCap>0?b.item.marketCap:null;
    if(av===null&&bv===null)return a.original-b.original;if(av===null)return 1;if(bv===null)return -1;return bv-av;
  });
  const semis=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).sort((a,b)=>{
    const av=Number.isFinite(a.marketCap)&&a.marketCap>0?a.marketCap:null;
    const bv=Number.isFinite(b.marketCap)&&b.marketCap>0?b.marketCap:null;
    if(av===null&&bv===null)return SEMICONDUCTOR_UNIVERSE.indexOf(a)-SEMICONDUCTOR_UNIVERSE.indexOf(b);
    if(av===null)return 1;if(bv===null)return -1;return bv-av;
  }).slice(0,16).map(x=>({no:4,id:x.id,name:x.name,ticker:x.ticker}));
  const m7Refs=m7Items.map(x=>({no:3,id:x.id,name:m7Names[x.id],ticker:x.ticker}));
  const m7Rows=[[m7Refs[0]],[m7Refs[1],m7Refs[2]],[m7Refs[3],m7Refs[4]],[m7Refs[5],m7Refs[6]]];
  const rows=[
    {items:[{no:1,id:'nasdaq',name:'나스닥 종합'},{no:2,id:'sp500',name:'S&P 500'}],after:true},
    ...m7Rows.map((items,index)=>({items,m7:true,after:index===3})),
    {items:[{no:4,id:'sox',name:'필라델피아 반도체 지수',ticker:'^SOX'}],single:true,semis,after:true},
    {items:[{no:5,id:'skhy',name:'SK hynix ADR',ticker:'SKHY'}],single:true,after:true},
    {items:[{no:6,id:'us2y',name:'미국 2년물'},{no:7,id:'us10y',name:'미국 10년물'},{no:8,id:'us30y',name:'미국 30년물'}]},
    {items:[{no:9,id:'dxy',name:'달러인덱스'},{no:10,id:'usdkRW',name:'원/달러'}]},
    {items:[{no:11,id:'wti',name:'WTI 유가'},{no:12,id:'brent',name:'브렌트유'},{no:13,id:'vix',name:'VIX'}]},
    {items:[{no:13,id:'kospi200night',name:'코스피200 야간선물',url:'https://kred.dev/ko/kospi-200-night-futures'},{no:14,id:'kosdaq150night',name:'코스닥150 야간선물',url:'https://kred.dev/ko/kosdaq-150-night-futures'}],before:true}
  ];
  function makeSummaryCell(ref){
    const cell=document.createElement('div');
    cell.className='summary-cell'+(ref.id==='kospi200night'||ref.id==='kosdaq150night'?' night-futures-summary-cell':'')+(ref.no===3?' m7-summary-cell':'')+(['nasdaq','sp500','sox','kospi200night','kosdaq150night'].includes(ref.id)?' soft-green-summary-cell':'');
    const targetId=ref.chartId||ref.id;
    const link=ref.url?`<a class="summary-chart-link" href="${ref.url}" target="_blank" rel="noopener noreferrer">차트</a>`:`<a class="summary-chart-link internal-chart-link" href="#chart-card-${targetId}" data-chart-target="chart-card-${targetId}">차트</a>`;
    const ticker=ref.ticker||all.find(item=>item.id===ref.id)?.ticker;
    const displayName=`${ref.no}. ${ref.name}${ticker?` [${ticker}]`:''}`;
    cell.innerHTML=`<div class="summary-titleline"><div class="summary-label">${displayName}</div>${link}</div><div class="summary-price-line"><div class="summary-quote-values"><div class="summary-price">${blank}</div><div class="summary-change neutral">${blank} · ${blank}</div>${all.find(item=>item.id===ref.id)?.unit==='stock'?`<div class="summary-session-box"><div class="summary-session-item"><span class="summary-session-label">프리마켓</span><span class="summary-session-value summary-pre-price">${blank}</span><span class="summary-session-delta summary-pre-delta neutral">${blank}</span><span class="summary-session-pct summary-pre-pct neutral">${blank}</span></div><div class="summary-session-item"><span class="summary-session-label">정규장</span><span class="summary-session-value summary-regular-price">${blank}</span><span class="summary-session-delta summary-regular-delta neutral">${blank}</span><span class="summary-session-pct summary-regular-pct neutral">${blank}</span></div><div class="summary-session-item"><span class="summary-session-label">애프터마켓</span><span class="summary-session-value summary-post-price">${blank}</span><span class="summary-session-delta summary-post-delta neutral">${blank}</span><span class="summary-session-pct summary-post-pct neutral">${blank}</span></div></div>`:''}</div></div>`;
    cell.dataset.summaryId=ref.id;
    return cell;
  }
  rows.forEach(row=>{
    if(!row.items.length)return;
    const line=document.createElement('div');
    line.className='summary-row'+(row.m7?' m7-summary-row':'')+(row.single?' single-index-row':'')+(row.before?' summary-divider-before':'')+(row.after?' summary-divider-after':'');
    line.style.setProperty('--cols',row.items.length);
    row.items.forEach(ref=>{
      const cell=makeSummaryCell(ref);
      if(ref.id==='sox'&&row.semis){
        const toggle=createSemiconductorToggle();
        toggle.classList.add('semiconductor-toggle-in-cell');
        cell.appendChild(toggle);
        const grid=document.createElement('div');grid.className='semiconductor-summary-grid';grid.dataset.semiconductorContent='true';grid.hidden=!semiconductorExpanded;
        row.semis.forEach(semiref=>grid.appendChild(makeSummaryCell(semiref)));
        cell.appendChild(grid);
      }
      line.appendChild(cell);
    });
    root.appendChild(line);
  });
  root.querySelectorAll('.internal-chart-link').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();const target=$(link.dataset.chartTarget);if(!target)return;target.scrollIntoView({behavior:'smooth',block:'start'});target.classList.remove('chart-card-highlight');void target.offsetWidth;target.classList.add('chart-card-highlight');window.setTimeout(()=>target.classList.remove('chart-card-highlight'),1600);}));
  updateSemiconductorToggles();
}
function makeCharts(){
  const root=$('charts');root.innerHTML='';
  groups.forEach(group=>{
    let visibleItems=group.items.filter(item=>item.source!=='kredNightFutures'&&(!item.semiconductorCandidate||item.summaryActive));
    const m7Set=new Set(M7_IDS);
    const byCap=(a,b)=>{const av=Number.isFinite(a.marketCap)&&a.marketCap>0?a.marketCap:null,bv=Number.isFinite(b.marketCap)&&b.marketCap>0?b.marketCap:null;if(av===null&&bv===null)return group.items.indexOf(a)-group.items.indexOf(b);if(av===null)return 1;if(bv===null)return -1;return bv-av;};
    visibleItems.sort((a,b)=>{if(m7Set.has(a.id)&&m7Set.has(b.id))return byCap(a,b);if(a.semiconductorCandidate&&b.semiconductorCandidate)return byCap(a,b);return group.items.indexOf(a)-group.items.indexOf(b);});
    if(!visibleItems.length)return;
    const heading=document.createElement('div');heading.className='section-heading group-heading';heading.innerHTML=`<div><span class="eyebrow">${group.label==='미국 증시'?'U.S. MARKETS':group.label==='금리·환율·원자재'?'RATES · FX · COMMODITIES':'KOREA MARKETS'}</span><h2>${group.label}</h2></div>`;root.appendChild(heading);
    let semiconductorWrap=null;
    visibleItems.forEach(item=>{
      const card=document.createElement('article');
      card.className='chart-card'+(['nvda-m7','sox','skhy','us2y'].includes(item.id)?' chart-divider-before':'');
      card.id=`chart-card-${item.id}`;
      card.innerHTML=`<div class="chart-top"><div class="chart-title"><span class="number">${item.no}</span><h3>${item.name}${item.ticker?` [${item.ticker}]`:''}</h3></div><div class="quote-block"><div class="quote-close">${blank}</div><div class="quote-change neutral">${blank} · ${blank}</div><div class="quote-date">종가 기준</div></div></div><div class="chart-range-toolbar" data-range-for="${item.id}"><button type="button" data-range="1M">1M</button><button type="button" data-range="3M" class="selected">3M</button><button type="button" data-range="6M">6M</button><button type="button" data-range="YTD">YTD</button><button type="button" data-range="1Y">1Y</button><button type="button" data-range="ALL">ALL</button></div><div id="chart-${item.id}" class="chart-area"><div class="chart-empty">시세 데이터를 불러오는 중…</div></div><div class="chart-foot"><span class="chart-note">${item.ticker||''}</span><span class="bar-count">전체 기간 데이터</span></div>`;
      if(item.semiconductorCandidate&&semiconductorWrap){semiconductorWrap.appendChild(card);}
      else root.appendChild(card);
      item.card=card;
      if(item.id==='sox'){
        const toggle=createSemiconductorToggle();toggle.classList.add('semiconductor-toggle-in-chart');card.appendChild(toggle);
        semiconductorWrap=document.createElement('div');semiconductorWrap.className='chart-semiconductor-content';semiconductorWrap.dataset.semiconductorContent='true';semiconductorWrap.hidden=!semiconductorExpanded;card.appendChild(semiconductorWrap);
      }
    });
  });
  updateSemiconductorToggles();
}
function workerUrl(ticker){return `${PROXY_BASE}/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1d&events=div%2Csplits&includePrePost=true`)}`;}
async function fetchSeries(item){if(item.source==='kredNightFutures'){const response=await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(item.page)}`,{cache:'no-store'});if(!response.ok)throw new Error(`KRED HTTP ${response.status}`);const html=await response.text();const doc=new DOMParser().parseFromString(html,'text/html');const decode=s=>String(s||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&minus;/gi,'−').replace(/&#8722;/g,'−');const bodyText=decode(doc.body?.textContent||'');const rawText=decode(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));const text=(bodyText+' '+rawText).replace(/[\u00a0\u2007\u202f]/g,' ').replace(/\s+/g,' ');const title=item.id==='kospi200night'?'코스피 200 야간선물':'코스닥 150 야간선물';const quotePattern=/([0-9]{1,4}(?:,[0-9]{3})*\.\d{2})\s*([+−–-]\s*\d+(?:\.\d+)?)\s*\(\s*([+−–-]?\s*\d+(?:\.\d+)?)\s*%\s*\)/g;let matches=[...text.matchAll(quotePattern)];let match=null;if(matches.length){const titleIndex=text.indexOf(title);match=matches.find(m=>titleIndex<0||m.index>=titleIndex&&m.index<titleIndex+2200)||matches[0];}if(!match){const metas=[...doc.querySelectorAll('meta[property="og:description"],meta[name="description"],meta[name="twitter:description"]')].map(m=>m.content||'').join(' ');const candidate=(bodyText+' '+decode(metas)).replace(/\s+/g,' ');match=candidate.match(new RegExp(quotePattern.source));}if(!match){const titleIndex=text.indexOf(title);const section=text.slice(titleIndex>=0?titleIndex:0,(titleIndex>=0?titleIndex:0)+2500);const priceMatch=section.match(/(?:^|\s)([0-9]{1,4}(?:,[0-9]{3})*\.\d{2})(?=\s|$)/);const changeMatch=section.match(/([+−–-]\s*\d+(?:\.\d+)?)\s*\(\s*([+−–-]?\s*\d+(?:\.\d+)?)\s*%\s*\)/);if(priceMatch&&changeMatch)match=[priceMatch[1],changeMatch[1],changeMatch[2]];}if(!match)throw new Error('KRED 시세를 읽지 못했습니다. Worker 응답에 현재가가 포함되는지 확인해 주세요.');const num=v=>Number(String(v).replace(/,/g,'').replace(/[−–]/g,'-').replace(/\s/g,''));const price=num(match[1]),delta=num(match[2]),pct=num(match[3]);if(!Number.isFinite(price)||!Number.isFinite(delta)||!Number.isFinite(pct)||price<=0)throw new Error('KRED 시세 형식이 올바르지 않습니다');const reference=price-delta;const nowMs=Date.now();const nowDate=new Date(nowMs);const sessionStart=new Date(nowDate);const hour=nowDate.getHours();if(hour<18)sessionStart.setDate(sessionStart.getDate()-1);sessionStart.setHours(18,0,0,0);let sessionEnd=new Date(sessionStart);sessionEnd.setDate(sessionEnd.getDate()+1);sessionEnd.setHours(6,0,0,0);const now=Math.floor(Math.min(nowMs,sessionEnd.getTime())/1000);const start=Math.floor(sessionStart.getTime()/1000);const chartEnd=Math.max(start+60,now);return {nightFutures:true,current:price,delta,pct,reference,values:[{time:start,value:reference},{time:chartEnd,value:price}],exchange:'KRED',sessionStart:start,sessionEnd:Math.floor(sessionEnd.getTime()/1000)};}if(item.source==='tradingview'||item.source==='tradingviewEmbed'||item.source==='nightFuturesEmbed')return {tradingView:true,embed:item.source==='tradingviewEmbed',nightFutures:item.source==='nightFuturesEmbed',values:[]};const intradayPromise=item.unit==='stock'?fetch(`${PROXY_BASE}/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.ticker)}?range=5d&interval=1m&events=div%2Csplits&includePrePost=true`)}`,{cache:'no-store'}).catch(()=>null):null;const target=item.source==='treasury'?`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${new Date().getFullYear()}`:item.source==='fred'?`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(item.ticker)}&cosd=2024-01-01`: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.ticker)}?range=2y&interval=1d&events=div%2Csplits&includePrePost=true`;const response=await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(target)}`,{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);if(item.source==='treasury'){const xml=await response.text();const doc=new DOMParser().parseFromString(xml,'application/xml');const entries=[...doc.getElementsByTagName('entry')];const values=entries.map(entry=>{const dateNode=entry.getElementsByTagName('d:NEW_DATE')[0]||entry.getElementsByTagName('NEW_DATE')[0];const field=item.treasuryField||'BC_2YEAR';const valueNode=[...entry.getElementsByTagName('*')].find(node=>node.localName===field);const date=(dateNode?.textContent||'').slice(0,10);const value=Number(valueNode?.textContent);return {date,value};}).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Number.isFinite(x.value)&&x.value>0).sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({time:Math.floor(Date.parse(x.date+'T00:00:00Z')/1000),value:x.value}));if(values.length<2)throw new Error(`${item.name} 데이터 없음`);return {values,currency:'%',exchange:'U.S. Treasury'};}if(item.source==='fred'){const csv=await response.text();const lines=csv.trim().split(/\r?\n/);const values=lines.slice(1).map(line=>{const parts=line.split(',');const date=parts[0];const value=Number(parts[1]);return {date,value};}).filter(x=>x.date&&x.date!=='date'&&Number.isFinite(x.value)&&x.value>-100&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)).map(x=>({time:Math.floor(Date.parse(x.date+'T00:00:00Z')/1000),value:x.value}));if(values.length<2)throw new Error('미국 2년물 금리 데이터 없음');return {values,currency:'%',exchange:'FRED'};}const json=await response.json();const result=json?.chart?.result?.[0];if(!result)throw new Error(json?.chart?.error?.description||'시세 데이터 없음');const timestamps=result.timestamp||[],quotes=result.indicators?.quote?.[0]||{},closes=quotes.close||[];const values=[];for(let i=0;i<timestamps.length;i++){const close=closes[i];if(close!==null&&close!==undefined&&Number.isFinite(Number(close)))values.push({time:timestamps[i],value:Number(close)});}if(values.length<2)throw new Error('차트 데이터 부족');const meta=result.meta||{};const numOrNull=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
// Yahoo의 2년/일봉 응답은 preMarketPrice·postMarketPrice를 누락하는 경우가 있어,
// 별도의 5일/1분봉(확장거래 포함)에서 각 세션의 마지막 체결가를 보완한다.
let sessionQuotes={};
if(item.unit==='stock'){
  try{
    const intradayResponse=await intradayPromise;
    if(intradayResponse.ok){
      const intradayJson=await intradayResponse.json();
      const intraday=intradayJson?.chart?.result?.[0];
      const times=intraday?.timestamp||[];
      const closes1m=intraday?.indicators?.quote?.[0]?.close||[];
      const formatter=new Intl.DateTimeFormat('en-US',{timeZone:intraday?.meta?.exchangeTimezoneName||'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
      const bars=[];
      for(let i=0;i<times.length;i++){
        const v=Number(closes1m[i]); if(!Number.isFinite(v)||v<=0)continue;
        const parts=Object.fromEntries(formatter.formatToParts(new Date(times[i]*1000)).map(p=>[p.type,p.value]));
        const minute=Number(parts.hour)*60+Number(parts.minute);
        bars.push({date:`${parts.year}-${parts.month}-${parts.day}`,minute,value:v,time:times[i]});
      }
      if(bars.length){
        const latestDate=bars[bars.length-1].date;
        const dayBars=bars.filter(b=>b.date===latestDate);
        const lastOf=list=>list.length?list[list.length-1].value:null;
        const pre=dayBars.filter(b=>b.minute>=240&&b.minute<570);
        const regular=dayBars.filter(b=>b.minute>=570&&b.minute<960);
        const post=dayBars.filter(b=>b.minute>=960&&b.minute<1200);
        const priorClose=values.length>1?values[values.length-2].value:null;
        const regularPrice=lastOf(regular)??numOrNull(meta.regularMarketPrice);
        const prePrice=lastOf(pre)??numOrNull(meta.preMarketPrice);
        const postPrice=lastOf(post)??numOrNull(meta.postMarketPrice);
        const change=(price,base)=>price!==null&&base!==null&&base>0?price-base:null;
        const pct=(delta,base)=>delta!==null&&base>0?delta/base*100:null;
        const preDelta=change(prePrice,priorClose), regularDelta=change(regularPrice,priorClose), postDelta=change(postPrice,regularPrice??priorClose);
        sessionQuotes={
          preMarketPrice:prePrice,preMarketChange:preDelta,preMarketChangePercent:pct(preDelta,priorClose),
          regularMarketPrice:regularPrice,regularMarketChange:regularDelta,regularMarketChangePercent:pct(regularDelta,priorClose),
          postMarketPrice:postPrice,postMarketChange:postDelta,postMarketChangePercent:pct(postDelta,regularPrice??priorClose)
        };
      }
    }
  }catch(sessionError){console.warn(`${item.ticker} 확장거래 시세 조회 실패`,sessionError);}
}
return {values,currency:meta.currency||'',exchange:meta.exchangeName||'',regularMarketPrice:sessionQuotes.regularMarketPrice??numOrNull(meta.regularMarketPrice),regularMarketChange:sessionQuotes.regularMarketChange??numOrNull(meta.regularMarketChange),regularMarketChangePercent:sessionQuotes.regularMarketChangePercent??numOrNull(meta.regularMarketChangePercent),preMarketPrice:sessionQuotes.preMarketPrice??numOrNull(meta.preMarketPrice),preMarketChange:sessionQuotes.preMarketChange??numOrNull(meta.preMarketChange),preMarketChangePercent:sessionQuotes.preMarketChangePercent??numOrNull(meta.preMarketChangePercent),postMarketPrice:sessionQuotes.postMarketPrice??numOrNull(meta.postMarketPrice),postMarketChange:sessionQuotes.postMarketChange??numOrNull(meta.postMarketChange),postMarketChangePercent:sessionQuotes.postMarketChangePercent??numOrNull(meta.postMarketChangePercent)};}
function dateString(ts){return new Date(ts*1000).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'});}
function renderOne(item,series){if(series.nightFutures){item.last=series.current;item.delta=series.delta;item.pct=series.pct;item.prev=series.reference;dataById.set(item.id,series);if(!item.card)return;const card=item.card,container=$(`chart-${item.id}`);const close=card.querySelector('.quote-close'),change=card.querySelector('.quote-change'),date=card.querySelector('.quote-date');close.textContent=closeText(item,series.current);change.textContent=`${series.delta>0?'+':''}${fmt(series.delta,item.decimals??2)} · ${series.pct>0?'+':''}${series.pct.toFixed(2)}%`;change.className=`quote-change ${colorClass(series.delta)}`;date.textContent='KRED 공개 시세 · 조회 시점';item.last=series.current;item.delta=series.delta;item.pct=series.pct;item.prev=series.reference;dataById.set(item.id,series);container.innerHTML='';if(!window.LightweightCharts){container.innerHTML='<div class=\'chart-empty\'>차트 라이브러리를 불러오지 못했습니다.</div>';return;}const chart=LightweightCharts.createChart(container,{width:container.clientWidth,height:container.clientHeight,layout:{background:{type:'solid',color:'#ffffff'},textColor:'#8995a6',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',fontSize:10},grid:{vertLines:{color:'#f0f3f7'},horzLines:{color:'#f0f3f7'}},rightPriceScale:{borderColor:'#e6eaf1',scaleMargins:{top:.12,bottom:.1}},timeScale:{borderColor:'#e6eaf1',timeVisible:true,secondsVisible:false,rightOffset:1,barSpacing:12,minBarSpacing:2},localization:{locale:'ko-KR',priceFormatter:p=>fmt(p,item.decimals??2)}});const line=chart.addLineSeries({color:series.delta>=0?'#d84a4a':'#3478d4',lineWidth:2,priceLineVisible:false,lastValueVisible:true});line.setData(series.values);chart.timeScale().fitContent();charts.set(item.id,{chart,line});const toolbar=card.querySelector('.chart-range-toolbar');if(toolbar)toolbar.style.display='none';card.querySelector('.chart-note').textContent='야간 세션 18:00~06:00 · 기준가와 최신가만 표시 (분봉 이력 API 미확인)';card.querySelector('.bar-count').textContent='야간 세션 전체 시간축 · 실제 분봉 이력 미제공';return;}if(series.tradingView){const card=item.card,container=$(`chart-${item.id}`);container.innerHTML='';const isKospi=item.id==='kospi200night';const title=isKospi?'코스피200 야간선물':'코스닥150 야간선물';const url=isKospi?'https://kred.dev/ko/kospi-200-night-futures':'https://kred.dev/ko/kosdaq-150-night-futures';card.querySelector('.quote-close').textContent='KRED 실시간 차트';card.querySelector('.quote-change').textContent='실시간 가격·등락은 아래 차트에서 확인';card.querySelector('.quote-change').className='quote-change neutral';card.querySelector('.quote-date').textContent='KRED 데이터';const frame=document.createElement('iframe');frame.className='kred-frame';frame.title=title+' 실시간 시세 및 차트';frame.loading='eager';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allow='fullscreen';frame.src=url;container.appendChild(frame);card.querySelector('.chart-note').textContent='KRED 원본 페이지 · 실제 야간선물 시세와 분봉 차트';card.querySelector('.bar-count').textContent='KRED 페이지에서 1분 · 5분 · 10분 · 15분 · 30분 선택';const toolbar=card.querySelector('.chart-range-toolbar');if(toolbar)toolbar.style.display='none';return;}const toolbar=item.card.querySelector('.chart-range-toolbar');if(toolbar){toolbar.style.display='flex';toolbar.querySelectorAll('button').forEach(btn=>{btn.onclick=()=>{toolbar.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===btn));const chartObj=charts.get(item.id)?.chart;if(!chartObj)return;const now=Math.floor(Date.now()/1000),days={'1M':31,'3M':92,'6M':184,'YTD':Math.ceil((Date.now()-new Date(new Date().getFullYear(),0,1).getTime())/86400000),'1Y':366,'ALL':730}[btn.dataset.range]||92;const to=series.values[series.values.length-1].time;let from;if(btn.dataset.range==='ALL'){from=series.values[0].time;}else if(btn.dataset.range==='YTD'){from=Math.max(series.values[0].time,Math.floor(new Date(new Date().getFullYear(),0,1).getTime()/1000));}else{from=Math.max(series.values[0].time,to-days*86400);}const visibleCount=series.values.filter(v=>v.time>=from&&v.time<=to).length;const plotWidth=Math.max(120,(chartObj.options().width||chartObj.chartElement?.clientWidth||item.card.querySelector('.chart-area').clientWidth)-58);chartObj.applyOptions({timeScale:{minBarSpacing:.25,barSpacing:Math.max(.25,Math.min(7,plotWidth/Math.max(1,visibleCount))),rightOffset:0}});chartObj.timeScale().setVisibleRange({from,to});};});}dataById.set(item.id,series);const vals=series.values,last=vals[vals.length-1],prev=vals[vals.length-2],delta=last.value-prev.value,pct=prev.value?delta/prev.value*100:null;item.last=last.value;item.delta=delta;item.pct=pct;item.prev=prev.value;if(item.unit==='stock'){item.preMarketPrice=series.preMarketPrice;item.preMarketDelta=series.preMarketChange;item.preMarketPct=series.preMarketChangePercent;item.regularMarketPrice=series.regularMarketPrice??last.value;item.regularMarketDelta=series.regularMarketChange??delta;item.regularMarketPct=series.regularMarketChangePercent??pct;item.afterMarketPrice=series.postMarketPrice;item.afterMarketDelta=series.postMarketChange;item.afterMarketPct=series.postMarketChangePercent;}const card=item.card;const close=card.querySelector('.quote-close'),change=card.querySelector('.quote-change'),date=card.querySelector('.quote-date');close.textContent=closeText(item,last.value);change.textContent=`${changeText(item,delta)} · ${pctText(pct)}`;change.className=`quote-change ${colorClass(delta)}`;date.textContent=`${dateString(last.time)} 종가`;const container=$(`chart-${item.id}`);container.innerHTML='';if(!window.LightweightCharts){container.innerHTML='<div class="chart-empty">차트 라이브러리를 불러오지 못했습니다.</div>';return;}const chart=LightweightCharts.createChart(container,{width:container.clientWidth,height:container.clientHeight,layout:{background:{type:'solid',color:'#ffffff'},textColor:'#8995a6',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',fontSize:10},grid:{vertLines:{color:'#f0f3f7'},horzLines:{color:'#f0f3f7'}},rightPriceScale:{borderColor:'#e6eaf1',scaleMargins:{top:.12,bottom:.1}},timeScale:{borderColor:'#e6eaf1',timeVisible:false,secondsVisible:false,rightOffset:1,barSpacing:7,minBarSpacing:.25},crosshair:{vertLine:{color:'#a9b9cc',width:1,style:2},horzLine:{color:'#a9b9cc',width:1,style:2}},localization:{locale:'ko-KR',priceFormatter:p=>item.percentChart?`${p>0?'+':''}${p.toFixed(1)}%`:fmt(p,item.decimals??2)}});let points=vals;if(item.percentChart){const base=vals[0].value;points=vals.map(v=>({time:v.time,value:(v.value/base-1)*100}));}const seriesLine=chart.addLineSeries({color:last.value>=prev.value?'#d83b4b':'#2874d0',lineWidth:2,priceLineVisible:false,lastValueVisible:true,crosshairMarkerVisible:true,priceFormat:item.percentChart?{type:'custom',formatter:p=>`${p>0?'+':''}${p.toFixed(1)}%`,minMove:.1}:{type:'price',precision:item.decimals??2,minMove:item.unit==='yield'?.001:.01}});seriesLine.setData(points);chart.timeScale().fitContent();charts.set(item.id,{chart,container,series:seriesLine});const initialFrom=Math.max(vals[0].time,Math.floor(Date.now()/1000)-92*86400);try{chart.timeScale().setVisibleRange({from:initialFrom,to:last.time});}catch(e){}const foot=card.querySelector('.bar-count');foot.textContent=`${vals.length}봉 · ${dateString(vals[0].time)} ~ ${dateString(last.time)}`;}
async function refreshMarketCaps(){
  const symbols=[...new Set([...M7_TICKERS,...SEMICONDUCTOR_UNIVERSE.map(x=>x.ticker)])];
  const target=`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
  try{
    const response=await fetch(`${PROXY_BASE}/?url=${encodeURIComponent(target)}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Yahoo quote HTTP ${response.status}`);
    const json=await response.json();const quotes=json?.quoteResponse?.result||[];let updated=0;
    const byTicker=new Map(quotes.map(q=>[q.symbol,q]));
    quotes.forEach(quote=>{const cap=Number(quote.marketCap);if(Number.isFinite(cap)&&cap>0){const matches=all.filter(x=>x.ticker===quote.symbol);matches.forEach(item=>{item.marketCap=cap;updated++;});}});
    const previousSelection=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).map(x=>x.id).join(',');
    const ranked=[...SEMICONDUCTOR_UNIVERSE].sort((a,b)=>{
      const av=Number.isFinite(a.marketCap)&&a.marketCap>0?a.marketCap:null,bv=Number.isFinite(b.marketCap)&&b.marketCap>0?b.marketCap:null;
      if(av===null&&bv===null)return SEMICONDUCTOR_UNIVERSE.indexOf(a)-SEMICONDUCTOR_UNIVERSE.indexOf(b);
      if(av===null)return 1;if(bv===null)return -1;return bv-av;
    });
    const selected=new Set(ranked.slice(0,16).map(x=>x.id));
    SEMICONDUCTOR_UNIVERSE.forEach(item=>{item.summaryActive=selected.has(item.id);});
    const nextSelection=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).map(x=>x.id).join(',');
    makeSummary();
    if(previousSelection!==nextSelection||!groups[0].items.some(item=>item.semiconductorCandidate&&item.card)){
      charts.forEach(entry=>{try{entry.chart?.remove?.();}catch(e){}});charts.clear();makeCharts();
    }
    updateSummary();return updated;
  }catch(error){
    console.warn('시가총액 조회 실패:',error);
    // 첫 조회 실패 시에도 카드 영역은 비우지 않고 기존 우선순위의 16개를 표시합니다.
    const previousSelection=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).map(x=>x.id).join(',');
    if(!SEMICONDUCTOR_UNIVERSE.some(x=>x.summaryActive))SEMICONDUCTOR_UNIVERSE.slice(0,16).forEach(x=>x.summaryActive=true);
    const nextSelection=SEMICONDUCTOR_UNIVERSE.filter(x=>x.summaryActive).map(x=>x.id).join(',');
    makeSummary();
    if(previousSelection!==nextSelection||!groups[0].items.some(item=>item.semiconductorCandidate&&item.card)){
      charts.forEach(entry=>{try{entry.chart?.remove?.();}catch(e){}});charts.clear();makeCharts();
    }
    updateSummary();return 0;
  }
}
function updateSummary(){document.querySelectorAll('[data-summary-id]').forEach(cell=>{const item=all.find(x=>x.id===cell.dataset.summaryId);const price=cell.querySelector('.summary-price'),change=cell.querySelector('.summary-change');const colorIndex=!!item;if(item?.last==null){price.textContent=(item?.source==='nightFuturesEmbed'||item?.source==='tradingviewEmbed')?'차트 참조':blank;price.className=`summary-price${colorIndex?' neutral':''}`;change.textContent=(item?.source==='nightFuturesEmbed'||item?.source==='tradingviewEmbed')?'차트에서 시세 확인':'데이터 확인 필요';change.className='summary-change neutral';return;}price.textContent=closeText(item,item.last);price.className=`summary-price${colorIndex?' '+colorClass(item.delta):''}`;change.textContent=`${changeText(item,item.delta)} · ${pctText(item.pct)}`;change.className=`summary-change ${colorClass(item.delta)}`;if(item.unit==='stock'){const sessions=[['pre',item.preMarketPrice,item.preMarketDelta,item.preMarketPct],['regular',item.regularMarketPrice,item.regularMarketDelta,item.regularMarketPct],['post',item.afterMarketPrice,item.afterMarketDelta,item.afterMarketPct]];sessions.forEach(([key,p,d,pct])=>{const pEl=cell.querySelector(`.summary-${key}-price`),dEl=cell.querySelector(`.summary-${key}-delta`),pctEl=cell.querySelector(`.summary-${key}-pct`);if(!pEl||!dEl||!pctEl)return;const valid=Number.isFinite(p)&&p>0;pEl.textContent=valid?closeText(item,p):blank;pEl.className=`summary-session-value summary-${key}-price ${valid?colorClass(d):'neutral'}`;dEl.textContent=valid&&Number.isFinite(d)?changeText(item,d):blank;dEl.className=`summary-session-delta summary-${key}-delta ${valid?colorClass(d):'neutral'}`;pctEl.textContent=valid&&Number.isFinite(pct)?pctText(pct):blank;pctEl.className=`summary-session-pct summary-${key}-pct ${valid?colorClass(d):'neutral'}`;});}});}
async function refreshAll(){
  const button=$('refresh');
  button.disabled=true;
  $('status').textContent='시세 데이터 불러오는 중…';
  $('updated').textContent='업데이트 중';
  $('status').classList.remove('error-note');
  $('status').parentElement.querySelector('.live-dot').classList.remove('active');
  let success=0,fail=0;
  await refreshMarketCaps();
  const queue=all.filter(item=>!item.semiconductorCandidate||item.summaryActive);
  let cursor=0;
  async function worker(){
    while(cursor<queue.length){
      const item=queue[cursor++];
      try{
        const series=await fetchSeries(item);
        renderOne(item,series);
        success++;
      }catch(e){
        fail++;
        const c=$(`chart-${item.id}`);
        if(c)c.innerHTML=`<div class="chart-empty"><span>${item.name} 데이터를 불러오지 못했습니다.<br><small>${String(e.message||e).slice(0,90)}</small></span></div>`;
        if(item.card){
          if(item.source==='kredNightFutures'){
            item.card.querySelector('.quote-close').textContent=blank;
            item.card.querySelector('.quote-change').textContent='시세 연결 실패';
            item.card.querySelector('.quote-change').className='quote-change neutral';
            item.card.querySelector('.quote-date').textContent='KRED 응답 확인 필요';
          }else{
            item.card.querySelector('.quote-close').textContent=blank;
            item.card.querySelector('.quote-change').textContent='데이터 확인 필요';
            item.card.querySelector('.quote-change').className='quote-change neutral';
          }
        }
      }
      if((success+fail)%4===0)updateSummary();
    }
  }
  await Promise.all(Array.from({length:6},()=>worker()));
  updateSummary();
  $('updated').textContent=`${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 갱신`;
  $('status').textContent=fail?`정상 ${success}개 · 확인 필요 ${fail}개`:`${success}개 시세 연결 완료`;
  $('status').parentElement.querySelector('.live-dot').classList.toggle('active',success>0);
  if(fail)$('status').classList.add('error-note');
  button.disabled=false;
  resizeCharts();
}
function resizeCharts(){for(const {chart,container} of charts.values()){if(container.clientWidth>0)chart.applyOptions({width:container.clientWidth,height:container.clientHeight});}}
makeSummary();makeCharts();$('refresh').addEventListener('click',refreshAll);window.addEventListener('resize',()=>{clearTimeout(window.__chartResizeTimer);window.__chartResizeTimer=setTimeout(resizeCharts,120);});refreshAll();
