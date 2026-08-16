
window.SafariViewport = {
  apply(){
    const vv=window.visualViewport;
    const h=Math.max(240, Math.round(vv ? vv.height : window.innerHeight));
    document.documentElement.style.setProperty("--app-h", h+"px");

    // Scale UI slightly if Safari chrome leaves less than the usual landscape height.
    const scale=Math.max(.84,Math.min(1,h/402));
    document.documentElement.style.setProperty("--ui-scale", String(scale));

    if(window.App?.engine){
      window.App.engine.resize();
    }
  },
  init(){
    this.apply();
    window.addEventListener("resize",()=>this.apply(),{passive:true});
    window.addEventListener("orientationchange",()=>{
      setTimeout(()=>this.apply(),80);
      setTimeout(()=>this.apply(),350);
    },{passive:true});
    if(window.visualViewport){
      visualViewport.addEventListener("resize",()=>this.apply(),{passive:true});
      visualViewport.addEventListener("scroll",()=>this.apply(),{passive:true});
    }
  }
};


window.App={
  league:"rpl",selected:null,engine:null,
  $:s=>document.querySelector(s),
  show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.toggle("active",x.id===id))},
  init(){
    this.renderPicker();document.querySelectorAll("[data-league]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-league]").forEach(x=>x.classList.toggle("active",x===b));this.league=b.dataset.league;this.renderPicker()});
    this.$("#startCareer").onclick=()=>{if(!this.selected)return;Career.new(this.selected);this.openCareer()};
    this.$("#continueCareer").onclick=()=>{if(Career.load())this.openCareer()};
    if(localStorage.getItem(Career.saveKey))this.$("#continueCareer").style.display="block";
    this.$("#saveCareerBtn")?.addEventListener("click",()=>{Career.save();alert("Карьера сохранена")});
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
    let minute=e.displayMinute();
    let sec=0;
    if(e.halfElapsed<=e.realHalfDuration){
      const base=e.half===1?0:45;
      const exact=e.halfElapsed/e.realHalfDuration*45;
      minute=Math.floor(base+exact);sec=Math.floor((exact-Math.floor(exact))*60);
    }
    this.$("#clock").textContent=String(minute).padStart(2,"0")+":"+String(sec).padStart(2,"0")+(e.addedMinutes&&e.halfElapsed>=e.realHalfDuration?` +${e.addedMinutes}`:"");
    this.$("#shoot").textContent=e.ball.owner===e.controlled?"УДАР":"ОТБОР";

    const p=e.players[e.controlled];
    const enemyOwner=(e.ball.owner!==null&&e.players[e.ball.owner]?.team!==e.userSide)?e.players[e.ball.owner]:null;
    if(p){
      this.$("#playerInfo").innerHTML=`<b>${p.name}</b><span>№ ${p.num}</span><small>Выносливость ${Math.round(p.stamina*100)}%</small><div class="stBar"><i style="width:${Math.round(p.stamina*100)}%"></i></div>`;
    }
    if(enemyOwner){
      this.$("#gkInfo").style.opacity="1";
      this.$("#gkInfo").innerHTML=`<b>${enemyOwner.name}</b><span>№ ${enemyOwner.num}</span><small>Соперник с мячом • ${Math.round(enemyOwner.stamina*100)}%</small><div class="stBar"><i style="width:${Math.round(enemyOwner.stamina*100)}%"></i></div>`;
    }else{
      this.$("#gkInfo").style.opacity=".35";
      this.$("#gkInfo").innerHTML=`<b>Соперник</b><span>—</span><small>Ожидание владения</small><div class="stBar"><i style="width:0%"></i></div>`;
    }
  },
  showHalftime(e){
    const total=e.stats[0].possession+e.stats[1].possession||1;
    const p0=Math.round(e.stats[0].possession/total*100),p1=100-p0;
    this.$("#halfScore").textContent=`${e.home.abbr} ${e.score[0]} : ${e.score[1]} ${e.away.abbr}`;
    this.$("#halfAdded").textContent=e.addedMinutes?`Добавлено: +${e.addedMinutes}`:"Без добавленного времени";
    this.$("#halfStats").innerHTML=`
      <div><span>Удары</span><b>${e.stats[0].shots} — ${e.stats[1].shots}</b></div>
      <div><span>В створ</span><b>${e.stats[0].onTarget} — ${e.stats[1].onTarget}</b></div>
      <div><span>Пасы</span><b>${e.stats[0].completed}/${e.stats[0].passes} — ${e.stats[1].completed}/${e.stats[1].passes}</b></div>
      <div><span>Владение</span><b>${p0}% — ${p1}%</b></div>
      <div><span>Отборы</span><b>${e.stats[0].tackles} — ${e.stats[1].tackles}</b></div>
      <div><span>Угловые</span><b>${e.stats[0].corners} — ${e.stats[1].corners}</b></div>`;
    const allEvents=e.events.filter(x=>x.half===1);
    const important=allEvents.filter(x=>x.type==="Гол"||x.type==="Карточка"||x.type==="Пенальти");
    const shots=allEvents.filter(x=>x.type==="Удар").slice(-5);
    const ev=[...important,...shots].sort((a,b)=>a.minute-b.minute);
    this.$("#halfEvents").innerHTML=ev.length
      ? ev.map(x=>`<p><b>${x.minute}'</b> ${x.text}</p>`).join("")
      : "<p>Ключевых событий не было.</p>";
    this.$("#halftime").style.display="flex";
    this.$("#secondHalfBtn").onclick=()=>{
      this.$("#halftime").style.display="none";
      e.startSecondHalf();
    };
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
addEventListener("DOMContentLoaded",()=>{SafariViewport.init();App.init();});


document.addEventListener("gesturestart",e=>e.preventDefault(),{passive:false});
document.addEventListener("gesturechange",e=>e.preventDefault(),{passive:false});
document.addEventListener("gestureend",e=>e.preventDefault(),{passive:false});
document.addEventListener("touchmove",e=>{
  if(document.querySelector("#game.active")) e.preventDefault();
},{passive:false});
