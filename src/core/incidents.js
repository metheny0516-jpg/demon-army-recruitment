// 噂の札の器。戦闘・既存ハプニングの進行状態は変更しない。
const Incidents = {
  cards() { return typeof INCIDENTS === "undefined" ? [] : INCIDENTS; },
  card(id) { return this.cards().find(x => x.id === id); },
  init(st) {
    const s = st.incidents || (st.incidents = {});
    s.offered ||= {}; s.done ||= {}; s.dry ||= 0; s.active ||= 0;
    s.identities ||= {}; s.stats ||= { settles: 0, offered: 0, opened: 0, natural: 0 };
    // 張り紙を待たない（docs/SPEC_FORCED_OMEN_2026-09-16.md §2-1）。
    // pending = まだモルモが持ってきていない札。presented = 一度でも見せた札。
    // omens = 大筋の予兆（run.js から積む。札ではないので offered には入らない）。
    s.pending ||= []; s.presented ||= {}; s.omens ||= {};
    s.stats.shown ||= 0;
    for (const m of [...(st.departed || []), ...(st.roster || [])]) s.identities[m.uid] = { name: m.name, race: m.race };
    return s;
  },
  roster(st) { return st.roster || []; },
  matches(m, spec) { return (!spec.race || m.race === spec.race) && (!spec.rank || m.rankId === spec.rank); },
  alive(st, card, offer) {
    if (card.subject.kind === "unit") return offer.uids.every(uid => this.roster(st).some(m => m.uid === uid));
    if (card.subject.kind === "race") return this.roster(st).some(m => m.race === card.subject.race);
    return typeof Town !== "undefined" && Town.lv(st, card.subject.id) > 0;
  },
  relevant(st, card, uids) {
    const s = this.init(st), turn = st.turn || 0;
    return (st.traces || []).filter(t => {
      if (!card.traces.includes(t.kind) || (t.turn ?? 0) < turn - 60) return false;
      if (card.subject.kind === "facility") return t.data?.facility === card.subject.id;
      if (card.subject.kind === "race") {
        if (t.kind === "fallen") return (st.traces || []).some(h => h.kind === "hired" && s.identities[h.subject]?.race === card.subject.race && h.seq < t.seq);
        return s.identities[t.subject]?.race === card.subject.race;
      }
      if (["ransacked", "defended", "fallen"].includes(t.kind)) {
        const hire = (st.traces || []).find(x => x.kind === "hired" && uids.includes(x.subject));
        return !!hire && t.seq > hire.seq;
      }
      return uids.includes(t.subject);
    }).sort((a, b) => b.seq - a.seq);
  },
  candidate(st, card, threshold) {
    // 「いまの状態」はデータ側の式（`src/data/incidents.js`）。読めない場面
    // （sim の SIM_NO_TOWN で Town が無い等）は**その札を出さない**だけにする。
    // 器の都合で決着を止めない。
    let ready = false;
    try { ready = !!card.state(st); } catch (e) { ready = false; }
    if (!ready) return null;
    const pool = this.roster(st).filter(m => this.matches(m, card.subject)).sort((a,b) => a.uid-b.uid);
    let groups = card.subject.kind === "unit" ? pool.map(m => [m.uid]) : [[]];
    if (card.subject.count === 2) {
      groups = [];
      for (let i=0;i<pool.length;i++) for (let j=i+1;j<pool.length;j++) groups.push([pool[i].uid,pool[j].uid]);
    }
    let best=null;
    for (const uids of groups) {
      const used = new Set(), by = this.relevant(st, card, uids).filter(t => {
        if (used.has(t.kind)) return false; used.add(t.kind); return true;
      }).slice(0,2);
      if (by.length < threshold) continue;
      const offer = { turn: st.turn || 0, expires: (st.turn || 0)+3, by: by.map(t=>t.seq),
        evidence: by.map(t=>JSON.parse(JSON.stringify(t))), uids, subjectUid: uids[0] ?? null, door: card.door };
      if (!this.alive(st,card,offer)) continue;
      if (card.id === "general_duel") {
        const [p,q] = uids.map(uid=>pool.find(m=>m.uid===uid));
        const strength = m => (m.atk || 0) + (m.def || 0);
        // Pが挑戦側。同点ならPが譲る。提示後の成長で勝敗を変えない。
        offer.winnerUid = strength(p)>strength(q) ? p.uid : q.uid;
        offer.loserUid = offer.winnerUid===p.uid ? q.uid : p.uid;
      }
      if(!best || offer.by[0]>best.by[0])best=offer;
    }
    return best;
  },
  record(game, subject, data) {
    if (game.trace) game.trace("incident",subject,null,data);
    else Traces.record(game.state.traces ||= [],{ kind:"incident",subject,object:null,data,turn:game.state.turn||0 });
  },
  settle(game) {
    const out=this.settleCore(game);
    // 決着で新しく出た札・続き・予兆を待ち行列へ。settleCore は途中で return するので、
    // 積み下ろしは必ずこの外側で1回だけ行う（§2-1）。
    this.syncPending(game.state);
    return out;
  },

  // 待ち行列を offered / tail / omens と突き合わせる。
  // 失効・主役の死で offered から消えた札は pending からも消える（§4）。
  // 順は 大筋 ＞ 続き ＞ 自然発生(B) ＞ 噂の札(A)、同順は tier 大→中→小（§2-1）。
  syncPending(st) {
    const s=this.init(st);
    s.pending=s.pending.filter(p=> p.kind==="arc" ? !!s.omens[p.id]
      : p.kind==="tail" ? !!(s.tail && s.tail.ready && s.tail.id===p.id)
      : !!s.offered[p.id]);
    const has=id=>s.pending.some(p=>p.id===id);
    for (const [id,o] of Object.entries(s.offered)) {
      if (s.presented[id] || has(id)) continue;
      s.pending.push({ id, kind: o.door==="B" ? "B" : "A", turn: st.turn||0 });
    }
    if (s.tail?.ready && !s.presented[s.tail.id] && !has(s.tail.id))
      s.pending.push({ id:s.tail.id, kind:"tail", turn: st.turn||0 });
    const kindRank={arc:0,tail:1,B:2,A:3}, tierRank={large:0,mid:1,small:2};
    s.pending.sort((a,b)=> (kindRank[a.kind]??9)-(kindRank[b.kind]??9)
      || (tierRank[this.card(a.id)?.tier]??3)-(tierRank[this.card(b.id)?.tier]??3));
    return s.pending;
  },

  // 大筋（arc）の予兆を積む。同じ id は初回だけ（2回目以降は日誌と小物だけ＝§2-4）。
  // 呼ぶのは st.arc を更新する側（run.js）。Incidents は運ぶだけ。
  pushOmen(game, omen) {
    const st=game.state||game, s=this.init(st);
    // 一度見せた予兆は積み直さない。markPresented は omens から落とすので、
    // omens だけを見ていると毎決着に言い直してしまう（＝予兆ではなく警報になる）。
    if (!omen || !omen.id || s.omens[omen.id] || s.presented[omen.id]) return false;
    s.omens[omen.id]={ text:String(omen.text||""), turn:st.turn||0 };
    s.pending.push({ id:omen.id, kind:"arc", turn:st.turn||0 });
    this.syncPending(st);
    if (game.save) game.save();
    return true;
  },

  // モルモが読み上げる本文。CodeX の mormoLine があればそちら（口で言う形）、
  // 無ければ従来どおり張り紙の rumor（§6 の補足）。
  pendingText(st, entry) {
    const s=this.init(st);
    if (entry.kind==="arc") return s.omens[entry.id]?.text || "";
    if (entry.kind==="tail") return this.card(s.tail?.parent)?.title
      ? `${this.card(s.tail.parent).title}のその後が聞けそうデス。` : "噂の続きが聞けそうデス。";
    const card=this.card(entry.id), offer=s.offered[entry.id];
    if (!card || !offer) return "";
    return card.mormoLine || this.text(st, card.rumor, this.context(st, offer));
  },

  // 見せた札は pending から外す。「あとで」は offered に残す＝張り紙で読み返せる（§2-3）。
  markPresented(st, id) {
    const s=this.init(st);
    s.presented[id]=true;
    const entry=s.pending.find(p=>p.id===id);
    s.pending=s.pending.filter(p=>p.id!==id);
    // 数えるのは「出た札（offered）を見せたか」だけ。続きと予兆は offered に入らないので
    // 両辺がずれる（§5 の 表示された札／出た札 が 1.0 にならなくなる）。
    if (entry && (entry.kind==="A" || entry.kind==="B")) s.stats.shown=(s.stats.shown||0)+1;
    if (s.omens[id]) delete s.omens[id];
  },
  later(game,id) { this.markPresented(game.state,id); if(game.save)game.save(); return true; },

  settleCore(game) {
    const st=game.state,s=this.init(st);
    // processDepartmentsは戦闘ごとに一度。turnの加算位置は訓練と本戦で異なる。
    s.stats.settles++;
    s.result=null;
    if (game.finishIncidentEffects) game.finishIncidentEffects();
    for (const [id,o] of Object.entries(s.offered)) {
      const card=this.card(id);
      if (!card || !this.alive(st,card,o)) {
        this.record(game,o.subjectUid,{id,phase:"lost",text:"話を引き継ぐ者がいなくなった"});
        delete s.offered[id];
      } else if (o.expires <= (st.turn||0)) {
        // 「あとで」と言った札が失効したら日誌に1行だけ（§4）。痕跡は残さない
        // （プレイヤーが読んだうえで置いた札なので、結果として扱わない）。
        if (s.presented[id]) this.record(game,o.subjectUid,{id,phase:"blown",text:"張り紙が風で飛んだ"});
        delete s.offered[id];
      }
    }
    if (s.tail && s.tail.due <= s.stats.settles) s.tail.ready=true;
    if (Object.keys(s.offered).length>=2) return;
    const threshold=s.dry>=3?1:2;
    const candidates=this.cards().filter(c=>!s.done[c.id]&&!s.offered[c.id]&&(!c.tail?.after || !s.tail))
      .map(card=>({card,offer:this.candidate(st,card,threshold)})).filter(x=>x.offer)
      .sort((a,b)=>({large:3,mid:2,small:1}[b.card.tier]-{large:3,mid:2,small:1}[a.card.tier]) ||
        b.offer.by[0]-a.offer.by[0] || a.card.id.localeCompare(b.card.id));
    if (!candidates.length) { s.dry++; return; }
    const {card,offer}=candidates[0]; s.dry=0;
    // 同じ札が失効のあと出直したら、それは別の提示。もう一度モルモが持ってくる
    // （presented は「この提示を見せたか」であって「この札を見たか」ではない）。
    delete s.presented[card.id];
    s.offered[card.id]=offer; s.stats.offered++;
    if (card.door==="B") {
      s.stats.natural++;
      this.record(game,offer.subjectUid,{id:card.id,phase:"appeared",text:this.text(st,card.rumor,this.context(st,offer))});
    }
  },
  context(st,offer,viewerUid) {
    const find=uid=>this.roster(st).find(m=>m.uid===uid);
    return { subject:find(offer.subjectUid), viewer:find(viewerUid), winner:find(offer.winnerUid),
      loser:find(offer.loserUid), members:offer.uids.map(find), offer };
  },
  text(st,text,c) {
    const names={ポチ:c.subject?.name,ピリカ:c.subject?.name,箱丸:c.subject?.name,ギギ:c.subject?.name,
      リリィ:c.subject?.name,ゴルド:c.viewer?.name};
    for (const [sample,name] of Object.entries(names)) if(name) text=text.split(sample).join(name);
    return text;
  },
  open(game,id,viewerUid) {
    const st=game.state,s=this.init(st), card=this.card(id),offer=s.offered[id];
    if (!card || !offer || offer.expires <= (st.turn||0) || !this.alive(st,card,offer)) return null;
    if (card.tail?.after && s.tail) return { busy:true };
    if (card.pick==="viewer" && !this.roster(st).some(m=>m.uid===viewerUid)) return { pick:true,id };
    const c=this.context(st,offer,viewerUid); c.game=game; c.id=id;
    // hiddenはgainで変更されうる値なので先に保存。模擬戦の敗者も既に確定済み。
    const value=card.hidden.value(st,c); let branch=card.branches[value];
    if(!branch) return null;
    card.gain(st,c); branch.apply(st,c);
    const actual=c.branchOverride||value; branch=card.branches[actual];
    const nameOf=uid=>s.identities[uid]?.name;
    const why=offer.evidence.map(t=>Traces.describe(t,nameOf)).join("。")+"。"+card.hidden.label+"："+value+"。"+this.text(st,branch.text,c);
    const result={id,title:card.title,text:this.text(st,branch.text,c),mormo:this.text(st,branch.mormo,c),why,branch:actual};
    s.done[id]={turn:st.turn||0,branch:actual}; delete s.offered[id]; s.stats.opened++;
    this.markPresented(st,id);
    this.record(game,offer.subjectUid,{id,branch:actual,phase:"start",text:result.text});
    if (card.tail?.after) {
      s.tail={id:card.tail.id,parent:id,due:s.stats.settles+card.tail.after,branch:actual,
        subjectUid:offer.subjectUid,viewerUid,winnerUid:offer.winnerUid,loserUid:offer.loserUid,text:card.tail.text};
      s.active=1;
    }
    s.result=result; if(game.save) game.save(); return result;
  },
  decline(game,id) {
    const s=this.init(game.state),offer=s.offered[id]; if(!offer) return false;
    if(offer.door==="B") {
      s.done[id]={turn:game.state.turn||0,branch:"ignored"};
      this.record(game,offer.subjectUid,{id,branch:"ignored",phase:"ignored",text:"関わらなかった"});
    }
    delete s.offered[id]; this.markPresented(game.state,id);
    if(game.save)game.save();return true;
  },
  finishTail(game,accept=false) {
    const s=this.init(game.state),t=s.tail; if(!t?.ready)return null;
    if(t.parent==="necro_visitor" && t.branch==="遺物あり" && accept && game.state.counterattack?.pending) return {id:t.id,title:"前の主は待っている",text:"今の防衛戦を終えてから、迎え撃つか話し合うかを選ぼう。",mormo:"順番に、お相手しましょう。",why:"王国の反撃が既に予約されているため。"};
    const text=game.incidentTail ? game.incidentTail(t,accept) : t.text;
    this.record(game,t.subjectUid,{id:t.parent,phase:"tail",text});
    this.markPresented(game.state,t.id);
    s.tail=null;s.active=0;s.result={id:t.id,title:"噂の続き",text,mormo:"その後のご報告デス。",why:"先日の噂の続き。"};
    if(game.save)game.save(); return s.result;
  }
};
if(typeof module!=="undefined") module.exports={Incidents};
