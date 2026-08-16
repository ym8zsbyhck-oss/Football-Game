
window.Logos = {
  mem:new Map(),
  key:"rfc-logo-cache-v3",

  store(){
    try{localStorage.setItem(this.key,JSON.stringify(Object.fromEntries(this.mem)))}catch{}
  },
  load(){
    try{
      const x=JSON.parse(localStorage.getItem(this.key)||"{}");
      Object.entries(x).forEach(([k,v])=>this.mem.set(k,v));
    }catch{}
  },

  async fetchJson(url){
    const r=await fetch(url,{cache:"force-cache"});
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  },

  async wikipediaSummary(club){
    const title=encodeURIComponent(club.wiki||club.name);
    const d=await this.fetchJson(`https://ru.wikipedia.org/api/rest_v1/page/summary/${title}`);
    return d.originalimage?.source||d.thumbnail?.source||"";
  },

  async wikidataLogo(club){
    const search=await this.fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent((club.wiki||club.name)+" футбольный клуб")}&language=ru&uselang=ru&limit=5&format=json&origin=*`
    );
    const candidates=(search.search||[]).filter(x=>{
      const t=((x.label||"")+" "+(x.description||"")).toLowerCase();
      return /футбол|football|soccer|клуб/.test(t);
    });
    for(const c of candidates.slice(0,4)){
      try{
        const e=await this.fetchJson(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(c.id)}&props=claims&format=json&origin=*`
        );
        const claims=e.entities?.[c.id]?.claims||{};
        const file=claims.P154?.[0]?.mainsnak?.datavalue?.value || claims.P18?.[0]?.mainsnak?.datavalue?.value;
        if(file)return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}`;
      }catch{}
    }
    return "";
  },

  async commonsLogo(club){
    const terms=[
      `${club.wiki||club.name} logo football`,
      `${club.name} football club logo`,
      `${club.name} эмблема`,
      `${club.abbr} football club`
    ];
    for(const q of terms){
      try{
        const j=await this.fetchJson(
          `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=360&format=json&origin=*`
        );
        const pages=Object.values(j.query?.pages||{});
        const tokens=club.name.toLowerCase().split(/\s+/).filter(x=>x.length>2);
        pages.sort((a,b)=>{
          const sa=tokens.reduce((s,t)=>s+((a.title||"").toLowerCase().includes(t)?2:0),0)+( /logo|эмблем|crest/i.test(a.title||"")?3:0);
          const sb=tokens.reduce((s,t)=>s+((b.title||"").toLowerCase().includes(t)?2:0),0)+( /logo|эмблем|crest/i.test(b.title||"")?3:0);
          return sb-sa;
        });
        for(const p of pages){
          const u=p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url;
          if(u)return u;
        }
      }catch{}
    }
    return "";
  },

  async wikipediaSearch(club){
    const j=await this.fetchJson(
      `https://ru.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(club.name+" футбольный клуб")}&gsrlimit=4&prop=pageimages&piprop=thumbnail|original&pithumbsize=360&format=json&origin=*`
    );
    const pages=Object.values(j.query?.pages||{});
    return pages.find(p=>p.original?.source||p.thumbnail?.source)?.original?.source ||
           pages.find(p=>p.thumbnail?.source)?.thumbnail?.source || "";
  },

  async resolve(club){
    if(!this.mem.size)this.load();
    if(this.mem.has(club.id))return this.mem.get(club.id);
    const methods=["wikidataLogo","wikipediaSummary","commonsLogo","wikipediaSearch"];
    for(const m of methods){
      try{
        const u=await this[m](club);
        if(u){
          this.mem.set(club.id,u);this.store();return u;
        }
      }catch{}
    }
    return "";
  },

  async bind(img,club){
    img.style.visibility="hidden";
    img.classList.add("logoLoading");
    const u=await this.resolve(club);
    if(!u){img.classList.remove("logoLoading");return}
    img.onload=()=>{img.style.visibility="visible";img.classList.remove("logoLoading")};
    img.onerror=async()=>{
      // Remove bad cached URL and retry the deeper Commons/Wikidata chain next time.
      this.mem.delete(club.id);this.store();img.style.visibility="hidden";img.classList.remove("logoLoading");
    };
    img.src=u;
  }
};
Logos.load();
