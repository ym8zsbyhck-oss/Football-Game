
window.MatchEngine = class {
  constructor(canvas,onFinish){
    this.canvas=canvas;this.ctx=canvas.getContext("2d");this.onFinish=onFinish;this.running=false;this.paused=false;
    this.userSide=0;this.players=[];this.ball={};this.score=[0,0];this.elapsed=0;this.duration=300;this.controlled=0;
    this.joy={x:0,y:0};this.sprint=false;this.last=0;this.restart=null;this.subs=[0,0];
  }
  resize(){this.W=innerWidth;this.H=innerHeight;const d=Math.min(devicePixelRatio||1,2);this.canvas.width=this.W*d;this.canvas.height=this.H*d;this.ctx.setTransform(d,0,0,d,0,0)}
  start(home,away,userSide){
    this.home=home;this.away=away;this.userSide=userSide;this.score=[0,0];this.elapsed=0;this.running=true;this.paused=false;this.resize();this.kickoff(0);this.last=performance.now();requestAnimationFrame(t=>this.loop(t));
  }
  form(side){
    const pts=[[.055,.5],[.18,.18],[.18,.4],[.18,.6],[.18,.82],[.34,.30],[.34,.70],[.48,.18],[.48,.50],[.48,.82],[.64,.50]];
    const roles=["GK","FB","CB","CB","FB","CM","CM","W","AM","W","ST"],nums=[1,3,4,5,2,6,8,11,10,7,9];
    return pts.map((v,i)=>{let x=side?1-v[0]:v[0];return {team:side,role:roles[i],x:this.W*x,y:this.H*v[1],baseX:this.W*x,baseY:this.H*v[1],vx:0,vy:0,r:i?12:15,num:nums[i],speed:i?102+(i%4)*3:88,hasBall:false,decision:Math.random()*.4,stamina:1,sent:false}})
  }
  kickoff(team){this.players=[...this.form(0),...this.form(1)];this.ball={x:this.W/2,y:this.H/2,vx:0,vy:0,r:5,owner:null,lastTeam:team,state:"free"};this.claim(team?19:8);this.controlled=this.nearestUser()}
  nearest(team,allowGK=false){let best=-1,bd=1e99;this.players.forEach((p,i)=>{if(p.team===team&&!p.sent&&(allowGK||p.role!=="GK")){let d=(p.x-this.ball.x)**2+(p.y-this.ball.y)**2;if(d<bd){bd=d;best=i}}});return best}
  nearestUser(){return this.nearest(this.userSide)}
  claim(i){
    const p=this.players[i];if(!p||p.sent)return;
    const speed=Math.hypot(this.ball.vx||0,this.ball.vy||0);
    if(this.ball.owner===null&&speed>390&&Math.random()>.38){this.ball.vx*=.52;this.ball.vy*=.52;return}
    if(this.ball.owner!==null&&this.players[this.ball.owner])this.players[this.ball.owner].hasBall=false;
    this.ball.owner=i;p.hasBall=true;this.ball.vx=this.ball.vy=0;this.ball.state="controlled";if(p.team===this.userSide&&p.role!=="GK")this.controlled=i;
  }
  release(i,vx,vy){const p=this.players[i];p.hasBall=false;this.ball.owner=null;this.ball.state="free";this.ball.x=p.x;this.ball.y=p.y;this.ball.vx=vx;this.ball.vy=vy;this.ball.lastTeam=p.team}
  bestPass(i,through=false){
    const p=this.players[i],dir=p.team? -1:1;let best=null,bs=-1e9;
    this.players.forEach((q,j)=>{if(j===i||q.team!==p.team||q.role==="GK"||q.sent)return;let dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1;let forward=dx*dir;let pressure=this.players.filter(r=>r.team!==p.team&&!r.sent&&Math.hypot(r.x-q.x,r.y-q.y)<55).length;let open=forward*1.15-d*.18-pressure*70+(q.role==="ST"?55:0)+(q.role==="W"?28:0);if(open>bs){bs=open;best={j,x:q.x+dir*(through?72:18)+q.vx*.22,y:q.y+q.vy*.22}}});return best
  }
  pass(through=false){
    if(this.ball.owner!==this.controlled)return;const t=this.bestPass(this.controlled,through);if(!t)return;const p=this.players[this.controlled],dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1,pow=through?405:330;this.release(this.controlled,dx/l*pow,dy/l*pow)
  }
  shootOrTackle(){
    if(this.ball.owner===this.controlled){const p=this.players[this.controlled],gx=p.team? -20:this.W+20,gy=this.H/2+this.joy.y*this.H*.15,dx=gx-p.x,dy=gy-p.y,l=Math.hypot(dx,dy)||1;this.release(this.controlled,dx/l*510,dy/l*510);return}
    const p=this.players[this.controlled];const own=this.ball.owner; if(own===null)return;const o=this.players[own];if(!o||o.team===p.team)return;const d=Math.hypot(p.x-o.x,p.y-o.y);if(d>38)return;
    if(Math.random()<.62-d/100){o.hasBall=false;this.ball.owner=null;this.ball.state="free";this.ball.x=o.x;this.ball.y=o.y;this.ball.vx=(o.x-p.x)*3;this.ball.vy=(o.y-p.y)*3;this.ball.lastTeam=p.team}
  }
  switch(){const arr=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)})).filter(o=>o.p.team===this.userSide&&o.p.role!=="GK"&&!o.p.sent).sort((a,b)=>a.d-b.d);let k=arr.findIndex(o=>o.i===this.controlled);this.controlled=arr[(k+1)%Math.min(4,arr.length)].i}
  keeperAI(p,i,dt){
    let gx=p.team?this.W-38:38,tx=gx,ty=Math.max(this.H*.36,Math.min(this.H*.64,this.ball.y));
    let dangerous=p.team?this.ball.x>this.W*.76:this.ball.x<this.W*.24;if(dangerous)tx+=p.team?-34:34;
    let dx=tx-p.x,dy=ty-p.y,l=Math.hypot(dx,dy)||1;p.vx=dx/l*108;p.vy=dy/l*108;
    if(this.ball.owner===null&&Math.hypot(p.x-this.ball.x,p.y-this.ball.y)<23){let sp=Math.hypot(this.ball.vx,this.ball.vy);if(sp<420&&Math.random()<(sp<270?.91:.58))this.claim(i);else{this.ball.vx=(p.team?-1:1)*(230+Math.random()*100);this.ball.vy=(Math.random()-.5)*170}}
    if(this.ball.owner===i){p.decision-=dt;if(p.decision<=0){p.decision=.85;const t=this.players.filter(q=>q.team===p.team&&q.role!=="GK"&&!q.sent).sort((a,b)=>p.team?b.x-a.x:a.x-b.x)[0];let dx=t.x-p.x,dy=t.y-p.y,l=Math.hypot(dx,dy)||1;this.release(i,dx/l*300,dy/l*300)}}
  }
  ai(p,i,dt){
    if(p.sent)return;let team=p.team,dir=team?-1:1,own=this.ball.owner!==null&&this.players[this.ball.owner]?.team===team,tx=p.baseX,ty=p.baseY;
    const active=this.players.filter(q=>q.team===team&&!q.sent&&q.role!=="GK").sort((a,b)=>Math.hypot(a.x-this.ball.x,a.y-this.ball.y)-Math.hypot(b.x-this.ball.x,b.y-this.ball.y));
    const presser=active[0],cover=active[1];
    if(own){
      const c=this.players[this.ball.owner];
      if(i===this.ball.owner){tx=p.x+dir*(p.role==="ST"?92:66);ty=p.y+(this.H/2-p.y)*.04;p.decision-=dt;if(p.decision<=0){p.decision=.27+Math.random()*.34;let near=team?p.x<this.W*.32:p.x>this.W*.68;if(near&&Math.abs(p.y-this.H/2)<this.H*.3&&Math.random()<.5)this.aiShoot(i);else if(Math.random()<.8)this.aiPass(i,Math.random()<.3)}}
      else {let push={CB:-95,FB:10,CM:30,W:110,AM:88,ST:150}[p.role]||0;tx=c.x+dir*push;ty=p.baseY+(c.y-this.H/2)*(p.role==="CM"?.34:.2)}
    }else{
      if(p===presser){tx=this.ball.x-dir*8;ty=this.ball.y}
      else if(p===cover){tx=this.ball.x-dir*68;ty=this.ball.y+(p.baseY-this.H/2)*.2}
      else {let sh=(this.ball.x-this.W/2)*.17;tx=p.baseX+sh;ty=this.H/2+(p.baseY-this.H/2)*.68+(this.ball.y-this.H/2)*.16;if(p.role==="CB"){tx=p.baseX+sh*.55;ty=this.H/2+(p.baseY-this.H/2)*.5}}
    }
    let dx=tx-p.x,dy=ty-p.y,l=Math.hypot(dx,dy)||1,sp=p.speed*(p===presser&&!own?1.08:.8)*(0.78+0.22*p.stamina);p.vx=dx/l*sp;p.vy=dy/l*sp
  }
  aiPass(i,t){const x=this.bestPass(i,t);if(!x)return;const p=this.players[i],dx=x.x-p.x,dy=x.y-p.y,l=Math.hypot(dx,dy)||1;this.release(i,dx/l*(t?390:318),dy/l*(t?390:318))}
  aiShoot(i){const p=this.players[i],gx=p.team?-20:this.W+20,gy=this.H/2+(Math.random()-.5)*this.H*.16,dx=gx-p.x,dy=gy-p.y,l=Math.hypot(dx,dy)||1;this.release(i,dx/l*485,dy/l*485)}
  setRestart(type,team,x,y){this.ball.owner=null;this.ball.vx=this.ball.vy=0;this.ball.x=x;this.ball.y=y;this.ball.state="restart";this.restart={type,team,t:.75}}
  takeRestart(){
    const r=this.restart;if(!r)return;this.restart=null;this.ball.state="free";let tx=r.team?this.ball.x-130:this.ball.x+130,ty=this.H/2+(Math.random()-.5)*this.H*.42;
    if(r.type==="corner"){tx=r.team?this.W*.72:this.W*.28;ty=this.H/2+(Math.random()-.5)*this.H*.15}
    let dx=tx-this.ball.x,dy=ty-this.ball.y,l=Math.hypot(dx,dy)||1,pow=r.type==="corner"?360:305;this.ball.vx=dx/l*pow;this.ball.vy=dy/l*pow;this.ball.lastTeam=r.team
  }
  update(dt){
    const B={l:30,r:this.W-30,t:30,b:this.H-30};
    if(this.ball.state==="restart"){this.restart.t-=dt;if(this.restart.t<=0)this.takeRestart();return}
    const cp=this.players[this.controlled];if(cp&&!cp.sent){let m=Math.hypot(this.joy.x,this.joy.y),sp=cp.speed*(this.sprint?1.48:1)*(0.78+.22*cp.stamina);if(m>.04){cp.vx=this.joy.x*sp;cp.vy=this.joy.y*sp}else{cp.vx*=.72;cp.vy*=.72}}
    this.players.forEach((p,i)=>{if(p.sent)return;p.stamina=Math.max(.36,p.stamina-dt*(Math.hypot(p.vx,p.vy)>115?.0025:.0007));if(p.role==="GK")this.keeperAI(p,i,dt);else if(i!==this.controlled)this.ai(p,i,dt);p.x=Math.max(B.l+2,Math.min(B.r-2,p.x+p.vx*dt));p.y=Math.max(B.t+2,Math.min(B.b-2,p.y+p.vy*dt))});
    if(this.ball.owner!==null){const p=this.players[this.ball.owner],dir=p.team?-1:1;this.ball.x=p.x+dir*(p.r+5);this.ball.y=p.y}
    else{this.ball.x+=this.ball.vx*dt;this.ball.y+=this.ball.vy*dt;this.ball.vx*=Math.pow(.18,dt);this.ball.vy*=Math.pow(.18,dt);let h=this.players.map((p,i)=>({p,i,d:Math.hypot(p.x-this.ball.x,p.y-this.ball.y)})).filter(o=>!o.p.sent&&o.d<o.p.r+this.ball.r+3).sort((a,b)=>a.d-b.d)[0];if(h)this.claim(h.i)}
    const gt=this.H*.39,gb=this.H*.61;
    if(this.ball.x>this.W-14&&this.ball.y>gt&&this.ball.y<gb){this.score[0]++;this.kickoff(1);return}
    if(this.ball.x<14&&this.ball.y>gt&&this.ball.y<gb){this.score[1]++;this.kickoff(0);return}
    if(this.ball.owner===null&&this.ball.y<B.t){this.setRestart("throw",this.ball.lastTeam?0:1,Math.max(B.l,Math.min(B.r,this.ball.x)),B.t);return}
    if(this.ball.owner===null&&this.ball.y>B.b){this.setRestart("throw",this.ball.lastTeam?0:1,Math.max(B.l,Math.min(B.r,this.ball.x)),B.b);return}
    if(this.ball.owner===null&&this.ball.x>B.r){if(this.ball.lastTeam===0)this.setRestart("corner",0,B.r,this.ball.y<B.t+this.H/2?B.t:B.b);else this.setRestart("goal",1,this.W-65,this.H/2)}
    if(this.ball.owner===null&&this.ball.x<B.l){if(this.ball.lastTeam===1)this.setRestart("corner",1,B.l,this.ball.y<B.t+this.H/2?B.t:B.b);else this.setRestart("goal",0,65,this.H/2)}
  }
  draw(){
    const c=this.ctx,W=this.W,H=this.H;c.clearRect(0,0,W,H);
    for(let i=0;i<12;i++){c.fillStyle=i%2?"#1d7441":"#176a3b";c.fillRect(i*W/12,0,W/12,H)}
    c.strokeStyle="#def6e4";c.lineWidth=2;c.globalAlpha=.85;c.strokeRect(30,30,W-60,H-60);c.beginPath();c.moveTo(W/2,30);c.lineTo(W/2,H-30);c.stroke();c.beginPath();c.arc(W/2,H/2,55,0,Math.PI*2);c.stroke();c.strokeRect(30,H*.23,120,H*.54);c.strokeRect(W-150,H*.23,120,H*.54);c.strokeRect(8,H*.39,22,H*.22);c.strokeRect(W-30,H*.39,22,H*.22);c.globalAlpha=1;
    this.players.forEach((p,i)=>{if(p.sent)return;let club=p.team?this.away:this.home,fill=p.role==="GK"?(p.team?"#f39a43":"#f0d33d"):(p.team?"#f5f5f5":club.color),txt=p.role==="GK"?"#111":(p.team?club.color:"#fff");if(i===this.controlled){c.beginPath();c.arc(p.x,p.y,p.r+6,0,Math.PI*2);c.strokeStyle="#fff36b";c.lineWidth=3;c.stroke()}c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fillStyle=fill;c.fill();c.strokeStyle="#fff8";c.stroke();c.fillStyle=txt;c.font="900 9px Arial";c.textAlign="center";c.textBaseline="middle";c.fillText(p.num,p.x,p.y)});
    c.beginPath();c.arc(this.ball.x,this.ball.y,this.ball.r,0,Math.PI*2);c.fillStyle="#fff";c.fill();c.strokeStyle="#111";c.stroke()
  }
  loop(t){if(!this.running||this.paused)return;let dt=Math.min((t-this.last)/1000,.03);this.last=t;this.elapsed+=dt;this.update(dt);this.draw();App.updateHUD(this);if(this.elapsed>=this.duration){this.running=false;this.onFinish(this.score);return}requestAnimationFrame(x=>this.loop(x))}
};
