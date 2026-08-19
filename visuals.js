window.BroadcastVisuals = {
  marks:{
    rplBear:{
      alt:"Логотип РПЛ",
      urls:["https://ru.wikipedia.org/wiki/Special:Redirect/file/Russian%20Premier%20League%20Logo.png"]
    },
    // 2026/27 Alfa-Bank RPL mark. The original mark is loaded from the web.
    rpl:{
      alt:"Альфа-Банк РПЛ",
      urls:[
        "https://upload.wikimedia.org/wikipedia/ru/a/ab/Alfa-Bank_Russian_Premier_League_Logo.svg",
        "https://ru.wikipedia.org/wiki/Special:Redirect/file/Alfa-Bank%20Russian%20Premier%20League%20Logo.svg"
      ]
    },
    // Official FNL assets from fnl.pro.
    fnl1:{
      alt:"Лига PARI",
      urls:[
        "https://fnl.pro/_next/static/media/pari-logo.958ffc73.svg",
        "https://fnl.pro/_next/static/media/pari-logo1.798449f9.svg"
      ]
    },
    fnl2:{
      alt:"LEON-Вторая лига А",
      urls:[
        "https://fnl.pro/_next/static/media/leon-a-logo.035b1bb6.svg",
        "https://fnl.pro/_next/static/media/leon-a-logo.08448ece.svg"
      ]
    },
    // Official RFU visual for FONBET Russian Cup.
    cup:{
      alt:"FONBET Кубок России",
      urls:[
        "https://www.rfs.ru/s3wl/websiterfs/news/224043/69d7835e5dbb5_1600x900.png"
      ]
    },
    // Official 2026 Super Cup identity from the RFU event site.
    supercup:{
      alt:"OLIMPBET Суперкубок России",
      urls:[
        "https://static.tildacdn.com/tild3538-3233-4233-a165-666636363964/supercup-logo-yel_1.svg"
      ]
    }
  },

  mark(theme){return this.marks[theme]||this.marks.rpl},

  bindScoreboard(img,fallback,theme){
    const item=this.mark(theme);
    if(!img)return;
    img.alt=item.alt;
    img.removeAttribute("src");
    img.style.display="none";
    fallback?.classList.remove("hiddenFallback");

    let i=0;
    const next=()=>{
      if(i>=item.urls.length){
        img.style.display="none";
        fallback?.classList.remove("hiddenFallback");
        return;
      }
      const url=item.urls[i++];
      const probe=new Image();
      probe.decoding="async";
      probe.referrerPolicy="no-referrer";
      probe.onload=()=>{
        img.src=url;
        img.style.display="block";
        fallback?.classList.add("hiddenFallback");
      };
      probe.onerror=next;
      probe.src=url;
    };
    next();
  },

  competitionImageUrl(theme){
    return this.mark(theme).urls[0]||"";
  }
};

window.StadiumVisuals = {
  key:"rfc-stadium-image-cache-v1",
  mem:new Map(),

  load(){
    try{
      const o=JSON.parse(localStorage.getItem(this.key)||"{}");
      Object.entries(o).forEach(([k,v])=>this.mem.set(k,v));
    }catch{}
  },
  save(){
    try{localStorage.setItem(this.key,JSON.stringify(Object.fromEntries(this.mem)))}catch{}
  },

  async json(url){
    const r=await fetch(url,{cache:"force-cache"});
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  },

  scoreTitle(title,club){
    const x=(title||"").toLowerCase();
    let score=0;
    const good=["стадион","stadium","arena","арена","sport","football","футбол"];
    const bad=["logo","логотип","эмблем","crest","kit","форма","flag","флаг","map","карта","player","portrait","team photo","состав"];
    good.forEach(t=>{if(x.includes(t))score+=4});
    bad.forEach(t=>{if(x.includes(t))score-=8});
    String(club.name||"").toLowerCase().split(/\s+/).filter(t=>t.length>3).forEach(t=>{if(x.includes(t))score+=3});
    return score;
  },

  async commons(club){
    const queries=[
      `${club.name} стадион`,
      `${club.name} stadium football`,
      `${club.wiki||club.name} stadium`
    ];
    for(const q of queries){
      try{
        const u=`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=18&prop=imageinfo&iiprop=url&iiurlwidth=1800&format=json&origin=*`;
        const j=await this.json(u);
        const pages=Object.values(j.query?.pages||{}).sort((a,b)=>this.scoreTitle(b.title,club)-this.scoreTitle(a.title,club));
        for(const p of pages){
          if(this.scoreTitle(p.title,club)<1)continue;
          const info=p.imageinfo?.[0];
          const url=info?.thumburl||info?.url;
          if(url)return {url,title:(p.title||"").replace(/^File:|^Файл:/i,"")};
        }
      }catch{}
    }
    return null;
  },

  async wikipedia(club){
    const q=`${club.name} стадион`;
    try{
      const u=`https://ru.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=8&prop=pageimages&piprop=thumbnail|original&pithumbsize=1600&format=json&origin=*`;
      const j=await this.json(u);
      const pages=Object.values(j.query?.pages||{}).sort((a,b)=>this.scoreTitle(b.title,club)-this.scoreTitle(a.title,club));
      for(const p of pages){
        if(this.scoreTitle(p.title,club)<1)continue;
        const url=p.original?.source||p.thumbnail?.source;
        if(url)return {url,title:p.title||"Стадион"};
      }
    }catch{}
    return null;
  },

  async resolve(club){
    if(!this.mem.size)this.load();
    const cached=this.mem.get(club.id);
    if(cached?.url)return cached;
    const result=await this.commons(club)||await this.wikipedia(club);
    if(result){this.mem.set(club.id,result);this.save();return result}
    return null;
  },

  async bind(el,club,theme="rpl"){
    if(!el||!club)return;
    el.classList.add("stadiumLoading");
    el.classList.remove("stadiumOnline");
    el.style.backgroundImage="";
    el.dataset.stadium="";

    const result=await this.resolve(club);
    if(!result){
      el.classList.remove("stadiumLoading");
      return;
    }

    const probe=new Image();
    probe.decoding="async";
    probe.referrerPolicy="no-referrer";
    probe.onload=()=>{
      el.style.backgroundImage=`url("${result.url.replace(/"/g,"%22")}")`;
      el.dataset.stadium=result.title||"Стадион";
      el.classList.remove("stadiumLoading");
      el.classList.add("stadiumOnline");
    };
    probe.onerror=()=>{
      this.mem.delete(club.id);this.save();
      el.classList.remove("stadiumLoading");
    };
    probe.src=result.url;
  }
};
StadiumVisuals.load();
