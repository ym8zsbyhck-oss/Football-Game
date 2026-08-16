
window.MatchEngine = class {
  constructor(canvas,onFinish){
    this.canvas=canvas; this.ctx=canvas.getContext("2d"); this.onFinish=onFinish;
    this.running=false; this.paused=false; this.userSide=0;
    this.players=[]; this.ball={}; this.score=[0,0]; this.elapsed=0; this.duration=300;
    this.controlled=0; this.joy={x:0,y:0}; this.sprint=false; this.last=0;
    this.restart=null; this.phase="kickoff"; this.kickoffTeam=0; this.kickoffTimer=0;
    this.passCharge=0; this.shotCharge=0; this.passCharging=false; this.shotCharging=false;
  }

  resize(){
    this.W=innerWidth; this.H=innerHeight;
    const d=Math.min(devicePixelRatio||1,2);
    this.canvas.width=this.W*d; this.canvas.height=this.H*d;
    this.ctx.setTransform(d,0,0,d,0,0);
  }

  start(home,away,userSide){
    this.home=home; this.away=away; this.userSide=userSide;
    this.score=[0,0]; this.elapsed=0; this.running=true; this.paused=false;
    this.resize(); this.kickoff(0); this.last=performance.now();
    requestAnimationFrame(t=>this.loop(t));
  }

  form(side){
    // 1 GK + 4 field players: DEF, CM, AM/W, ST
    const left=[[.07,.50],[.24,.50],[.40,.30],[.40,.70],[.56,.50]];
    const roles=["GK","DEF","CM","W","ST"];
    const nums=[1,4,6,10,9];
    return left.map((v,i)=>{
      let x=side?1-v[0]:v[0];
      return {
        team:side,role:roles[i],x:this.W*x,y:this.H*v[1],
        homeX:this.W*x,homeY:this.H*v[1],vx:0,vy:0,
        r:i===0?16:14,num:nums[i],speed:i===0?92:108+(i%2)*4,
        accel:i===0?520:660,hasBall:false,decision:.2+Math.random()*.3,
        stamina:1,sent:false,contactCd:0,strength:.88+((i*11)%12)/100,
        name:["Вратарь","Защитник","Полузащитник","Плеймейкер","Нападающий"][i]
      }
    });
  }

  kickoff(team){
    this.players=[...this.form(0),...this.form(1)];
    this.kickoffTeam=team; this.phase="kickoff"; this.kickoffTimer=.55;
    this.ball={x:this.W/2,y:this.H/2,vx:0,vy:0,r:5,owner:null,lastTeam:team,state:"dead",pickupLock:0,ignorePlayer:-1};

    const ids=team===0?[3,4]:[8,9];
    const dir=team===0?-1:1;
    this.players[ids[0]].x=this.W/2+dir*18; this.players[ids[0]].y=this.H/2;
    this.players[ids[1]].x=this.W/2+dir*58; this.players[ids[1]].y=this.H/2+34;
    this.controlled=this.nearestUser();
  }

  beginKickoff(){
    const team=this.kickoffTeam, passer=team===0?3:8, receiver=team===0?4:9;
    const q=this.players[receiver];
    this.ball.state="free"; this.ball.x=this.W/2; this.ball.y=this.H/2;
    let dx=q.x-this.ball.x,dy=q.y-this.ball.y,l=Math.hypot(dx,dy)||1;
    this.ball.vx=dx/l*215; this.ball.vy=dy/l*215; this.ball.lastTeam=team;
    this.ball.ignorePlayer=passer; this.ball.pickupLock=.20; this.phase="open";
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
  nearestUser(){ return this.nearest(this.userSide); }

  claim(i){
    const p=this.players[i];
    if(!p||p.sent||this.ball.state!=="free") return false;
    if(this.ball.pickupLock>0&&i===this.ball.ignorePlayer) return false;
    const speed=Math.hypot(this.ball.vx,this.ball.vy);
    const teamRating=(p.team===0?this.home.rating:this.away.rating)||75;
    const controlBonus=(teamRating-70)/50;
    if(speed>500)return false;
    if(speed>340 && Math.random()>(.48+controlBonus)){
      this.ball.vx*=.58; this.ball.vy*=.58; return false;
    }
    if(this.ball.owner!==null&&this.players[this.ball.owner])this.players[this.ball.owner].hasBall=false;
    this.ball.owner=i;p.hasBall=true;this.ball.vx=0;this.ball.vy=0;this.ball.state="controlled";
    this.ball.ignorePlayer=-1;
    if(p.team===this.userSide&&p.role!=="GK")this.controlled=i;
    return true;
  }

  release(i,vx,vy){
    const p=this.players[i]; if(!p)return;
    p.hasBall=false; this.ball.owner=null; this.ball.state="free";
    const mag=Math.hypot(vx,vy)||1,ux=vx/mag,uy=vy/mag;
    this.ball.x=p.x+ux*(p.r+9);this.ball.y=p.y+uy*(p.r+9);
    this.ball.vx=vx;this.ball.vy=vy;this.ball.lastTeam=p.team;
    this.ball.ignorePlayer=i;this.ball.pickupLock=.22;
  }

  aimDirection(p){
    const m=Math.hypot(this.joy.x,this.joy.y);
    if(m>.18)return {x:this.joy.x/m,y:this.joy.y/m};
    return {x:p.team===0?1:-1,y:0};
  }

  bestPass(i,through=false){
    const p=this.players[i],aim=this.aimDirection(p);
    let best=null,bs=-1e9;
    this.players.forEach((q,j)=>{
      if(j===i||q.team!==p.team||q.role==="GK"||q.sent)return;
      const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1;
      const ux=dx/d,uy=dy/d;
      const directional=ux*aim.x+uy*aim.y;
      const forward=(p.team===0?dx:-dx);
      const pressure=this.players.filter(r=>r.team!==p.team&&!r.sent&&Math.hypot(r.x-q.x,r.y-q.y)<70).length;
      let score=directional*260+Math.max(0,forward)*(through?.34:.14)-d*.18-pressure*90;
      if(q.role==="ST")score+=45;if(q.role==="W")score+=25;
      if(score>bs){bs=score;best={j,x:q.x+(p.team===0?1:-1)*(through?88:22)+q.vx*.28,y:q.y+q.vy*.28}}
    });
    return best;
  }

  startPassCharge(){ if(this.ball.owner===this.controlled){this.passCharging=true;this.passCharge=0} }
  releasePass(through=false){
    if(!this.passCharging||this.ball.owner!==this.controlled){this.passCharging=false;return}
    const t=this.bestPass(this.controlled,through);this.passCharging=false;if(!t)return;
    const p=this.players[this.controlled],dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
    const charge=Math.max(.15,Math.min(1,this.passCharge));
    const rating=((p.team===0?this.home.rating:this.away.rating)||75);
    const accuracy=1-Math.max(0,(78-rating))*0.006;
    const err=(1-accuracy)*(Math.random()-.5)*.24;
    const base=through?330:245, extra=through?190:210;
    const ang=Math.atan2(dy,dx)+err;
    const pow=base+extra*charge;
    this.release(this.controlled,Math.cos(ang)*pow,Math.sin(ang)*pow);
  }

  startShotCharge(){ if(this.ball.owner===this.controlled){this.shotCharging=true;this.shotCharge=0} }
  releaseShot(){
    if(!this.shotCharging||this.ball.owner!==this.controlled){this.shotCharging=false;return}
    this.shotCharging=false;
    const p=this.players[this.controlled],gx=p.team===0?this.W+28:-28;
    const aim=this.aimDirection(p);
    const gy=this.H/2+aim.y*this.H*.20;
    const dx=gx-p.x,dy=gy-p.y,l=Math.hypot(dx,dy)||1;
    const charge=Math.max(.2,Math.min(1,this.shotCharge));
    const rating=((p.team===0?this.home.rating:this.away.rating)||75);
    const spread=Math.max(.01,(82-rating)*.0035)*(Math.random()-.5);
    const ang=Math.atan2(dy,dx)+spread;
    const pow=360+230*charge;
    this.release(this.controlled,Math.cos(ang)*pow,Math.sin(ang)*pow);
  }

  tackle(){
    const p=this.players[this.controlled];
    if(!p||p.contactCd>0)return;
    p.contactCd=.35;
    const owner=this.ball.owner;if(owner===null)return;
    const o=this.players[owner];if(!o||o.team===p.team)return;
    const d=Math.hypot(p.x-o.x,p.y-o.y);if(d>42)return;
    const teamRating=(p.team===0?this.home.rating:this.away.rating)||75;
    const chance=Math.max(.25,Math.min(.82,.52+(teamRating-75)*.008-d/110));
    if(Math.random()<chance){
      o.hasBall=false;this.ball.owner=null;this.ball.state="free";
      const dx=o.x-p.x,dy=o.y-p.y,l=Math.hypot(dx,dy)||1;
      this.ball.x=o.x;this.ball.y=o.y;this.ball.vx=dx/l*155;this.ball.vy=dy/l*155;
      this.ball.lastTeam=p.team;this.ball.ignorePlayer=this.controlled;this.ball.pickupLock=.1;
    }
  }

  switch(){
    // Important: while user's controlled player owns the ball, switching is disabled.
    if(this.ball.owner===this.controlled)return;
    const arr=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)}))
      .filter(o=>o.p.team===this.userSide&&o.p.role!=="GK"&&!o.p.sent).sort((a,b)=>a.d-b.d);
    if(!arr.length)return;
    const k=arr.findIndex(o=>o.i===this.controlled);
    this.controlled=arr[(k+1)%Math.min(4,arr.length)].i;
  }

  separation(p){
    let sx=0,sy=0,n=0;
    for(const q of this.players){
      if(q===p||q.sent)continue;
      const dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy);
      const safe=p.r+q.r+(q.team===p.team?24:8);
      if(d>0&&d<safe*1.5){
        const w=(safe*1.5-d)/(safe*1.5);
        sx+=(dx/d)*w;sy+=(dy/d)*w;n++;
      }
    }
    return n?{x:sx/n,y:sy/n}:{x:0,y:0};
  }

  steer(p,tx,ty,dt,mul=1){
    const sep=this.separation(p);tx+=sep.x*44;ty+=sep.y*44;
    const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy);
    const desired=Math.min(p.speed*mul,d*4.3);
    const dvx=(d?dx/d:0)*desired-p.vx,dvy=(d?dy/d:0)*desired-p.vy;
    const dl=Math.hypot(dvx,dvy)||1,max=p.accel*dt;
    p.vx+=dvx/dl*Math.min(max,dl);p.vy+=dvy/dl*Math.min(max,dl);
  }

  keeperAI(p,i,dt){
    const teamRating=(p.team===0?this.home.rating:this.away.rating)||75;
    const gx=p.team===0?38:this.W-38;
    let tx=gx,ty=Math.max(this.H*.34,Math.min(this.H*.66,this.ball.y));
    const danger=p.team===0?this.ball.x<this.W*.28:this.ball.x>this.W*.72;
    if(danger)tx+=p.team===0?42:-42;
    this.steer(p,tx,ty,dt,1.10+(teamRating-75)*.006);

    if(this.ball.owner===null&&this.ball.state==="free"&&Math.hypot(p.x-this.ball.x,p.y-this.ball.y)<29){
      const sp=Math.hypot(this.ball.vx,this.ball.vy);
      const catchChance=Math.max(.38,Math.min(.96,.74+(teamRating-75)*.012-sp/1000));
      if(sp<520&&Math.random()<catchChance)this.claim(i);
      else{
        this.ball.vx=(p.team===0?1:-1)*(280+Math.random()*120);
        this.ball.vy=(Math.random()-.5)*190;this.ball.lastTeam=p.team;
      }
    }

    if(this.ball.owner===i){
      p.decision-=dt;
      if(p.decision<=0){
        p.decision=.6;
        const mates=this.players.filter(q=>q.team===p.team&&q.role!=="GK"&&!q.sent)
          .sort((a,b)=>p.team===0?a.x-b.x:b.x-a.x);
        const t=mates[Math.min(1,mates.length-1)];
        const dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
        this.release(i,dx/l*(315+(teamRating-75)*2),dy/l*(315+(teamRating-75)*2));
      }
    }
  }

  shapeTarget(p){
    const own=this.ball.owner!==null&&this.players[this.ball.owner]?.team===p.team;
    const dir=p.team===0?1:-1;
    const teamRating=(p.team===0?this.home.rating:this.away.rating)||75;
    let x=p.homeX,y=p.homeY;
    if(own){
      const c=this.players[this.ball.owner];
      const push={DEF:-90,CM:35,W:95,ST:145}[p.role]||0;
      x=c.x+dir*push;
      if(p.role==="W")y=p.homeY;
      else if(p.role==="ST")y=this.H/2;
      else y=p.homeY+(c.y-this.H/2)*.22;
    }else{
      const shift=(this.ball.x-this.W/2)*(.16+(teamRating-70)*.002);
      x=p.homeX+shift;
      y=this.H/2+(p.homeY-this.H/2)*.72+(this.ball.y-this.H/2)*.12;
      if(p.role==="DEF")x=p.homeX+shift*.45;
      if(p.role==="ST")x=p.homeX+shift*.25;
    }
    return {x,y};
  }

  ai(p,i,dt){
    if(p.sent)return;
    const team=p.team,own=this.ball.owner!==null&&this.players[this.ball.owner]?.team===team;
    const teamRating=(team===0?this.home.rating:this.away.rating)||75;
    const active=this.players.filter(q=>q.team===team&&!q.sent&&q.role!=="GK")
      .sort((a,b)=>Math.hypot(a.x-this.ball.x,a.y-this.ball.y)-Math.hypot(b.x-this.ball.x,b.y-this.ball.y));
    const presser=active[0];

    if(own&&i===this.ball.owner){
      const dir=team===0?1:-1;
      this.steer(p,p.x+dir*90,p.y+(this.H/2-p.y)*.05,dt,1.02+(teamRating-75)*.004);
      p.decision-=dt;
      if(p.decision<=0){
        p.decision=.34+Math.random()*.35-(teamRating-75)*.004;
        const near=team===0?p.x>this.W*.66:p.x<this.W*.34;
        if(near&&Math.abs(p.y-this.H/2)<this.H*.30&&Math.random()<(.38+(teamRating-70)*.012))this.aiShoot(i);
        else if(Math.random()<(.68+(teamRating-70)*.008))this.aiPass(i,Math.random()<.28);
      }
      return;
    }

    let t=this.shapeTarget(p);
    if(!own&&p===presser){
      t={x:this.ball.x+(team===0?-10:10),y:this.ball.y};
      this.steer(p,t.x,t.y,dt,1.05+(teamRating-75)*.004);
      return;
    }
    this.steer(p,t.x,t.y,dt,.86+(teamRating-75)*.003);
  }

  aiPass(i,through=false){
    const t=this.bestPass(i,through);if(!t)return;
    const p=this.players[i],dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
    const rating=(p.team===0?this.home.rating:this.away.rating)||75;
    const err=Math.max(.005,(82-rating)*.003)*(Math.random()-.5);
    const ang=Math.atan2(dy,dx)+err,pow=(through?395:320)+(rating-75)*1.8;
    this.release(i,Math.cos(ang)*pow,Math.sin(ang)*pow);
  }

  aiShoot(i){
    const p=this.players[i],rating=(p.team===0?this.home.rating:this.away.rating)||75;
    const gx=p.team===0?this.W+24:-24,gy=this.H/2+(Math.random()-.5)*this.H*(.18-(rating-70)*.002);
    const dx=gx-p.x,dy=gy-p.y,l=Math.hypot(dx,dy)||1;
    this.release(i,dx/l*(475+(rating-75)*2.2),dy/l*(475+(rating-75)*2.2));
  }

  setRestart(type,team,x,y){
    this.ball.owner=null;this.ball.vx=this.ball.vy=0;this.ball.x=x;this.ball.y=y;
    this.ball.state="restart";this.restart={type,team,t:type==="throw"?1.05:.8,thrower:null};
  }

  takeRestart(){
    const r=this.restart;if(!r)return;
    this.restart=null;this.ball.state="free";

    if(r.type==="throw"){
      // A real player goes to the touchline, then throws the ball inward.
      const candidate=this.players.filter(p=>p.team===r.team&&p.role!=="GK"&&!p.sent)
        .sort((a,b)=>Math.hypot(a.x-this.ball.x,a.y-this.ball.y)-Math.hypot(b.x-this.ball.x,b.y-this.ball.y))[0];
      if(candidate){
        candidate.x=this.ball.x;candidate.y=this.ball.y+(this.ball.y<this.H/2?10:-10);
        let target=this.players.filter(p=>p.team===r.team&&p!==candidate&&p.role!=="GK"&&!p.sent)
          .sort((a,b)=>Math.hypot(a.x-candidate.x,a.y-candidate.y)-Math.hypot(b.x-candidate.x,b.y-candidate.y))[0];
        if(target){
          let dx=target.x-this.ball.x,dy=target.y-this.ball.y,l=Math.hypot(dx,dy)||1;
          this.ball.vx=dx/l*245;this.ball.vy=dy/l*245;this.ball.lastTeam=r.team;
        }
      }
      return;
    }

    let tx=r.team===0?this.ball.x+135:this.ball.x-135;
    let ty=this.H/2+(Math.random()-.5)*this.H*.38;
    if(r.type==="corner"){tx=r.team===0?this.W*.73:this.W*.27;ty=this.H/2+(Math.random()-.5)*this.H*.14}
    let dx=tx-this.ball.x,dy=ty-this.ball.y,l=Math.hypot(dx,dy)||1,pow=r.type==="corner"?365:315;
    this.ball.vx=dx/l*pow;this.ball.vy=dy/l*pow;this.ball.lastTeam=r.team;
  }

  resolveContacts(){
    for(let i=0;i<this.players.length;i++){
      const a=this.players[i];if(a.sent)continue;
      for(let j=i+1;j<this.players.length;j++){
        const b=this.players[j];if(b.sent)continue;
        let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.r+b.r+2;
        if(d>=min)continue;
        if(d<.001){dx=1;dy=.3;d=Math.hypot(dx,dy)}
        const nx=dx/d,ny=dy/d,ov=min-d;
        a.x-=nx*ov*.5;a.y-=ny*ov*.5;b.x+=nx*ov*.5;b.y+=ny*ov*.5;
      }
    }
  }

  update(dt){
    const B={l:30,r:this.W-30,t:30,b:this.H-30};

    if(this.phase==="kickoff"){
      this.kickoffTimer-=dt;if(this.kickoffTimer<=0)this.beginKickoff();return;
    }

    if(this.ball.pickupLock>0)this.ball.pickupLock-=dt;
    if(this.ball.state==="restart"){
      this.restart.t-=dt;if(this.restart.t<=0)this.takeRestart();return;
    }

    if(this.passCharging)this.passCharge=Math.min(1,this.passCharge+dt/1.2);
    if(this.shotCharging)this.shotCharge=Math.min(1,this.shotCharge+dt/1.0);

    const cp=this.players[this.controlled];
    if(cp&&!cp.sent){
      const m=Math.hypot(this.joy.x,this.joy.y);
      const mul=(this.sprint?1.48:1)*(0.78+.22*cp.stamina);
      if(m>.04){
        const tx=cp.x+this.joy.x*140,ty=cp.y+this.joy.y*140;
        this.steer(cp,tx,ty,dt,mul);
      }else{
        cp.vx*=Math.pow(.07,dt);cp.vy*=Math.pow(.07,dt);
      }
    }

    this.players.forEach((p,i)=>{
      p.contactCd=Math.max(0,p.contactCd-dt);
      p.stamina=Math.max(.30,p.stamina-dt*(Math.hypot(p.vx,p.vy)>115?.0025:.00055));
      if(p.role==="GK")this.keeperAI(p,i,dt);
      else if(i!==this.controlled)this.ai(p,i,dt);
      p.x=Math.max(B.l+2,Math.min(B.r-2,p.x+p.vx*dt));
      p.y=Math.max(B.t+2,Math.min(B.b-2,p.y+p.vy*dt));
    });

    this.resolveContacts();

    if(this.ball.owner!==null){
      const p=this.players[this.ball.owner],dir=p.team===0?1:-1;
      this.ball.x=p.x+dir*(p.r+5);this.ball.y=p.y;
    }else{
      this.ball.x+=this.ball.vx*dt;this.ball.y+=this.ball.vy*dt;
      this.ball.vx*=Math.pow(.15,dt);this.ball.vy*=Math.pow(.15,dt);
      const hits=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)}))
        .filter(o=>!o.p.sent&&o.d<o.p.r+this.ball.r+2).sort((a,b)=>a.d-b.d);
      for(const h of hits){if(this.claim(h.i))break}
    }

    const gt=this.H*.39,gb=this.H*.61;
    if(this.ball.x>this.W-14&&this.ball.y>gt&&this.ball.y<gb){this.score[0]++;this.kickoff(1);return}
    if(this.ball.x<14&&this.ball.y>gt&&this.ball.y<gb){this.score[1]++;this.kickoff(0);return}

    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.y<B.t){
      this.setRestart("throw",this.ball.lastTeam===0?1:0,Math.max(B.l,Math.min(B.r,this.ball.x)),B.t);return;
    }
    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.y>B.b){
      this.setRestart("throw",this.ball.lastTeam===0?1:0,Math.max(B.l,Math.min(B.r,this.ball.x)),B.b);return;
    }
    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.x>B.r){
      if(this.ball.lastTeam===0)this.setRestart("corner",0,B.r,this.ball.y<this.H/2?B.t:B.b);
      else this.setRestart("goal",1,this.W-65,this.H/2);return;
    }
    if(this.ball.owner===null&&this.ball.state==="free"&&this.ball.x<B.l){
      if(this.ball.lastTeam===1)this.setRestart("corner",1,B.l,this.ball.y<this.H/2?B.t:B.b);
      else this.setRestart("goal",0,65,this.H/2);return;
    }
  }

  drawChargeBar(x,y,w,val,label){
    const c=this.ctx;c.fillStyle="#07110dcc";c.fillRect(x,y,w,8);c.fillStyle="#fff";c.globalAlpha=.9;c.fillRect(x,y,w*val,8);c.globalAlpha=1;c.font="700 9px Arial";c.fillStyle="#fff";c.fillText(label,x,y-4);
  }

  draw(){
    const c=this.ctx,W=this.W,H=this.H;c.clearRect(0,0,W,H);
    for(let i=0;i<12;i++){c.fillStyle=i%2?"#1d7441":"#176a3b";c.fillRect(i*W/12,0,W/12,H)}
    c.strokeStyle="#def6e4";c.lineWidth=2;c.globalAlpha=.85;c.strokeRect(30,30,W-60,H-60);
    c.beginPath();c.moveTo(W/2,30);c.lineTo(W/2,H-30);c.stroke();
    c.beginPath();c.arc(W/2,H/2,55,0,Math.PI*2);c.stroke();
    c.strokeRect(30,H*.23,120,H*.54);c.strokeRect(W-150,H*.23,120,H*.54);
    c.strokeRect(8,H*.39,22,H*.22);c.strokeRect(W-30,H*.39,22,H*.22);c.globalAlpha=1;

    this.players.forEach((p,i)=>{
      const club=p.team?this.away:this.home;
      const fill=p.role==="GK"?(p.team?"#f39a43":"#f0d33d"):(p.team?"#f5f5f5":club.color);
      const txt=p.role==="GK"?"#111":(p.team?club.color:"#fff");
      if(i===this.controlled){c.beginPath();c.arc(p.x,p.y,p.r+6,0,Math.PI*2);c.strokeStyle="#fff36b";c.lineWidth=3;c.stroke()}
      c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fillStyle=fill;c.fill();c.strokeStyle="#fff8";c.stroke();
      c.fillStyle=txt;c.font="900 10px Arial";c.textAlign="center";c.textBaseline="middle";c.fillText(p.num,p.x,p.y);
    });

    c.beginPath();c.arc(this.ball.x,this.ball.y,this.ball.r,0,Math.PI*2);c.fillStyle="#fff";c.fill();c.strokeStyle="#111";c.stroke();

    if(this.passCharging)this.drawChargeBar(W*.40,H-24,W*.20,this.passCharge,"СИЛА ПАСА");
    if(this.shotCharging)this.drawChargeBar(W*.40,H-38,W*.20,this.shotCharge,"СИЛА УДАРА");
  }

  loop(t){
    if(!this.running||this.paused)return;
    const dt=Math.min((t-this.last)/1000,.028);this.last=t;this.elapsed+=dt;
    this.update(dt);this.draw();App.updateHUD(this);
    if(this.elapsed>=this.duration){this.running=false;this.onFinish(this.score);return}
    requestAnimationFrame(x=>this.loop(x));
  }
};
