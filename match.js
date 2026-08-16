
window.MatchEngine = class {
  constructor(canvas,onFinish){
    this.canvas=canvas;this.ctx=canvas.getContext("2d");this.onFinish=onFinish;
    this.running=false;this.paused=false;this.userSide=0;
    this.players=[];this.ball={};this.score=[0,0];
    this.elapsed=0;this.realHalfDuration=150;this.half=1;this.halfElapsed=0;
    this.addedMinutes=0;this.addedReal=0;this.halftimeShown=false;
    this.controlled=0;this.joy={x:0,y:0};this.sprint=false;this.last=0;
    this.restart=null;this.phase="kickoff";this.kickoffTeam=0;this.kickoffTimer=0;
    this.passCharge=0;this.shotCharge=0;this.passCharging=false;this.shotCharging=false;
    this.pressAssist=false;this.secondPress=false;
    this.stats=this.newStats();this.events=[];
    this.lastPossessionTeam=-1;this.counterPressTeam=-1;this.counterPressTimer=0;
    this.teamShotCooldown=[0,0];this.teamPhases=["DEFENSIVE_SHAPE","DEFENSIVE_SHAPE"];
    this.shotSerial=0;this.lastGoalTime=-999;
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

  tacticalProfile(team){
    const club=team===0?this.home:this.away;
    const r=club?.rating||72,id=club?.id||"";
    const explicit=window.DB?.teamStyles?.[id];
    if(explicit)return {...explicit,rating:r,reaction:Math.max(.095,.19-(r-68)*.0045)};
    let mode=r>=80?"possession":(r<=69?"compact":"balanced");
    const base={
      possession:{press:.80,counter:.82,direct:.48,width:.73,tempo:.80,line:.72,risk:.65},
      compact:{press:.68,counter:.66,direct:.74,width:.56,tempo:.64,line:.50,risk:.43},
      balanced:{press:.74,counter:.75,direct:.62,width:.65,tempo:.73,line:.61,risk:.56}
    }[mode];
    const q=(r-68)/18;
    return {...base,mode,rating:r,reaction:Math.max(.105,.19-q*.055)};
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

  start(home,away,userSide){
    this.home=home;this.away=away;this.userSide=userSide;
    this.score=[0,0];this.elapsed=0;this.half=1;this.halfElapsed=0;
    this.addedMinutes=0;this.addedReal=0;this.halftimeShown=false;
    this.running=true;this.paused=false;this.stats=this.newStats();this.events=[];
    this.lastPossessionTeam=-1;this.counterPressTeam=-1;this.counterPressTimer=0;
    this.teamShotCooldown=[0,0];this.teamPhases=["DEFENSIVE_SHAPE","DEFENSIVE_SHAPE"];
    this.resize();this.kickoff(0);this.last=performance.now();
    requestAnimationFrame(t=>this.loop(t));
  }

  form(side){
    const left=[[.07,.50],[.25,.50],[.40,.31],[.40,.69],[.57,.50]];
    const roles=["GK","DEF","CM","W","ST"],nums=[1,4,6,10,9],names=this.teamNames(side),fc=this.rolePlan(side);
    return left.map((v,i)=>{
      const x=side?1-v[0]:v[0],club=side===0?this.home:this.away,q=((club?.rating||72)-68)/18;
      return {
        team:side,role:roles[i],fcRole:fc[i],x:this.W*x,y:this.H*v[1],homeX:this.W*x,homeY:this.H*v[1],
        vx:0,vy:0,r:i===0?16:14,num:nums[i],speed:(i===0?96:106+(i%2)*4)*(1+q*.032),
        accel:(i===0?580:690)*(1+q*.04),hasBall:false,decision:.24+Math.random()*.28,
        stamina:1,sent:false,contactCd:0,strength:.88+q*.12+(i===4?.05:0),name:names[i],
        anim:Math.random()*6.28,action:"idle",actionTimer:0,contactFlash:0,
        facingX:side===0?1:-1,facingY:0,turnAmount:0,touchTimer:.08+Math.random()*.16,
        touchPulse:0,dribbleLead:0,runSeed:Math.random()*6.28,runTimer:.2+Math.random()*.6,
        lowUrgency:false,keeperState:"SET",keeperReaction:0,keeperTargetY:this.H/2,
        lastShotSeen:-1,diveDir:0
      };
    });
  }

  kickoff(team){
    this.players=[...this.form(0),...this.form(1)];
    this.kickoffTeam=team;this.phase="kickoff";this.kickoffTimer=.55;
    this.ball={x:this.W/2,y:this.H/2,vx:0,vy:0,r:6,owner:null,lastTeam:team,state:"dead",
      pickupLock:0,ignorePlayer:-1,lastPassTeam:-1,lastPassTarget:-1,
      spin:0,spinSpeed:0,shotId:0,isShot:false,shotTeam:-1};
    const ids=team===0?[3,4]:[8,9],dir=team===0?-1:1;
    this.players[ids[0]].x=this.W/2+dir*18;this.players[ids[0]].y=this.H/2;
    this.players[ids[1]].x=this.W/2+dir*60;this.players[ids[1]].y=this.H/2+34;
    this.controlled=this.nearestUser();this.lastPossessionTeam=-1;
  }

  beginKickoff(){
    const team=this.kickoffTeam,passer=team===0?3:8,receiver=team===0?4:9,q=this.players[receiver];
    this.ball.state="free";this.ball.x=this.W/2;this.ball.y=this.H/2;
    const dx=q.x-this.ball.x,dy=q.y-this.ball.y,l=Math.hypot(dx,dy)||1;
    this.ball.vx=dx/l*220;this.ball.vy=dy/l*220;this.ball.lastTeam=team;
    this.ball.spinSpeed=8;this.ball.ignorePlayer=passer;this.ball.pickupLock=.2;this.phase="open";
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
      this.counterPressTimer=.95+pf.counter*1.05;
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
    const rating=(p.team===0?this.home.rating:this.away.rating)||72;
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,64);
    const facingMag=Math.hypot(p.facingX,p.facingY)||1,bv=Math.hypot(this.ball.vx,this.ball.vy)||1;
    const incomingX=-this.ball.vx/bv,incomingY=-this.ball.vy/bv;
    const facingDot=(p.facingX/facingMag)*incomingX+(p.facingY/facingMag)*incomingY;
    return Math.max(.18,Math.min(.96,.78+(rating-72)*.012-speed/1050-pressure*.075+facingDot*.05));
  }

  claim(i,forceKeeper=false){
    const p=this.players[i];
    if(!p||p.sent||this.ball.state!=="free")return false;
    if(this.ball.pickupLock>0&&i===this.ball.ignorePlayer)return false;
    const speed=Math.hypot(this.ball.vx,this.ball.vy);
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
      let score=directional*250+Math.max(0,forward)*(through?.38:.13)-d*.17-pressure*95-lane.blocks*155+Math.min(60,lane.min)*.92;
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
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,65),err=Math.max(.003,(83-rating)*.0026+pressure*.004)*(Math.random()-.5);
    const ang=Math.atan2(dy,dx)+err,pow=(through?325:240)+(through?205:215)*charge;
    p.action="passKick";p.actionTimer=.18;
    this.release(this.controlled,Math.cos(ang)*pow,Math.sin(ang)*pow,t.j,true,false);
  }

  chooseGoalTarget(i){
    const p=this.players[i],team=p.team,gx=team===0?this.W+24:-24;
    const keeper=this.players.find(q=>q.team!==team&&q.role==="GK"&&!q.sent);
    const ys=[.405,.435,.47,.53,.565,.595].map(v=>this.H*v);
    let bestY=this.H/2,best=-1e9;
    for(const y of ys){
      const lane=this.segmentClearance(p.x,p.y,gx,y,team,true);
      const keeperPenalty=keeper?Math.max(0,78-Math.abs(keeper.y-y))*3.2:0;
      const farPost=(p.y<this.H/2?y>this.H/2:y<this.H/2)?30:0,center=Math.abs(y-this.H/2)<9?16:0;
      const score=lane.min*2.05-lane.blocks*500-keeperPenalty+farPost-center+Math.random()*4;
      if(score>best){best=score;bestY=y}
    }
    return{gx,gy:bestY,score:best};
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
    const target=this.chooseGoalTarget(this.controlled),pressure=this.opponentPressureAt(p.x,p.y,p.team,68);
    const dx=target.gx-p.x,dy=target.gy-p.y,l=Math.hypot(dx,dy)||1,charge=Math.max(.18,Math.min(1,this.shotCharge));
    const error=Math.max(.0015,(84-rating)*.0021+pressure*.0038),angle=Math.atan2(dy,dx)+(Math.random()-.5)*error;
    this.stats[p.team].shots++;this.stats[p.team].onTarget++;
    this.events.push({half:this.half,minute:this.displayMinute(),type:"Удар",team:p.team,text:`${p.name} пробил по воротам`});
    p.action="shootKick";p.actionTimer=.22;
    this.release(this.controlled,Math.cos(angle)*(365+235*charge),Math.sin(angle)*(365+235*charge),-1,false,true);
    this.teamShotCooldown[p.team]=2.9;
  }

  duelChance(defender,carrier,explicit=false){
    const dRating=(defender.team===0?this.home.rating:this.away.rating)||72,cRating=(carrier.team===0?this.home.rating:this.away.rating)||72;
    const dx=defender.x-carrier.x,dy=defender.y-carrier.y,l=Math.hypot(dx,dy)||1,nx=dx/l,ny=dy/l;
    const front=nx*carrier.facingX+ny*carrier.facingY,ds=Math.hypot(defender.vx,defender.vy),cs=Math.hypot(carrier.vx,carrier.vy);
    const angleBonus=front>.35?.13:(front<-.30?-.18:0),strength=(defender.strength-carrier.strength)*.42;
    return Math.max(.16,Math.min(.84,.47+angleBonus+strength+(dRating-cRating)*.007+(ds-cs)*.0007+(explicit?.11:0)));
  }

  attemptDuel(defenderIdx,carrierIdx,explicit=false){
    const d=this.players[defenderIdx],c=this.players[carrierIdx];
    if(!d||!c||d.sent||c.sent||d.contactCd>0)return false;
    d.contactCd=.34;c.contactCd=Math.max(c.contactCd,.14);d.action="contact";d.actionTimer=.16;c.contactFlash=.13;
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
    const profile=this.tacticalProfile(p.team),rating=profile.rating,gx=p.team===0?38:this.W-38;
    const owner=this.ball.owner!==null?this.players[this.ball.owner]:null,cross=this.predictGoalCross(p.team);
    const oppOwner=owner&&owner.team!==p.team?owner:null;
    const oneVOne=oppOwner&&(p.team===0?oppOwner.x<this.W*.29:oppOwner.x>this.W*.71)&&Math.abs(oppOwner.y-this.H/2)<this.H*.27;

    if(this.ball.shotId!==p.lastShotSeen&&cross){
      p.lastShotSeen=this.ball.shotId;p.keeperReaction=Math.max(.055,.20-(rating-68)*.0065);
      p.keeperTargetY=Math.max(this.H*.36,Math.min(this.H*.64,cross.y));
      p.keeperState="READY";p.action="keeperReady";p.actionTimer=.25;
    }

    if(oneVOne){
      p.keeperState="1V1";const dir=p.team===0?1:-1,depth=Math.min(76,Math.max(28,Math.abs(oppOwner.x-gx)*.28));
      this.steer(p,gx+dir*depth,Math.max(this.H*.37,Math.min(this.H*.63,oppOwner.y)),dt,1.18+(rating-72)*.006,1);
    }else if(cross){
      if(p.keeperReaction>0){p.keeperReaction-=dt;p.keeperState="READY";this.steer(p,gx,p.keeperTargetY,dt,.72,1)}
      else{p.keeperState="DIVE";p.diveDir=Math.sign(p.keeperTargetY-p.y);this.steer(p,gx+(p.team===0?12:-12),p.keeperTargetY,dt,1.65+(rating-72)*.012,1)}
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
      const reach=p.r+this.ball.r+(p.keeperState==="DIVE"?14:(p.keeperState==="1V1"?7:3));
      if(Math.hypot(p.x-this.ball.x,p.y-this.ball.y)>reach)continue;
      const shotAgainst=this.ball.isShot&&this.ball.shotTeam!==p.team;
      if(!shotAgainst&&speed>440)continue;
      const catchChance=Math.max(.18,Math.min(.88,.63+(rating-72)*.018-speed/1100+(p.keeperState==="SET"?.08:0)));
      if(Math.random()<catchChance){
        p.action="keeperCatch";p.actionTimer=.30;p.keeperState="SAVE";this.claim(i,true);this.ball.spinSpeed=0;
      }else{
        p.action="keeperParry";p.actionTimer=.28;p.keeperState="SAVE";
        const awayX=p.team===0?1:-1,safeSide=this.ball.y<this.H/2?-1:1;
        const goodParry=Math.random()<Math.max(.45,Math.min(.88,.58+(rating-72)*.018));
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
    const dir=p.team===0?1:-1,profile=this.tacticalProfile(p.team),phase=this.teamPhases[p.team];
    p.runTimer-=1/60;if(p.runTimer<=0){p.runTimer=.40+Math.random()*.75;p.runSeed+=1.35+Math.random()*.8}
    let x=p.homeX,y=p.homeY;
    if(p.fcRole==="BallPlayingDefender"){x=carrier.x-dir*(105+profile.risk*20);y=this.H/2+(p.homeY-this.H/2)*.35}
    else if(p.fcRole==="Stopper"){x=carrier.x-dir*125;y=this.H/2}
    else if(p.fcRole==="Holding"){x=carrier.x-dir*(72+profile.direct*20);y=this.H/2+(p.homeY-this.H/2)*.50}
    else if(p.fcRole==="DeepPlaymaker"){x=carrier.x-dir*42;y=carrier.y+(p.homeY-this.H/2)*.52}
    else if(p.fcRole==="BoxCrasher"){x=carrier.x+dir*((phase==="FINAL_THIRD"||phase==="CHANCE")?92:38);y=this.H/2+Math.sin(p.runSeed)*this.H*.12}
    else if(p.fcRole==="WidePlaymaker"){x=carrier.x+dir*(78+profile.tempo*28);y=this.H*(p.homeY<this.H/2?.18:.82)}
    else if(p.fcRole==="HalfWinger"){x=carrier.x+dir*(92+profile.tempo*30);y=this.H*(p.homeY<this.H/2?.36:.64)}
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
    const profile=this.tacticalProfile(p.team),dir=p.team===0?1:-1;
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,72),quality=this.shotQuality(i),progress=p.team===0?p.x/this.W:1-p.x/this.W;
    p.decision-=dt;
    if(p.decision<=0){
      p.decision=Math.max(.30,.68-profile.tempo*.20+Math.random()*.22);
      if(this.teamShotCooldown[p.team]<=0&&progress>.60&&quality>(.34-(profile.rating-72)*.0045)){this.aiShoot(i);return}
      const through=profile.direct>.68&&progress>.40&&Math.random()<(.25+profile.direct*.15),pass=this.bestPass(i,through);
      const mustRelease=pressure>=1||(progress>.70&&quality<.40),circulate=profile.mode==="possession"?.48:.30;
      if(pass&&(mustRelease||Math.random()<circulate)){this.aiPass(i,through);return}
    }
    const laneY=p.fcRole==="WidePlaymaker"?p.homeY:this.H/2+(p.y-this.H/2)*.70,drive=progress<.72?86+profile.tempo*30:55;
    this.steer(p,p.x+dir*drive,laneY,dt,1.00+profile.tempo*.09,1);
  }

  ai(p,i,dt){
    if(p.sent)return;
    const team=p.team,profile=this.tacticalProfile(team),carrier=this.getCarrier(),own=carrier&&carrier.team===team;
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
      p.lowUrgency=!involved;this.steer(p,t.x,t.y,dt,.86+profile.tempo*.11,involved?1:.52);return;
    }
    if(team===this.userSide&&this.secondPress&&rank===1)rank=0;
    const t=this.defensiveTarget(p,rank,carrier),involved=rank<=1||Math.hypot(p.x-this.ball.x,p.y-this.ball.y)<this.W*.28;
    p.lowUrgency=!involved;let mul=.80+profile.press*.16;if(rank===0)mul=1.02+profile.press*.13;
    this.steer(p,t.x,t.y,dt,mul,involved?1:.56);
  }

  aiPass(i,through=false){
    const t=this.bestPass(i,through);if(!t)return;
    const p=this.players[i],rating=(p.team===0?this.home.rating:this.away.rating)||72;
    const dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1,pressure=this.opponentPressureAt(p.x,p.y,p.team,70);
    const err=Math.max(.003,(84-rating)*.0023+pressure*.0035)*(Math.random()-.5),ang=Math.atan2(dy,dx)+err;
    p.action="passKick";p.actionTimer=.17;
    const pow=(through?390:315)+(rating-72)*2;
    this.release(i,Math.cos(ang)*pow,Math.sin(ang)*pow,t.j,true,false);
  }

  aiShoot(i){
    const p=this.players[i],rating=(p.team===0?this.home.rating:this.away.rating)||72,target=this.chooseGoalTarget(i);
    const dx=target.gx-p.x,dy=target.gy-p.y,l=Math.hypot(dx,dy)||1,pressure=this.opponentPressureAt(p.x,p.y,p.team,68);
    const error=Math.max(.0015,(84-rating)*.0022+pressure*.0038),angle=Math.atan2(dy,dx)+(Math.random()-.5)*error;
    this.stats[p.team].shots++;this.stats[p.team].onTarget++;
    this.events.push({half:this.half,minute:this.displayMinute(),type:"Удар",team:p.team,text:`${p.name} пробил по воротам`});
    p.action="shootKick";p.actionTimer=.21;
    const pow=485+(rating-72)*2;
    this.release(i,Math.cos(angle)*pow,Math.sin(angle)*pow,-1,false,true);this.teamShotCooldown[p.team]=3.0;
  }

  setRestart(type,team,x,y){
    this.ball.owner=null;this.ball.vx=this.ball.vy=0;this.ball.x=x;this.ball.y=y;this.ball.state="restart";this.ball.isShot=false;
    let thrower=-1;
    if(type==="throw"){
      const candidates=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-x,p.y-y)}))
        .filter(o=>o.p.team===team&&o.p.role!=="GK"&&!o.p.sent).sort((a,b)=>a.d-b.d);
      thrower=candidates[0]?.i??-1;
    }
    this.restart={type,team,t:0,stage:type==="throw"?"approach":"wait",thrower,x,y};
    if(type==="corner")this.stats[team].corners++;
  }

  updateRestart(dt){
    const r=this.restart;if(!r)return;
    if(r.type==="throw"&&r.stage==="approach"){
      const p=this.players[r.thrower];if(!p){r.stage="throw";r.t=.25;return}
      const targetY=r.y<=31?r.y+10:r.y-10;
      this.steer(p,r.x,targetY,dt,1.05,1);p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(Math.hypot(p.x-r.x,p.y-targetY)<16){p.vx=p.vy=0;p.action="throwIn";p.actionTimer=.35;r.stage="throw";r.t=.32}
      return;
    }
    if(r.stage==="wait"){r.t+=dt;if(r.t>.65){r.stage="throw";r.t=.20}return}
    if(r.stage==="throw"){r.t-=dt;if(r.t<=0)this.takeRestart()}
  }

  takeRestart(){
    const r=this.restart;if(!r)return;this.restart=null;this.ball.state="free";
    if(r.type==="throw"){
      const thrower=this.players[r.thrower],targets=this.players.filter(q=>q.team===r.team&&q!==thrower&&q.role!=="GK"&&!q.sent)
        .sort((a,b)=>this.opponentPressureAt(a.x,a.y,r.team)-this.opponentPressureAt(b.x,b.y,r.team));
      const target=targets[0];
      if(target){
        const dx=target.x-r.x,dy=target.y-r.y,l=Math.hypot(dx,dy)||1;
        this.ball.x=r.x;this.ball.y=r.y;this.ball.vx=dx/l*255;this.ball.vy=dy/l*255;this.ball.lastTeam=r.team;
        this.ball.spinSpeed=9;this.ball.pickupLock=.10;this.ball.ignorePlayer=r.thrower;
      }return;
    }
    let tx=r.team===0?this.ball.x+140:this.ball.x-140,ty=this.H/2+(Math.random()-.5)*this.H*.36;
    if(r.type==="corner"){tx=r.team===0?this.W*.72:this.W*.28;ty=this.H/2+(Math.random()-.5)*this.H*.13}
    const dx=tx-this.ball.x,dy=ty-this.ball.y,l=Math.hypot(dx,dy)||1,pow=r.type==="corner"?370:320;
    this.ball.vx=dx/l*pow;this.ball.vy=dy/l*pow;this.ball.lastTeam=r.team;this.ball.spinSpeed=12;this.ball.pickupLock=.10;this.ball.ignorePlayer=-1;
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
    this.half=2;this.halfElapsed=0;this.addedMinutes=0;this.addedReal=0;this.halftimeShown=false;
    this.kickoff(1-this.kickoffTeam);this.paused=false;this.last=performance.now();requestAnimationFrame(t=>this.loop(t));
  }

  halftime(){
    if(this.halftimeShown)return;this.halftimeShown=true;this.paused=true;App.showHalftime(this);
  }

  update(dt){
    const B={l:30,r:this.W-30,t:30,b:this.H-30};
    if(this.phase==="kickoff"){this.kickoffTimer-=dt;if(this.kickoffTimer<=0)this.beginKickoff();return}
    if(this.ball.pickupLock>0)this.ball.pickupLock-=dt;
    if(this.ball.state==="restart"){this.updateRestart(dt);return}

    if(this.passCharging)this.passCharge=Math.min(1,this.passCharge+dt/1.2);
    if(this.shotCharging)this.shotCharge=Math.min(1,this.shotCharge+dt/1.0);
    this.counterPressTimer=Math.max(0,this.counterPressTimer-dt);
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
      p.stamina=Math.max(.30,p.stamina-dt*(Math.hypot(p.vx,p.vy)>115?.00245:.00052));
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
      this.ball.vx*=Math.pow(.15,dt);this.ball.vy*=Math.pow(.15,dt);
      this.ball.spin+=this.ball.spinSpeed*dt;this.ball.spinSpeed*=Math.pow(.32,dt);
      this.keeperSaveContacts();
      if(this.ball.owner===null){
        const hits=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)}))
          .filter(o=>!o.p.sent&&o.p.role!=="GK"&&o.d<o.p.r+this.ball.r+2).sort((a,b)=>a.d-b.d);
        for(const h of hits){if(this.claim(h.i,false))break}
      }
    }

    const gt=this.H*.39,gb=this.H*.61;
    if(this.ball.owner===null&&this.ball.x>this.W-14&&this.ball.y>gt&&this.ball.y<gb){
      this.score[0]++;this.events.push({half:this.half,minute:this.displayMinute(),type:"Гол",team:0,text:`Гол — ${this.home.name}`});
      this.lastGoalTime=this.elapsed;this.kickoff(1);return;
    }
    if(this.ball.owner===null&&this.ball.x<14&&this.ball.y>gt&&this.ball.y<gb){
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
    if(p.role==="GK"&&p.keeperState==="READY"){sx=1.14;sy=.86}
    if(p.role==="GK"&&p.keeperState==="DIVE"){sx=1.45;sy=.72;rot+=p.diveDir*.20}
    if(p.role==="GK"&&p.action==="keeperCatch"){sx=1.18;sy=.84}
    if(p.role==="GK"&&p.action==="keeperParry"){sx=1.35;sy=.76}
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

  draw(){
    const c=this.ctx,W=this.W,H=this.H;c.clearRect(0,0,W,H);
    for(let i=0;i<12;i++){c.fillStyle=i%2?"#1d7441":"#176a3b";c.fillRect(i*W/12,0,W/12,H)}
    c.strokeStyle="#def6e4";c.lineWidth=2;c.globalAlpha=.85;c.strokeRect(30,30,W-60,H-60);
    c.beginPath();c.moveTo(W/2,30);c.lineTo(W/2,H-30);c.stroke();c.beginPath();c.arc(W/2,H/2,55,0,Math.PI*2);c.stroke();
    c.strokeRect(30,H*.23,120,H*.54);c.strokeRect(W-150,H*.23,120,H*.54);c.strokeRect(8,H*.39,22,H*.22);c.strokeRect(W-30,H*.39,22,H*.22);c.globalAlpha=1;
    this.players.forEach((p,i)=>this.drawPlayer(p,i));this.drawBall();
    if(this.passCharging)this.drawChargeBar(W*.40,H-24,W*.20,this.passCharge,"СИЛА ПАСА");
    if(this.shotCharging)this.drawChargeBar(W*.40,H-38,W*.20,this.shotCharge,"СИЛА УДАРА");
  }

  loop(t){
    if(!this.running||this.paused)return;
    const dt=Math.min((t-this.last)/1000,.028);this.last=t;this.elapsed+=dt;this.halfElapsed+=dt;
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
