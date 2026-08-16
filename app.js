
window.App={
  league:"rpl",selected:null,engine:null,
  $:s=>document.querySelector(s),
  show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.toggle("active",x.id===id))},
  init(){
    this.renderPicker();document.querySelectorAll("[data-league]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-league]").forEach(x=>x.classList.toggle("active",x===b));this.league=b.dataset.league;this.renderPicker()});
    this.$("#startCareer").onclick=()=>{if(!this.selected)return;Career.new(this.selected);this.openCareer()};
    this.$("#continueCareer").onclick=()=>{if(Career.load())this.openCareer()};
    if(localStorage.getItem(Career.saveKey))this.$("#continueCareer").style.display="block";
    this.$("#back").onclick=()=>this.show("select");
    document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>this.renderCareer(b.dataset.tab));
    this.setupControls();
  },
  pickerClubs(){return this.league==="fnl2"?DB.clubs.filter(c=>c.league==="fnl2"):DB.clubs.filter(c=>c.league===this.league)},
  renderPicker(){
    const box=this.$("#clubGrid");box.innerHTML="";
    this.pickerClubs().forEach(c=>{let b=document.createElement("button");b.className="club";b.innerHTML=`<img><span>${c.name}</span><small>${c.group?c.group==="gold"?"Золото":"Серебро":""}</small>`;Logos.bind(b.querySelector("img"),c);b.onclick=()=>{this.selected=c;document.querySelectorAll(".club").forEach(x=>x.classList.remove("sel"));b.classList.add("sel");this.$("#selectedName").textContent=c.name;Logos.bind(this.$("#selectedLogo"),c);this.$("#startCareer").disabled=false};box.appendChild(b)})
  },
  openCareer(){const c=Career.club();this.$("#careerName").textContent=c.name;this.$("#careerLeague").textContent=DB.leagues[Career.state.league].name+(Career.state.group?` • ${Career.state.group==="gold"?"Золото":"Серебро"}`:"");Logos.bind(this.$("#careerLogo"),c);this.show("career");this.renderCareer("overview")},
  renderCareer(tab){
    document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===tab));const s=Career.state,c=Career.club(),co=this.$("#content");
    if(tab==="overview"){const f=Career.nextFixture(),opp=f?DB.clubs.find(x=>x.id===(f.home===c.id?f.away:f.home)):null;co.innerHTML=`<h2>Обзор</h2><div class="stats"><div>Тур<b>${s.round}</b></div><div>Мораль<b>${s.morale}%</b></div><div>Доверие<b>${s.confidence}%</b></div><div>Место<b>${Career.sorted().findIndex(x=>x.id===c.id)+1}</b></div></div><div class="card"><h3>Следующий матч</h3>${f?`<p>${DB.clubs.find(x=>x.id===f.home).name} — ${DB.clubs.find(x=>x.id===f.away).name}</p><button id="play" class="primary">СЫГРАТЬ</button>`:"<p>Этап завершён.</p>"}</div><div class="card"><b>ИИ матча</b><p>FC 26 / FC IQ-inspired: поддержка владельца мяча, забегания в свободные зоны, роли, компактная оборона и отдельное позиционирование вратаря.</p></div>`;this.$("#play")?.addEventListener("click",()=>this.playFixture(f))}
    else if(tab==="table"){co.innerHTML=`<h2>Таблица</h2><table><tr><th>#</th><th>Клуб</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>М</th><th>О</th></tr>${Career.sorted().map((r,i)=>`<tr><td>${i+1}</td><td>${DB.clubs.find(c=>c.id===r.id)?.name||r.id}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td><b>${r.pts}</b></td></tr>`).join("")}</table>`}
    else if(tab==="calendar"){co.innerHTML=`<h2>Календарь</h2>${s.fixtures.map(f=>`<div class="fixture"><span>${f.round}</span><span>${DB.clubs.find(c=>c.id===f.home).name} — ${DB.clubs.find(c=>c.id===f.away).name}</span><b>${f.played?f.score:"—"}</b></div>`).join("")}`}
    else if(tab==="rules"){co.innerHTML=`<h2>Повышение и вылет</h2><div class="card"><b>РПЛ</b><p>15–16 — прямой вылет. 13–14 — двухматчевые стыки.</p></div><div class="card"><b>Первая лига</b><p>1–2 — прямой выход в РПЛ. 3–4 — стыковые матчи. Три последних места — вылет.</p></div><div class="card"><b>Вторая лига А</b><p>Два этапа, «Золото» и «Серебро». В игровом сезоне группа сохраняется отдельно.</p></div>`}
  },
  playFixture(f){const h=DB.clubs.find(c=>c.id===f.home),a=DB.clubs.find(c=>c.id===f.away),userSide=f.home===Career.state.clubId?0:1;this.currentFixture=f;this.$("#hName").textContent=h.abbr;this.$("#aName").textContent=a.abbr;Logos.bind(this.$("#hLogo"),h);Logos.bind(this.$("#aLogo"),a);this.show("game");this.engine=new MatchEngine(this.$("#pitch"),sc=>this.finishMatch(sc));this.engine.start(h,a,userSide)},
  finishMatch(sc){this.$("#result").style.display="flex";this.$("#resultText").textContent=`${this.engine.home.name} ${sc[0]} : ${sc[1]} ${this.engine.away.name}`;Career.applyFixture(this.currentFixture,sc[0],sc[1])},
  updateHUD(e){
    this.$("#score").textContent=`${e.score[0]} : ${e.score[1]}`;
    let m=Math.min(90,Math.floor(e.elapsed/e.duration*90)),s=Math.floor((e.elapsed/e.duration*90-m)*60);
    this.$("#clock").textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
    this.$("#shoot").textContent=e.ball.owner===e.controlled?"УДАР":"ОТБОР";
    const p=e.players[e.controlled],g=e.players.find(x=>x.team===e.userSide&&x.role==="GK");
    if(p){
      this.$("#playerInfo").innerHTML=`<b>${p.name}</b><span>№ ${p.num}</span><small>Выносливость ${Math.round(p.stamina*100)}%</small><div class="stBar"><i style="width:${Math.round(p.stamina*100)}%"></i></div>`;
    }
    if(g){
      this.$("#gkInfo").innerHTML=`<b>${g.name}</b><span>№ ${g.num}</span><small>Вратарь • ${Math.round(g.stamina*100)}%</small><div class="stBar"><i style="width:${Math.round(g.stamina*100)}%"></i></div>`;
    }
  },
  setupControls(){
    const c=this.$("#pitch"),joy=this.$("#joy"),kn=this.$("#knob");let pid=null,cx=0,cy=0;
    c.onpointerdown=e=>{if(e.clientX>innerWidth*.53)return;pid=e.pointerId;cx=e.clientX;cy=e.clientY;joy.style.display="block";joy.style.left=e.clientX-59+"px";joy.style.top=e.clientY-59+"px";c.setPointerCapture?.(e.pointerId)};
    c.onpointermove=e=>{if(e.pointerId!==pid||!this.engine)return;let dx=e.clientX-cx,dy=e.clientY-cy,l=Math.hypot(dx,dy),m=41;if(l>m){dx*=m/l;dy*=m/l}this.engine.joy.x=dx/m;this.engine.joy.y=dy/m;kn.style.transform=`translate(${dx}px,${dy}px)`};
    const end=e=>{if(e.pointerId!==pid)return;pid=null;if(this.engine){this.engine.joy.x=0;this.engine.joy.y=0}joy.style.display="none";kn.style.transform=""};c.onpointerup=end;c.onpointercancel=end;
    this.$("#pass").onpointerdown=()=>this.engine?.startPassCharge();
    this.$("#pass").onpointerup=()=>this.engine?.releasePass(false);
    this.$("#pass").onpointercancel=()=>this.engine?.releasePass(false);
    this.$("#through").onpointerdown=()=>this.engine?.startPassCharge();
    this.$("#through").onpointerup=()=>this.engine?.releasePass(true);
    this.$("#through").onpointercancel=()=>this.engine?.releasePass(true);
    this.$("#shoot").onpointerdown=()=>{if(!this.engine)return;if(this.engine.ball.owner===this.engine.controlled)this.engine.startShotCharge();else this.engine.tackle()};
    this.$("#shoot").onpointerup=()=>this.engine?.releaseShot();
    this.$("#shoot").onpointercancel=()=>this.engine?.releaseShot();
    this.$("#switch").onpointerdown=()=>this.engine?.switch();this.$("#sprint").onpointerdown=()=>{if(this.engine)this.engine.sprint=true};["pointerup","pointerleave","pointercancel"].forEach(x=>this.$("#sprint").addEventListener(x,()=>{if(this.engine)this.engine.sprint=false}));
    this.$("#pause").onclick=()=>{if(!this.engine)return;this.engine.paused=true;this.$("#pauseOverlay").style.display="flex"};this.$("#resume").onclick=()=>{this.$("#pauseOverlay").style.display="none";this.engine.paused=false;this.engine.last=performance.now();requestAnimationFrame(t=>this.engine.loop(t))};
    this.$("#continue").onclick=()=>{this.$("#result").style.display="none";this.openCareer()}
  }
};
addEventListener("DOMContentLoaded",()=>App.init());
