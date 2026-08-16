
window.MatchEngine = class {
  constructor(canvas,onFinish){
    this.canvas=canvas; this.ctx=canvas.getContext("2d"); this.onFinish=onFinish;
    this.running=false; this.paused=false; this.userSide=0;
    this.players=[]; this.ball={}; this.score=[0,0];
    this.elapsed=0; this.realHalfDuration=150; this.half=1; this.halfElapsed=0;
    this.addedMinutes=0; this.addedReal=0; this.halftimeShown=false;
    this.controlled=0; this.joy={x:0,y:0}; this.sprint=false; this.last=0;
    this.restart=null; this.phase="kickoff"; this.kickoffTeam=0; this.kickoffTimer=0;
    this.passCharge=0; this.shotCharge=0; this.passCharging=false; this.shotCharging=false;
    this.pressAssist=false; this.secondPress=false;
    this.stats=this.newStats(); this.events=[];
    this.lastPossessionTeam=-1; this.counterPressTeam=-1; this.counterPressTimer=0;
    this.teamShotCooldown=[0,0]; this.teamDecisionBias=[0,0];
  }

  newStats(){
    return [
      {shots:0,onTarget:0,passes:0,completed:0,possession:0,tackles:0,corners:0,fouls:0},
      {shots:0,onTarget:0,passes:0,completed:0,possession:0,tackles:0,corners:0,fouls:0}
    ];
  }

  resize(){
    const oldW=this.W||innerWidth, oldH=this.H||innerHeight;
    const vv=window.visualViewport;
    const newW=Math.round(vv?vv.width:innerWidth);
    const newH=Math.round(vv?vv.height:innerHeight);
    this.W=newW;this.H=newH;
    const d=Math.min(devicePixelRatio||1,2);
    this.canvas.width=this.W*d;this.canvas.height=this.H*d;
    this.canvas.style.width=this.W+"px";this.canvas.style.height=this.H+"px";
    this.ctx.setTransform(d,0,0,d,0,0);
    if(this.players?.length && oldW>0 && oldH>0 && (oldW!==newW || oldH!==newH)){
      const sx=newW/oldW,sy=newH/oldH;
      this.players.forEach(p=>{p.x*=sx;p.y*=sy;p.homeX*=sx;p.homeY*=sy});
      if(this.ball){this.ball.x*=sx;this.ball.y*=sy}
    }
  }

  teamNames(team){
    const id=(team===0?this.home?.id:this.away?.id)||"";
    const map={
      zenit:["Адамов","Дркушич","Вендел","Глушенков","Соболев"],
      krasnodar:["Агкацев","Тормена","Ленини","Сперцян","Кордуоба"],
      spartak:["Максименко","Литвинов","Зобнин","Барко","Угальде"],
      cska:["Акинфеев","Дивеев","Обляков","Кисляк","Мусаев"],
      lokomotiv:["Лантратов","Ненахов","Баринов","Батраков","Воробьёв"],
      "dynamo-moscow":["Лещук","Маричаль","Фомин","Карраскаль","Тюкавин"],
      rubin:["Ставер","Вуячич","Иву","Даку","Шабанхаджай"],
      rostov:["Ятимов","Осипенко","Глебов","Щетинин","Комличенко"],
      akhmat:["Шелия","Семёнов","Уткин","Садулаев","Конате"],
      krylya:["Песьяков","Солдатенков","Бабкин","Гарре","Сергеев"],
      akron:["Волков","Бокоев","Дмитриев","Пестряков","Дзюба"],
      orenburg:["Сысуев","Хотулёв","Прохин","Михайлов","Гюрлюк"],
      fakel:["Гудиев","Брызгалов","Моцпан","Якимов","Ильин"],
      rodina:["Коченков","Сокол","Калинин","Горбунов","Тимошенко"],
      baltika:["Бориско","Осипов","Титков","Петров","Хиль"]
    };
    return map[id]||["Вратарь","Защитник","Полузащитник","Плеймейкер","Нападающий"];
  }

  tacticalProfile(team){
    const club=team===0?this.home:this.away;
    const r=club?.rating||72;
    const id=club?.id||"";
    let mode="balanced";
    if(["zenit","krasnodar","dynamo-moscow"].includes(id))mode="possession";
    else if(["spartak","lokomotiv","cska","akhmat"].includes(id))mode="vertical";
    else if(["baltika","rubin","dynamo-makhachkala","fakel"].includes(id))mode="compact";
    else if(["akron","orenburg","rostov","krylya","rodina"].includes(id))mode="direct";
    const q=(r-66)/18;
    const base={
      possession:{press:.77,counter:.82,direct:.38,width:.76,tempo:.76},
      vertical:{press:.88,counter:.92,direct:.72,width:.63,tempo:.88},
      compact:{press:.65,counter:.58,direct:.70,width:.58,tempo:.63},
      direct:{press:.72,counter:.74,direct:.86,width:.60,tempo:.78},
      balanced:{press:.73,counter:.72,direct:.60,width:.65,tempo:.72}
    }[mode];
    return {
      mode,
      press:Math.min(.96,base.press+q*.06),
      counter:Math.min(.98,base.counter+q*.05),
      direct:Math.min(.95,base.direct+q*.04),
      width:base.width,
      tempo:Math.min(.95,base.tempo+q*.05),
      reaction:.18-(q*.045),
      rating:r
    };
  }

  start(home,away,userSide){
    this.home=home;this.away=away;this.userSide=userSide;
    this.score=[0,0];this.elapsed=0;this.half=1;this.halfElapsed=0;
    this.addedMinutes=0;this.addedReal=0;this.halftimeShown=false;
    this.running=true;this.paused=false;this.stats=this.newStats();this.events=[];
    this.lastPossessionTeam=-1;this.counterPressTeam=-1;this.counterPressTimer=0;
    this.teamShotCooldown=[0,0];
    this.resize();this.kickoff(0);this.last=performance.now();
    requestAnimationFrame(t=>this.loop(t));
  }

  form(side){
    const left=[[.07,.50],[.25,.50],[.40,.31],[.40,.69],[.57,.50]];
    const roles=["GK","DEF","CM","W","ST"],nums=[1,4,6,10,9],names=this.teamNames(side);
    return left.map((v,i)=>{
      const x=side?1-v[0]:v[0];
      const club=side===0?this.home:this.away;
      const q=((club?.rating||72)-66)/18;
      return {
        team:side,role:roles[i],x:this.W*x,y:this.H*v[1],homeX:this.W*x,homeY:this.H*v[1],
        vx:0,vy:0,r:i===0?16:14,num:nums[i],
        speed:(i===0?94:106+(i%2)*4)*(1+q*.035),accel:(i===0?570:680)*(1+q*.04),
        hasBall:false,decision:.25+Math.random()*.28,stamina:1,sent:false,contactCd:0,
        strength:.88+q*.12+(i===4?.05:0),name:names[i],anim:Math.random()*6.28,
        markIndex:-1,runTimer:Math.random()*.5,rolePhase:Math.random()*2
      };
    });
  }

  kickoff(team){
    this.players=[...this.form(0),...this.form(1)];
    this.kickoffTeam=team;this.phase="kickoff";this.kickoffTimer=.55;
    this.ball={x:this.W/2,y:this.H/2,vx:0,vy:0,r:6,owner:null,lastTeam:team,state:"dead",
      pickupLock:0,ignorePlayer:-1,lastPassTeam:-1,lastPassTarget:-1};
    const ids=team===0?[3,4]:[8,9],dir=team===0?-1:1;
    this.players[ids[0]].x=this.W/2+dir*18;this.players[ids[0]].y=this.H/2;
    this.players[ids[1]].x=this.W/2+dir*60;this.players[ids[1]].y=this.H/2+34;
    this.controlled=this.nearestUser();
    this.lastPossessionTeam=-1;
  }

  beginKickoff(){
    const team=this.kickoffTeam,passer=team===0?3:8,receiver=team===0?4:9,q=this.players[receiver];
    this.ball.state="free";this.ball.x=this.W/2;this.ball.y=this.H/2;
    let dx=q.x-this.ball.x,dy=q.y-this.ball.y,l=Math.hypot(dx,dy)||1;
    this.ball.vx=dx/l*220;this.ball.vy=dy/l*220;this.ball.lastTeam=team;
    this.ball.ignorePlayer=passer;this.ball.pickupLock=.2;this.phase="open";
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
      this.counterPressTimer=.8+pf.counter*.9;
    }
    this.lastPossessionTeam=newTeam;
  }

  claim(i){
    const p=this.players[i];
    if(!p||p.sent||this.ball.state!=="free")return false;
    if(this.ball.pickupLock>0&&i===this.ball.ignorePlayer)return false;
    const speed=Math.hypot(this.ball.vx,this.ball.vy),rating=(p.team===0?this.home.rating:this.away.rating)||72;
    if(speed>510)return false;
    if(speed>345&&Math.random()>(.46+(rating-66)/48)){this.ball.vx*=.58;this.ball.vy*=.58;return false}
    if(this.ball.lastPassTeam===p.team&&this.ball.lastPassTarget===i){
      this.stats[p.team].completed++;this.ball.lastPassTeam=-1;this.ball.lastPassTarget=-1;
    }else if(this.ball.lastPassTeam>=0&&this.ball.lastPassTeam!==p.team){
      this.ball.lastPassTeam=-1;this.ball.lastPassTarget=-1;
    }
    if(this.ball.owner!==null&&this.players[this.ball.owner])this.players[this.ball.owner].hasBall=false;
    this.ball.owner=i;p.hasBall=true;this.ball.vx=this.ball.vy=0;this.ball.state="controlled";this.ball.ignorePlayer=-1;
    if(p.team===this.userSide&&p.role!=="GK")this.controlled=i;
    this.updateTransition(p.team);
    return true;
  }

  release(i,vx,vy,passTarget=-1,isPass=false){
    const p=this.players[i];if(!p)return;
    p.hasBall=false;this.ball.owner=null;this.ball.state="free";
    const mag=Math.hypot(vx,vy)||1,ux=vx/mag,uy=vy/mag;
    this.ball.x=p.x+ux*(p.r+9);this.ball.y=p.y+uy*(p.r+9);
    this.ball.vx=vx;this.ball.vy=vy;this.ball.lastTeam=p.team;this.ball.ignorePlayer=i;this.ball.pickupLock=.20;
    if(isPass){this.stats[p.team].passes++;this.ball.lastPassTeam=p.team;this.ball.lastPassTarget=passTarget}
  }

  aimDirection(p){
    const m=Math.hypot(this.joy.x,this.joy.y);
    if(m>.18)return{x:this.joy.x/m,y:this.joy.y/m};
    return{x:p.team===0?1:-1,y:0};
  }

  opponentPressureAt(x,y,team,radius=72){
    return this.players.filter(q=>q.team!==team&&!q.sent&&q.role!=="GK"&&Math.hypot(q.x-x,q.y-y)<radius).length;
  }

  segmentClearance(x1,y1,x2,y2,team,ignoreGK=false){
    let min=999,blocks=0;
    for(const q of this.players){
      if(q.team===team||q.sent||(ignoreGK&&q.role==="GK"))continue;
      const vx=x2-x1,vy=y2-y1,wx=q.x-x1,wy=q.y-y1;
      const vv=vx*vx+vy*vy||1;
      let t=(wx*vx+wy*vy)/vv;t=Math.max(0,Math.min(1,t));
      const px=x1+vx*t,py=y1+vy*t,d=Math.hypot(q.x-px,q.y-py);
      min=Math.min(min,d);
      if(t>.05&&t<.98&&d<q.r+10)blocks++;
    }
    return{min,blocks};
  }

  bestPass(i,through=false){
    const p=this.players[i],aim=this.aimDirection(p),profile=this.tacticalProfile(p.team);
    let best=null,bs=-1e9;
    this.players.forEach((q,j)=>{
      if(j===i||q.team!==p.team||q.role==="GK"||q.sent)return;
      const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
      const directional=ux*aim.x+uy*aim.y,forward=(p.team===0?dx:-dx);
      const pressure=this.opponentPressureAt(q.x,q.y,p.team,74);
      const lane=this.segmentClearance(p.x,p.y,q.x,q.y,p.team,true);
      let score=directional*250+Math.max(0,forward)*(through?.36:.13)-d*.17-pressure*95-lane.blocks*150+Math.min(55,lane.min)*.9;
      if(q.role==="ST")score+=through?70:38;
      if(q.role==="W")score+=profile.width*35;
      if(q.role==="CM")score+=profile.mode==="possession"?38:12;
      if(score>bs){bs=score;best={j,x:q.x+(p.team===0?1:-1)*(through?88:22)+q.vx*.28,y:q.y+q.vy*.28}}
    });
    return best;
  }

  startPassCharge(){if(this.ball.owner===this.controlled){this.passCharging=true;this.passCharge=0}}
  releasePass(through=false){
    if(!this.passCharging||this.ball.owner!==this.controlled){this.passCharging=false;return}
    const t=this.bestPass(this.controlled,through);this.passCharging=false;if(!t)return;
    const p=this.players[this.controlled],dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
    const charge=Math.max(.12,Math.min(1,this.passCharge)),rating=(p.team===0?this.home.rating:this.away.rating)||72;
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,65);
    const err=Math.max(.003,(83-rating)*.0027+pressure*.004)*(Math.random()-.5);
    const ang=Math.atan2(dy,dx)+err,pow=(through?325:240)+(through?205:215)*charge;
    this.release(this.controlled,Math.cos(ang)*pow,Math.sin(ang)*pow,t.j,true);
  }

  chooseGoalTarget(i){
    const p=this.players[i],team=p.team,gx=team===0?this.W+24:-24;
    const keeper=this.players.find(q=>q.team!==team&&q.role==="GK"&&!q.sent);
    const ys=[.405,.445,.485,.515,.555,.595].map(v=>this.H*v);
    let bestY=this.H/2,best=-1e9;
    for(const y of ys){
      const lane=this.segmentClearance(p.x,p.y,gx,y,team,true);
      const keeperPenalty=keeper?Math.max(0,74-Math.abs(keeper.y-y))*3.0:0;
      const farPostBonus=(p.y<this.H/2?y>this.H/2:y<this.H/2)?26:0;
      const centerPenalty=Math.abs(y-this.H/2)<8?12:0;
      const score=lane.min*2.0-lane.blocks*480-keeperPenalty+farPostBonus-centerPenalty+Math.random()*5;
      if(score>best){best=score;bestY=y}
    }
    return{gx,gy:bestY,score:best};
  }

  startShotCharge(){if(this.ball.owner===this.controlled){this.shotCharging=true;this.shotCharge=0}}
  releaseShot(){
    if(!this.shotCharging||this.ball.owner!==this.controlled){this.shotCharging=false;return}
    this.shotCharging=false;
    const p=this.players[this.controlled],rating=(p.team===0?this.home.rating:this.away.rating)||72;
    const target=this.chooseGoalTarget(this.controlled),pressure=this.opponentPressureAt(p.x,p.y,p.team,68);
    const dx=target.gx-p.x,dy=target.gy-p.y,l=Math.hypot(dx,dy)||1;
    const charge=Math.max(.18,Math.min(1,this.shotCharge));
    const error=Math.max(.002,(84-rating)*.0024+pressure*.0045);
    const angle=Math.atan2(dy,dx)+(Math.random()-.5)*error;
    this.stats[p.team].shots++;this.stats[p.team].onTarget++;
    this.events.push({half:this.half,minute:this.displayMinute(),type:"Удар",team:p.team,text:`${p.name} пробил по воротам`});
    this.release(this.controlled,Math.cos(angle)*(365+235*charge),Math.sin(angle)*(365+235*charge),-1,false);
    this.teamShotCooldown[p.team]=2.8;
  }

  tackle(){
    const p=this.players[this.controlled];if(!p||p.contactCd>0)return;p.contactCd=.32;
    const owner=this.ball.owner;if(owner===null)return;const o=this.players[owner];
    if(!o||o.team===p.team)return;const d=Math.hypot(p.x-o.x,p.y-o.y);if(d>43)return;
    const rating=(p.team===0?this.home.rating:this.away.rating)||72;
    const chance=Math.max(.22,Math.min(.84,.48+(rating-72)*.009+(p.strength-o.strength)*.35-d/120));
    if(Math.random()<chance){
      o.hasBall=false;this.ball.owner=null;this.ball.state="free";
      const dx=o.x-p.x,dy=o.y-p.y,l=Math.hypot(dx,dy)||1;
      this.ball.x=o.x;this.ball.y=o.y;this.ball.vx=dx/l*165;this.ball.vy=dy/l*165;
      this.ball.lastTeam=p.team;this.ball.ignorePlayer=this.controlled;this.ball.pickupLock=.10;
      this.stats[p.team].tackles++;
    }
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
      const dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy),safe=p.r+q.r+(q.team===p.team?28:8);
      if(d>0&&d<safe*1.55){const w=(safe*1.55-d)/(safe*1.55);sx+=(dx/d)*w;sy+=(dy/d)*w;n++}
    }
    return n?{x:sx/n,y:sy/n}:{x:0,y:0};
  }

  steer(p,tx,ty,dt,mul=1){
    const sep=this.separation(p);tx+=sep.x*48;ty+=sep.y*48;
    const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy),desired=Math.min(p.speed*mul,d*4.4);
    const dvx=(d?dx/d:0)*desired-p.vx,dvy=(d?dy/d:0)*desired-p.vy,dl=Math.hypot(dvx,dvy)||1,max=p.accel*dt;
    p.vx+=dvx/dl*Math.min(max,dl);p.vy+=dvy/dl*Math.min(max,dl);
  }

  keeperAI(p,i,dt){
    const profile=this.tacticalProfile(p.team),rating=profile.rating,gx=p.team===0?38:this.W-38;
    let tx=gx,ty=Math.max(this.H*.36,Math.min(this.H*.64,this.ball.y));
    const danger=p.team===0?this.ball.x<this.W*.30:this.ball.x>this.W*.70;
    const owner=this.ball.owner!==null?this.players[this.ball.owner]:null;
    if(danger){
      const nearOneVOne=owner&&owner.team!==p.team&&(p.team===0?owner.x<this.W*.22:owner.x>this.W*.78);
      tx+=p.team===0?(nearOneVOne?58:42):(nearOneVOne?-58:-42);
    }
    this.steer(p,tx,ty,dt,1.13+(rating-72)*.006);

    if(this.ball.owner===null&&this.ball.state==="free"){
      const dist=Math.hypot(p.x-this.ball.x,p.y-this.ball.y),sp=Math.hypot(this.ball.vx,this.ball.vy);
      const movingTowardGoal=p.team===0?this.ball.vx<0:this.ball.vx>0;
      const reach=30+(rating-66)*.8;
      if(dist<reach){
        const catchChance=Math.max(.45,Math.min(.97,.80+(rating-72)*.012-sp/1150+(movingTowardGoal?.04:0)));
        if(sp<560&&Math.random()<catchChance){
          if(this.ball.owner!==null&&this.players[this.ball.owner])this.players[this.ball.owner].hasBall=false;
          this.ball.owner=i;p.hasBall=true;this.ball.state="controlled";this.ball.vx=this.ball.vy=0;
          this.ball.ignorePlayer=-1;this.updateTransition(p.team);
        }else{
          const away=p.team===0?1:-1;
          this.ball.vx=away*(300+Math.random()*115);this.ball.vy=(Math.random()-.5)*210;this.ball.lastTeam=p.team;
        }
      }
    }

    if(this.ball.owner===i){
      p.decision-=dt;
      if(p.decision<=0){
        p.decision=.48+Math.random()*.25;
        const mates=this.players.filter(q=>q.team===p.team&&q.role!=="GK"&&!q.sent);
        const safe=mates.sort((a,b)=>this.opponentPressureAt(a.x,a.y,p.team)-this.opponentPressureAt(b.x,b.y,p.team))[0];
        if(safe){
          const dx=safe.x-p.x,dy=safe.y-p.y,l=Math.hypot(dx,dy)||1;
          this.release(i,dx/l*(320+(rating-72)*2.2),dy/l*(320+(rating-72)*2.2),safe.team===p.team?this.players.indexOf(safe):-1,true);
        }
      }
    }
  }

  getCarrier(){return this.ball.owner!==null?this.players[this.ball.owner]:null}

  attackTarget(p,carrier){
    const dir=p.team===0?1:-1,profile=this.tacticalProfile(p.team);
    let x=p.homeX,y=p.homeY;
    const ahead=(carrier.x-p.homeX)*dir;
    if(p.role==="DEF"){
      x=carrier.x-dir*(110+profile.direct*15);
      y=this.H/2+(p.homeY-this.H/2)*.25;
    }else if(p.role==="CM"){
      x=carrier.x-dir*(24-profile.mode==="possession"?10:0);
      y=carrier.y+(p.homeY-this.H/2)*.55;
    }else if(p.role==="W"){
      const side=p.homeY<this.H/2?.22:.78;
      x=carrier.x+dir*(75+profile.tempo*35);
      y=this.H*side;
    }else if(p.role==="ST"){
      x=carrier.x+dir*(125+profile.direct*45);
      y=this.H/2+(Math.sin(this.elapsed*1.7+p.rolePhase)*this.H*.06);
    }
    return{x,y};
  }

  dangerousOpponents(team){
    const dir=team===0?1:-1;
    return this.players.filter(q=>q.team!==team&&q.role!=="GK"&&!q.sent)
      .sort((a,b)=>((team===0?a.x:b.x)*dir)-((team===0?b.x:a.x)*dir));
  }

  defensiveTarget(p,team,rank,carrier){
    const dir=team===0?1:-1,profile=this.tacticalProfile(team);
    const ballX=this.ball.x,ballY=this.ball.y;
    if(rank===0)return{x:ballX-dir*10,y:ballY};
    if(rank===1){
      const coverX=ballX-dir*(58+profile.press*20);
      return{x:coverX,y:ballY+(p.homeY-this.H/2)*.30};
    }
    const dangerous=this.players.filter(q=>q.team!==team&&q.role!=="GK"&&!q.sent&&q!==carrier);
    let mark=null,bd=1e9;
    for(const q of dangerous){
      const d=Math.hypot(q.x-p.homeX,q.y-p.homeY);
      if(d<bd){bd=d;mark=q}
    }
    if(mark){
      return{x:mark.x-dir*36,y:mark.y+(p.homeY-this.H/2)*.16};
    }
    const shift=(ballX-this.W/2)*.22;
    return{x:p.homeX+shift*.55,y:this.H/2+(p.homeY-this.H/2)*.68+(ballY-this.H/2)*.10};
  }

  shotQuality(i){
    const p=this.players[i],team=p.team,gx=team===0?this.W:-0;
    const dist=Math.abs(gx-p.x),central=1-Math.min(1,Math.abs(p.y-this.H/2)/(this.H*.32));
    const lane=this.segmentClearance(p.x,p.y,gx,this.H/2,team,true);
    const pressure=this.opponentPressureAt(p.x,p.y,team,68);
    const distanceScore=1-Math.min(1,dist/(this.W*.52));
    return distanceScore*.56+central*.27+Math.min(1,lane.min/70)*.20-pressure*.10-Math.min(2,lane.blocks)*.12;
  }

  aiCarrier(p,i,dt){
    const profile=this.tacticalProfile(p.team),dir=p.team===0?1:-1;
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,72),quality=this.shotQuality(i);
    const progress=p.team===0?p.x/this.W:1-p.x/this.W;
    p.decision-=dt;
    if(p.decision<=0){
      p.decision=Math.max(.34,.68-profile.tempo*.18+Math.random()*.24);
      if(this.teamShotCooldown[p.team]<=0&&progress>.61&&quality>(.34-(profile.rating-72)*.0045)){
        this.aiShoot(i);return;
      }
      const through=profile.direct>.68&&progress>.42&&Math.random()<.34;
      const pass=this.bestPass(i,through);
      const mustRelease=pressure>=1 || (progress>.70&&quality<.40);
      const circulation=profile.mode==="possession" ? .42 : .30;
      if(pass&&(mustRelease||Math.random()<circulation)){
        this.aiPass(i,through);return;
      }
    }
    const laneY=this.H/2+(p.role==="W"?(p.homeY<this.H/2?-this.H*.08:this.H*.08):0);
    const drive=progress<.72 ? (88+profile.tempo*28) : 58;
    this.steer(p,p.x+dir*drive,laneY+(p.y-laneY)*.62,dt,1.01+profile.tempo*.09);
  }

  ai(p,i,dt){
    if(p.sent)return;
    const team=p.team,profile=this.tacticalProfile(team),carrier=this.getCarrier();
    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.lastPassTeam===team&&this.ball.lastPassTarget===i){
      const tx=this.ball.x+this.ball.vx*.16,ty=this.ball.y+this.ball.vy*.16;
      this.steer(p,tx,ty,dt,1.08+profile.tempo*.06);return;
    }
    const own=carrier&&carrier.team===team;
    if(own&&i===this.ball.owner){this.aiCarrier(p,i,dt);return}

    const field=this.players.filter(q=>q.team===team&&!q.sent&&q.role!=="GK");
    const ranks=[...field].sort((a,b)=>Math.hypot(a.x-this.ball.x,a.y-this.ball.y)-Math.hypot(b.x-this.ball.x,b.y-this.ball.y));
    const rank=ranks.indexOf(p);

    if(own&&carrier){
      const t=this.attackTarget(p,carrier);
      this.steer(p,t.x,t.y,dt,.86+profile.tempo*.10);
      return;
    }

    const counter=this.counterPressTeam===team&&this.counterPressTimer>0;
    let effectiveRank=rank;
    if(counter&&profile.counter>.65&&rank<=1)effectiveRank=rank;
    else if(!counter&&rank===1&&profile.press<.72)effectiveRank=2;

    if(team===this.userSide&&this.secondPress&&rank===1)effectiveRank=0;
    const t=this.defensiveTarget(p,team,effectiveRank,carrier);
    let mul=.82+profile.press*.15;
    if(effectiveRank===0)mul=1.02+profile.press*.13;
    this.steer(p,t.x,t.y,dt,mul);
  }

  aiPass(i,through=false){
    const t=this.bestPass(i,through);if(!t)return;
    const p=this.players[i],rating=(p.team===0?this.home.rating:this.away.rating)||72;
    const dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,70);
    const err=Math.max(.003,(84-rating)*.0023+pressure*.0035)*(Math.random()-.5);
    const ang=Math.atan2(dy,dx)+err,pow=(through?390:315)+(rating-72)*2;
    this.release(i,Math.cos(ang)*pow,Math.sin(ang)*pow,t.j,true);
  }

  aiShoot(i){
    const p=this.players[i],rating=(p.team===0?this.home.rating:this.away.rating)||72,target=this.chooseGoalTarget(i);
    const dx=target.gx-p.x,dy=target.gy-p.y,l=Math.hypot(dx,dy)||1;
    const pressure=this.opponentPressureAt(p.x,p.y,p.team,68);
    const error=Math.max(.002,(84-rating)*.0023+pressure*.004);
    const angle=Math.atan2(dy,dx)+(Math.random()-.5)*error;
    this.stats[p.team].shots++;this.stats[p.team].onTarget++;
    this.events.push({half:this.half,minute:this.displayMinute(),type:"Удар",team:p.team,text:`${p.name} пробил по воротам`});
    this.release(i,Math.cos(angle)*(485+(rating-72)*2),Math.sin(angle)*(485+(rating-72)*2),-1,false);
    this.teamShotCooldown[p.team]=3.1;
  }

  setRestart(type,team,x,y){
    this.ball.owner=null;this.ball.vx=this.ball.vy=0;this.ball.x=x;this.ball.y=y;this.ball.state="restart";
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
      const p=this.players[r.thrower];
      if(!p){r.stage="throw";r.t=.25;return}
      const targetY=r.y===30?r.y+10:r.y-10;
      this.steer(p,r.x,targetY,dt,1.05);
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      const d=Math.hypot(p.x-r.x,p.y-targetY);
      if(d<16){p.vx=p.vy=0;r.stage="throw";r.t=.32}
      return;
    }
    if(r.stage==="wait"){r.t+=dt;if(r.t>.65){r.stage="throw";r.t=.20}return}
    if(r.stage==="throw"){r.t-=dt;if(r.t<=0)this.takeRestart()}
  }

  takeRestart(){
    const r=this.restart;if(!r)return;this.restart=null;this.ball.state="free";
    if(r.type==="throw"){
      const thrower=this.players[r.thrower];
      const targets=this.players.filter(q=>q.team===r.team&&q!==thrower&&q.role!=="GK"&&!q.sent)
        .sort((a,b)=>this.opponentPressureAt(a.x,a.y,r.team)-this.opponentPressureAt(b.x,b.y,r.team));
      const target=targets[0];
      if(target){
        let dx=target.x-r.x,dy=target.y-r.y,l=Math.hypot(dx,dy)||1;
        this.ball.x=r.x;this.ball.y=r.y;this.ball.vx=dx/l*255;this.ball.vy=dy/l*255;this.ball.lastTeam=r.team;
        this.ball.pickupLock=.10;this.ball.ignorePlayer=r.thrower;
      }
      return;
    }
    let tx=r.team===0?this.ball.x+140:this.ball.x-140,ty=this.H/2+(Math.random()-.5)*this.H*.36;
    if(r.type==="corner"){tx=r.team===0?this.W*.72:this.W*.28;ty=this.H/2+(Math.random()-.5)*this.H*.13}
    let dx=tx-this.ball.x,dy=ty-this.ball.y,l=Math.hypot(dx,dy)||1,pow=r.type==="corner"?370:320;
    this.ball.vx=dx/l*pow;this.ball.vy=dy/l*pow;this.ball.lastTeam=r.team;this.ball.pickupLock=.10;this.ball.ignorePlayer=-1;
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
      }
    }
  }

  displayMinute(){
    const base=this.half===1?0:45;
    const normal=Math.min(45,this.halfElapsed/this.realHalfDuration*45);
    if(this.halfElapsed<=this.realHalfDuration)return Math.floor(base+normal);
    const extraReal=this.halfElapsed-this.realHalfDuration;
    const extraMin=this.addedReal?Math.min(this.addedMinutes,extraReal/this.addedReal*this.addedMinutes):0;
    return Math.floor(base+45+extraMin);
  }

  determineAddedTime(){
    const activity=this.events.filter(e=>e.half===this.half).length+this.stats[0].corners+this.stats[1].corners+Math.floor((this.stats[0].shots+this.stats[1].shots)/4);
    const max=Math.min(5,Math.floor(activity/4)+1);
    if(Math.random()<.20)return 0;
    return Math.floor(Math.random()*(max+1));
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
    this.teamShotCooldown[0]=Math.max(0,this.teamShotCooldown[0]-dt);
    this.teamShotCooldown[1]=Math.max(0,this.teamShotCooldown[1]-dt);
    if(this.counterPressTimer>0)this.counterPressTimer-=dt;

    if(this.phase==="kickoff"){this.kickoffTimer-=dt;if(this.kickoffTimer<=0)this.beginKickoff();return}
    if(this.ball.pickupLock>0)this.ball.pickupLock-=dt;
    if(this.ball.state==="restart"){this.updateRestart(dt);return}
    if(this.passCharging)this.passCharge=Math.min(1,this.passCharge+dt/1.2);
    if(this.shotCharging)this.shotCharge=Math.min(1,this.shotCharge+dt/1.0);

    const carrier=this.getCarrier();
    if(carrier)this.stats[carrier.team].possession+=dt;

    const cp=this.players[this.controlled];
    if(cp&&!cp.sent){
      const m=Math.hypot(this.joy.x,this.joy.y),mul=(this.sprint?1.46:1)*(0.78+.22*cp.stamina);
      if(m>.04)this.steer(cp,cp.x+this.joy.x*145,cp.y+this.joy.y*145,dt,mul);
      else if(this.pressAssist && (!carrier || carrier.team!==this.userSide)){
        this.steer(cp,this.ball.x,this.ball.y,dt,1.10);
      }else{cp.vx*=Math.pow(.07,dt);cp.vy*=Math.pow(.07,dt)}
    }

    this.players.forEach((p,i)=>{
      p.contactCd=Math.max(0,p.contactCd-dt);
      const moving=Math.hypot(p.vx,p.vy);
      p.stamina=Math.max(.28,p.stamina-dt*(moving>120?.0027:.0005));
      if(p.role==="GK")this.keeperAI(p,i,dt);else if(i!==this.controlled)this.ai(p,i,dt);
      p.anim+=dt*(3+moving/45);
      p.x=Math.max(B.l+2,Math.min(B.r-2,p.x+p.vx*dt));p.y=Math.max(B.t+2,Math.min(B.b-2,p.y+p.vy*dt));
    });

    this.resolveContacts();

    if(this.ball.owner!==null){
      const p=this.players[this.ball.owner],dir=p.team===0?1:-1;
      const sprintTouch=(p.team===this.userSide&&this.sprint&&this.ball.owner===this.controlled)?3:0;
      this.ball.x=p.x+dir*(p.r+5+sprintTouch);this.ball.y=p.y;
    }else{
      this.ball.x+=this.ball.vx*dt;this.ball.y+=this.ball.vy*dt;this.ball.vx*=Math.pow(.15,dt);this.ball.vy*=Math.pow(.15,dt);
      const hits=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)}))
        .filter(o=>!o.p.sent&&o.d<o.p.r+this.ball.r+2).sort((a,b)=>a.d-b.d);
      for(const h of hits){if(this.claim(h.i))break}
    }

    const gt=this.H*.39,gb=this.H*.61;
    if(this.ball.x>this.W-14&&this.ball.y>gt&&this.ball.y<gb){
      this.score[0]++;this.events.push({half:this.half,minute:this.displayMinute(),type:"Гол",team:0,text:`Гол — ${this.home.name}`});this.kickoff(1);return;
    }
    if(this.ball.x<14&&this.ball.y>gt&&this.ball.y<gb){
      this.score[1]++;this.events.push({half:this.half,minute:this.displayMinute(),type:"Гол",team:1,text:`Гол — ${this.away.name}`});this.kickoff(0);return;
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
    c.save();c.translate(x,y);c.rotate((this.elapsed*7)%6.28);
    c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fillStyle="#f5f5f3";c.fill();c.strokeStyle="#111";c.lineWidth=1;c.stroke();
    c.fillStyle="#171717";
    for(let k=0;k<5;k++){const a=k*Math.PI*2/5-Math.PI/2;c.beginPath();c.arc(Math.cos(a)*r*.45,Math.sin(a)*r*.45,r*.18,0,Math.PI*2);c.fill()}
    c.beginPath();c.arc(0,0,r*.22,0,Math.PI*2);c.fill();c.restore();
  }

  drawPlayer(p,i){
    const c=this.ctx,club=p.team?this.away:this.home;
    const base=p.role==="GK"?(p.team?"#f39a43":"#f0d33d"):(p.team?"#f5f5f5":club.color);
    const txt=p.role==="GK"?"#111":(p.team?club.color:"#fff"),speed=Math.hypot(p.vx,p.vy);
    const squish=Math.min(.10,speed/1200),bob=Math.sin(p.anim)*Math.min(1.5,speed/90);
    c.save();c.translate(p.x,p.y+bob);
    if(speed>25){c.globalAlpha=.18;c.fillStyle="#000";c.beginPath();c.ellipse(-p.vx*.045,-p.vy*.045,p.r*.85,p.r*.38,0,0,Math.PI*2);c.fill();c.globalAlpha=1}
    if(i===this.controlled){c.beginPath();c.arc(0,0,p.r+6,0,Math.PI*2);c.strokeStyle="#fff36b";c.lineWidth=3;c.stroke()}
    c.scale(1+squish,1-squish);c.beginPath();c.arc(0,0,p.r,0,Math.PI*2);c.fillStyle=base;c.fill();c.strokeStyle="#fff8";c.stroke();
    c.save();c.clip();if(p.role!=="GK"){c.globalAlpha=.18;c.fillStyle=p.team?club.color:"#fff";c.fillRect(-p.r,-p.r,p.r*.38,p.r*2);c.fillRect(p.r*.20,-p.r,p.r*.38,p.r*2);c.globalAlpha=1}c.restore();
    c.fillStyle=txt;c.font="900 10px Arial";c.textAlign="center";c.textBaseline="middle";c.fillText(p.num,0,0);c.restore();
    c.font="700 9px Arial";c.textAlign="center";c.textBaseline="bottom";c.fillStyle="#fff";c.strokeStyle="#0009";c.lineWidth=3;c.strokeText(p.name,p.x,p.y-p.r-7);c.fillText(p.name,p.x,p.y-p.r-7);
  }

  drawChargeBar(x,y,w,val,label){
    const c=this.ctx;c.fillStyle="#07110dcc";c.fillRect(x,y,w,8);c.fillStyle="#fff";c.globalAlpha=.9;c.fillRect(x,y,w*val,8);c.globalAlpha=1;c.font="700 9px Arial";c.fillStyle="#fff";c.fillText(label,x,y-4);
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
    const target=this.realHalfDuration+this.addedReal;
    if(this.halfElapsed>=target){
      if(this.half===1){this.halftime();return}
      this.running=false;this.onFinish(this.score);return;
    }
    this.update(dt);this.draw();App.updateHUD(this);requestAnimationFrame(x=>this.loop(x));
  }
};
