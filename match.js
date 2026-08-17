
window.MatchEngine = class {
  constructor(canvas,onFinish){
    this.canvas=canvas;this.ctx=canvas.getContext("2d");this.onFinish=onFinish;
    this.running=false;this.paused=false;this.userSide=0;
    this.matchClockRunning=false;
    this.players=[];this.ball={};this.score=[0,0];
    this.elapsed=0;
    // v1.1.2: 1 real minute = one 45-minute football half.
    // Full match is ~2 real minutes before stoppage time / halftime overlay.
    this.realHalfDuration=60;
    this.half=1;this.halfElapsed=0;
    this.addedMinutes=0;this.addedReal=0;this.halftimeShown=false;
    this.controlled=0;this.joy={x:0,y:0};this.sprint=false;this.last=0;
    this.restart=null;this.phase="kickoff";this.kickoffTeam=0;this.kickoffTimer=0;
    this.passCharge=0;this.shotCharge=0;this.passCharging=false;this.shotCharging=false;
    this.pressAssist=false;this.secondPress=false;
    this.stats=this.newStats();this.events=[];
    this.lastPossessionTeam=-1;this.counterPressTeam=-1;this.counterPressTimer=0;
    this.teamShotCooldown=[0,0];this.teamPhases=["DEFENSIVE_SHAPE","DEFENSIVE_SHAPE"];
    this.shotSerial=0;this.lastGoalTime=-999;
    this.kickoffProtection=0;
    this.kickoffReceiver=-1;
    this.kickoffPasser=-1;
    this.kickoffReceiveTimer=0;
    this.aiDifficulty=.58;this.openingKickoffTeam=0;

    // v1.2.0 Manager / Coach Mode.
    this.controlMode="player";
    this.coachSide=-1;
    this.coachTactics={
      mentality:"balanced",
      press:"balanced",
      tempo:"balanced",
      width:"balanced",
      build:"balanced"
    };
    this.coachShout=null;
    this.coachShoutTimer=0;
  }

  newStats(){
    return [
      {shots:0,onTarget:0,passes:0,completed:0,possession:0,tackles:0,corners:0,fouls:0},
      {shots:0,onTarget:0,passes:0,completed:0,possession:0,tackles:0,corners:0,fouls:0}
    ];
  }

  resize(){
    const oldW=this.W||innerWidth,oldH=this.H||innerHeight;
    const vv=window.visualViewport;
    const nw=Math.round(vv?vv.width:innerWidth),nh=Math.round(vv?vv.height:innerHeight);
    this.W=nw;this.H=nh;
    const d=Math.min(devicePixelRatio||1,2);
    this.canvas.width=nw*d;this.canvas.height=nh*d;
    this.canvas.style.width=nw+"px";this.canvas.style.height=nh+"px";
    this.ctx.setTransform(d,0,0,d,0,0);
    if(this.players.length&&oldW&&oldH&&(oldW!==nw||oldH!==nh)){
      const sx=nw/oldW,sy=nh/oldH;
      for(const p of this.players){p.x*=sx;p.y*=sy;p.homeX*=sx;p.homeY*=sy}
      if(this.ball){this.ball.x*=sx;this.ball.y*=sy}
    }
  }

  teamNames(team){
    const id=(team===0?this.home?.id:this.away?.id)||"";
    const map={
      zenit:["Адамов","Дркушич","Вендел","Глушенков","Соболев"],
      krasnodar:["Агкацев","Тормена","Ленини","Сперцян","Кордуоба"],
      lokomotiv:["Лантратов","Ненахов","Баринов","Батраков","Воробьёв"],
      spartak:["Максименко","Литвинов","Зобнин","Барко","Угальде"],
      cska:["Акинфеев","Дивеев","Обляков","Кисляк","Мусаев"],
      baltika:["Бориско","Осипов","Титков","Петров","Хиль"],
      "dynamo-moscow":["Лещук","Маричаль","Фомин","Карраскаль","Тюкавин"],
      rubin:["Ставер","Вуячич","Иву","Даку","Шабанхаджай"],
      akhmat:["Шелия","Семёнов","Уткин","Садулаев","Конате"],
      rostov:["Ятимов","Осипенко","Глебов","Щетинин","Комличенко"],
      krylya:["Песьяков","Солдатенков","Бабкин","Гарре","Сергеев"],
      orenburg:["Сысуев","Хотулёв","Прохин","Михайлов","Гюрлюк"],
      akron:["Волков","Бокоев","Дмитриев","Пестряков","Дзюба"],
      "dynamo-makhachkala":["Волк","Шумахов","Касинтура","Мрезиг","Агаларов"],
      rodina:["Коченков","Сокол","Калинин","Горбунов","Тимошенко"],
      fakel:["Гудиев","Брызгалов","Моцпан","Якимов","Ильин"]
    };
    return map[id]||["Вратарь","Защитник","Полузащитник","Плеймейкер","Нападающий"];
  }

  clamp01(v){return Math.max(0,Math.min(1,v))}

  setCoachInstruction(group,value){
    if(this.controlMode!=="coach")return false;

    const allowed={
      mentality:["defensive","balanced","attacking"],
      press:["low","balanced","high"],
      tempo:["slow","balanced","fast"],
      width:["narrow","balanced","wide"],
      build:["possession","balanced","direct","counter"]
    };

    if(!allowed[group]?.includes(value))return false;
    this.coachTactics[group]=value;
    return true;
  }

  triggerCoachShout(type){
    if(this.controlMode!=="coach")return false;
    const durations={attack:8,press:7,calm:8,hold:8};
    if(!durations[type])return false;
    this.coachShout=type;
    this.coachShoutTimer=durations[type];
    return true;
  }

  coachProfile(team,base){
    if(this.controlMode!=="coach"||team!==this.coachSide)return base;

    const p={...base};
    const t=this.coachTactics||{};

    if(t.mentality==="defensive"){
      p.line-=.14;p.risk-=.17;p.tempo-=.06;p.press-=.04;
    }else if(t.mentality==="attacking"){
      p.line+=.12;p.risk+=.18;p.tempo+=.08;p.press+=.06;
    }

    if(t.press==="low"){
      p.press-=.18;p.counter-=.08;p.line-=.05;
    }else if(t.press==="high"){
      p.press+=.18;p.counter+=.12;p.line+=.07;
    }

    if(t.tempo==="slow"){
      p.tempo-=.15;p.direct-=.08;p.risk-=.03;
    }else if(t.tempo==="fast"){
      p.tempo+=.14;p.direct+=.06;p.risk+=.04;
    }

    if(t.width==="narrow")p.width-=.18;
    else if(t.width==="wide")p.width+=.18;

    if(t.build==="possession"){
      p.direct-=.22;p.tempo-=.04;p.risk-=.02;
    }else if(t.build==="direct"){
      p.direct+=.22;p.tempo+=.08;p.risk+=.07;
    }else if(t.build==="counter"){
      p.counter+=.20;p.direct+=.17;p.line-=.08;p.risk+=.03;
    }

    if(this.coachShoutTimer>0){
      if(this.coachShout==="attack"){
        p.risk+=.18;p.tempo+=.12;p.line+=.08;p.direct+=.08;
      }else if(this.coachShout==="press"){
        p.press+=.24;p.counter+=.16;p.line+=.08;
      }else if(this.coachShout==="calm"){
        p.tempo-=.12;p.direct-=.10;p.risk-=.06;
      }else if(this.coachShout==="hold"){
        p.line-=.17;p.risk-=.20;p.tempo-=.08;p.press-=.04;
      }
    }

    for(const k of ["press","counter","direct","width","tempo","line","risk"]){
      p[k]=this.clamp01(p[k]);
    }
    return p;
  }

  coachLevel(team,base){
    if(this.controlMode!=="coach"||team!==this.coachSide)return base;
    const x={...base};
    const t=this.coachTactics||{};

    if(t.tempo==="fast"){
      x.decision*=.91;
      x.mistake+=.012;
    }else if(t.tempo==="slow"){
      x.decision*=1.06;
      x.composure=Math.min(.98,x.composure+.035);
      x.passAccuracy=Math.min(.98,x.passAccuracy+.018);
    }

    if(t.build==="possession"){
      x.passAccuracy=Math.min(.98,x.passAccuracy+.018);
      x.composure=Math.min(.98,x.composure+.018);
    }

    if(this.coachShoutTimer>0&&this.coachShout==="calm"){
      x.composure=Math.min(.99,x.composure+.055);
      x.mistake=Math.max(.025,x.mistake-.035);
    }

    if(this.coachShoutTimer>0&&this.coachShout==="attack"){
      x.supportRuns=Math.min(.99,x.supportRuns+.06);
      x.decision*=.94;
    }

    return x;
  }

  aiLevel(team){
    const club=team===0?this.home:this.away;
    const rating=club?.rating||72;
    const norm=Math.max(0,Math.min(1,(rating-64)/22));

    let tier="underdog";
    if(rating>=83)tier="elite";
    else if(rating>=79)tier="strong";
    else if(rating>=74)tier="average";
    else if(rating>=69)tier="developing";

    const level={
      rating,norm,tier,
      decision:1.18-norm*.36,
      passAccuracy:.76+norm*.20,
      shotAccuracy:.75+norm*.19,
      firstTouch:.70+norm*.24,
      composure:.60+norm*.34,
      pressCoordination:.52+norm*.42,
      supportRuns:.56+norm*.40,
      recovery:.65+norm*.31,
      duel:.85+norm*.19,
      keeper:.76+norm*.20,
      mistake:.17-norm*.11,
      tempo:.90+norm*.14
    };
    return this.coachLevel(team,level);
  }

  tacticalProfile(team){
    const club=team===0?this.home:this.away;
    const r=club?.rating||72,id=club?.id||"";
    const explicit=window.DB?.teamStyles?.[id];

    let out;
    if(explicit){
      out={...explicit,rating:r,reaction:Math.max(.095,.19-(r-68)*.0045)};
    }else{
      const mode=r>=80?"possession":(r<=69?"compact":"balanced");
      const base={
        possession:{press:.80,counter:.82,direct:.48,width:.73,tempo:.80,line:.72,risk:.65},
        compact:{press:.68,counter:.66,direct:.74,width:.56,tempo:.64,line:.50,risk:.43},
        balanced:{press:.74,counter:.75,direct:.62,width:.65,tempo:.73,line:.61,risk:.56}
      }[mode];
      const q=(r-68)/18;
      out={...base,mode,rating:r,reaction:Math.max(.105,.19-q*.055)};
    }

    return this.coachProfile(team,out);
  }

  rolePlan(team){
    const p=this.tacticalProfile(team);
    return [
      (p.line>.66&&p.rating>=77)?"SweeperKeeper":"Goalkeeper",
      p.mode==="possession"?"BallPlayingDefender":"Stopper",
      p.mode==="compact"?"Holding":(p.mode==="vertical"?"BoxCrasher":"DeepPlaymaker"),
      p.width>.68?"WidePlaymaker":"HalfWinger",
      p.direct>.80?"TargetForward":"AdvancedForward"
    ];
  }

  start(home,away,userSide,options={}){
    this.home=home;this.away=away;

    this.controlMode=options.mode==="coach"?"coach":"player";
    this.coachSide=Number.isInteger(options.coachSide)?options.coachSide:userSide;

    // In coach mode there is no manually controlled team/player.
    // Using a non-existent side makes both teams run through the AI path.
    this.userSide=this.controlMode==="coach"?2:userSide;
    this.coachTactics={
      mentality:"balanced",
      press:"balanced",
      tempo:"balanced",
      width:"balanced",
      build:"balanced",
      ...(options.tactics||{})
    };
    this.coachShout=null;
    this.coachShoutTimer=0;

    this.score=[0,0];this.elapsed=0;this.half=1;this.halfElapsed=0;
    this.addedMinutes=0;this.addedReal=0;this.halftimeShown=false;
    this.running=true;this.paused=false;this.matchClockRunning=false;this.stats=this.newStats();this.events=[];
    this.lastPossessionTeam=-1;this.counterPressTeam=-1;this.counterPressTimer=0;
    this.teamShotCooldown=[0,0];this.teamPhases=["DEFENSIVE_SHAPE","DEFENSIVE_SHAPE"];
    this.openingKickoffTeam=0;this.resize();this.kickoff(this.openingKickoffTeam);this.last=performance.now();
    requestAnimationFrame(t=>this.loop(t));
  }

  form(side){
    const left=[[.07,.50],[.24,.50],[.36,.30],[.36,.70],[.46,.50]];
    const roles=["GK","DEF","CM","W","ST"],nums=[1,4,6,10,9],names=this.teamNames(side),fc=this.rolePlan(side);
    return left.map((v,i)=>{
      const x=side?1-v[0]:v[0],club=side===0?this.home:this.away,q=((club?.rating||72)-68)/18;
      return {
        team:side,role:roles[i],fcRole:fc[i],x:this.W*x,y:this.H*v[1],homeX:this.W*x,homeY:this.H*v[1],
        vx:0,vy:0,r:i===0?16:14,num:nums[i],speed:(i===0?96:106+(i%2)*4)*(1+q*.018),
        accel:(i===0?580:690)*(1+q*.026),hasBall:false,decision:.24+Math.random()*.28,
        stamina:1,sent:false,contactCd:0,strength:.88+q*.09+(i===4?.05:0),name:names[i],
        anim:Math.random()*6.28,action:"idle",actionTimer:0,contactFlash:0,
        facingX:side===0?1:-1,facingY:0,turnAmount:0,touchTimer:.08+Math.random()*.16,
        touchPulse:0,dribbleLead:0,runSeed:Math.random()*6.28,runTimer:.2+Math.random()*.6,
        lowUrgency:false,keeperState:"SET",keeperReaction:0,keeperTargetY:this.H/2,
        lastShotSeen:-1,diveDir:0,keeperMissShotId:-1
      };
    });
  }

  kickoff(team){
    const oldPlayers=this.players?.length===10?this.players:null;
    const freshPlayers=[...this.form(0),...this.form(1)];

    if(oldPlayers){
      freshPlayers.forEach((p,i)=>{
        p.stamina=oldPlayers[i]?.stamina??1;
      });
    }

    this.players=freshPlayers;
    this.kickoffTeam=team;
    this.phase="kickoff";
    this.matchClockRunning=false;
    this.kickoffTimer=.66;
    this.restart=null;

    this.passCharging=false;
    this.shotCharging=false;
    this.pressAssist=false;
    this.secondPress=false;
    this.counterPressTimer=0;
    this.counterPressTeam=-1;
    this.teamPhases=["DEFENSIVE_SHAPE","DEFENSIVE_SHAPE"];

    this.ball={
      x:this.W/2,y:this.H/2,vx:0,vy:0,r:6,owner:null,lastTeam:team,state:"dead",
      pickupLock:0,ignorePlayer:-1,lastPassTeam:-1,lastPassTarget:-1,
      spin:0,spinSpeed:0,shotId:0,isShot:false,shotTeam:-1
    };

    const attackDir=team===0?1:-1;
    const passer=team===0?4:9;
    const receiver=team===0?3:8;

    this.kickoffPasser=passer;
    this.kickoffReceiver=receiver;

    this.players[passer].x=this.W/2-attackDir*15;
    this.players[passer].y=this.H/2;

    this.players[receiver].x=this.W/2-attackDir*76;
    this.players[receiver].y=this.H/2+(team===0?34:-34);

    const defendingTeam=1-team;
    const defendDir=defendingTeam===0?1:-1;
    const dST=defendingTeam===0?4:9;
    const dW=defendingTeam===0?3:8;
    const dCM=defendingTeam===0?2:7;

    this.players[dST].x=this.W/2-defendDir*90;
    this.players[dST].y=this.H/2;

    this.players[dW].x=this.W/2-defendDir*120;
    this.players[dW].y=this.H/2+(defendingTeam===0?-56:56);

    if(Math.abs(this.players[dCM].x-this.W/2)<86){
      this.players[dCM].x=this.W/2-defendDir*104;
    }

    for(const p of this.players){
      p.vx=0;p.vy=0;p.hasBall=false;p.contactCd=0;
      p.action="idle";p.actionTimer=0;p.contactFlash=0;
      p.touchPulse=0;p.touchTimer=.10+Math.random()*.10;
      p.kickoffHoldX=p.x;p.kickoffHoldY=p.y;
    }

    this.kickoffProtection=.88;
    this.kickoffReceiveTimer=.24;
    this.controlled=this.nearestUser();
    this.lastPossessionTeam=-1;
  }

  beginKickoff(){
    const passer=this.kickoffPasser;
    const receiver=this.kickoffReceiver;
    const p=this.players[passer],q=this.players[receiver];

    this.ball.state="free";
    this.ball.x=this.W/2;
    this.ball.y=this.H/2;

    const dx=q.x-this.ball.x,dy=q.y-this.ball.y,l=Math.hypot(dx,dy)||1;
    this.ball.vx=dx/l*245;
    this.ball.vy=dy/l*245;
    this.ball.lastTeam=this.kickoffTeam;
    this.ball.spinSpeed=7;
    this.ball.ignorePlayer=passer;
    this.ball.pickupLock=.20;
    this.ball.lastPassTeam=this.kickoffTeam;
    this.ball.lastPassTarget=receiver;

    p.action="passKick";
    p.actionTimer=.18;
    
    // Start football time exactly when the centre pass puts the ball in play.
    this.matchClockRunning=true;
    this.phase="open";
  }

  forceKickoffReceive(){
    const i=this.kickoffReceiver;
    const p=this.players[i];
    if(!p||this.ball.owner!==null)return;

    if(this.ball.lastPassTeam===p.team){
      this.stats[p.team].completed++;
    }

    this.ball.owner=i;
    this.ball.state="controlled";
    this.ball.vx=0;this.ball.vy=0;
    this.ball.lastPassTeam=-1;
    this.ball.lastPassTarget=-1;
    this.ball.ignorePlayer=-1;
    this.ball.pickupLock=0;

    p.hasBall=true;
    p.action="firstTouch";
    p.actionTimer=.14;

    if(p.team===this.userSide&&p.role!=="GK"){
      this.controlled=i;
    }

    this.updateTransition(p.team);
  }

  nearest(team,allowGK=false){
    let best=-1,bd=1e99;
    this.players.forEach((p,i)=>{
      if(p.team===team&&!p.sent&&(allowGK||p.role!=="GK")){
        const d=(p.x-this.ball.x)**2+(p.y-this.ball.y)**2;
        if(d<bd){bd=d;best=i}
      }
    });
    return best;
  }
  nearestUser(){return this.nearest(this.userSide)}

  updateTransition(newTeam){
    if(newTeam<0||newTeam===this.lastPossessionTeam)return;
    if(this.lastPossessionTeam>=0){
      this.counterPressTeam=this.lastPossessionTeam;
      const pf=this.tacticalProfile(this.counterPressTeam);
      const lv=this.aiLevel(this.counterPressTeam);
      this.counterPressTimer=.66+pf.counter*.72+lv.pressCoordination*.72;
    }
    this.lastPossessionTeam=newTeam;
  }

  opponentPressureAt(x,y,team,radius=72){
    return this.players.filter(q=>q.team!==team&&!q.sent&&q.role!=="GK"&&Math.hypot(q.x-x,q.y-y)<radius).length;
  }

  segmentClearance(x1,y1,x2,y2,team,ignoreGK=false){
    let min=999,blocks=0;
    for(const q of this.players){
      if(q.team===team||q.sent||(ignoreGK&&q.role==="GK"))continue;
      const vx=x2-x1,vy=y2-y1,wx=q.x-x1,wy=q.y-y1,vv=vx*vx+vy*vy||1;
      let t=(wx*vx+wy*vy)/vv;t=Math.max(0,Math.min(1,t));
      const px=x1+vx*t,py=y1+vy*t,d=Math.hypot(q.x-px,q.y-py);
      min=Math.min(min,d);if(t>.05&&t<.98&&d<q.r+10)blocks++;
    }
    return{min,blocks};
  }

  firstTouchQuality(p,speed){
    const level=this.aiLevel(p.team);
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,64);
    const facingMag=Math.hypot(p.facingX,p.facingY)||1,bv=Math.hypot(this.ball.vx,this.ball.vy)||1;
    const incomingX=-this.ball.vx/bv,incomingY=-this.ball.vy/bv;
    const facingDot=(p.facingX/facingMag)*incomingX+(p.facingY/facingMag)*incomingY;

    const pressurePenalty=pressure*(.095-level.composure*.030);
    const speedPenalty=(speed/(980+level.norm*260))*.13;

    return Math.max(.16,Math.min(.97,
      level.firstTouch+facingDot*.055-pressurePenalty-speedPenalty
    ));
  }

  claim(i,forceKeeper=false){
    const p=this.players[i];
    if(!p||p.sent||this.ball.state!=="free")return false;
    if(this.ball.pickupLock>0&&i===this.ball.ignorePlayer)return false;
    const speed=Math.hypot(this.ball.vx,this.ball.vy);

    if(this.ball.isShot && p.role!=="GK")return false;
    if(!forceKeeper&&p.role!=="GK"&&speed>115){
      const quality=this.firstTouchQuality(p,speed);
      if(Math.random()>quality){
        const ang=Math.atan2(this.ball.vy,this.ball.vx)+(Math.random()-.5)*.65,out=Math.max(55,speed*(.28+Math.random()*.18));
        this.ball.vx=Math.cos(ang)*out;this.ball.vy=Math.sin(ang)*out;this.ball.spinSpeed*=.65;
        p.action="firstTouchBad";p.actionTimer=.20;p.contactFlash=.10;return false;
      }
      p.action="firstTouch";p.actionTimer=.15;
    }
    if(this.ball.lastPassTeam===p.team&&this.ball.lastPassTarget===i){
      this.stats[p.team].completed++;this.ball.lastPassTeam=-1;this.ball.lastPassTarget=-1;
    }else if(this.ball.lastPassTeam>=0&&this.ball.lastPassTeam!==p.team){
      this.ball.lastPassTeam=-1;this.ball.lastPassTarget=-1;
    }
    if(this.ball.owner!==null&&this.players[this.ball.owner])this.players[this.ball.owner].hasBall=false;
    this.ball.owner=i;p.hasBall=true;this.ball.vx=this.ball.vy=0;this.ball.state="controlled";this.ball.ignorePlayer=-1;
    this.ball.isShot=false;p.touchTimer=.05;p.touchPulse=0;
    if(p.team===this.userSide&&p.role!=="GK")this.controlled=i;
    this.updateTransition(p.team);return true;
  }

  release(i,vx,vy,passTarget=-1,isPass=false,isShot=false){
    const p=this.players[i];if(!p)return;
    p.hasBall=false;this.ball.owner=null;this.ball.state="free";
    const mag=Math.hypot(vx,vy)||1,ux=vx/mag,uy=vy/mag;
    this.ball.x=p.x+ux*(p.r+9);this.ball.y=p.y+uy*(p.r+9);
    this.ball.vx=vx;this.ball.vy=vy;this.ball.lastTeam=p.team;this.ball.ignorePlayer=i;this.ball.pickupLock=.20;
    this.ball.spinSpeed=Math.min(24,mag/20)*(vy>=0?1:-1);
    if(isPass){this.stats[p.team].passes++;this.ball.lastPassTeam=p.team;this.ball.lastPassTarget=passTarget}
    if(isShot){this.shotSerial++;this.ball.shotId=this.shotSerial;this.ball.isShot=true;this.ball.shotTeam=p.team}
  }

  aimDirection(p){
    const m=Math.hypot(this.joy.x,this.joy.y);
    if(m>.18)return{x:this.joy.x/m,y:this.joy.y/m};
    return{x:p.team===0?1:-1,y:0};
  }

  bestPass(i,through=false){
    const p=this.players[i],aim=this.aimDirection(p),profile=this.tacticalProfile(p.team);
    let best=null,bs=-1e9;
    this.players.forEach((q,j)=>{
      if(j===i||q.team!==p.team||q.role==="GK"||q.sent)return;
      const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
      const directional=ux*aim.x+uy*aim.y,forward=(p.team===0?dx:-dx);
      const pressure=this.opponentPressureAt(q.x,q.y,p.team,74),lane=this.segmentClearance(p.x,p.y,q.x,q.y,p.team,true);
      const level=this.aiLevel(p.team);
      let score=
        directional*(232+level.norm*38)+
        Math.max(0,forward)*(through?.38:.13)-
        d*.17-
        pressure*(80+level.norm*30)-
        lane.blocks*(138+level.norm*62)+
        Math.min(60,lane.min)*(.80+level.norm*.25)+
        level.supportRuns*20;
      if(q.fcRole==="AdvancedForward")score+=through?78:36;
      if(["HalfWinger","WidePlaymaker"].includes(q.fcRole))score+=profile.width*38;
      if(["DeepPlaymaker","Holding"].includes(q.fcRole))score+=profile.mode==="possession"?40:12;
      if(score>bs){bs=score;best={j,x:q.x+(p.team===0?1:-1)*(through?92:22)+q.vx*.30,y:q.y+q.vy*.30}}
    });
    return best;
  }

  startPassCharge(){
    if(this.ball.owner===this.controlled){
      this.passCharging=true;this.passCharge=0;
      const p=this.players[this.controlled];p.action="passPrep";p.actionTimer=9;
    }
  }

  releasePass(through=false){
    if(!this.passCharging||this.ball.owner!==this.controlled){this.passCharging=false;return}
    const t=this.bestPass(this.controlled,through);this.passCharging=false;if(!t)return;
    const p=this.players[this.controlled],dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
    const charge=Math.max(.12,Math.min(1,this.passCharge)),rating=(p.team===0?this.home.rating:this.away.rating)||72;
    const level=this.aiLevel(p.team);
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,65);
    const passError=(1-level.passAccuracy)*.050+pressure*(.0051-level.composure*.0015);
    const err=Math.max(.0021,passError)*(Math.random()-.5);
    const ang=Math.atan2(dy,dx)+err,pow=(through?325:240)+(through?205:215)*charge;
    p.action="passKick";p.actionTimer=.18;
    this.release(this.controlled,Math.cos(ang)*pow,Math.sin(ang)*pow,t.j,true,false);
  }

  shotBlockRadius(p){
    // The visual token is deliberately larger than a footballer's actual blocking body.
    // Using the full circle made one defender cover the entire goal.
    return p.r*.48 + this.ball.r + 1;
  }

  shotLaneAnalysis(shooter,gx,gy){
    const team=shooter.team;
    const vx=gx-shooter.x,vy=gy-shooter.y,len=Math.hypot(vx,vy)||1;
    const totalTime=len/500;

    let minGap=999;
    let hardBlocks=0;
    let nearestBlocker=null;

    for(const q of this.players){
      if(q.team===team||q.sent||q.role==="GK")continue;

      const wx=q.x-shooter.x,wy=q.y-shooter.y;
      let t=(wx*vx+wy*vy)/(len*len);
      if(t<=.04||t>=.98)continue;

      const arrival=Math.max(0,Math.min(totalTime,totalTime*t));
      const futureX=q.x+q.vx*arrival*.35;
      const futureY=q.y+q.vy*arrival*.35;

      const fx=futureX-shooter.x,fy=futureY-shooter.y;
      let ft=(fx*vx+fy*vy)/(len*len);
      ft=Math.max(.04,Math.min(.98,ft));

      const px=shooter.x+vx*ft,py=shooter.y+vy*ft;
      const dist=Math.hypot(futureX-px,futureY-py);
      const gap=dist-this.shotBlockRadius(q);

      if(gap<minGap){minGap=gap;nearestBlocker=q}
      if(gap<0)hardBlocks++;
    }

    return {minGap,hardBlocks,nearestBlocker};
  }

  chooseGoalTarget(i){
    const p=this.players[i];
    const team=p.team;
    const gx=team===0?this.W+24:-24;
    const gt=this.H*.39,gb=this.H*.61;
    const margin=this.ball.r+2;

    const keeper=this.players.find(q=>q.team!==team&&q.role==="GK"&&!q.sent);
    const keeperRating=((team===0?this.away.rating:this.home.rating)||72);

    const candidates=[];
    const steps=26;
    for(let n=0;n<=steps;n++){
      candidates.push((gt+margin)+(gb-gt-margin*2)*(n/steps));
    }

    let bestY=this.H/2;
    let bestScore=-1e12;
    let bestMeta=null;

    for(const y of candidates){
      let keeperGap=120;
      if(keeper){
        const distToGoal=Math.hypot(gx-p.x,y-p.y);
        const travel=distToGoal/520;
        const predictedY=keeper.y+keeper.vy*Math.min(.40,travel)*.26;
        const targetingCoverage=keeper.r+4+Math.max(0,keeperRating-70)*.12;
        keeperGap=Math.abs(y-predictedY)-targetingCoverage;
      }

      const insidePost=Math.min(y-(gt+margin),(gb-margin)-y);
      const farPostBonus=(p.y<this.H/2 ? y>this.H/2 : y<this.H/2)?25:0;
      const cornerBonus=Math.abs(y-this.H/2)/(gb-gt)*24;

      const score=
        keeperGap*12.0 +
        insidePost*.18 +
        farPostBonus +
        cornerBonus +
        (Math.random()-.5)*2;

      if(score>bestScore){
        bestScore=score;bestY=y;bestMeta={keeperGap};
      }
    }

    return {gx,gy:bestY,score:bestScore,meta:bestMeta};
  }

  startShotCharge(){
    if(this.ball.owner===this.controlled){
      this.shotCharging=true;this.shotCharge=0;
      const p=this.players[this.controlled];p.action="shootPrep";p.actionTimer=9;
    }
  }

  releaseShot(){
    if(!this.shotCharging||this.ball.owner!==this.controlled){this.shotCharging=false;return}
    this.shotCharging=false;
    const p=this.players[this.controlled],rating=(p.team===0?this.home.rating:this.away.rating)||72;
    const level=this.aiLevel(p.team);
    const target=this.chooseGoalTarget(this.controlled),pressure=this.opponentPressureAt(p.x,p.y,p.team,68);
    const dx=target.gx-p.x,dy=target.gy-p.y,l=Math.hypot(dx,dy)||1,charge=Math.max(.18,Math.min(1,this.shotCharge));
    const error=Math.max(.0014,
      (1-level.shotAccuracy)*.038+
      pressure*(.0041-level.composure*.0015)
    );
    const angle=Math.atan2(dy,dx)+(Math.random()-.5)*error;
    this.stats[p.team].shots++;this.stats[p.team].onTarget++;
    this.events.push({half:this.half,minute:this.displayMinute(),type:"Удар",team:p.team,text:`${p.name} пробил по воротам`});
    p.action="shootKick";p.actionTimer=.22;
    this.release(this.controlled,Math.cos(angle)*(365+235*charge),Math.sin(angle)*(365+235*charge),-1,false,true);
    this.ball.shotTargetY=target.gy;
    this.teamShotCooldown[p.team]=2.9;
  }

  duelChance(defender,carrier,explicit=false){
    const dRating=(defender.team===0?this.home.rating:this.away.rating)||72,cRating=(carrier.team===0?this.home.rating:this.away.rating)||72;
    const dx=defender.x-carrier.x,dy=defender.y-carrier.y,l=Math.hypot(dx,dy)||1,nx=dx/l,ny=dy/l;
    const front=nx*carrier.facingX+ny*carrier.facingY,ds=Math.hypot(defender.vx,defender.vy),cs=Math.hypot(carrier.vx,carrier.vy);
    const angleBonus=front>.35?.13:(front<-.30?-.18:0),strength=(defender.strength-carrier.strength)*.42;
    const dLevel=this.aiLevel(defender.team),cLevel=this.aiLevel(carrier.team);
    const iq=(dLevel.duel-cLevel.duel)*.24;
    return Math.max(.14,Math.min(.84,
      .46+angleBonus+strength+iq+(dRating-cRating)*.0035+(ds-cs)*.0006+(explicit?.11:0)
    ));
  }

  attemptDuel(defenderIdx,carrierIdx,explicit=false){
    const d=this.players[defenderIdx],c=this.players[carrierIdx];
    if(!d||!c||d.sent||c.sent||d.contactCd>0)return false;
    d.contactCd=explicit?.34:.62;c.contactCd=Math.max(c.contactCd,.14);d.action="contact";d.actionTimer=.16;c.contactFlash=.13;
    if(Math.random()<this.duelChance(d,c,explicit)){
      c.hasBall=false;this.ball.owner=null;this.ball.state="free";
      const vx=this.ball.x-d.x,vy=this.ball.y-d.y,l=Math.hypot(vx,vy)||1,side=Math.random()<.5?-1:1;
      this.ball.x=c.x+c.facingX*(c.r+7);this.ball.y=c.y+c.facingY*(c.r+7);
      this.ball.vx=(vx/l)*125-c.facingY*side*70;this.ball.vy=(vy/l)*125+c.facingX*side*70;
      this.ball.lastTeam=d.team;this.ball.ignorePlayer=defenderIdx;this.ball.pickupLock=.10;this.ball.spinSpeed=10*side;
      this.stats[d.team].tackles++;c.action="contactLost";c.actionTimer=.18;return true;
    }
    const side=d.y<c.y?1:-1,tangentX=-c.facingY*side,tangentY=c.facingX*side;
    c.vx+=tangentX*62;c.vy+=tangentY*62;c.action="shield";c.actionTimer=.20;
    d.vx-=tangentX*28;d.vy-=tangentY*28;return false;
  }

  tackle(){
    const p=this.players[this.controlled];if(!p||p.contactCd>0)return;
    const owner=this.ball.owner;if(owner===null)return;const o=this.players[owner];
    if(!o||o.team===p.team||Math.hypot(p.x-o.x,p.y-o.y)>45)return;
    this.attemptDuel(this.controlled,owner,true);
  }

  switch(){
    if(this.ball.owner===this.controlled)return;
    const arr=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)}))
      .filter(o=>o.p.team===this.userSide&&o.p.role!=="GK"&&!o.p.sent).sort((a,b)=>a.d-b.d);
    if(!arr.length)return;const k=arr.findIndex(o=>o.i===this.controlled);
    this.controlled=arr[(k+1)%Math.min(4,arr.length)].i;
  }

  separation(p){
    let sx=0,sy=0,n=0;
    for(const q of this.players){
      if(q===p||q.sent)continue;
      const dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy),safe=p.r+q.r+(q.team===p.team?30:7);
      if(d>0&&d<safe*1.6){const w=(safe*1.6-d)/(safe*1.6);sx+=(dx/d)*w;sy+=(dy/d)*w;n++}
    }
    return n?{x:sx/n,y:sy/n}:{x:0,y:0};
  }

  steer(p,tx,ty,dt,mul=1,urgency=1){
    const sep=this.separation(p);tx+=sep.x*50;ty+=sep.y*50;
    const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy),desired=Math.min(p.speed*mul*urgency,d*4.3);
    const dvx=(d?dx/d:0)*desired-p.vx,dvy=(d?dy/d:0)*desired-p.vy,dl=Math.hypot(dvx,dvy)||1,max=p.accel*dt;
    p.vx+=dvx/dl*Math.min(max,dl);p.vy+=dvy/dl*Math.min(max,dl);
  }

  updateFacing(p,dt){
    const sp=Math.hypot(p.vx,p.vy);
    if(sp>12){
      const nx=p.vx/sp,ny=p.vy/sp,dot=p.facingX*nx+p.facingY*ny;
      p.turnAmount=Math.max(0,1-dot);
      const blend=Math.min(1,dt*(p.turnAmount>.5?7:4));
      p.facingX=p.facingX*(1-blend)+nx*blend;p.facingY=p.facingY*(1-blend)+ny*blend;
      const fl=Math.hypot(p.facingX,p.facingY)||1;p.facingX/=fl;p.facingY/=fl;
    }else p.turnAmount*=Math.pow(.05,dt);
    if(p.actionTimer>0){p.actionTimer-=dt;if(p.actionTimer<=0)p.action="idle"}
    p.contactFlash=Math.max(0,p.contactFlash-dt);
    const speed=Math.hypot(p.vx,p.vy);p.anim+=dt*(speed<20?1.7:3.2+speed/42);
  }

  updateControlledBall(p,dt){
    const speed=Math.hypot(p.vx,p.vy);p.touchTimer-=dt;
    if(p.touchTimer<=0&&speed>18){
      const sprinting=(p.team===this.userSide&&p===this.players[this.controlled]&&this.sprint)||speed>p.speed*.88;
      p.touchTimer=sprinting?.34:.23;p.touchPulse=1;p.dribbleLead=(sprinting?21:11)+speed*.035;
      p.action=sprinting?"sprintTouch":"dribbleTouch";p.actionTimer=.10;this.ball.spinSpeed+=(sprinting?5:3)*(p.facingY>=0?1:-1);
    }
    p.touchPulse=Math.max(0,p.touchPulse-dt*(p.touchTimer>.28?2.2:4.8));
    const lead=p.r+5+p.dribbleLead*p.touchPulse,tx=p.x+p.facingX*lead,ty=p.y+p.facingY*lead;
    const follow=Math.min(1,dt*(p.touchPulse>.25?15:22));
    this.ball.x+=(tx-this.ball.x)*follow;this.ball.y+=(ty-this.ball.y)*follow;
    if(speed<14){
      const ix=p.x+p.facingX*(p.r+5),iy=p.y+p.facingY*(p.r+5);
      this.ball.x+=(ix-this.ball.x)*Math.min(1,dt*18);this.ball.y+=(iy-this.ball.y)*Math.min(1,dt*18);
    }
  }

  predictGoalCross(team){
    if(this.ball.owner!==null||!this.ball.isShot)return null;
    const goalX=team===0?15:this.W-15,vx=this.ball.vx;
    if((team===0&&vx>=-20)||(team===1&&vx<=20))return null;
    const t=(goalX-this.ball.x)/vx;if(t<=0||t>1.5)return null;
    return{t,y:this.ball.y+this.ball.vy*t};
  }

  keeperAI(p,i,dt){
    const profile=this.tacticalProfile(p.team),level=this.aiLevel(p.team),rating=profile.rating,gx=p.team===0?38:this.W-38;
    const owner=this.ball.owner!==null?this.players[this.ball.owner]:null,cross=this.predictGoalCross(p.team);
    const oppOwner=owner&&owner.team!==p.team?owner:null;
    const oneVOne=oppOwner&&(p.team===0?oppOwner.x<this.W*.29:oppOwner.x>this.W*.71)&&Math.abs(oppOwner.y-this.H/2)<this.H*.27;

    if(this.ball.shotId!==p.lastShotSeen&&cross){
      p.lastShotSeen=this.ball.shotId;p.keeperReaction=Math.max(.085,.335-level.keeper*.165);
      p.keeperTargetY=Math.max(this.H*.36,Math.min(this.H*.64,cross.y));
      p.keeperState="READY";p.action="keeperReady";p.actionTimer=.25;
    }

    if(oneVOne){
      p.keeperState="1V1";const dir=p.team===0?1:-1,depth=Math.min(50,Math.max(18,Math.abs(oppOwner.x-gx)*.18));
      this.steer(p,gx+dir*depth,Math.max(this.H*.38,Math.min(this.H*.62,oppOwner.y)),dt,1.04+(rating-72)*.004,1);
    }else if(cross){
      if(p.keeperReaction>0){p.keeperReaction-=dt;p.keeperState="READY";this.steer(p,gx,p.keeperTargetY,dt,.72,1)}
      else{p.keeperState="DIVE";p.diveDir=Math.sign(p.keeperTargetY-p.y);this.steer(p,gx+(p.team===0?8:-8),p.keeperTargetY,dt,1.07+level.keeper*.13,1)}
    }else{
      const danger=p.team===0?this.ball.x<this.W*.34:this.ball.x>this.W*.66;
      p.keeperState=danger?"ADJUST":"SET";let tx=gx,ty=Math.max(this.H*.38,Math.min(this.H*.62,this.ball.y));
      if(danger)tx+=p.team===0?34:-34;
      if(p.fcRole==="SweeperKeeper"&&this.ball.owner===null){
        const channel=p.team===0?this.ball.x<this.W*.30:this.ball.x>this.W*.70;if(channel)tx+=p.team===0?22:-22;
      }
      this.steer(p,tx,ty,dt,1.04+(rating-72)*.006,1);
    }

    if(this.ball.owner===i){
      p.keeperState="SET";p.decision-=dt;
      if(p.decision<=0){
        p.decision=.46+Math.random()*.20;
        const mates=this.players.filter(q=>q.team===p.team&&q.role!=="GK"&&!q.sent)
          .sort((a,b)=>this.opponentPressureAt(a.x,a.y,p.team)-this.opponentPressureAt(b.x,b.y,p.team));
        const safe=mates[0];
        if(safe){
          const dx=safe.x-p.x,dy=safe.y-p.y,l=Math.hypot(dx,dy)||1;p.action="passKick";p.actionTimer=.18;
          this.release(i,dx/l*(320+(rating-72)*2.1),dy/l*(320+(rating-72)*2.1),this.players.indexOf(safe),true,false);
        }
      }
    }
  }

  keeperSaveContacts(){
    if(this.ball.owner!==null||this.ball.state!=="free")return;
    const speed=Math.hypot(this.ball.vx,this.ball.vy);
    for(let i=0;i<this.players.length;i++){
      const p=this.players[i];if(p.role!=="GK"||p.sent)continue;
      const rating=(p.team===0?this.home.rating:this.away.rating)||72;
      const level=this.aiLevel(p.team);
      const reach=p.r+this.ball.r+
        (p.keeperState==="DIVE"?(2+level.keeper*3):(p.keeperState==="1V1"?(2+level.keeper*2):1));
      if(Math.hypot(p.x-this.ball.x,p.y-this.ball.y)>reach)continue;
      const shotAgainst=this.ball.isShot&&this.ball.shotTeam!==p.team;
      if(!shotAgainst&&speed>440)continue;

      // A keeper who gets near the ball is not guaranteed to save it.
      // Edge-of-reach, high-speed shots can beat him cleanly.
      if(shotAgainst){
        if(p.keeperMissShotId===this.ball.shotId)continue;
        const dist=Math.hypot(p.x-this.ball.x,p.y-this.ball.y);
        const edge=Math.max(0,Math.min(1,dist/reach));
        const touchChance=Math.max(.25,Math.min(.79,
          .41+level.keeper*.28+(1-edge)*.12-Math.max(0,speed-340)/1120
        ));
        if(Math.random()>touchChance){
          p.keeperMissShotId=this.ball.shotId;
          p.action="keeperMiss";p.actionTimer=.20;
          continue;
        }
      }

      const catchChance=Math.max(.04,Math.min(.52,
        .16+level.keeper*.28-speed/900+(p.keeperState==="SET"?.03:0)
      ));
      if(Math.random()<catchChance){
        p.action="keeperCatch";p.actionTimer=.30;p.keeperState="SAVE";this.claim(i,true);this.ball.spinSpeed=0;
      }else{
        p.action="keeperParry";p.actionTimer=.28;p.keeperState="SAVE";
        const awayX=p.team===0?1:-1,safeSide=this.ball.y<this.H/2?-1:1;
        const goodParry=Math.random()<Math.max(.34,Math.min(.76,.49+(rating-72)*.014));
        this.ball.owner=null;this.ball.state="free";this.ball.isShot=false;
        this.ball.vx=awayX*(210+speed*.22);this.ball.vy=(goodParry?safeSide:(Math.random()-.5))*Math.min(250,120+speed*.25);
        this.ball.lastTeam=p.team;this.ball.spinSpeed*=.65;
      }
      return;
    }
  }

  teamPhase(team){
    const owner=this.ball.owner!==null?this.players[this.ball.owner]:null;
    if(owner&&owner.team===team){
      const progress=team===0?owner.x/this.W:1-owner.x/this.W;
      if(progress<.34)return"BUILD_UP";if(progress<.62)return"PROGRESS";if(progress<.78)return"FINAL_THIRD";return"CHANCE";
    }
    if(this.counterPressTeam===team&&this.counterPressTimer>0)return"COUNTER_PRESS";
    return"DEFENSIVE_SHAPE";
  }

  getCarrier(){return this.ball.owner!==null?this.players[this.ball.owner]:null}

  offBallRunTarget(p,carrier){
    const dir=p.team===0?1:-1,profile=this.tacticalProfile(p.team),phase=this.teamPhases[p.team],level=this.aiLevel(p.team);
    p.runTimer-=1/60;
    if(p.runTimer<=0){
      p.runTimer=(.64-level.supportRuns*.25)+Math.random()*(.84-level.supportRuns*.24);
      p.runSeed+=1.08+level.supportRuns*.58+Math.random()*.52;
    }
    let x=p.homeX,y=p.homeY;
    if(p.fcRole==="BallPlayingDefender"){x=carrier.x-dir*(105+profile.risk*20);y=this.H/2+(p.homeY-this.H/2)*.35}
    else if(p.fcRole==="Stopper"){x=carrier.x-dir*125;y=this.H/2}
    else if(p.fcRole==="Holding"){x=carrier.x-dir*(72+profile.direct*20);y=this.H/2+(p.homeY-this.H/2)*.50}
    else if(p.fcRole==="DeepPlaymaker"){x=carrier.x-dir*42;y=carrier.y+(p.homeY-this.H/2)*.52}
    else if(p.fcRole==="BoxCrasher"){x=carrier.x+dir*((phase==="FINAL_THIRD"||phase==="CHANCE")?92:38);y=this.H/2+Math.sin(p.runSeed)*this.H*.12}
    else if(p.fcRole==="WidePlaymaker"){
      const edge=.50-(.18+profile.width*.18);
      x=carrier.x+dir*(78+profile.tempo*28);
      y=this.H*(p.homeY<this.H/2?edge:1-edge);
    }
    else if(p.fcRole==="HalfWinger"){
      const half=.50-(.08+profile.width*.09);
      x=carrier.x+dir*(92+profile.tempo*30);
      y=this.H*(p.homeY<this.H/2?half:1-half);
    }
    else if(p.fcRole==="AdvancedForward"){x=carrier.x+dir*(145+profile.direct*42);y=this.H*(Math.sin(p.runSeed)>0?.40:.60)}
    else if(p.fcRole==="TargetForward"){x=carrier.x+dir*(105+profile.direct*24);y=this.H/2+Math.sin(p.runSeed)*this.H*.06}
    return{x,y};
  }

  defensiveTarget(p,rank,carrier){
    const team=p.team,dir=team===0?1:-1,profile=this.tacticalProfile(team),phase=this.teamPhases[team];
    if(rank===0)return{x:this.ball.x-dir*9,y:this.ball.y};
    if(rank===1&&(phase==="COUNTER_PRESS"||profile.press>.80))return{x:this.ball.x-dir*(54+profile.press*18),y:this.ball.y+(p.homeY-this.H/2)*.28};
    const opps=this.players.filter(q=>q.team!==team&&q.role!=="GK"&&!q.sent&&q!==carrier);
    let mark=null,bd=1e9;
    for(const q of opps){let bias=Math.hypot(q.x-p.homeX,q.y-p.homeY);if(q.fcRole==="AdvancedForward")bias-=18;if(bias<bd){bd=bias;mark=q}}
    if(mark&&p.fcRole!=="TargetForward"&&p.fcRole!=="AdvancedForward")return{x:mark.x-dir*(p.fcRole==="Stopper"?25:38),y:mark.y+(p.homeY-this.H/2)*.13};
    const shift=(this.ball.x-this.W/2)*(profile.line*.30);
    return{x:p.homeX+shift*.58,y:this.H/2+(p.homeY-this.H/2)*.68+(this.ball.y-this.H/2)*.10};
  }

  shotQuality(i){
    const p=this.players[i],gx=p.team===0?this.W:0,dist=Math.abs(gx-p.x);
    const central=1-Math.min(1,Math.abs(p.y-this.H/2)/(this.H*.32));
    const lane=this.segmentClearance(p.x,p.y,gx,this.H/2,p.team,true),pressure=this.opponentPressureAt(p.x,p.y,p.team,68);
    return(1-Math.min(1,dist/(this.W*.52)))*.56+central*.27+Math.min(1,lane.min/70)*.20-pressure*.10-Math.min(2,lane.blocks)*.12;
  }

  aiCarrier(p,i,dt){
    const profile=this.tacticalProfile(p.team),level=this.aiLevel(p.team),dir=p.team===0?1:-1;
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,72),quality=this.shotQuality(i),progress=p.team===0?p.x/this.W:1-p.x/this.W;

    p.decision-=dt;
    if(p.decision<=0){
      p.decision=Math.max(.20,
        (.66-profile.tempo*.15)*level.decision+
        Math.random()*(.23-level.norm*.075)
      );

      const shootingProgress=.67-level.norm*.07-profile.risk*.055;
      const shootingThreshold=.205-level.norm*.10-profile.risk*.075;

      if(this.teamShotCooldown[p.team]<=0 &&
         progress>shootingProgress &&
         quality>shootingThreshold){
        this.aiShoot(i);return;
      }

      const throughChance=.10+profile.direct*.18+level.norm*.12;
      const through=profile.direct>.56&&progress>.34&&Math.random()<throughChance;
      const pass=this.bestPass(i,through);

      const mustRelease=
        pressure>=(level.composure>.82?2:1) ||
        (progress>.72&&quality<.32);

      let circulate=profile.mode==="possession"?.43:.27;
      circulate+=level.norm*.18;
      circulate+=(1-profile.direct)*.10;

      if(pass&&(mustRelease||Math.random()<circulate)){
        this.aiPass(i,through);return;
      }

      // Developing/underdog clubs occasionally need one extra touch under pressure.
      if(level.mistake>.07&&pressure>0&&Math.random()<level.mistake*.35){
        p.decision+=.15+Math.random()*.14;
      }
    }

    const laneY=p.fcRole==="WidePlaymaker"?p.homeY:this.H/2+(p.y-this.H/2)*.66;
    const drive=progress<.76?88+profile.tempo*28+level.norm*14:58+level.norm*10;
    this.steer(p,p.x+dir*drive,laneY,dt,
      (.96+profile.tempo*.07)*level.tempo,1
    );
  }

  ai(p,i,dt){
    if(p.sent)return;
    const team=p.team,profile=this.tacticalProfile(team),level=this.aiLevel(team),carrier=this.getCarrier(),own=carrier&&carrier.team===team;

    if(this.kickoffProtection>0 && team!==this.kickoffTeam){
      const hx=p.kickoffHoldX??p.homeX;
      const hy=p.kickoffHoldY??p.homeY;
      this.steer(p,hx,hy,dt,.78,.72);
      return;
    }
    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.lastPassTeam===team&&this.ball.lastPassTarget===i){
      this.steer(p,this.ball.x+this.ball.vx*.17,this.ball.y+this.ball.vy*.17,dt,1.10+profile.tempo*.06,1);return;
    }
    if(own&&i===this.ball.owner){this.aiCarrier(p,i,dt);return}
    const field=this.players.filter(q=>q.team===team&&!q.sent&&q.role!=="GK");
    const ranks=[...field].sort((a,b)=>Math.hypot(a.x-this.ball.x,a.y-this.ball.y)-Math.hypot(b.x-this.ball.x,b.y-this.ball.y));
    let rank=ranks.indexOf(p);
    if(own&&carrier){
      const t=this.offBallRunTarget(p,carrier);
      const involved=Math.hypot(p.x-carrier.x,p.y-carrier.y)<this.W*.34||["AdvancedForward","HalfWinger","WidePlaymaker","BoxCrasher"].includes(p.fcRole);
      p.lowUrgency=!involved;
      const supportMul=.82+profile.tempo*.10+level.supportRuns*.12;
      this.steer(p,t.x,t.y,dt,supportMul,involved?1:(.42+level.supportRuns*.18));
      return;
    }
    if(team===this.userSide&&this.secondPress&&rank===1)rank=0;
    const t=this.defensiveTarget(p,rank,carrier),involved=rank<=1||Math.hypot(p.x-this.ball.x,p.y-this.ball.y)<this.W*.28;
    p.lowUrgency=!involved;
    const pressIQ=level.pressCoordination;
    let mul=.75+profile.press*.14+pressIQ*.14;
    if(rank===0)mul=.98+profile.press*.12+pressIQ*.19;
    else if(rank===1&&this.teamPhases[team]==="COUNTER_PRESS")mul=.84+pressIQ*.19;
    this.steer(p,t.x,t.y,dt,mul,involved?1:(.44+level.recovery*.14));

    // FC-like active pressure: an AI presser actually attempts the duel
    // when he reaches the carrier, instead of waiting for perfect circle overlap.
    if(carrier&&carrier.team!==team&&rank===0&&p.contactCd<=0){
      const carrierIdx=this.ball.owner;
      const duelDist=p.r+carrier.r+(8+level.pressCoordination*7);
      if(carrierIdx!==null&&Math.hypot(p.x-carrier.x,p.y-carrier.y)<duelDist){
        this.attemptDuel(i,carrierIdx,false);
      }
    }
  }

  aiPass(i,through=false){
    const t=this.bestPass(i,through);if(!t)return;
    const p=this.players[i],rating=(p.team===0?this.home.rating:this.away.rating)||72,level=this.aiLevel(p.team);
    const dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1,pressure=this.opponentPressureAt(p.x,p.y,p.team,70);

    const errBase=(1-level.passAccuracy)*.046+pressure*(.0048-level.composure*.0014);
    const err=Math.max(.0020,errBase)*(Math.random()-.5),ang=Math.atan2(dy,dx)+err;

    p.action="passKick";p.actionTimer=.17;
    const pow=(through?382:310)+(rating-72)*1.25;
    this.release(i,Math.cos(ang)*pow,Math.sin(ang)*pow,t.j,true,false);
  }

  aiShoot(i){
    const p=this.players[i],rating=(p.team===0?this.home.rating:this.away.rating)||72,target=this.chooseGoalTarget(i),level=this.aiLevel(p.team);
    const dx=target.gx-p.x,dy=target.gy-p.y,l=Math.hypot(dx,dy)||1,pressure=this.opponentPressureAt(p.x,p.y,p.team,68);

    const error=Math.max(.0014,
      (1-level.shotAccuracy)*.038+
      pressure*(.0040-level.composure*.0015)
    );
    const angle=Math.atan2(dy,dx)+(Math.random()-.5)*error;

    this.stats[p.team].shots++;this.stats[p.team].onTarget++;
    this.events.push({half:this.half,minute:this.displayMinute(),type:"Удар",team:p.team,text:`${p.name} пробил по воротам`});
    p.action="shootKick";p.actionTimer=.21;

    const pow=532+level.norm*32;
    this.release(i,Math.cos(angle)*pow,Math.sin(angle)*pow,-1,false,true);
    this.ball.shotTargetY=target.gy;
    this.teamShotCooldown[p.team]=3.70-level.norm*.78;
  }

  setRestart(type,team,x,y){
    if(this.restart)return;

    if(this.ball.owner!==null&&this.players[this.ball.owner]){
      this.players[this.ball.owner].hasBall=false;
    }

    this.ball.owner=null;
    this.ball.vx=0;this.ball.vy=0;
    this.ball.x=x;this.ball.y=y;
    this.ball.state="restart";
    this.ball.isShot=false;
    this.ball.pickupLock=.20;
    this.ball.ignorePlayer=-1;

    let thrower=-1;
    if(type==="throw"){
      const candidates=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-x,p.y-y)}))
        .filter(o=>o.p.team===team&&o.p.role!=="GK"&&!o.p.sent)
        .sort((a,b)=>a.d-b.d);
      thrower=candidates[0]?.i??-1;
    }

    this.restart={
      type,team,x,y,thrower,
      stage:type==="throw"?"approach":"wait",
      age:0,stageAge:0
    };

    if(type==="corner")this.stats[team].corners++;
  }

  forceRestartRelease(r){
    // Absolute safety net: no restart may lock the match.
    const dir=r.team===0?1:-1;
    const inwardY=r.y<=this.H/2?1:-1;

    this.restart=null;
    this.ball.state="free";
    this.ball.owner=null;
    this.ball.lastTeam=r.team;
    this.ball.pickupLock=.14;
    this.ball.ignorePlayer=r.thrower??-1;

    if(r.type==="throw"){
      this.ball.x=Math.max(34,Math.min(this.W-34,r.x));
      this.ball.y=r.y<=31?32:this.H-32;
      this.ball.vx=dir*(175+Math.random()*35);
      this.ball.vy=inwardY*(120+Math.random()*45);
      this.ball.spinSpeed=8*inwardY;
    }else{
      this.ball.vx=dir*315;
      this.ball.vy=(Math.random()-.5)*105;
      this.ball.spinSpeed=9;
    }
    this.phase="open";
  }

  updateRestartSupport(dt){
    const r=this.restart;
    if(!r)return;

    const B={l:30,r:this.W-30,t:30,b:this.H-30};

    for(let i=0;i<this.players.length;i++){
      const p=this.players[i];
      if(p.sent||i===r.thrower)continue;

      let tx=p.homeX;
      let ty=p.homeY;

      if(r.type==="throw"){
        tx+=(r.x-this.W/2)*.10;

        if(p.team===r.team && p.role!=="GK"){
          const side=p.homeY<this.H/2?-1:1;
          tx=r.x+(p.team===0?1:-1)*(64+(i%2)*24);
          ty=this.H/2+side*(46+(i%3)*18);
        }
      }

      this.steer(p,tx,ty,dt,.62,.66);
      p.x=Math.max(B.l+2,Math.min(B.r-2,p.x+p.vx*dt));
      p.y=Math.max(B.t+2,Math.min(B.b-2,p.y+p.vy*dt));
      this.updateFacing(p,dt);
    }
  }

  updateRestart(dt){
    const r=this.restart;
    if(!r){
      this.ball.state="free";
      this.phase="open";
      return;
    }

    r.age+=dt;
    r.stageAge+=dt;

    // Global watchdog: even in an unexpected geometry/state, resume play.
    if(r.age>1.20){
      this.forceRestartRelease(r);
      return;
    }

    if(r.type==="throw"&&r.stage==="approach"){
      const p=this.players[r.thrower];
      if(!p){
        r.stage="throw";r.stageAge=0;
        return;
      }

      const targetX=Math.max(34,Math.min(this.W-34,r.x));
      const targetY=r.y<=31?39:this.H-39;
      const dx=targetX-p.x,dy=targetY-p.y,d=Math.hypot(dx,dy);

      // Direct movement avoids collision/steering deadlocks.
      if(d>1){
        const step=Math.min(d,205*dt);
        p.x+=dx/d*step;
        p.y+=dy/d*step;
        p.facingX=dx/d;p.facingY=dy/d;
      }
      p.vx=0;p.vy=0;

      if(d<10||r.stageAge>.70){
        p.x=targetX;p.y=targetY;
        p.action="throwIn";p.actionTimer=.30;
        r.stage="throw";r.stageAge=0;
      }
      return;
    }

    if(r.stage==="wait"){
      if(r.stageAge>.42){
        r.stage="throw";r.stageAge=0;
      }
      return;
    }

    if(r.stage==="throw"){
      if(r.stageAge>.24)this.takeRestart();
    }
  }

  takeRestart(){
    const r=this.restart;
    if(!r){
      this.ball.state="free";this.phase="open";return;
    }

    if(r.type==="throw"){
      const thrower=this.players[r.thrower];
      const targets=this.players
        .filter(q=>q.team===r.team&&q!==thrower&&q.role!=="GK"&&!q.sent)
        .sort((a,b)=>{
          const pa=this.opponentPressureAt(a.x,a.y,r.team);
          const pb=this.opponentPressureAt(b.x,b.y,r.team);
          const da=Math.hypot(a.x-r.x,a.y-r.y);
          const db=Math.hypot(b.x-r.x,b.y-r.y);
          return (pa*75+da)-(pb*75+db);
        });

      const target=targets[0];
      this.restart=null;
      this.ball.state="free";
      this.ball.owner=null;
      this.ball.lastTeam=r.team;
      this.ball.pickupLock=.12;
      this.ball.ignorePlayer=r.thrower;

      if(target){
        const dx=target.x-r.x,dy=target.y-r.y,l=Math.hypot(dx,dy)||1;
        this.ball.x=Math.max(34,Math.min(this.W-34,r.x));
        this.ball.y=r.y<=31?32:this.H-32;
        this.ball.vx=dx/l*270;
        this.ball.vy=dy/l*270;
      }else{
        const dir=r.team===0?1:-1;
        this.ball.vx=dir*190;
        this.ball.vy=(r.y<=31?1:-1)*135;
      }
      this.ball.spinSpeed=9;
      this.phase="open";
      return;
    }

    let tx=r.team===0?this.ball.x+145:this.ball.x-145;
    let ty=this.H/2+(Math.random()-.5)*this.H*.30;
    if(r.type==="corner"){
      tx=r.team===0?this.W*.72:this.W*.28;
      ty=this.H/2+(Math.random()-.5)*this.H*.12;
    }

    const dx=tx-this.ball.x,dy=ty-this.ball.y,l=Math.hypot(dx,dy)||1;
    const pow=r.type==="corner"?375:325;

    this.restart=null;
    this.ball.state="free";
    this.ball.owner=null;
    this.ball.vx=dx/l*pow;
    this.ball.vy=dy/l*pow;
    this.ball.lastTeam=r.team;
    this.ball.spinSpeed=11;
    this.ball.pickupLock=.10;
    this.ball.ignorePlayer=-1;
    this.phase="open";
  }

  resolveContacts(){
    for(let i=0;i<this.players.length;i++){
      const a=this.players[i];if(a.sent)continue;
      for(let j=i+1;j<this.players.length;j++){
        const b=this.players[j];if(b.sent)continue;
        let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r+2;
        if(d>=min)continue;if(d<.001){dx=1;dy=.3;d=Math.hypot(dx,dy)}
        const nx=dx/d,ny=dy/d,ov=min-d;
        a.x-=nx*ov*.5;a.y-=ny*ov*.5;b.x+=nx*ov*.5;b.y+=ny*ov*.5;
        if(a.team!==b.team){
          if(this.kickoffProtection>0)continue;
          const aOwn=this.ball.owner===i,bOwn=this.ball.owner===j;
          if(aOwn&&!bOwn&&b.contactCd<=0&&b.team!==this.userSide)this.attemptDuel(j,i,false);
          else if(bOwn&&!aOwn&&a.contactCd<=0&&a.team!==this.userSide)this.attemptDuel(i,j,false);
        }
      }
    }
  }

  displayMinute(){
    const base=this.half===1?0:45,normal=Math.min(45,this.halfElapsed/this.realHalfDuration*45);
    if(this.halfElapsed<=this.realHalfDuration)return Math.floor(base+normal);
    const extra=this.halfElapsed-this.realHalfDuration,extraMin=this.addedReal?Math.min(this.addedMinutes,extra/this.addedReal*this.addedMinutes):0;
    return Math.floor(base+45+extraMin);
  }

  determineAddedTime(){
    const halfEvents=this.events.filter(e=>e.half===this.half).length;
    const activity=halfEvents+Math.floor((this.stats[0].shots+this.stats[1].shots)/3)+this.stats[0].corners+this.stats[1].corners;
    if(Math.random()<.17)return 0;
    return Math.min(5,Math.floor(Math.random()*(Math.min(5,Math.floor(activity/3)+1)+1)));
  }

  startSecondHalf(){
    this.matchClockRunning=false;
    this.half=2;this.halfElapsed=0;this.addedMinutes=0;this.addedReal=0;this.halftimeShown=false;
    this.kickoff(1-this.openingKickoffTeam);this.paused=false;this.last=performance.now();requestAnimationFrame(t=>this.loop(t));
  }

  halftime(){
    if(this.halftimeShown)return;this.halftimeShown=true;this.paused=true;App.showHalftime(this);
  }

  update(dt){
    const B={l:30,r:this.W-30,t:30,b:this.H-30};
    if(this.phase==="kickoff"){this.kickoffTimer-=dt;if(this.kickoffTimer<=0)this.beginKickoff();return}
    if(this.ball.pickupLock>0)this.ball.pickupLock-=dt;
    if(this.ball.state==="restart"){
      this.updateRestart(dt);
      this.updateRestartSupport(dt);
      return;
    }

    if(this.passCharging)this.passCharge=Math.min(1,this.passCharge+dt/1.2);
    if(this.shotCharging)this.shotCharge=Math.min(1,this.shotCharge+dt/1.0);

    if(this.kickoffProtection>0){
      this.kickoffProtection=Math.max(0,this.kickoffProtection-dt);

      if(this.ball.owner===null && this.kickoffReceiver>=0){
        this.kickoffReceiveTimer-=dt;
        if(this.kickoffReceiveTimer<=0){
          this.forceKickoffReceive();
        }
      }
    }
    this.counterPressTimer=Math.max(0,this.counterPressTimer-dt);

    if(this.coachShoutTimer>0){
      this.coachShoutTimer=Math.max(0,this.coachShoutTimer-dt);
      if(this.coachShoutTimer<=0)this.coachShout=null;
    }

    this.teamShotCooldown[0]=Math.max(0,this.teamShotCooldown[0]-dt);this.teamShotCooldown[1]=Math.max(0,this.teamShotCooldown[1]-dt);
    this.teamPhases[0]=this.teamPhase(0);this.teamPhases[1]=this.teamPhase(1);

    if(this.ball.owner!==null&&this.players[this.ball.owner])this.stats[this.players[this.ball.owner].team].possession+=dt;

    const cp=this.players[this.controlled];
    if(cp&&!cp.sent){
      const m=Math.hypot(this.joy.x,this.joy.y),mul=(this.sprint?1.48:1)*(0.78+.22*cp.stamina);
      if(m>.04)this.steer(cp,cp.x+this.joy.x*145,cp.y+this.joy.y*145,dt,mul,1);
      else{cp.vx*=Math.pow(.07,dt);cp.vy*=Math.pow(.07,dt)}
      if(this.pressAssist&&this.ball.owner!==null&&this.players[this.ball.owner]?.team!==this.userSide){
        const o=this.players[this.ball.owner];this.steer(cp,o.x,o.y,dt,1.12,1);
      }
    }

    this.players.forEach((p,i)=>{
      p.contactCd=Math.max(0,p.contactCd-dt);

      let extraCoachCost=0;
      if(this.controlMode==="coach"&&p.team===this.coachSide&&p.role!=="GK"){
        if(this.coachTactics.press==="high")extraCoachCost+=.00115;
        if(this.coachTactics.tempo==="fast")extraCoachCost+=.00045;
        if(this.coachShoutTimer>0&&this.coachShout==="press")extraCoachCost+=.00125;
        if(this.coachShoutTimer>0&&this.coachShout==="attack")extraCoachCost+=.00050;
      }

      p.stamina=Math.max(.30,p.stamina-dt*((Math.hypot(p.vx,p.vy)>115?.00245:.00052)+extraCoachCost));
      if(p.role==="GK")this.keeperAI(p,i,dt);else if(i!==this.controlled)this.ai(p,i,dt);
      this.updateFacing(p,dt);
      p.x=Math.max(B.l+2,Math.min(B.r-2,p.x+p.vx*dt));p.y=Math.max(B.t+2,Math.min(B.b-2,p.y+p.vy*dt));
    });

    this.resolveContacts();

    if(this.ball.owner!==null){
      const p=this.players[this.ball.owner];
      if(p.role==="GK"){const dir=p.team===0?1:-1;this.ball.x=p.x+dir*(p.r+4);this.ball.y=p.y}
      else this.updateControlledBall(p,dt);
    }else{
      this.ball.x+=this.ball.vx*dt;this.ball.y+=this.ball.vy*dt;
      // Shots keep their pace like a real strike; passes/loose balls slow much faster.
      const drag=this.ball.isShot?.52:.15;
      this.ball.vx*=Math.pow(drag,dt);this.ball.vy*=Math.pow(drag,dt);
      this.ball.spin+=this.ball.spinSpeed*dt;this.ball.spinSpeed*=Math.pow(this.ball.isShot?.58:.32,dt);
      this.keeperSaveContacts();
      if(this.ball.owner===null){
        const hits=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)}))
          .filter(o=>{
            if(o.p.sent||o.p.role==="GK")return false;
            if(this.ball.isShot)return false;
            return o.d<o.p.r+this.ball.r+2;
          }).sort((a,b)=>a.d-b.d);
        for(const h of hits){if(this.claim(h.i,false))break}
      }
    }

    const gt=this.H*.39,gb=this.H*.61;
    // The actual goal line is the FRONT of the goal at B.l / B.r.
    // Previously scoring was checked behind the net, so the out-of-bounds
    // restart fired first and valid shots were incorrectly turned into goal kicks.
    if(this.ball.owner===null&&this.ball.x>=B.r&&this.ball.y>gt&&this.ball.y<gb){
      this.score[0]++;this.events.push({half:this.half,minute:this.displayMinute(),type:"Гол",team:0,text:`Гол — ${this.home.name}`});
      this.lastGoalTime=this.elapsed;this.kickoff(1);return;
    }
    if(this.ball.owner===null&&this.ball.x<=B.l&&this.ball.y>gt&&this.ball.y<gb){
      this.score[1]++;this.events.push({half:this.half,minute:this.displayMinute(),type:"Гол",team:1,text:`Гол — ${this.away.name}`});
      this.lastGoalTime=this.elapsed;this.kickoff(0);return;
    }

    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.y<B.t){this.setRestart("throw",this.ball.lastTeam===0?1:0,Math.max(B.l,Math.min(B.r,this.ball.x)),B.t);return}
    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.y>B.b){this.setRestart("throw",this.ball.lastTeam===0?1:0,Math.max(B.l,Math.min(B.r,this.ball.x)),B.b);return}
    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.x>B.r){
      if(this.ball.lastTeam===0)this.setRestart("corner",0,B.r,this.ball.y<this.H/2?B.t:B.b);else this.setRestart("goal",1,this.W-65,this.H/2);return;
    }
    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.x<B.l){
      if(this.ball.lastTeam===1)this.setRestart("corner",1,B.l,this.ball.y<this.H/2?B.t:B.b);else this.setRestart("goal",0,65,this.H/2);return;
    }
  }

  drawBall(){
    const c=this.ctx,x=this.ball.x,y=this.ball.y,r=this.ball.r;
    c.save();c.translate(x,y);c.rotate(this.ball.spin||0);
    c.fillStyle="#0005";c.beginPath();c.ellipse(2,5,r*.95,r*.42,0,0,Math.PI*2);c.fill();
    c.beginPath();c.arc(0,0,r+2.5,0,Math.PI*2);
    c.fillStyle="rgba(255,255,255,.34)";c.fill();
    c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fillStyle="#f7f7f3";c.fill();c.strokeStyle="#111";c.lineWidth=1;c.stroke();
    c.fillStyle="#171717";c.beginPath();c.arc(0,0,r*.24,0,Math.PI*2);c.fill();
    for(let k=0;k<5;k++){
      const a=k*Math.PI*2/5-Math.PI/2,px=Math.cos(a)*r*.53,py=Math.sin(a)*r*.53;
      c.beginPath();
      for(let n=0;n<5;n++){
        const aa=a+n*Math.PI*2/5,xx=px+Math.cos(aa)*r*.16,yy=py+Math.sin(aa)*r*.16;
        n?c.lineTo(xx,yy):c.moveTo(xx,yy);
      }
      c.closePath();c.fill();
    }
    c.restore();
  }

  drawPlayer(p,i){
    const c=this.ctx,club=p.team?this.away:this.home;
    const base=p.role==="GK"?(p.team?"#f39a43":"#f0d33d"):(p.team?"#f5f5f5":club.color);
    const txt=p.role==="GK"?"#111":(p.team?club.color:"#fff"),speed=Math.hypot(p.vx,p.vy),isSprint=speed>p.speed*.84;
    let sx=1,sy=1,bob=0,rot=Math.atan2(p.facingY,p.facingX)*.035;
    if(speed<18){const breathe=Math.sin(p.anim)*.018;sx+=breathe;sy-=breathe*.5}
    else{bob=Math.sin(p.anim)*(isSprint?1.8:1.2);sx+=isSprint?.09:.045;sy-=isSprint?.055:.025}
    if(p.turnAmount>.35){sx-=.04*p.turnAmount;sy+=.06*p.turnAmount;rot+=Math.sign(p.vy||1)*.05*p.turnAmount}
    if(p.action==="passPrep"||p.action==="shootPrep"){sx=.94;sy=1.06;rot-=p.team===0?.05:-.05}
    if(p.action==="passKick"){sx=1.12;sy=.90}
    if(p.action==="shootKick"){sx=1.17;sy=.87}
    if(p.action==="firstTouch"){sx=1.08;sy=.93}
    if(p.action==="firstTouchBad"){sx=.90;sy=1.10;rot+=.10}
    if(p.action==="shield"){sx=1.10;sy=.94;rot+=.07}
    if(p.action==="contact"||p.action==="contactLost"){sx=.90;sy=1.10}
    if(p.action==="shotBlock"){sx=1.22;sy=.80;rot+=.08}
    if(p.role==="GK"&&p.keeperState==="READY"){sx=1.14;sy=.86}
    if(p.role==="GK"&&p.keeperState==="DIVE"){sx=1.45;sy=.72;rot+=p.diveDir*.20}
    if(p.role==="GK"&&p.action==="keeperCatch"){sx=1.18;sy=.84}
    if(p.role==="GK"&&p.action==="keeperParry"){sx=1.35;sy=.76}
    if(p.role==="GK"&&p.action==="keeperMiss"){sx=1.20;sy=.83;rot-=p.diveDir*.08}
    if(p.contactFlash>0){sx+=.05;sy-=.04}

    c.save();c.translate(p.x,p.y+bob);c.rotate(rot);
    if(speed>24){
      c.globalAlpha=.16;c.fillStyle="#000";c.beginPath();c.ellipse(-p.facingX*7,-p.facingY*7,p.r*.95,p.r*.38,0,0,Math.PI*2);c.fill();c.globalAlpha=1;
      if(isSprint){
        c.strokeStyle="#ffffff20";c.lineWidth=1;
        for(let k=-1;k<=1;k++){c.beginPath();c.moveTo(-p.facingX*(p.r+5),-p.facingY*(p.r+5)+k*5);c.lineTo(-p.facingX*(p.r+16),-p.facingY*(p.r+16)+k*5);c.stroke()}
      }
    }
    if(i===this.controlled){c.beginPath();c.arc(0,0,p.r+6,0,Math.PI*2);c.strokeStyle="#fff36b";c.lineWidth=3;c.stroke()}
    c.scale(sx,sy);c.beginPath();c.arc(0,0,p.r,0,Math.PI*2);c.fillStyle=base;c.fill();c.strokeStyle=p.contactFlash>0?"#fff":"#fff8";c.lineWidth=p.contactFlash>0?2.5:1;c.stroke();
    c.save();c.clip();
    if(p.role!=="GK"){
      c.globalAlpha=.18;c.fillStyle=p.team?club.color:"#fff";c.fillRect(-p.r,-p.r,p.r*.34,p.r*2);c.fillRect(p.r*.22,-p.r,p.r*.32,p.r*2);c.globalAlpha=1;
    }else if(p.keeperState==="READY"||p.keeperState==="DIVE"){
      c.globalAlpha=.18;c.fillStyle="#fff";c.fillRect(-p.r,-2,p.r*2,4);c.globalAlpha=1;
    }
    c.restore();c.fillStyle=txt;c.font="900 10px Arial";c.textAlign="center";c.textBaseline="middle";c.fillText(p.num,0,0);c.restore();
    c.font="700 9px Arial";c.textAlign="center";c.textBaseline="bottom";c.fillStyle="#fff";c.strokeStyle="#000a";c.lineWidth=3;
    c.strokeText(p.name,p.x,p.y-p.r-7);c.fillText(p.name,p.x,p.y-p.r-7);
  }

  drawChargeBar(x,y,w,val,label){
    const c=this.ctx;c.fillStyle="#07110dcc";c.fillRect(x,y,w,8);c.fillStyle="#fff";c.globalAlpha=.9;c.fillRect(x,y,w*val,8);c.globalAlpha=1;
    c.font="700 9px Arial";c.fillStyle="#fff";c.fillText(label,x,y-4);
  }

  drawGoalNets(){
    const c=this.ctx,H=this.H,W=this.W;
    const gt=H*.39,gb=H*.61;
    const leftBack=8,leftFront=30,rightFront=W-30,rightBack=W-8;

    c.save();
    c.lineWidth=.8;
    c.strokeStyle="rgba(244,255,248,.31)";

    for(let y=gt+6;y<gb;y+=8){
      c.beginPath();c.moveTo(leftBack,y);c.lineTo(leftFront,y);c.stroke();
      c.beginPath();c.moveTo(rightFront,y);c.lineTo(rightBack,y);c.stroke();
    }

    for(let x=leftBack+4;x<leftFront;x+=5){
      c.beginPath();c.moveTo(x,gt);c.lineTo(x,gb);c.stroke();
    }
    for(let x=rightFront+4;x<rightBack;x+=5){
      c.beginPath();c.moveTo(x,gt);c.lineTo(x,gb);c.stroke();
    }

    c.strokeStyle="rgba(244,255,248,.19)";
    for(let y=gt;y<gb;y+=13){
      c.beginPath();c.moveTo(leftBack,y);c.lineTo(leftFront,Math.min(gb,y+11));c.stroke();
      c.beginPath();c.moveTo(rightBack,y);c.lineTo(rightFront,Math.min(gb,y+11));c.stroke();
    }

    c.strokeStyle="rgba(250,255,251,.98)";
    c.lineWidth=2.2;
    c.beginPath();c.moveTo(leftFront,gt);c.lineTo(leftBack,gt);c.lineTo(leftBack,gb);c.lineTo(leftFront,gb);c.stroke();
    c.beginPath();c.moveTo(rightFront,gt);c.lineTo(rightBack,gt);c.lineTo(rightBack,gb);c.lineTo(rightFront,gb);c.stroke();
    c.restore();
  }

  draw(){
    const c=this.ctx,W=this.W,H=this.H;c.clearRect(0,0,W,H);
    for(let i=0;i<12;i++){c.fillStyle=i%2?"#1d7441":"#176a3b";c.fillRect(i*W/12,0,W/12,H)}
    c.strokeStyle="#def6e4";c.lineWidth=2;c.globalAlpha=.85;c.strokeRect(30,30,W-60,H-60);
    c.beginPath();c.moveTo(W/2,30);c.lineTo(W/2,H-30);c.stroke();c.beginPath();c.arc(W/2,H/2,55,0,Math.PI*2);c.stroke();
    c.strokeRect(30,H*.23,120,H*.54);c.strokeRect(W-150,H*.23,120,H*.54);c.globalAlpha=1;
    this.drawGoalNets();
    this.players.forEach((p,i)=>this.drawPlayer(p,i));this.drawBall();
    if(this.passCharging)this.drawChargeBar(W*.40,H-24,W*.20,this.passCharge,"СИЛА ПАСА");
    if(this.shotCharging)this.drawChargeBar(W*.40,H-38,W*.20,this.shotCharge,"СИЛА УДАРА");
  }

  loop(t){
    if(!this.running||this.paused)return;
    const dt=Math.min((t-this.last)/1000,.028);this.last=t;

    // The compressed match clock counts active football time only.
    // It stays frozen during centre setup at the start of a half and after a goal.
    if(this.matchClockRunning){
      this.elapsed+=dt;
      this.halfElapsed+=dt;
    }
    if(this.halfElapsed>=this.realHalfDuration&&this.addedReal===0){
      this.addedMinutes=this.determineAddedTime();this.addedReal=this.addedMinutes*(this.realHalfDuration/45);
    }
    const halfTarget=this.realHalfDuration+this.addedReal;
    if(this.halfElapsed>=halfTarget){
      if(this.half===1){this.halftime();return}
      this.running=false;this.onFinish(this.score);return;
    }
    this.update(dt);this.draw();App.updateHUD(this);requestAnimationFrame(x=>this.loop(x));
  }
};
