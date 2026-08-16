
window.Logos = {
  cache: new Map(),
  async resolve(club){
    if(this.cache.has(club.id)) return this.cache.get(club.id);
    const title=encodeURIComponent(club.wiki||club.name);
    try{
      const r=await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${title}`);
      if(r.ok){
        const d=await r.json();
        const u=d.thumbnail?.source || d.originalimage?.source;
        if(u){ this.cache.set(club.id,u); return u; }
      }
      const s=await fetch(`https://ru.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(club.name+" футбольный клуб")}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=300&format=json&origin=*`);
      const j=await s.json(); const p=Object.values(j.query?.pages||{})[0];
      if(p?.thumbnail?.source){this.cache.set(club.id,p.thumbnail.source);return p.thumbnail.source}
    }catch(e){}
    return "";
  },
  async bind(img,club){
    img.style.visibility="hidden";
    const u=await this.resolve(club);
    if(u){img.src=u;img.style.visibility="visible"}
  }
};
