
window.Career = {
  saveKey:"rfc-v06-career",
  state:null,
  leagueClubs(league,group=null){
    return DB.clubs.filter(c=>c.league===league && (!group || c.group===group));
  },
  new(club){
    const group=club.league==="fnl2"?(club.group||"gold"):null;
    const pool=this.leagueClubs(club.league,group);
    const standings=pool.map(c=>({id:c.id,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}));
    const fixtures=[];
    const opps=pool.filter(c=>c.id!==club.id);
    opps.forEach((o,i)=>fixtures.push({round:i+1,home:i%2?o.id:club.id,away:i%2?club.id:o.id,played:false,score:null}));
    opps.forEach((o,i)=>fixtures.push({round:opps.length+i+1,home:i%2?club.id:o.id,away:i%2?o.id:club.id,played:false,score:null}));
    this.state={clubId:club.id,league:club.league,group,stage:1,season:2026,round:1,standings,fixtures,lastResult:"",morale:78,confidence:72,tactics:{line:50,width:52,press:"balanced",build:"balanced"}};
    this.save(); return this.state;
  },
  save(){if(this.state)localStorage.setItem(this.saveKey,JSON.stringify(this.state))},
  load(){try{this.state=JSON.parse(localStorage.getItem(this.saveKey)||"null")}catch{} return this.state},
  club(){return DB.clubs.find(c=>c.id===this.state.clubId)},
  sorted(){return [...this.state.standings].sort((a,b)=>b.pts-a.pts||((b.gf-b.ga)-(a.gf-a.ga))||b.gf-a.gf)},
  row(id){return this.state.standings.find(x=>x.id===id)},
  addResult(id,gf,ga){const r=this.row(id);if(!r)return;r.p++;r.gf+=gf;r.ga+=ga;if(gf>ga){r.w++;r.pts+=3}else if(gf===ga){r.d++;r.pts++}else r.l++},
  simGoals(a,b){let x=1.2+(a.rating-b.rating)/18,n=0;for(let i=0;i<5;i++)if(Math.random()<Math.max(.06,Math.min(.46,x/5)))n++;return n},
  applyFixture(fx,hg,ag){
    fx.played=true;fx.score=`${hg}:${ag}`;this.addResult(fx.home,hg,ag);this.addResult(fx.away,ag,hg);
    const pool=this.leagueClubs(this.state.league,this.state.group);
    const rest=pool.filter(c=>![fx.home,fx.away].includes(c.id));
    for(let i=0;i<rest.length-1;i+=2){const a=rest[i],b=rest[i+1],g1=this.simGoals(a,b),g2=this.simGoals(b,a);this.addResult(a.id,g1,g2);this.addResult(b.id,g2,g1)}
    this.state.round++;this.state.lastResult=`${DB.clubs.find(c=>c.id===fx.home).name} ${hg}:${ag} ${DB.clubs.find(c=>c.id===fx.away).name}`;this.save();
  },
  nextFixture(){return this.state.fixtures.find(f=>!f.played)}
};
