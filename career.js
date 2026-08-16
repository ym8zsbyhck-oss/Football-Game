
window.Career = {
  saveKey:"rfc-v06-career",
  state:null,

  leagueClubs(league,group=null){
    return DB.clubs.filter(c=>c.league===league && (!group || c.group===group));
  },

  clubById(id){return DB.clubs.find(c=>c.id===id)},
  club(){return this.clubById(this.state.clubId)},

  makeLeagueFixtures(club){
    const group=club.league==="fnl2"?(club.group||"gold"):null;
    const pool=this.leagueClubs(club.league,group);
    const opps=pool.filter(c=>c.id!==club.id);
    const fixtures=[];

    opps.forEach((o,i)=>fixtures.push({
      id:`league-${i+1}`,
      competition:"league",
      label:DB.leagues[club.league].name,
      round:i+1,
      order:(i+1)*10,
      home:i%2?o.id:club.id,
      away:i%2?club.id:o.id,
      played:false,score:null
    }));

    opps.forEach((o,i)=>fixtures.push({
      id:`league-${opps.length+i+1}`,
      competition:"league",
      label:DB.leagues[club.league].name,
      round:opps.length+i+1,
      order:(opps.length+i+1)*10,
      home:i%2?club.id:o.id,
      away:i%2?o.id:club.id,
      played:false,score:null
    }));

    return fixtures;
  },

  new(club){
    const group=club.league==="fnl2"?(club.group||"gold"):null;
    const pool=this.leagueClubs(club.league,group);
    const standings=pool.map(c=>({id:c.id,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}));

    this.state={
      version:"1.1.0",
      clubId:club.id,
      league:club.league,
      group,
      stage:1,
      season:2026,
      round:1,
      standings,
      fixtures:this.makeLeagueFixtures(club),
      lastResult:"",
      morale:78,
      confidence:72,
      tactics:{line:50,width:52,press:"balanced",build:"balanced"},
      trophies:[],
      cup:this.createCup(club),
      supercup:this.createSupercup(club)
    };

    this.save();
    return this.state;
  },

  migrate(){
    if(!this.state)return null;
    const club=this.clubById(this.state.clubId);
    if(!club)return this.state;

    this.state.version="1.1.0";
    if(!Array.isArray(this.state.trophies))this.state.trophies=[];

    if(!Array.isArray(this.state.fixtures)||!this.state.fixtures.length){
      this.state.fixtures=this.makeLeagueFixtures(club);
    }else{
      this.state.fixtures.forEach((f,i)=>{
        if(!f.competition)f.competition="league";
        if(f.order==null)f.order=(f.round||i+1)*10;
        if(!f.label)f.label=DB.leagues[this.state.league]?.name||"Чемпионат";
        if(!f.id)f.id=`league-${i+1}`;
      });
    }

    if(!this.state.cup)this.state.cup=this.createCup(club);
    if(!this.state.supercup)this.state.supercup=this.createSupercup(club);

    return this.state;
  },

  save(){
    if(this.state){
      this.state.savedAt=new Date().toISOString();
      localStorage.setItem(this.saveKey,JSON.stringify(this.state));
      localStorage.setItem(this.saveKey+"-backup",JSON.stringify(this.state));
    }
  },

  load(){
    try{
      const raw=localStorage.getItem(this.saveKey)||localStorage.getItem(this.saveKey+"-backup")||"null";
      this.state=JSON.parse(raw);
    }catch{
      try{this.state=JSON.parse(localStorage.getItem(this.saveKey+"-backup")||"null")}catch{}
    }
    this.migrate();
    return this.state;
  },

  sorted(){
    return [...this.state.standings].sort((a,b)=>
      b.pts-a.pts||
      ((b.gf-b.ga)-(a.gf-a.ga))||
      b.gf-a.gf
    );
  },

  row(id){return this.state.standings.find(x=>x.id===id)},

  addResult(id,gf,ga){
    const r=this.row(id);
    if(!r)return;
    r.p++;r.gf+=gf;r.ga+=ga;
    if(gf>ga){r.w++;r.pts+=3}
    else if(gf===ga){r.d++;r.pts++}
    else r.l++;
  },

  simGoals(a,b){
    let x=1.25+(a.rating-b.rating)/19,n=0;
    for(let i=0;i<5;i++){
      if(Math.random()<Math.max(.06,Math.min(.47,x/5)))n++;
    }
    return n;
  },

  penaltyShootout(homeId,awayId){
    const h=this.clubById(homeId),a=this.clubById(awayId);
    const hp=.71+((h?.rating||70)-(a?.rating||70))*.004;
    const ap=.71+((a?.rating||70)-(h?.rating||70))*.004;
    let hg=0,ag=0;

    for(let i=0;i<5;i++){
      if(Math.random()<Math.max(.58,Math.min(.86,hp)))hg++;
      if(Math.random()<Math.max(.58,Math.min(.86,ap)))ag++;
    }

    let safety=0;
    while(hg===ag&&safety++<12){
      if(Math.random()<Math.max(.58,Math.min(.86,hp)))hg++;
      if(Math.random()<Math.max(.58,Math.min(.86,ap)))ag++;
    }

    if(hg===ag){
      if(Math.random()<.5)hg++; else ag++;
    }

    return {home:hg,away:ag,winner:hg>ag?homeId:awayId};
  },

  /* ---------------- Russian Cup ---------------- */

  cupEmptyRow(id){
    return {id,p:0,w:0,wp:0,lp:0,l:0,gf:0,ga:0,pts:0};
  },

  createGroupSchedule(ids){
    const pairings=[
      [[0,3],[1,2]],
      [[2,0],[3,1]],
      [[0,1],[2,3]],
      [[3,0],[2,1]],
      [[0,2],[1,3]],
      [[1,0],[3,2]]
    ];

    return pairings.flatMap((matches,ri)=>
      matches.map((p,mi)=>({
        id:`g${ri+1}-${mi}`,
        round:ri+1,
        home:ids[p[0]],
        away:ids[p[1]],
        played:false,
        score:null,
        pens:null
      }))
    );
  },

  createCup(club){
    const cfg=DB.russianCup2026;
    const cup={
      competition:"cup",
      season:cfg.season,
      status:"active",
      path:club.league==="rpl"?"rpl":"regions",
      stage:"",
      group:null,
      groupTables:{},
      groupSchedules:{},
      simulatedRounds:[],
      fixtures:[],
      history:[],
      usedOpponents:[],
      won:false
    };

    if(club.league==="rpl"){
      for(const [g,ids] of Object.entries(cfg.rplGroups)){
        cup.groupTables[g]=ids.map(id=>this.cupEmptyRow(id));
        cup.groupSchedules[g]=this.createGroupSchedule(ids);
        if(ids.includes(club.id))cup.group=g;
      }

      cup.stage=`Групповой этап • группа ${cup.group}`;

      const sched=cup.groupSchedules[cup.group];
      for(let round=1;round<=6;round++){
        const m=sched.find(x=>x.round===round&&(x.home===club.id||x.away===club.id));
        cup.fixtures.push({
          id:`cup-group-${round}`,
          competition:"cup",
          cupType:"group",
          stage:`Кубок России • группа ${cup.group} • ${round} тур`,
          round,
          order:cfg.groupOrders[round-1],
          home:m.home,
          away:m.away,
          played:false,
          score:null,
          pens:null
        });
      }
    }else{
      const startRound=club.league==="fnl1"?4:2;
      cup.stage=`Путь регионов • раунд ${startRound}`;
      this.scheduleRegionQualifier(cup,club,startRound);
    }

    return cup;
  },

  groupRow(cup,group,id){
    return cup.groupTables[group].find(r=>r.id===id);
  },

  applyCupGroupScore(cup,group,home,away,hg,ag,penWinner=null){
    const h=this.groupRow(cup,group,home),a=this.groupRow(cup,group,away);
    if(!h||!a)return;

    h.p++;a.p++;
    h.gf+=hg;h.ga+=ag;
    a.gf+=ag;a.ga+=hg;

    if(hg>ag){h.w++;h.pts+=3;a.l++}
    else if(ag>hg){a.w++;a.pts+=3;h.l++}
    else{
      if(penWinner===home){
        h.wp++;h.pts+=2;
        a.lp++;a.pts+=1;
      }else{
        a.wp++;a.pts+=2;
        h.lp++;h.pts+=1;
      }
    }
  },

  cupGroupSorted(group){
    const c=this.state?.cup;
    if(!c?.groupTables?.[group])return [];
    return [...c.groupTables[group]].sort((a,b)=>
      b.pts-a.pts||
      b.w-a.w||
      ((b.gf-b.ga)-(a.gf-a.ga))||
      b.gf-a.gf
    );
  },

  simulateCupGroupRound(cup,round,userFx,hg,ag,userPens){
    if(cup.simulatedRounds.includes(round))return;

    for(const [group,schedule] of Object.entries(cup.groupSchedules)){
      const games=schedule.filter(m=>m.round===round);

      for(const m of games){
        if(m.played)continue;

        let mh,ma,pens=null;

        if(group===cup.group &&
           userFx &&
           m.home===userFx.home &&
           m.away===userFx.away){
          mh=hg;ma=ag;pens=userPens;
        }else{
          const hc=this.clubById(m.home),ac=this.clubById(m.away);
          mh=this.simGoals(hc,ac);
          ma=this.simGoals(ac,hc);
          if(mh===ma)pens=this.penaltyShootout(m.home,m.away);
        }

        m.played=true;
        m.score=`${mh}:${ma}`;
        m.pens=pens?`${pens.home}:${pens.away}`:null;

        this.applyCupGroupScore(
          cup,group,m.home,m.away,mh,ma,
          pens?.winner||null
        );
      }
    }

    cup.simulatedRounds.push(round);
  },

  pickCupOpponent(cup,mode="regions"){
    const user=this.club();
    let pool;

    if(mode==="regions"){
      pool=DB.clubs.filter(c=>c.id!==user.id&&["fnl1","fnl2"].includes(c.league));
    }else if(mode==="late-regions"){
      pool=DB.clubs.filter(c=>c.id!==user.id);
    }else{
      pool=DB.clubs.filter(c=>c.id!==user.id&&c.league==="rpl");
    }

    const used=new Set(cup.usedOpponents||[]);
    let available=pool.filter(c=>!used.has(c.id));
    if(!available.length)available=pool;

    available.sort((a,b)=>{
      const da=Math.abs((a.rating||70)-(user.rating||70));
      const db=Math.abs((b.rating||70)-(user.rating||70));
      return da-db+(Math.random()-.5)*5;
    });

    const slice=available.slice(0,Math.min(8,available.length));
    const opp=slice[Math.floor(Math.random()*slice.length)]||available[0];
    if(opp)cup.usedOpponents.push(opp.id);
    return opp;
  },

  scheduleRegionQualifier(cup,club,round){
    const opp=this.pickCupOpponent(cup,"regions");
    if(!opp){cup.status="eliminated";return}

    const order=DB.russianCup2026.regionOrders[round]||112;
    const home=Math.random()<.5?club.id:opp.id;
    const away=home===club.id?opp.id:club.id;

    cup.fixtures.push({
      id:`cup-region-r${round}-${cup.fixtures.length+1}`,
      competition:"cup",
      cupType:"region-qualifier",
      stage:`Кубок России • Путь регионов • раунд ${round}`,
      round,
      order,
      home,away,
      played:false,score:null,pens:null
    });
  },

  scheduleUpperTie(cup,stage){
    const cfg=DB.russianCup2026.playoffOrders;
    const map={
      r16:{label:"1/8 финала",orders:cfg.upperR16},
      qf:{label:"1/4 финала",orders:cfg.upperQF},
      sf:{label:"1/2 финала",orders:cfg.upperSF}
    };
    const d=map[stage];
    const opp=this.pickCupOpponent(cup,"rpl");
    if(!opp){cup.status="eliminated";return}

    const user=this.club();
    const firstHome=Math.random()<.5?user.id:opp.id;
    const firstAway=firstHome===user.id?opp.id:user.id;
    const tieId=`upper-${stage}-${Date.now()}-${Math.floor(Math.random()*9999)}`;

    cup.stage=`${d.label} • Путь РПЛ`;

    cup.fixtures.push({
      id:`${tieId}-1`,tieId,leg:1,
      competition:"cup",cupType:"upper-tie",upperStage:stage,
      stage:`Кубок России • ${d.label} • Путь РПЛ • 1-й матч`,
      order:d.orders[0],home:firstHome,away:firstAway,
      played:false,score:null,pens:null
    });

    cup.fixtures.push({
      id:`${tieId}-2`,tieId,leg:2,
      competition:"cup",cupType:"upper-tie",upperStage:stage,
      stage:`Кубок России • ${d.label} • Путь РПЛ • ответный матч`,
      order:d.orders[1],home:firstAway,away:firstHome,
      played:false,score:null,pens:null
    });
  },

  scheduleRegionPlayoff(cup,stage,reason=""){
    const cfg=DB.russianCup2026.playoffOrders;
    const map={
      r16:{label:"1/8 финала",order:cfg.regionR16},
      qf:{label:"1/4 финала",order:cfg.regionQF},
      sf:{label:"1/2 финала",order:cfg.regionSF}
    };
    const d=map[stage];
    const opp=this.pickCupOpponent(cup,"late-regions");
    if(!opp){cup.status="eliminated";return}

    const user=this.club();
    const home=Math.random()<.5?user.id:opp.id;
    const away=home===user.id?opp.id:user.id;

    cup.path="regions";
    cup.stage=`${d.label} • Путь регионов${reason?` • ${reason}`:""}`;

    cup.fixtures.push({
      id:`region-${stage}-${Date.now()}-${Math.floor(Math.random()*9999)}`,
      competition:"cup",
      cupType:"region-playoff",
      regionStage:stage,
      stage:`Кубок России • ${d.label} • Путь регионов`,
      order:d.order,
      home,away,
      played:false,score:null,pens:null
    });
  },

  scheduleCupFinal(cup){
    const opp=this.pickCupOpponent(cup,"late-regions");
    if(!opp){cup.status="eliminated";return}

    const user=this.club();
    const home=Math.random()<.5?user.id:opp.id;
    const away=home===user.id?opp.id:user.id;

    cup.path="final";
    cup.stage="Финал Кубка России";

    cup.fixtures.push({
      id:`cup-final-${Date.now()}`,
      competition:"cup",
      cupType:"final",
      stage:"FONBET Кубок России • ФИНАЛ",
      order:DB.russianCup2026.playoffOrders.final,
      home,away,
      played:false,score:null,pens:null
    });
  },

  markCupTrophy(){
    const title="Кубок России 2026/27";
    if(!this.state.trophies.includes(title))this.state.trophies.push(title);
    this.state.cup.status="winner";
    this.state.cup.stage="ОБЛАДАТЕЛЬ КУБКА РОССИИ";
    this.state.cup.won=true;
  },

  resolveKnockoutWinner(fx,hg,ag){
    let pens=null;
    let winner=null;

    if(hg>ag)winner=fx.home;
    else if(ag>hg)winner=fx.away;
    else{
      pens=this.penaltyShootout(fx.home,fx.away);
      winner=pens.winner;
    }

    return {winner,pens};
  },

  applyCupFixture(fx,hg,ag){
    const cup=this.state.cup;
    const userId=this.state.clubId;
    let pens=null;
    let display="";

    fx.played=true;
    fx.score=`${hg}:${ag}`;

    if(fx.cupType==="group"){
      if(hg===ag)pens=this.penaltyShootout(fx.home,fx.away);
      fx.pens=pens?`${pens.home}:${pens.away}`:null;

      this.simulateCupGroupRound(cup,fx.round,fx,hg,ag,pens);

      display=`${this.clubById(fx.home).name} ${hg}:${ag} ${this.clubById(fx.away).name}`;
      if(pens)display+=` (${pens.home}:${pens.away} пен.)`;

      cup.history.push({stage:fx.stage,result:display});

      if(fx.round===6){
        const table=this.cupGroupSorted(cup.group);
        const pos=table.findIndex(r=>r.id===userId)+1;

        if(pos<=2){
          cup.path="rpl-upper";
          this.scheduleUpperTie(cup,"r16");
        }else if(pos===3){
          this.scheduleRegionPlayoff(cup,"r16","3-е место в группе");
        }else{
          cup.status="eliminated";
          cup.stage="Вылет из Кубка России";
        }
      }
    }

    else if(fx.cupType==="region-qualifier"){
      const dec=this.resolveKnockoutWinner(fx,hg,ag);
      pens=dec.pens;
      fx.pens=pens?`${pens.home}:${pens.away}`:null;

      display=`${this.clubById(fx.home).name} ${hg}:${ag} ${this.clubById(fx.away).name}`;
      if(pens)display+=` (${pens.home}:${pens.away} пен.)`;
      cup.history.push({stage:fx.stage,result:display});

      if(dec.winner!==userId){
        cup.status="eliminated";
        cup.stage="Вылет из Кубка России";
      }else if(fx.round<6){
        const nr=fx.round+1;
        cup.stage=`Путь регионов • раунд ${nr}`;
        this.scheduleRegionQualifier(cup,this.club(),nr);
      }else{
        this.scheduleRegionPlayoff(cup,"r16");
      }
    }

    else if(fx.cupType==="upper-tie"){
      display=`${this.clubById(fx.home).name} ${hg}:${ag} ${this.clubById(fx.away).name}`;
      cup.history.push({stage:fx.stage,result:display});

      if(fx.leg===2){
        const legs=cup.fixtures.filter(x=>x.tieId===fx.tieId&&x.played);
        let userGoals=0,oppGoals=0;
        let oppId=null;

        for(const l of legs){
          const [lh,la]=l.score.split(":").map(Number);
          if(l.home===userId){userGoals+=lh;oppGoals+=la;oppId=l.away}
          else{userGoals+=la;oppGoals+=lh;oppId=l.home}
        }

        let userWon;
        if(userGoals>oppGoals)userWon=true;
        else if(userGoals<oppGoals)userWon=false;
        else{
          const shoot=this.penaltyShootout(userId,oppId);
          userWon=shoot.winner===userId;
          pens=shoot;
          fx.pens=`${shoot.home}:${shoot.away}`;
          display+=` • по сумме ${userGoals}:${oppGoals}, пен. ${shoot.home}:${shoot.away}`;
        }

        const stage=fx.upperStage;

        if(userWon){
          if(stage==="r16")this.scheduleUpperTie(cup,"qf");
          else if(stage==="qf")this.scheduleUpperTie(cup,"sf");
          else this.scheduleCupFinal(cup);
        }else{
          if(stage==="r16")this.scheduleRegionPlayoff(cup,"r16","вылет из верхней сетки");
          else if(stage==="qf")this.scheduleRegionPlayoff(cup,"qf","вылет из верхней сетки");
          else this.scheduleRegionPlayoff(cup,"sf","вылет из верхней сетки");
        }
      }
    }

    else if(fx.cupType==="region-playoff"){
      const dec=this.resolveKnockoutWinner(fx,hg,ag);
      pens=dec.pens;
      fx.pens=pens?`${pens.home}:${pens.away}`:null;

      display=`${this.clubById(fx.home).name} ${hg}:${ag} ${this.clubById(fx.away).name}`;
      if(pens)display+=` (${pens.home}:${pens.away} пен.)`;
      cup.history.push({stage:fx.stage,result:display});

      if(dec.winner!==userId){
        cup.status="eliminated";
        cup.stage="Вылет из Кубка России";
      }else if(fx.regionStage==="r16"){
        this.scheduleRegionPlayoff(cup,"qf");
      }else if(fx.regionStage==="qf"){
        this.scheduleRegionPlayoff(cup,"sf");
      }else{
        this.scheduleCupFinal(cup);
      }
    }

    else if(fx.cupType==="final"){
      const dec=this.resolveKnockoutWinner(fx,hg,ag);
      pens=dec.pens;
      fx.pens=pens?`${pens.home}:${pens.away}`:null;

      display=`${this.clubById(fx.home).name} ${hg}:${ag} ${this.clubById(fx.away).name}`;
      if(pens)display+=` (${pens.home}:${pens.away} пен.)`;

      cup.history.push({stage:fx.stage,result:display});

      if(dec.winner===userId){
        this.markCupTrophy();
        display=`🏆 ${display} • КУБОК РОССИИ ВЫИГРАН`;
      }else{
        cup.status="runner-up";
        cup.stage="Финалист Кубка России";
      }
    }

    this.state.lastResult=display;
    this.save();
    return {display,pens,competition:"cup"};
  },

  /* ---------------- Super Cup ---------------- */

  createSupercup(club){
    const cfg=DB.superCup2026;
    const eligible=[cfg.home,cfg.away].includes(club.id);

    if(eligible){
      return {
        competition:"supercup",
        season:cfg.season,
        eligible:true,
        status:"pending",
        winner:null,
        result:null,
        fixture:{
          id:"supercup-2026",
          competition:"supercup",
          stage:"OLIMPBET Суперкубок России 2026",
          label:"Суперкубок России",
          order:1,
          home:cfg.home,
          away:cfg.away,
          played:false,
          score:null,
          pens:null
        }
      };
    }

    return {
      competition:"supercup",
      season:cfg.season,
      eligible:false,
      status:"completed",
      winner:cfg.actualWinner,
      result:`Зенит ${cfg.actualResult} Спартак Москва`,
      fixture:null
    };
  },

  applySupercupFixture(fx,hg,ag){
    const s=this.state.supercup;
    const dec=this.resolveKnockoutWinner(fx,hg,ag);
    const pens=dec.pens;

    fx.played=true;
    fx.score=`${hg}:${ag}`;
    fx.pens=pens?`${pens.home}:${pens.away}`:null;

    let display=`${this.clubById(fx.home).name} ${hg}:${ag} ${this.clubById(fx.away).name}`;
    if(pens)display+=` (${pens.home}:${pens.away} пен.)`;

    s.status="completed";
    s.winner=dec.winner;
    s.result=display;

    if(dec.winner===this.state.clubId){
      const title="Суперкубок России 2026";
      if(!this.state.trophies.includes(title))this.state.trophies.push(title);
      display=`🏆 ${display} • СУПЕРКУБОК ВЫИГРАН`;
    }

    this.state.lastResult=display;
    this.save();
    return {display,pens,competition:"supercup"};
  },

  /* ---------------- League ---------------- */

  applyLeagueFixture(fx,hg,ag){
    fx.played=true;
    fx.score=`${hg}:${ag}`;
    this.addResult(fx.home,hg,ag);
    this.addResult(fx.away,ag,hg);

    const pool=this.leagueClubs(this.state.league,this.state.group);
    const rest=pool.filter(c=>![fx.home,fx.away].includes(c.id));

    for(let i=0;i<rest.length-1;i+=2){
      const a=rest[i],b=rest[i+1];
      const g1=this.simGoals(a,b),g2=this.simGoals(b,a);
      this.addResult(a.id,g1,g2);
      this.addResult(b.id,g2,g1);
    }

    this.state.round++;
    const display=`${this.clubById(fx.home).name} ${hg}:${ag} ${this.clubById(fx.away).name}`;
    this.state.lastResult=display;
    this.save();
    return {display,competition:"league"};
  },

  applyFixture(fx,hg,ag){
    if(fx.competition==="cup")return this.applyCupFixture(fx,hg,ag);
    if(fx.competition==="supercup")return this.applySupercupFixture(fx,hg,ag);
    return this.applyLeagueFixture(fx,hg,ag);
  },

  /* ---------------- Calendar / UI helpers ---------------- */

  allFixtures(){
    if(!this.state)return [];
    const arr=[...(this.state.fixtures||[])];

    if(this.state.cup?.fixtures)arr.push(...this.state.cup.fixtures);
    if(this.state.supercup?.fixture)arr.push(this.state.supercup.fixture);

    return arr.sort((a,b)=>(a.order??9999)-(b.order??9999));
  },

  nextFixture(){
    return this.allFixtures().find(f=>!f.played);
  },

  calendarItems(){
    return this.allFixtures();
  },

  competitionName(fx){
    if(fx.competition==="cup")return "Кубок России";
    if(fx.competition==="supercup")return "Суперкубок России";
    return DB.leagues[this.state.league]?.name||"Чемпионат";
  },

  fixtureResultText(f){
    if(!f.played)return "—";
    let s=f.score||"—";
    if(f.pens)s+=` (${f.pens} пен.)`;
    return s;
  },

  cupStatusText(){
    const c=this.state?.cup;
    if(!c)return "—";
    if(c.status==="winner")return "🏆 Обладатель Кубка России";
    if(c.status==="runner-up")return "Финалист Кубка России";
    if(c.status==="eliminated")return "Выбыл";
    return c.stage||"Участник";
  }
};
