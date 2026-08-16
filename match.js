
window.MatchEngine = class {
  constructor(canvas,onFinish){
    this.canvas=canvas;
    this.ctx=canvas.getContext("2d");
    this.onFinish=onFinish;
    this.running=false;
    this.paused=false;
    this.userSide=0;
    this.players=[];
    this.ball={};
    this.score=[0,0];
    this.elapsed=0;
    this.duration=300;
    this.controlled=0;
    this.joy={x:0,y:0};
    this.sprint=false;
    this.last=0;
    this.restart=null;
    this.phase="kickoff";
    this.kickoffTeam=0;
    this.kickoffTimer=0;
    this.lastPasser=-1;
    this.passLock=0;
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
    this.resize(); this.kickoff(0);
    this.last=performance.now();
    requestAnimationFrame(t=>this.loop(t));
  }

  baseFormation(side){
    // 4-2-3-1. All coordinates intentionally stay in own half.
    const left=[
      [.055,.50], // GK
      [.16,.18], [.18,.39], [.18,.61], [.16,.82],
      [.33,.38], [.33,.62],
      [.47,.20], [.46,.50], [.47,.80],
      [.43,.50] // ST stays behind halfway until kickoff
    ];
    return left.map(v=>side?[1-v[0],v[1]]:v);
  }

  form(side){
    const pts=this.baseFormation(side);
    const roles=["GK","LB","CB","CB","RB","DM","DM","LW","AM","RW","ST"];
    const nums=[1,3,4,5,2,6,8,11,10,7,9];
    return pts.map((v,i)=>({
      team:side, role:roles[i],
      x:this.W*v[0], y:this.H*v[1],
      homeX:this.W*v[0], homeY:this.H*v[1],
      vx:0,vy:0,tx:this.W*v[0],ty:this.H*v[1],
      r:i===0?15:12,num:nums[i],
      speed:i===0?90:104+(i%3)*4,
      accel:i===0?480:620,
      hasBall:false,decision:.2+Math.random()*.35,
      stamina:1,sent:false,
      state:"shape",
      lane:i%3
    }));
  }

  kickoff(team){
    this.players=[...this.form(0),...this.form(1)];
    this.kickoffTeam=team;
    this.phase="kickoff";
    this.kickoffTimer=0.65;
    this.ball={
      x:this.W/2,y:this.H/2,vx:0,vy:0,r:5,
      owner:null,lastTeam:team,state:"dead",
      pickupLock:0,ignorePlayer:-1
    };

    // Two kickoff players are placed around the centre spot.
    const ids = team===0 ? [8,10] : [19,21]; // AM + ST
    const dir = team===0 ? -1 : 1;
    this.players[ids[0]].x=this.W/2+dir*20;
    this.players[ids[0]].y=this.H/2;
    this.players[ids[1]].x=this.W/2+dir*60;
    this.players[ids[1]].y=this.H/2+32;

    this.controlled=this.nearestUser();
  }

  beginKickoff(){
    const team=this.kickoffTeam;
    const passer=team===0?8:19;
    const receiver=team===0?10:21;
    const p=this.players[passer],q=this.players[receiver];
    this.ball.state="free";
    this.ball.x=this.W/2; this.ball.y=this.H/2;
    let dx=q.x-this.ball.x,dy=q.y-this.ball.y,l=Math.hypot(dx,dy)||1;
    this.ball.vx=dx/l*210; this.ball.vy=dy/l*210;
    this.ball.lastTeam=team;
    this.ball.ignorePlayer=passer;
    this.ball.pickupLock=.18;
    this.phase="open";
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
    if(this.ball.pickupLock>0 && i===this.ball.ignorePlayer) return false;

    // A player must actually meet the ball. Very fast balls are controlled less reliably.
    const speed=Math.hypot(this.ball.vx,this.ball.vy);
    if(speed>470) return false;
    if(speed>330 && Math.random()>.56){
      this.ball.vx*=.58; this.ball.vy*=.58;
      return false;
    }

    if(this.ball.owner!==null&&this.players[this.ball.owner]) this.players[this.ball.owner].hasBall=false;
    this.ball.owner=i; p.hasBall=true;
    this.ball.vx=0; this.ball.vy=0; this.ball.state="controlled";
    this.ball.ignorePlayer=-1;
    if(p.team===this.userSide && p.role!=="GK") this.controlled=i;
    return true;
  }

  release(i,vx,vy){
    const p=this.players[i];
    if(!p)return;
    p.hasBall=false;
    this.ball.owner=null;
    this.ball.state="free";
    const mag=Math.hypot(vx,vy)||1;
    const ux=vx/mag,uy=vy/mag;
    // Spawn the ball outside the passer circle, preventing instant re-capture.
    this.ball.x=p.x+ux*(p.r+8);
    this.ball.y=p.y+uy*(p.r+8);
    this.ball.vx=vx; this.ball.vy=vy;
    this.ball.lastTeam=p.team;
    this.ball.ignorePlayer=i;
    this.ball.pickupLock=.22;
    this.lastPasser=i;
  }

  userDirection(p){
    const m=Math.hypot(this.joy.x,this.joy.y);
    if(p.team===this.userSide && m>.22) return {x:this.joy.x/m,y:this.joy.y/m};
    return {x:p.team===0?1:-1,y:0};
  }

  bestPass(i,through=false){
    const p=this.players[i], aim=this.userDirection(p);
    let best=null,bs=-1e9;
    this.players.forEach((q,j)=>{
      if(j===i||q.team!==p.team||q.role==="GK"||q.sent)return;
      const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1;
      const ux=dx/d,uy=dy/d;
      const directional=ux*aim.x+uy*aim.y;
      const forward=(p.team===0?dx:-dx);
      const pressure=this.players.filter(r=>r.team!==p.team&&!r.sent&&Math.hypot(r.x-q.x,r.y-q.y)<62).length;
      const ahead=through?Math.max(0,forward)*.38:Math.max(0,forward)*.16;
      const score=directional*240 + ahead - d*.20 - pressure*82 + (q.role==="ST"?45:0)+(q.role==="AM"?25:0);
      if(score>bs){bs=score;best={j,x:q.x+(p.team===0?1:-1)*(through?85:22)+q.vx*.3,y:q.y+q.vy*.3}}
    });
    return best;
  }

  pass(through=false){
    if(this.ball.owner!==this.controlled)return;
    const t=this.bestPass(this.controlled,through); if(!t)return;
    const p=this.players[this.controlled],dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
    const distance=Math.min(380,l);
    const power=through ? 390+distance*.12 : 300+distance*.13;
    this.release(this.controlled,dx/l*power,dy/l*power);
  }

  shootOrTackle(){
    if(this.ball.owner===this.controlled){
      const p=this.players[this.controlled],gx=p.team===0?this.W+24:-24;
      const gy=this.H/2+this.joy.y*this.H*.17;
      const dx=gx-p.x,dy=gy-p.y,l=Math.hypot(dx,dy)||1;
      this.release(this.controlled,dx/l*520,dy/l*520);
      return;
    }
    const p=this.players[this.controlled];
    const owner=this.ball.owner;
    if(owner===null)return;
    const o=this.players[owner];
    if(!o||o.team===p.team)return;
    const d=Math.hypot(p.x-o.x,p.y-o.y);
    if(d>39)return;
    const angleBonus=Math.abs(p.y-o.y)<26?.12:0;
    if(Math.random()<Math.max(.22,.72-d/90+angleBonus)){
      o.hasBall=false;
      this.ball.owner=null; this.ball.state="free";
      const dx=o.x-p.x,dy=o.y-p.y,l=Math.hypot(dx,dy)||1;
      this.ball.x=o.x;this.ball.y=o.y;
      this.ball.vx=dx/l*145;this.ball.vy=dy/l*145;
      this.ball.lastTeam=p.team;
      this.ball.ignorePlayer=p===undefined?-1:this.controlled;
      this.ball.pickupLock=.12;
    }
  }

  switch(){
    const arr=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)}))
      .filter(o=>o.p.team===this.userSide&&o.p.role!=="GK"&&!o.p.sent)
      .sort((a,b)=>a.d-b.d);
    const k=arr.findIndex(o=>o.i===this.controlled);
    this.controlled=arr[(k+1)%Math.min(4,arr.length)].i;
  }

  desiredShape(p){
    const team=p.team,dir=team===0?1:-1;
    const ballX=this.ball.x, ballY=this.ball.y;
    const own=this.ball.owner!==null && this.players[this.ball.owner]?.team===team;
    const carrier=own?this.players[this.ball.owner]:null;

    let x=p.homeX,y=p.homeY;
    const bxShift=(ballX-this.W/2)*.22;

    if(own && carrier){
      // FC-IQ-like support lanes: one player wide, one under the ball, one beyond the ball.
      const pushes={LB:15,RB:15,CB:-90,DM:-5,LW:115,RW:115,AM:85,ST:145};
      const push=pushes[p.role]??25;
      x=carrier.x+dir*push;
      y=p.homeY+(carrier.y-this.H/2)*(p.role==="DM"?.28:.16);

      if(p.role==="LW") y=this.H*.18;
      if(p.role==="RW") y=this.H*.82;
      if(p.role==="ST") y=this.H*.50;
      if(p.role==="CB") y=this.H/2+(p.homeY-this.H/2)*.62;
    }else{
      // Defensive block shifts together. No one except presser chases blindly.
      x=p.homeX+bxShift;
      y=this.H/2+(p.homeY-this.H/2)*.72+(ballY-this.H/2)*.12;
      if(p.role==="CB"){
        x=p.homeX+bxShift*.45;
        y=this.H/2+(p.homeY-this.H/2)*.55;
      }
      if(p.role==="LB"||p.role==="RB"){
        x=p.homeX+bxShift*.60;
      }
      if(p.role==="ST"){
        x=p.homeX+bxShift*.25;
        y=this.H/2;
      }
    }
    return {x,y};
  }

  steer(p,tx,ty,dt,maxMul=1){
    const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy);
    const desiredSpeed=Math.min(p.speed*maxMul,d*4.4);
    const dvx=(d?dx/d:0)*desiredSpeed-p.vx;
    const dvy=(d?dy/d:0)*desiredSpeed-p.vy;
    const maxChange=p.accel*dt;
    const dl=Math.hypot(dvx,dvy)||1;
    p.vx+=dvx/dl*Math.min(maxChange,dl);
    p.vy+=dvy/dl*Math.min(maxChange,dl);
  }

  keeperAI(p,i,dt){
    const gx=p.team===0?38:this.W-38;
    let tx=gx,ty=Math.max(this.H*.37,Math.min(this.H*.63,this.ball.y));
    const danger=p.team===0?this.ball.x<this.W*.22:this.ball.x>this.W*.78;
    if(danger) tx+=p.team===0?32:-32;
    this.steer(p,tx,ty,dt,1.0);

    if(this.ball.owner===null&&this.ball.state==="free"&&Math.hypot(p.x-this.ball.x,p.y-this.ball.y)<24){
      const sp=Math.hypot(this.ball.vx,this.ball.vy);
      if(sp<430&&Math.random()<(sp<260?.93:.62)) this.claim(i);
      else{
        this.ball.vx=(p.team===0?1:-1)*(245+Math.random()*95);
        this.ball.vy=(Math.random()-.5)*170;
        this.ball.lastTeam=p.team;
      }
    }
    if(this.ball.owner===i){
      p.decision-=dt;
      if(p.decision<=0){
        p.decision=.65;
        const mates=this.players.filter(q=>q.team===p.team&&q.role!=="GK"&&!q.sent)
          .sort((a,b)=>p.team===0?a.x-b.x:b.x-a.x);
        const t=mates[Math.min(2,mates.length-1)];
        const dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
        this.release(i,dx/l*310,dy/l*310);
      }
    }
  }

  ai(p,i,dt){
    if(p.sent)return;
    const team=p.team,dir=team===0?1:-1;
    const own=this.ball.owner!==null&&this.players[this.ball.owner]?.team===team;

    const active=this.players.filter(q=>q.team===team&&!q.sent&&q.role!=="GK");
    const sorted=[...active].sort((a,b)=>Math.hypot(a.x-this.ball.x,a.y-this.ball.y)-Math.hypot(b.x-this.ball.x,b.y-this.ball.y));
    const presser=sorted[0],cover=sorted[1];

    if(own && i===this.ball.owner){
      // Ball carrier advances but periodically makes a decision.
      const pGoalX=team===0?this.W:-0;
      let tx=p.x+dir*90,ty=p.y+(this.H/2-p.y)*.04;
      this.steer(p,tx,ty,dt,1.03);
      p.decision-=dt;
      if(p.decision<=0){
        p.decision=.32+Math.random()*.38;
        const closeToGoal=team===0?p.x>this.W*.70:p.x<this.W*.30;
        if(closeToGoal&&Math.abs(p.y-this.H/2)<this.H*.28&&Math.random()<.55) this.aiShoot(i);
        else if(Math.random()<.82) this.aiPass(i,Math.random()<.31);
      }
      return;
    }

    let target=this.desiredShape(p);
    if(!own){
      if(p===presser){
        target={x:this.ball.x-dir*8,y:this.ball.y};
        this.steer(p,target.x,target.y,dt,1.08); return;
      }
      if(p===cover){
        target={x:this.ball.x-dir*68,y:this.ball.y+(p.homeY-this.H/2)*.18};
        this.steer(p,target.x,target.y,dt,.94); return;
      }
    }
    this.steer(p,target.x,target.y,dt,.84);
  }

  aiPass(i,through=false){
    const t=this.bestPass(i,through); if(!t)return;
    const p=this.players[i],dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;
    this.release(i,dx/l*(through?395:320),dy/l*(through?395:320));
  }

  aiShoot(i){
    const p=this.players[i],gx=p.team===0?this.W+24:-24,gy=this.H/2+(Math.random()-.5)*this.H*.16;
    const dx=gx-p.x,dy=gy-p.y,l=Math.hypot(dx,dy)||1;
    this.release(i,dx/l*490,dy/l*490);
  }

  setRestart(type,team,x,y){
    this.ball.owner=null;this.ball.vx=this.ball.vy=0;
    this.ball.x=x;this.ball.y=y;this.ball.state="restart";
    this.restart={type,team,t:.72};
  }

  takeRestart(){
    const r=this.restart;if(!r)return;
    this.restart=null;this.ball.state="free";
    let tx=r.team===0?this.ball.x+130:this.ball.x-130;
    let ty=this.H/2+(Math.random()-.5)*this.H*.42;
    if(r.type==="corner"){
      tx=r.team===0?this.W*.74:this.W*.26;
      ty=this.H/2+(Math.random()-.5)*this.H*.14;
    }
    const dx=tx-this.ball.x,dy=ty-this.ball.y,l=Math.hypot(dx,dy)||1,pow=r.type==="corner"?360:305;
    this.ball.vx=dx/l*pow;this.ball.vy=dy/l*pow;this.ball.lastTeam=r.team;
    this.ball.pickupLock=.12;this.ball.ignorePlayer=-1;
  }

  update(dt){
    const B={l:30,r:this.W-30,t:30,b:this.H-30};

    if(this.phase==="kickoff"){
      this.kickoffTimer-=dt;
      if(this.kickoffTimer<=0)this.beginKickoff();
      return;
    }

    if(this.ball.pickupLock>0)this.ball.pickupLock-=dt;
    if(this.ball.state==="restart"){
      this.restart.t-=dt;
      if(this.restart.t<=0)this.takeRestart();
      return;
    }

    const cp=this.players[this.controlled];
    if(cp&&!cp.sent){
      const m=Math.hypot(this.joy.x,this.joy.y);
      const speedMul=(this.sprint?1.48:1)*(0.78+.22*cp.stamina);
      if(m>.04){
        const tx=cp.x+this.joy.x*140,ty=cp.y+this.joy.y*140;
        this.steer(cp,tx,ty,dt,speedMul);
      }else{
        cp.vx*=Math.pow(.06,dt);cp.vy*=Math.pow(.06,dt);
      }
    }

    this.players.forEach((p,i)=>{
      if(p.sent)return;
      p.stamina=Math.max(.36,p.stamina-dt*(Math.hypot(p.vx,p.vy)>115?.0022:.0006));
      if(p.role==="GK")this.keeperAI(p,i,dt);
      else if(i!==this.controlled)this.ai(p,i,dt);
      p.x=Math.max(B.l+2,Math.min(B.r-2,p.x+p.vx*dt));
      p.y=Math.max(B.t+2,Math.min(B.b-2,p.y+p.vy*dt));
    });

    if(this.ball.owner!==null){
      const p=this.players[this.ball.owner],dir=p.team===0?1:-1;
      this.ball.x=p.x+dir*(p.r+5);this.ball.y=p.y;
    }else{
      this.ball.x+=this.ball.vx*dt;this.ball.y+=this.ball.vy*dt;
      this.ball.vx*=Math.pow(.14,dt);this.ball.vy*=Math.pow(.14,dt);

      // Real interceptions/receptions by the first player whose circle meets the ball.
      const hits=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)}))
        .filter(o=>!o.p.sent&&o.d<o.p.r+this.ball.r+2)
        .sort((a,b)=>a.d-b.d);
      for(const h of hits){ if(this.claim(h.i)) break; }
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

  draw(){
    const c=this.ctx,W=this.W,H=this.H;c.clearRect(0,0,W,H);
    for(let i=0;i<12;i++){c.fillStyle=i%2?"#1d7441":"#176a3b";c.fillRect(i*W/12,0,W/12,H)}
    c.strokeStyle="#def6e4";c.lineWidth=2;c.globalAlpha=.85;c.strokeRect(30,30,W-60,H-60);
    c.beginPath();c.moveTo(W/2,30);c.lineTo(W/2,H-30);c.stroke();
    c.beginPath();c.arc(W/2,H/2,55,0,Math.PI*2);c.stroke();
    c.strokeRect(30,H*.23,120,H*.54);c.strokeRect(W-150,H*.23,120,H*.54);
    c.strokeRect(8,H*.39,22,H*.22);c.strokeRect(W-30,H*.39,22,H*.22);c.globalAlpha=1;

    this.players.forEach((p,i)=>{
      if(p.sent)return;
      const club=p.team?this.away:this.home;
      const fill=p.role==="GK"?(p.team?"#f39a43":"#f0d33d"):(p.team?"#f5f5f5":club.color);
      const txt=p.role==="GK"?"#111":(p.team?club.color:"#fff");
      if(i===this.controlled){
        c.beginPath();c.arc(p.x,p.y,p.r+6,0,Math.PI*2);c.strokeStyle="#fff36b";c.lineWidth=3;c.stroke();
      }
      c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fillStyle=fill;c.fill();c.strokeStyle="#fff8";c.stroke();
      c.fillStyle=txt;c.font="900 9px Arial";c.textAlign="center";c.textBaseline="middle";c.fillText(p.num,p.x,p.y);
    });
    c.beginPath();c.arc(this.ball.x,this.ball.y,this.ball.r,0,Math.PI*2);c.fillStyle="#fff";c.fill();c.strokeStyle="#111";c.stroke();
  }

  loop(t){
    if(!this.running||this.paused)return;
    const dt=Math.min((t-this.last)/1000,.028);this.last=t;this.elapsed+=dt;
    this.update(dt);this.draw();App.updateHUD(this);
    if(this.elapsed>=this.duration){
      this.running=false;this.onFinish(this.score);return;
    }
    requestAnimationFrame(x=>this.loop(x));
  }
};
