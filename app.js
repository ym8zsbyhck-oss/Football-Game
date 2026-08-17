
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
    Career.initStorage();

    this.renderCareerSlots();
    this.renderPicker();

    document.querySelectorAll("[data-league]").forEach(b=>b.onclick=()=>{
      document.querySelectorAll("[data-league]").forEach(x=>x.classList.toggle("active",x===b));
      this.league=b.dataset.league;
      this.renderPicker();
    });

    this.$("#startCareer").onclick=()=>{
      if(!this.selected)return;

      const slot=Career.firstFreeSlot();
      if(!slot){
        alert("Все 3 слота карьеры заняты. Удалите один из слотов, чтобы начать новую карьеру.");
        return;
      }

      if(!Career.new(this.selected,slot)){
        alert("Не удалось создать карьеру в выбранном слоте.");
        return;
      }

      this.renderCareerSlots();
      this.openCareer();
    };

    this.$("#saveCareerBtn")?.addEventListener("click",()=>{
      Career.save();
      this.renderCareerSlots();
      alert(`Карьера сохранена • слот ${Career.currentSlot}`);
    });

    this.$("#back").onclick=()=>{
      Career.save();
      this.renderCareerSlots();
      this.show("select");
    };

    document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>this.renderCareer(b.dataset.tab));
    this.setupControls();
  },
  renderCareerSlots(){
    const box=this.$("#careerSlots");
    if(!box)return;

    const slots=Career.listSlots();
    const used=slots.filter(x=>x.state).length;

    if(this.$("#saveCounter")){
      this.$("#saveCounter").textContent=`КАРЬЕРЫ ${used}/3`;
    }

    box.innerHTML=slots.map(({slot,state})=>{
      if(!state){
        return `
          <div class="careerSlot empty">
            <div class="slotNumber">СЛОТ ${slot}</div>
            <div class="slotEmpty">Пусто</div>
          </div>`;
      }

      const club=DB.clubs.find(c=>c.id===state.clubId);
      const league=DB.leagues[state.league]?.name||state.league||"Лига";
      const round=state.round||1;
      const saved=state.savedAt
        ? new Date(state.savedAt).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit"})
        : "";

      return `
        <div class="careerSlot filled" data-slot="${slot}">
          <img class="slotLogo" data-club-logo="${club?.id||""}">
          <div class="slotInfo">
            <div class="slotNumber">СЛОТ ${slot}</div>
            <b>${club?.name||state.clubId||"Карьера"}</b>
            <small>${league} • тур ${round}${saved?` • ${saved}`:""}</small>
          </div>
          <div class="slotActions">
            <button class="slotContinue" data-slot-open="${slot}">ИГРАТЬ</button>
            <button class="slotDelete" data-slot-delete="${slot}" aria-label="Удалить слот">×</button>
          </div>
        </div>`;
    }).join("");

    box.querySelectorAll("[data-club-logo]").forEach(img=>{
      const club=DB.clubs.find(c=>c.id===img.dataset.clubLogo);
      if(club)Logos.bind(img,club);
    });

    box.querySelectorAll("[data-slot-open]").forEach(btn=>{
      btn.onclick=e=>{
        e.stopPropagation();
        const slot=Number(btn.dataset.slotOpen);
        if(Career.load(slot))this.openCareer();
      };
    });

    box.querySelectorAll(".careerSlot.filled").forEach(card=>{
      card.onclick=()=>{
        const slot=Number(card.dataset.slot);
        if(Career.load(slot))this.openCareer();
      };
    });

    box.querySelectorAll("[data-slot-delete]").forEach(btn=>{
      btn.onclick=e=>{
        e.stopPropagation();
        const slot=Number(btn.dataset.slotDelete);
        const state=Career.readSlot(slot);
        const club=DB.clubs.find(c=>c.id===state?.clubId);
        if(!confirm(`Удалить карьеру из слота ${slot}${club?` (${club.name})`:""}?`))return;
        Career.deleteSlot(slot);
        this.renderCareerSlots();
      };
    });

    const start=this.$("#startCareer");
    if(start&&this.selected){
      start.textContent=used>=3?"СЛОТОВ НЕТ":"НАЧАТЬ";
    }
  },

  pickerClubs(){return this.league==="fnl2"?DB.clubs.filter(c=>c.league==="fnl2"):DB.clubs.filter(c=>c.league===this.league)},
  renderPicker(){
    const box=this.$("#clubGrid");box.innerHTML="";
    this.pickerClubs().forEach(c=>{let b=document.createElement("button");b.className="club";b.innerHTML=`<img><span>${c.name}</span><small>${c.group?(c.group==="gold"?"Золото":"Серебро")+" • ":""}РТГ ${c.rating}</small>`;Logos.bind(b.querySelector("img"),c);b.onclick=()=>{this.selected=c;document.querySelectorAll(".club").forEach(x=>x.classList.remove("sel"));b.classList.add("sel");this.$("#selectedName").textContent=`${c.name} • рейтинг ${c.rating}`;Logos.bind(this.$("#selectedLogo"),c);this.$("#startCareer").disabled=false;this.$("#startCareer").textContent=Career.firstFreeSlot()?"НАЧАТЬ":"СЛОТОВ НЕТ"};box.appendChild(b)})
  },
  openCareer(){
    const c=Career.club();
    this.$("#careerName").textContent=c.name;
    this.$("#careerLeague").textContent=DB.leagues[Career.state.league].name+(Career.state.group?` • ${Career.state.group==="gold"?"Золото":"Серебро"}`:"")+` • РТГ ${c.rating}`;
    if(this.$("#careerTopBrand"))this.$("#careerTopBrand").textContent=`КАРЬЕРА • СЛОТ ${Career.currentSlot}`;
    Logos.bind(this.$("#careerLogo"),c);
    this.show("career");
    this.renderCareer("overview");
  },
  renderCareer(tab){
    document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===tab));
    const s=Career.state,c=Career.club(),co=this.$("#content");

    const badge=f=>`<span class="compBadge ${f.competition||"league"}">${Career.competitionName(f)}</span>`;

    if(tab==="overview"){
      const f=Career.nextFixture();
      const cupStatus=Career.cupStatusText();
      const trophies=s.trophies?.length?s.trophies.length:0;

      co.innerHTML=`
        <h2>Обзор</h2>
        <div class="stats">
          <div>Тур лиги<b>${s.round}</b></div>
          <div>Место<b>${Career.sorted().findIndex(x=>x.id===c.id)+1}</b></div>
          <div>Кубок<b>${s.cup?.status==="winner"?"🏆":s.cup?.status==="eliminated"?"—":"●"}</b></div>
          <div>Трофеи<b>${trophies}</b></div>
        </div>

        <div class="card nextMatchCard">
          <h3>Следующий матч</h3>
          ${f?`
            ${badge(f)}
            <p><b>${DB.clubs.find(x=>x.id===f.home)?.name}</b> — <b>${DB.clubs.find(x=>x.id===f.away)?.name}</b></p>
            <small>${f.stage||f.label||Career.competitionName(f)}</small>
            <div class="matchModeButtons">
              <button id="play" class="primary">ИГРАТЬ САМОМУ</button>
              <button id="coachMatch" class="secondary coachStart">РЕЖИМ ТРЕНЕРА</button>
            </div>
          `:"<p>Матчей в текущем календаре больше нет.</p>"}
        </div>

        <div class="card">
          <b>FONBET Кубок России</b>
          <p>${cupStatus}</p>
        </div>

        <div class="card">
          <b>ИИ матча</b>
          <p>v1.2.1 Team IQ: рейтинг клуба влияет на решения, прессинг, передачи, первый приём, забегания, завершение и вратаря.</p>
        </div>`;

      this.$("#play")?.addEventListener("click",()=>this.playFixture(f,"player"));
      this.$("#coachMatch")?.addEventListener("click",()=>this.playFixture(f,"coach"));
    }

    else if(tab==="table"){
      co.innerHTML=`<h2>Таблица</h2>
      <table>
        <tr><th>#</th><th>Клуб</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>М</th><th>О</th></tr>
        ${Career.sorted().map((r,i)=>`
          <tr>
            <td>${i+1}</td>
            <td>${DB.clubs.find(c=>c.id===r.id)?.name||r.id}</td>
            <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
            <td>${r.gf}:${r.ga}</td><td><b>${r.pts}</b></td>
          </tr>`).join("")}
      </table>`;
    }

    else if(tab==="calendar"){
      co.innerHTML=`<h2>Календарь сезона</h2>
        ${Career.calendarItems().map(f=>`
          <div class="fixture competitionFixture">
            <span>${badge(f)}</span>
            <span>
              <b>${DB.clubs.find(c=>c.id===f.home)?.name||f.home}</b> —
              <b>${DB.clubs.find(c=>c.id===f.away)?.name||f.away}</b>
              <small>${f.stage||`Тур ${f.round||""}`}</small>
            </span>
            <b>${Career.fixtureResultText(f)}</b>
          </div>`).join("")}`;
    }

    else if(tab==="tournaments"){
      const cup=s.cup;
      const supercup=s.supercup;
      let cupHtml="";

      if(cup?.group){
        const table=Career.cupGroupSorted(cup.group);
        cupHtml=`
          <div class="card tournamentCard">
            <h3>FONBET Кубок России</h3>
            <p><b>${Career.cupStatusText()}</b></p>
            <small>Группа ${cup.group} • Путь РПЛ</small>
            <table class="cupTable">
              <tr><th>#</th><th>Клуб</th><th>И</th><th>В</th><th>ВП</th><th>ПП</th><th>П</th><th>М</th><th>О</th></tr>
              ${table.map((r,i)=>`
                <tr class="${r.id===c.id?"me":""}">
                  <td>${i+1}</td>
                  <td>${DB.clubs.find(x=>x.id===r.id)?.name||r.id}</td>
                  <td>${r.p}</td><td>${r.w}</td><td>${r.wp}</td><td>${r.lp}</td><td>${r.l}</td>
                  <td>${r.gf}:${r.ga}</td><td><b>${r.pts}</b></td>
                </tr>`).join("")}
            </table>
          </div>`;
      }else{
        cupHtml=`
          <div class="card tournamentCard">
            <h3>FONBET Кубок России</h3>
            <p><b>${Career.cupStatusText()}</b></p>
            <small>${cup?.path==="regions"?"Путь регионов":"Кубок России"}</small>
          </div>`;
      }

      const cupHistory=(cup?.history||[]).slice().reverse().map(x=>
        `<div class="tournamentEvent"><b>${x.stage}</b><span>${x.result}</span></div>`
      ).join("");

      const superText=supercup?.eligible
        ? (supercup.status==="pending"?"Предстоит матч":supercup.result||"Завершён")
        : `2026: ${supercup?.result||"Зенит — Спартак"}`;

      const trophyHtml=s.trophies?.length
        ? s.trophies.map(t=>`<div class="trophyRow">🏆 <b>${t}</b></div>`).join("")
        : `<p class="muted">Трофеев пока нет.</p>`;

      co.innerHTML=`
        <h2>Турниры</h2>
        <div class="tournamentGrid">
          ${cupHtml}
          <div class="card tournamentCard">
            <h3>OLIMPBET Суперкубок России</h3>
            <p><b>${superText}</b></p>
            <small>${supercup?.eligible?"Вы участвуете в матче за трофей":"Ваш клуб не участвовал в Суперкубке-2026"}</small>
          </div>
        </div>

        <div class="card">
          <h3>Кубок России — ваши матчи</h3>
          ${cupHistory||'<p class="muted">Матчи ещё не сыграны.</p>'}
        </div>

        <div class="card">
          <h3>Трофеи карьеры</h3>
          ${trophyHtml}
        </div>`;
    }

    else if(tab==="rules"){
      co.innerHTML=`
        <h2>Регламент</h2>

        <div class="card">
          <b>РПЛ</b>
          <p>15–16 — прямой вылет. 13–14 — двухматчевые стыки.</p>
        </div>

        <div class="card">
          <b>Первая лига</b>
          <p>1–2 — прямой выход в РПЛ. 3–4 — стыковые матчи. Три последних места — вылет.</p>
        </div>

        <div class="card">
          <b>Вторая лига А</b>
          <p>«Золото» и «Серебро» сохраняются как отдельные группы игрового сезона.</p>
        </div>

        <div class="card">
          <b>FONBET Кубок России 2026/27</b>
          <p>Клубы РПЛ начинают с четырёх групп по 4 команды и играют по 6 матчей. Победа в основное время — 3 очка. При ничьей проводится серия пенальти: победителю 2 очка, проигравшему 1.</p>
          <p>1–2 места группы продолжают путь по верхней сетке, 3-е место переходит в нижнюю сетку. Клубы Первой и Второй лиги играют через Путь регионов.</p>
        </div>

        <div class="card">
          <b>OLIMPBET Суперкубок России</b>
          <p>Один матч между чемпионом России и обладателем Кубка России. При ничьей после 90 минут — сразу серия пенальти.</p>
        </div>`;
    }
  },

  scoreboardThemeForFixture(f){
    if(f?.competition==="cup")return "cup";
    if(f?.competition==="supercup")return "supercup";

    const league=Career.state?.league;
    if(league==="fnl1")return "fnl1";
    if(league==="fnl2")return "fnl2";
    return "rpl";
  },

  scoreboardMeta(theme){
    const meta={
      rpl:{top:"АЛЬФА-БАНК",main:"РПЛ",icon:"РПЛ",label:"АЛЬФА-БАНК РПЛ • 2026/27"},
      fnl1:{top:"ЛИГА",main:"PARI",icon:"1",label:"ЛИГА PARI • 2026/27"},
      fnl2:{top:"LEON",main:"2 ЛИГА А",icon:"2",label:"LEON • ВТОРАЯ ЛИГА А • 2026/27"},
      cup:{top:"FONBET",main:"КУБОК РОССИИ",icon:"КР",label:"FONBET КУБОК РОССИИ • 2026/27"},
      supercup:{top:"OLIMPBET",main:"СУПЕРКУБОК",icon:"СК",label:"OLIMPBET СУПЕРКУБОК РОССИИ • 2026"}
    };
    return meta[theme]||meta.rpl;
  },

  applyScoreboardTheme(f,h,a,mode){
    const theme=this.scoreboardThemeForFixture(f);
    const meta=this.scoreboardMeta(theme);
    const game=this.$("#game");
    const hud=this.$("#matchHud");

    ["score-rpl","score-fnl1","score-fnl2","score-cup","score-supercup"].forEach(x=>{
      game.classList.remove(x);hud?.classList.remove(x);
    });
    game.classList.add(`score-${theme}`);
    hud?.classList.add(`score-${theme}`);
    if(hud)hud.dataset.scoreboard=theme;

    game.style.setProperty("--home-accent",h?.color||"#efefef");
    game.style.setProperty("--away-accent",a?.color||"#efefef");

    this.$("#leagueMarkTop").textContent=meta.top;
    this.$("#leagueMarkMain").textContent=meta.main;
    this.$("#leagueMarkIcon").textContent=meta.icon;
    this.$("#competitionLabel").textContent=(mode==="coach"?"ТРЕНЕР • ":"")+meta.label;
  },

  playFixture(f,mode="player"){
    const h=DB.clubs.find(c=>c.id===f.home);
    const a=DB.clubs.find(c=>c.id===f.away);
    const careerSide=f.home===Career.state.clubId?0:1;

    this.matchMode=mode;
    this.currentFixture=f;

    this.$("#hName").textContent=h.abbr;
    this.$("#aName").textContent=a.abbr;
    this.applyScoreboardTheme(f,h,a,mode);

    Logos.bind(this.$("#hLogo"),h);
    Logos.bind(this.$("#aLogo"),a);

    const game=this.$("#game");
    game.classList.toggle("coachMode",mode==="coach");

    this.$("#coachPanel").classList.remove("collapsed");
    this.$("#coachPanel").style.display=mode==="coach"?"block":"none";
    this.$("#coachToggle").style.display="none";

    this.show("game");

    this.engine=new MatchEngine(this.$("#pitch"),sc=>this.finishMatch(sc));
    this.engine.start(
      h,
      a,
      careerSide,
      {
        mode,
        coachSide:careerSide,
        tactics:Career.state.managerTactics||{}
      }
    );

    if(mode==="coach")this.syncCoachUI();
  },

  finishMatch(sc){
    const result=Career.applyFixture(this.currentFixture,sc[0],sc[1]);
    this.$("#result").style.display="flex";
    this.$("#resultText").textContent=result.display;
  },

  coachLabel(group,value){
    const labels={
      mentality:{defensive:"Оборона",balanced:"Баланс",attacking:"Атака"},
      press:{low:"Низкий пресс",balanced:"Средний пресс",high:"Высокий пресс"},
      tempo:{slow:"Спокойный темп",balanced:"Нормальный темп",fast:"Быстрый темп"},
      width:{narrow:"Узко",balanced:"Нормальная ширина",wide:"Широко"},
      build:{possession:"Контроль мяча",balanced:"Сбалансировано",direct:"Вертикально",counter:"Контратака"}
    };
    return labels[group]?.[value]||value;
  },

  syncCoachUI(){
    if(!this.engine||this.engine.controlMode!=="coach")return;
    const t=this.engine.coachTactics;

    document.querySelectorAll("[data-coach-group]").forEach(btn=>{
      const active=t[btn.dataset.coachGroup]===btn.dataset.coachValue;
      btn.classList.toggle("active",active);
    });

    if(Career.state){
      Career.state.managerTactics={...t};
      Career.save();
    }
  },

  applyCoachInstruction(group,value){
    if(!this.engine?.setCoachInstruction(group,value))return;
    this.syncCoachUI();
  },

  coachShout(type){
    if(!this.engine?.triggerCoachShout(type))return;
    document.querySelectorAll("[data-coach-shout]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.coachShout===type);
    });
  },

  updateHUD(e){
    this.$("#score").textContent=`${e.score[0]}–${e.score[1]}`;
    let minute=e.displayMinute(),sec=0;
    if(e.halfElapsed<=e.realHalfDuration){
      const base=e.half===1?0:45;
      const exact=e.halfElapsed/e.realHalfDuration*45;
      minute=Math.floor(base+exact);sec=Math.floor((exact-Math.floor(exact))*60);
    }
    this.$("#clock").textContent=String(minute).padStart(2,"0")+":"+String(sec).padStart(2,"0")+(e.addedMinutes&&e.halfElapsed>=e.realHalfDuration?` +${e.addedMinutes}`:"");

    if(e.controlMode==="coach"){
      const total=e.stats[0].possession+e.stats[1].possession||1;
      const own=e.coachSide;
      const possession=Math.round(e.stats[own].possession/total*100);
      const phase=e.teamPhases[own]||"SHAPE";
      const shout=e.coachShoutTimer>0?` • ${Math.ceil(e.coachShoutTimer)}с`:"";

      if(this.$("#coachLive")){
        this.$("#coachLive").innerHTML=
          `<b>${this.coachLabel("mentality",e.coachTactics.mentality)}</b> • `+
          `${this.coachLabel("press",e.coachTactics.press)} • `+
          `${this.coachLabel("tempo",e.coachTactics.tempo)}<br>`+
          `<span>Владение ${possession}% • Удары ${e.stats[own].shots} • ${phase}${shout}</span>`;
      }

      if(e.coachShoutTimer<=0){
        document.querySelectorAll("[data-coach-shout]").forEach(btn=>btn.classList.remove("active"));
      }

      return;
    }

    const ownBall=e.ball.owner!==null&&e.players[e.ball.owner]?.team===e.userSide;
    const controlledOwn=e.ball.owner===e.controlled;
    this.$("#shoot").textContent=controlledOwn?"УДАР":"ОТБОР";
    this.$("#pass").textContent=ownBall?"ПАС":"ПРЕСС";
    this.$("#through").textContent=ownBall?"ВРАЗРЕЗ":"2-Й ПРЕСС";
    this.$("#switch").classList.toggle("disabledAction",controlledOwn);

    const p=e.players[e.controlled];
    const enemyOwner=(e.ball.owner!==null&&e.players[e.ball.owner]?.team!==e.userSide)?e.players[e.ball.owner]:null;
    if(p){
      this.$("#playerInfo").innerHTML=`<b>${p.name}</b><span>№ ${p.num}</span><small>${DB.roleLabels?.[p.fcRole]||p.fcRole} • ${Math.round(p.stamina*100)}%</small><div class="stBar"><i style="width:${Math.round(p.stamina*100)}%"></i></div>`;
    }
    if(enemyOwner){
      this.$("#gkInfo").style.opacity="1";
      this.$("#gkInfo").innerHTML=`<b>${enemyOwner.name}</b><span>№ ${enemyOwner.num}</span><small>${DB.roleLabels?.[enemyOwner.fcRole]||enemyOwner.fcRole} • ${Math.round(enemyOwner.stamina*100)}%</small><div class="stBar"><i style="width:${Math.round(enemyOwner.stamina*100)}%"></i></div>`;
    }else{
      this.$("#gkInfo").style.opacity=".35";
      this.$("#gkInfo").innerHTML=`<b>Соперник</b><span>—</span><small>Без владения</small><div class="stBar"><i style="width:0%"></i></div>`;
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
    c.onpointerdown=e=>{
      if(this.engine?.controlMode==="coach")return;
      if(e.clientX>innerWidth*.53)return;
      pid=e.pointerId;cx=e.clientX;cy=e.clientY;
      joy.style.display="block";joy.style.left=e.clientX-59+"px";joy.style.top=e.clientY-59+"px";
      c.setPointerCapture?.(e.pointerId);
    };
    c.onpointermove=e=>{
      if(e.pointerId!==pid||!this.engine)return;
      let dx=e.clientX-cx,dy=e.clientY-cy,l=Math.hypot(dx,dy),m=41;
      if(l>m){dx*=m/l;dy*=m/l}
      this.engine.joy.x=dx/m;this.engine.joy.y=dy/m;kn.style.transform=`translate(${dx}px,${dy}px)`;
    };
    const end=e=>{
      if(e.pointerId!==pid)return;pid=null;
      if(this.engine){this.engine.joy.x=0;this.engine.joy.y=0}
      joy.style.display="none";kn.style.transform="";
    };
    c.onpointerup=end;c.onpointercancel=end;

    const userHasBall=()=>this.engine&&this.engine.ball.owner!==null&&this.engine.players[this.engine.ball.owner]?.team===this.engine.userSide;
    const controlledOwns=()=>this.engine&&this.engine.ball.owner===this.engine.controlled;

    this.$("#pass").onpointerdown=()=>{
      if(!this.engine||this.engine.controlMode==="coach")return;
      if(controlledOwns())this.engine.startPassCharge();
      else this.engine.pressAssist=true;
    };
    this.$("#pass").onpointerup=()=>{
      if(!this.engine)return;
      if(this.engine.passCharging)this.engine.releasePass(false);
      this.engine.pressAssist=false;
    };
    this.$("#pass").onpointercancel=()=>{
      if(!this.engine)return;
      if(this.engine.passCharging)this.engine.releasePass(false);
      this.engine.pressAssist=false;
    };

    this.$("#through").onpointerdown=()=>{
      if(!this.engine||this.engine.controlMode==="coach")return;
      if(controlledOwns())this.engine.startPassCharge();
      else this.engine.secondPress=true;
    };
    this.$("#through").onpointerup=()=>{
      if(!this.engine)return;
      if(this.engine.passCharging)this.engine.releasePass(true);
      this.engine.secondPress=false;
    };
    this.$("#through").onpointercancel=()=>{
      if(!this.engine)return;
      if(this.engine.passCharging)this.engine.releasePass(true);
      this.engine.secondPress=false;
    };

    this.$("#shoot").onpointerdown=()=>{
      if(!this.engine||this.engine.controlMode==="coach")return;
      if(controlledOwns())this.engine.startShotCharge();else this.engine.tackle();
    };
    this.$("#shoot").onpointerup=()=>this.engine?.releaseShot();
    this.$("#shoot").onpointercancel=()=>this.engine?.releaseShot();

    this.$("#switch").onpointerdown=()=>this.engine?.switch();

    this.$("#sprint").onpointerdown=()=>{if(this.engine)this.engine.sprint=true};
    ["pointerup","pointerleave","pointercancel"].forEach(x=>this.$("#sprint").addEventListener(x,()=>{if(this.engine)this.engine.sprint=false}));

    document.querySelectorAll("[data-coach-group]").forEach(btn=>{
      btn.onclick=()=>this.applyCoachInstruction(btn.dataset.coachGroup,btn.dataset.coachValue);
    });

    document.querySelectorAll("[data-coach-shout]").forEach(btn=>{
      btn.onclick=()=>this.coachShout(btn.dataset.coachShout);
    });

    this.$("#coachClose").onclick=()=>{
      this.$("#coachPanel").style.display="none";
      this.$("#coachToggle").style.display="block";
    };

    this.$("#coachToggle").onclick=()=>{
      if(this.engine?.controlMode!=="coach")return;
      this.$("#coachPanel").style.display="block";
      this.$("#coachToggle").style.display="none";
    };

    this.$("#pause").onclick=()=>{if(!this.engine)return;this.engine.paused=true;this.$("#pauseOverlay").style.display="flex"};
    this.$("#resume").onclick=()=>{this.$("#pauseOverlay").style.display="none";this.engine.paused=false;this.engine.last=performance.now();requestAnimationFrame(t=>this.engine.loop(t))};
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
