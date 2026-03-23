/**
 * Dashboard UI — renders a complete HTML page as a string literal.
 * All CSS, JS, and SVG assets are embedded inline (C6: zero runtime deps).
 * Consumed by server.ts GET / route via renderDashboard().
 */

export interface DashboardStatus {
  executionPlan: ExecutionPlanData | null;
  managerLog: ManagerLogEntry[];
  costLog: CostLogEntry[];
  checkpoint: CheckpointData | null;
  shutdownAt?: number;
}

export interface ExecutionPlanData {
  stories: StoryData[];
}

export interface StoryData {
  id: string;
  title?: string;
  status?: string;
  tokensUsed?: number;
  tokenBudget?: number;
  durationMs?: number;
  wave?: number;
}

export interface ManagerLogEntry {
  action: string;
  timestamp?: number;
  storyId?: string;
  [key: string]: unknown;
}

export interface CostLogEntry {
  totalCost?: number;
  inputTokens?: number;
  outputTokens?: number;
  [key: string]: unknown;
}

export interface CheckpointData {
  storyId?: string;
  message?: string;
  [key: string]: unknown;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFlowDiagram(stages: string[]): string {
  if (stages.length === 0) return "";
  const nodeW = 100;
  const nodeH = 36;
  const gap = 40;
  const totalW = stages.length * nodeW + (stages.length - 1) * gap + 20;
  const svgH = 60;
  let nodes = "";
  for (let i = 0; i < stages.length; i++) {
    const x = 10 + i * (nodeW + gap);
    const y = 12;
    nodes += `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="6" fill="#1a1a2e" stroke="#6366f1" stroke-width="1.5"/>`;
    nodes += `<text x="${x + nodeW / 2}" y="${y + nodeH / 2 + 5}" text-anchor="middle" fill="#e0e0e0" font-size="11">${escapeHtml(stages[i])}</text>`;
    if (i < stages.length - 1) {
      const lineX1 = x + nodeW;
      const lineX2 = lineX1 + gap;
      const lineY = y + nodeH / 2;
      nodes += `<line x1="${lineX1}" y1="${lineY}" x2="${lineX2}" y2="${lineY}" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="6 3"><animate attributeName="stroke-dashoffset" from="9" to="0" dur="1s" repeatCount="indefinite"/></line>`;
    }
  }
  return `<svg viewBox="0 0 ${totalW} ${svgH}" width="100%" height="${svgH}" xmlns="http://www.w3.org/2000/svg">${nodes}</svg>`;
}

function renderStatusHalo(status: string): string {
  const colorMap: Record<string, string> = {
    running: "#22d3ee",
    passed: "#4ade80",
    failed: "#f87171",
    pending: "#94a3b8",
    blocked: "#facc15",
  };
  const color = colorMap[status?.toLowerCase()] ?? "#94a3b8";
  const pulse = status?.toLowerCase() === "running"
    ? `<animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/>`
    : "";
  return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="${color}" stroke="${color}" stroke-width="1">${pulse}</circle></svg>`;
}

function renderProgressBar(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `<div style="width:100%;height:8px;background:#1e293b;border-radius:4px;overflow:hidden"><div style="width:${clamped}%;height:100%;background:linear-gradient(90deg,#6366f1,#22d3ee);border-radius:4px"></div></div>`;
}

function renderSparkChart(values: number[]): string {
  if (values.length === 0) return "";
  const maxVal = Math.max(...values, 1);
  const barW = 6;
  const gap = 2;
  const h = 30;
  const w = values.length * (barW + gap);
  let rects = "";
  for (let i = 0; i < values.length; i++) {
    const barH = Math.max(1, (values[i] / maxVal) * h);
    const x = i * (barW + gap);
    const y = h - barH;
    rects += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#6366f1" rx="1"/>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

function renderRadialGauge(used: number, budget: number): string {
  const pct = budget > 0 ? Math.min(1, used / budget) : 0;
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dashLen = pct * circ;
  const color = pct > 0.9 ? "#f87171" : pct > 0.7 ? "#facc15" : "#4ade80";
  return `<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#1e293b" stroke-width="8"/>` +
    `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${dashLen} ${circ - dashLen}" stroke-linecap="round" transform="rotate(-90 50 50)"/>` +
    `<text x="50" y="54" text-anchor="middle" fill="#e0e0e0" font-size="14">${Math.round(pct * 100)}%</text>` +
    `</svg>`;
}

function renderDurationBars(stories: StoryData[]): string {
  const withDur = stories.filter((s) => (s.durationMs ?? 0) > 0);
  if (withDur.length === 0) return "";
  const maxDur = Math.max(...withDur.map((s) => s.durationMs!));
  let bars = "";
  for (const s of withDur) {
    const pct = Math.round((s.durationMs! / maxDur) * 100);
    bars += `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">` +
      `<span style="width:60px;font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="story-label" data-story-id="${escapeHtml(s.id)}">${escapeHtml(s.id)}</span>` +
      `<div style="flex:1;height:6px;background:#1e293b;border-radius:3px"><div style="width:${pct}%;height:100%;background:#818cf8;border-radius:3px"></div></div>` +
      `<span style="font-size:11px;color:#94a3b8">${(s.durationMs! / 1000).toFixed(1)}s</span></div>`;
  }
  return bars;
}

function extractStages(managerLog: ManagerLogEntry[]): string[] {
  const seen = new Set<string>();
  const stages: string[] = [];
  for (const entry of managerLog) {
    if (entry.action && !seen.has(entry.action)) {
      seen.add(entry.action);
      stages.push(entry.action);
    }
  }
  return stages;
}

function renderCostDisplay(costLog: CostLogEntry[], costError?: boolean): string {
  if (costError) {
    return `<span style="color:#facc15">[!] Unable to read cost data</span>`;
  }
  if (costLog.length === 0) {
    return `<span style="color:#94a3b8">-- awaiting data --</span>`;
  }
  const total = costLog.reduce((sum, e) => sum + (e.totalCost ?? 0), 0);
  return `<span style="color:#4ade80">$${total.toFixed(4)}</span>`;
}

function renderCheckpointSection(checkpoint: CheckpointData | null): string {
  if (!checkpoint) return "";
  return `<div id="checkpoint-section" style="background:#1e293b;border:1px solid #facc15;border-radius:8px;padding:12px;margin:12px 0">` +
    `<div style="color:#facc15;font-weight:600;margin-bottom:4px">Checkpoint Active</div>` +
    `<div class="checkpoint-message" style="color:#e0e0e0;font-size:13px"></div>` +
    `</div>`;
}

export function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Hive Mind Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f1a;color:#e0e0e0;min-height:100vh;padding:16px}
h1{font-size:20px;color:#a5b4fc;margin-bottom:12px}
.container{max-width:1100px;margin:0 auto}
.section{background:#1a1a2e;border-radius:8px;padding:14px;margin-bottom:12px}
.section-title{font-size:13px;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
.story-card{background:#12121f;border-radius:6px;padding:10px;margin-bottom:6px;cursor:pointer;transition:background 0.15s}
.story-card:hover{background:#1e1e35}
.story-header{display:flex;align-items:center;gap:8px}
.story-title{font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.story-status{font-size:11px;padding:2px 8px;border-radius:10px;background:#1e293b;color:#94a3b8}
.log-panel{display:none;margin-top:8px;background:#0a0a15;border-radius:4px;padding:8px;max-height:400px;overflow-y:auto}
.log-panel pre{font-size:11px;color:#94a3b8;white-space:pre-wrap;word-break:break-all}
.show-more-btn{background:#6366f1;color:#fff;border:none;padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:4px}
.show-more-btn:hover{background:#818cf8}
.shutdown-banner{background:#7c3aed;color:#fff;padding:10px;border-radius:8px;text-align:center;margin-bottom:12px;font-weight:600}
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.metric-card{background:#12121f;border-radius:6px;padding:12px;text-align:center}
.metric-value{font-size:22px;font-weight:700;color:#a5b4fc}
.metric-label{font-size:11px;color:#6b7280;margin-top:2px}
.placeholder-card{height:60px;background:#12121f;border-radius:6px}
.error-msg{color:#f87171;font-size:12px;text-align:center;padding:8px}
</style>
</head>
<body>
<div class="container">
<div id="shutdown-banner"></div>
<h1>Hive Mind Pipeline Dashboard</h1>
<div id="error-display"></div>
<div id="flow-section" class="section"><div class="section-title">Pipeline Flow</div><div id="flow-diagram"></div></div>
<div id="metrics-section" class="section"><div class="section-title">Metrics</div><div id="metrics" class="metrics-grid"></div></div>
<div id="checkpoint-area"></div>
<div class="section"><div class="section-title">Duration Comparison</div><div id="duration-bars"></div></div>
<div class="section"><div class="section-title">Stories</div><div id="story-list"></div></div>
</div>
<script>
(function(){
  var observer = null;

  function escTxt(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function updateDashboard(data){
    renderFlow(data.managerLog || []);
    renderMetrics(data);
    renderCheckpoint(data.checkpoint);
    renderDurations(data.executionPlan);
    renderStories(data.executionPlan);
    renderShutdown(data.shutdownAt);
  }

  function renderFlow(log){
    var seen = {};
    var stages = [];
    for(var i=0;i<log.length;i++){
      var a = log[i].action;
      if(a && !seen[a]){ seen[a]=true; stages.push(a); }
    }
    var el = document.getElementById("flow-diagram");
    if(!el) return;
    if(stages.length===0){ el.textContent="-- awaiting data --"; return; }
    var nodeW=100,nodeH=36,gap=40,totalW=stages.length*nodeW+(stages.length-1)*gap+20,svgH=60;
    var svgNS='http://www.w3.org/2000/svg';
    var svgEl=document.createElementNS(svgNS,'svg');
    svgEl.setAttribute('viewBox','0 0 '+totalW+' '+svgH);
    svgEl.setAttribute('width','100%');
    svgEl.setAttribute('height',String(svgH));
    for(var i=0;i<stages.length;i++){
      var x=10+i*(nodeW+gap),y=12;
      var rect=document.createElementNS(svgNS,'rect');
      rect.setAttribute('x',String(x));rect.setAttribute('y',String(y));
      rect.setAttribute('width',String(nodeW));rect.setAttribute('height',String(nodeH));
      rect.setAttribute('rx','6');rect.setAttribute('fill','#1a1a2e');
      rect.setAttribute('stroke','#6366f1');rect.setAttribute('stroke-width','1.5');
      svgEl.appendChild(rect);
      var txt=document.createElementNS(svgNS,'text');
      txt.setAttribute('x',String(x+nodeW/2));txt.setAttribute('y',String(y+nodeH/2+5));
      txt.setAttribute('text-anchor','middle');txt.setAttribute('fill','#e0e0e0');
      txt.setAttribute('font-size','11');
      txt.textContent=stages[i];
      svgEl.appendChild(txt);
      if(i<stages.length-1){
        var lx1=x+nodeW,lx2=lx1+gap,ly=y+nodeH/2;
        var lineEl=document.createElementNS(svgNS,'line');
        lineEl.setAttribute('x1',String(lx1));lineEl.setAttribute('y1',String(ly));
        lineEl.setAttribute('x2',String(lx2));lineEl.setAttribute('y2',String(ly));
        lineEl.setAttribute('stroke','#6366f1');lineEl.setAttribute('stroke-width','1.5');
        lineEl.setAttribute('stroke-dasharray','6 3');
        var anim=document.createElementNS(svgNS,'animate');
        anim.setAttribute('attributeName','stroke-dashoffset');
        anim.setAttribute('from','9');anim.setAttribute('to','0');
        anim.setAttribute('dur','1s');anim.setAttribute('repeatCount','indefinite');
        lineEl.appendChild(anim);
        svgEl.appendChild(lineEl);
      }
    }
    while(el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(svgEl);
  }

  function renderMetrics(data){
    var el = document.getElementById("metrics");
    if(!el) return;
    var stories = (data.executionPlan && data.executionPlan.stories) || [];
    var totalStories = stories.length;
    var passed = stories.filter(function(s){return s.status==="passed"}).length;
    var running = stories.filter(function(s){return s.status==="running"}).length;
    var totalTokens = 0;
    var totalBudget = 0;
    for(var i=0;i<stories.length;i++){
      totalTokens += stories[i].tokensUsed||0;
      totalBudget += stories[i].tokenBudget||0;
    }
    function mkCard(valueNode,labelText){
      var card=document.createElement('div');card.className='metric-card';
      var vd=document.createElement('div');vd.className='metric-value';
      vd.appendChild(valueNode);card.appendChild(vd);
      var ld=document.createElement('div');ld.className='metric-label';
      ld.textContent=labelText;card.appendChild(ld);
      return card;
    }
    while(el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(mkCard(document.createTextNode(passed+'/'+totalStories),'Stories Passed'));
    el.appendChild(mkCard(document.createTextNode(String(running)),'Running'));
    var costEl;
    if(data.costError){
      costEl=document.createElement('span');costEl.style.color='#facc15';
      costEl.textContent='[!] Unable to read cost data';
    } else if(!data.costLog || data.costLog.length===0){
      costEl=document.createElement('span');costEl.style.color='#94a3b8';
      costEl.textContent='-- awaiting data --';
    } else {
      var total=0;
      for(var i=0;i<data.costLog.length;i++) total+=(data.costLog[i].totalCost||0);
      costEl=document.createTextNode('$'+total.toFixed(4));
    }
    el.appendChild(mkCard(costEl,'Total Cost'));
    var budgetCard=document.createElement('div');budgetCard.className='metric-card';
    var budgetVal=document.createElement('div');budgetVal.className='metric-value';
    if(totalBudget>0){
      var usedPct=Math.min(1,totalTokens/totalBudget);
      var r=40,circ=2*Math.PI*r,dashLen=usedPct*circ;
      var gc=usedPct>0.9?"#f87171":usedPct>0.7?"#facc15":"#4ade80";
      var mSvgNS='http://www.w3.org/2000/svg';
      var gSvg=document.createElementNS(mSvgNS,'svg');
      gSvg.setAttribute('viewBox','0 0 100 100');gSvg.setAttribute('width','80');gSvg.setAttribute('height','80');
      var gCirc1=document.createElementNS(mSvgNS,'circle');
      gCirc1.setAttribute('cx','50');gCirc1.setAttribute('cy','50');gCirc1.setAttribute('r',String(r));
      gCirc1.setAttribute('fill','none');gCirc1.setAttribute('stroke','#1e293b');gCirc1.setAttribute('stroke-width','8');
      gSvg.appendChild(gCirc1);
      var gCirc2=document.createElementNS(mSvgNS,'circle');
      gCirc2.setAttribute('cx','50');gCirc2.setAttribute('cy','50');gCirc2.setAttribute('r',String(r));
      gCirc2.setAttribute('fill','none');gCirc2.setAttribute('stroke',gc);gCirc2.setAttribute('stroke-width','8');
      gCirc2.setAttribute('stroke-dasharray',dashLen+' '+(circ-dashLen));
      gCirc2.setAttribute('stroke-linecap','round');gCirc2.setAttribute('transform','rotate(-90 50 50)');
      gSvg.appendChild(gCirc2);
      var gTxt=document.createElementNS(mSvgNS,'text');
      gTxt.setAttribute('x','50');gTxt.setAttribute('y','54');
      gTxt.setAttribute('text-anchor','middle');gTxt.setAttribute('fill','#e0e0e0');gTxt.setAttribute('font-size','14');
      gTxt.textContent=Math.round(usedPct*100)+'%';
      gSvg.appendChild(gTxt);
      budgetVal.appendChild(gSvg);
    } else {
      var noData=document.createElement('div');noData.className='metric-value';
      noData.style.cssText='font-size:14px;color:#94a3b8';
      noData.textContent='-- not yet available --';
      budgetVal.appendChild(noData);
    }
    budgetCard.appendChild(budgetVal);
    var budgetLbl=document.createElement('div');budgetLbl.className='metric-label';
    budgetLbl.textContent='Token Budget';
    budgetCard.appendChild(budgetLbl);
    el.appendChild(budgetCard);
  }

  function renderCheckpoint(cp){
    var area = document.getElementById("checkpoint-area");
    if(!area) return;
    if(!cp){ area.innerHTML=""; return; }
    var div=document.createElement("div");
    div.style.cssText="background:#1e293b;border:1px solid #facc15;border-radius:8px;padding:12px;margin:0 0 12px";
    var title=document.createElement("div");
    title.style.cssText="color:#facc15;font-weight:600;margin-bottom:4px";
    title.textContent="Checkpoint Active";
    div.appendChild(title);
    if(cp.storyId){
      var sid=document.createElement("div");
      sid.style.cssText="font-size:12px;color:#94a3b8";
      sid.textContent="Story: "+cp.storyId;
      div.appendChild(sid);
    }
    if(cp.message){
      var msg=document.createElement("div");
      msg.style.cssText="font-size:13px;color:#e0e0e0;margin-top:4px";
      msg.textContent=cp.message;
      div.appendChild(msg);
    }
    area.innerHTML="";
    area.appendChild(div);
  }

  function renderDurations(plan){
    var el=document.getElementById("duration-bars");
    if(!el) return;
    if(!plan || !plan.stories){ el.textContent="-- awaiting data --"; return; }
    var withDur=plan.stories.filter(function(s){return s.durationMs>0});
    if(withDur.length===0){ el.textContent="-- not yet available --"; return; }
    var maxDur=0;
    for(var i=0;i<withDur.length;i++) if(withDur[i].durationMs>maxDur) maxDur=withDur[i].durationMs;
    while(el.firstChild) el.removeChild(el.firstChild);
    for(var i=0;i<withDur.length;i++){
      var s=withDur[i],pct=Math.round(s.durationMs/maxDur*100);
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;margin:2px 0';
      var label=document.createElement('span');
      label.style.cssText='width:60px;font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      label.textContent=s.id;
      row.appendChild(label);
      var barOuter=document.createElement('div');
      barOuter.style.cssText='flex:1;height:6px;background:#1e293b;border-radius:3px';
      var barInner=document.createElement('div');
      barInner.style.cssText='width:'+pct+'%;height:100%;background:#818cf8;border-radius:3px';
      barOuter.appendChild(barInner);
      row.appendChild(barOuter);
      var durSpan=document.createElement('span');
      durSpan.style.cssText='font-size:11px;color:#94a3b8';
      durSpan.textContent=(s.durationMs/1000).toFixed(1)+'s';
      row.appendChild(durSpan);
      el.appendChild(row);
    }
  }

  function renderStories(plan){
    var el=document.getElementById("story-list");
    if(!el) return;
    if(!plan || !plan.stories || plan.stories.length===0){
      el.textContent="-- awaiting data --";
      return;
    }
    var stories=plan.stories;
    var frag=document.createDocumentFragment();
    for(var i=0;i<stories.length;i++){
      (function(s,idx){
        var card=document.createElement("div");
        card.className="story-card";
        card.setAttribute("data-story-index",String(idx));
        var isOffscreen = idx >= 15;
        if(isOffscreen){
          card.classList.add("placeholder-card");
          card.setAttribute("data-placeholder","true");
          frag.appendChild(card);
          return;
        }
        renderStoryContent(card,s);
      })(stories[i],i);
      frag.appendChild(frag.lastChild || document.createDocumentFragment());
    }
    el.innerHTML="";
    el.appendChild(frag);

    if(observer) observer.disconnect();
    if(typeof IntersectionObserver!=="undefined"){
      observer=new IntersectionObserver(function(entries){
        for(var j=0;j<entries.length;j++){
          var entry=entries[j];
          if(entry.isIntersecting && entry.target.getAttribute("data-placeholder")==="true"){
            var idx=parseInt(entry.target.getAttribute("data-story-index")||"0",10);
            if(plan.stories[idx]){
              entry.target.removeAttribute("data-placeholder");
              entry.target.classList.remove("placeholder-card");
              renderStoryContent(entry.target,plan.stories[idx]);
              observer.unobserve(entry.target);
            }
          }
        }
      },{rootMargin:"200px"});
      var placeholders=el.querySelectorAll("[data-placeholder]");
      for(var p=0;p<placeholders.length;p++) observer.observe(placeholders[p]);
    }
  }

  function renderStoryContent(card,s){
    card.innerHTML="";
    var header=document.createElement("div");
    header.className="story-header";

    var haloSpan=document.createElement("span");
    var st=s.status||"pending";
    var colors={running:"#22d3ee",passed:"#4ade80",failed:"#f87171",pending:"#94a3b8",blocked:"#facc15"};
    var c=colors[st.toLowerCase()]||"#94a3b8";
    var hSvgNS='http://www.w3.org/2000/svg';
    var hSvg=document.createElementNS(hSvgNS,'svg');
    hSvg.setAttribute('width','14');hSvg.setAttribute('height','14');hSvg.setAttribute('viewBox','0 0 14 14');
    var hCircle=document.createElementNS(hSvgNS,'circle');
    hCircle.setAttribute('cx','7');hCircle.setAttribute('cy','7');hCircle.setAttribute('r','6');
    hCircle.setAttribute('fill',c);hCircle.setAttribute('stroke',c);hCircle.setAttribute('stroke-width','1');
    if(st.toLowerCase()==="running"){
      var hAnim=document.createElementNS(hSvgNS,'animate');
      hAnim.setAttribute('attributeName','opacity');hAnim.setAttribute('values','1;0.4;1');
      hAnim.setAttribute('dur','2s');hAnim.setAttribute('repeatCount','indefinite');
      hCircle.appendChild(hAnim);
    }
    hSvg.appendChild(hCircle);
    haloSpan.appendChild(hSvg);
    header.appendChild(haloSpan);

    var titleEl=document.createElement("span");
    titleEl.className="story-title";
    titleEl.textContent=s.id+(s.title?" - "+s.title:"");
    header.appendChild(titleEl);

    var statusEl=document.createElement("span");
    statusEl.className="story-status";
    statusEl.textContent=st;
    header.appendChild(statusEl);

    card.appendChild(header);

    var pct=0;
    if(st.toLowerCase()==="passed") pct=100;
    else if(st.toLowerCase()==="running") pct=50;
    else if(st.toLowerCase()==="failed") pct=75;
    var barDiv=document.createElement("div");
    barDiv.style.cssText="margin-top:6px";
    barDiv.innerHTML='<div style="width:100%;height:8px;background:#1e293b;border-radius:4px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:linear-gradient(90deg,#6366f1,#22d3ee);border-radius:4px"></div></div>';
    card.appendChild(barDiv);

    if(s.tokensUsed!=null){
      var tokens=[];
      var tv=s.tokensUsed;
      if(tv>0) tokens.push(tv);
      if(tokens.length>0){
        var sparkDiv=document.createElement("div");
        sparkDiv.style.cssText="margin-top:4px";
        var maxV=Math.max.apply(null,tokens.concat([1]));
        var spSvgNS='http://www.w3.org/2000/svg';
        var spSvg=document.createElementNS(spSvgNS,'svg');
        spSvg.setAttribute('viewBox','0 0 '+(tokens.length*8)+' 30');
        spSvg.setAttribute('width',String(tokens.length*8));
        spSvg.setAttribute('height','30');
        for(var t=0;t<tokens.length;t++){
          var bh=Math.max(1,tokens[t]/maxV*30);
          var spRect=document.createElementNS(spSvgNS,'rect');
          spRect.setAttribute('x',String(t*8));spRect.setAttribute('y',String(30-bh));
          spRect.setAttribute('width','6');spRect.setAttribute('height',String(bh));
          spRect.setAttribute('fill','#6366f1');spRect.setAttribute('rx','1');
          spSvg.appendChild(spRect);
        }
        sparkDiv.appendChild(spSvg);
        card.appendChild(sparkDiv);
      }
    }

    card.addEventListener("click",function(){
      var logPanel=card.querySelector(".log-panel");
      if(logPanel){
        var shown=logPanel.style.display!=="none";
        logPanel.style.display=shown?"none":"block";
        return;
      }
      var panel=document.createElement("div");
      panel.className="log-panel";
      panel.style.display="block";
      var pre=document.createElement("pre");
      pre.textContent="Loading logs...";
      panel.appendChild(pre);
      card.appendChild(panel);
      fetchLogs(s.id,0,panel,pre);
    });
  }

  function fetchLogs(storyId,offset,panel,pre){
    fetch("/api/story/"+encodeURIComponent(storyId)+"/logs?offset="+offset)
      .then(function(r){return r.json()})
      .then(function(data){
        if(!data.lines || data.lines.length===0){
          if(offset===0) pre.textContent="No logs available";
          return;
        }
        if(offset===0) pre.textContent="";
        for(var i=0;i<data.lines.length;i++){
          var lineNode=document.createTextNode(data.lines[i]+"\n");
          pre.appendChild(lineNode);
        }
        var existingBtn=panel.querySelector(".show-more-btn");
        if(existingBtn) existingBtn.remove();
        if(data.nextOffset!==null){
          var btn=document.createElement("button");
          btn.className="show-more-btn";
          btn.textContent="Show more";
          btn.addEventListener("click",function(e){
            e.stopPropagation();
            fetchLogs(storyId,data.nextOffset,panel,pre);
          });
          panel.appendChild(btn);
        }
      })
      .catch(function(){
        pre.textContent="[!] Unable to load logs";
      });
  }

  function renderShutdown(shutdownAt){
    var el=document.getElementById("shutdown-banner");
    if(!el) return;
    if(shutdownAt==null){ el.innerHTML=""; el.style.display="none"; return; }
    el.style.display="block";
    el.className="shutdown-banner";
    function tick(){
      var remaining=Math.max(0,Math.ceil((shutdownAt-Date.now())/1000));
      el.textContent="Pipeline complete. Dashboard shutting down in "+remaining+"s.";
    }
    tick();
    setInterval(tick,1000);
  }

  function poll(){
    fetch("/api/status")
      .then(function(r){
        if(!r.ok) throw new Error("HTTP "+r.status);
        return r.json();
      })
      .then(function(data){ updateDashboard(data); })
      .catch(function(){
        var errEl=document.getElementById("error-display");
        if(errEl) errEl.innerHTML='<div class="error-msg">[!] Unable to reach dashboard server</div>';
      });
  }

  poll();
  setInterval(poll, 2000);
})();
</script>
</body>
</html>`;
}

export {
  escapeHtml,
  renderFlowDiagram,
  renderStatusHalo,
  renderProgressBar,
  renderSparkChart,
  renderRadialGauge,
  renderDurationBars,
  renderCostDisplay,
  renderCheckpointSection,
  extractStages,
};
