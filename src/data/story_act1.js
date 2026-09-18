// 第一幕のストーリーデータ。設計は docs/STORY_ACT1_DESIGN_2026-09-18.md。
//
// 四層：
//   幹 STORY_BEATS   章の節目。必ず起きる。人物条件を持たない（誰を採っても見る）
//   枝 STORY_SCENES  作戦の道中(road)・現地(arrival)・戦後(aftermath)に差す場面。接点のある者がいるときだけ
//   葉 （SCENE の中）人物は特性キー・前職で動く。人物IDでは引かない
//   根 （BEAT の文面）痕跡・旗を読んで返す。章ごとに数本まで
//
// 王国側の人物 KINGDOM_CAST は立ち絵を assets/kingdom/{id}.png に置けば出る（無ければ icon の絵文字）。
// 絵の仕様は assets/monsters と同じ 768×1024（3:4）、顔は上55%以内。

const KINGDOM_CAST = {
  brennan: {
    id: "brennan", name: "伍長ブレンダン", title: "開拓保護隊", icon: "🗡",
    profile: "王国軍の若い下士官。教本どおりに動くのが誇り。令状に書いてあることは全部本当だと思っている。",
    lines: {
      intro: ["盗賊討伐の令状はここにある！ ……え、村？ ここは盗賊の村だろう？", "王国軍開拓保護隊、伍長ブレンダン！ 教本第三章に従い、包囲を継続する！"],
      win: ["訓練どおりだ！ 報告書にはそう書く！", "ふう……。教本は正しかった。たぶん"],
      lose: ["報告書には……なんと書けば……", "退却！ 教本第九章、退却！ 誰か九章持ってないか！？"],
      hesitate: ["……そこの、農具を持ったの。なぜ斬らない？"]
    }
  },
  goldon: {
    id: "goldon", name: "鉱山監督ゴールドン", title: "王国鉱山局", icon: "💰",
    profile: "鉱山の帳簿を預かる文官。剣は持たない。数字は持っている。",
    lines: {
      intro: ["この鉱山は担保です。担保に手を出す者は、隣国の債権者と話していただく", "採掘量は先月比で一割増。オークの皆さんには感謝しております。無給ですが"],
      lose: ["帳簿は……帳簿だけは持って帰らせてください……"]
    }
  },
  vissel: {
    id: "vissel", name: "法務官ヴィッセル", title: "王国法務院", icon: "📜",
    profile: "盟約の失効を宣言した本人。悪意はない。前例があるだけ。",
    lines: {
      intro: ["境界盟約は当事者の死により失効しております。前例が、あるのです", "新しい魔王殿？ 存じ上げません。署名がございませんので"],
      envoy: ["盟約の更新には署名が要ります。署名には、当事者の承認が要ります。承認には……前例がございません"]
    }
  },
  el: {
    id: "el", name: "聖女エル", title: "勇者一行", icon: "✨",
    profile: "避難民の世話を焼き続けて三日寝ていない。魔族にも包帯を巻く。",
    lines: {
      intro: ["避難民の後ろに立たないで！ 前に立って！ ……あなたたちもです！", "怪我人は列に並んで。魔族の方も。……順番は守ってください"]
    }
  },
  graham: {
    id: "graham", name: "将軍グラハム", title: "王国遠征軍", icon: "🎖️",
    profile: "叩き上げの将軍。書類が嫌いで、前線が好き。",
    lines: {
      intro: ["王都の連中は書類で戦争をする。俺は違う。ここで終わらせる", "魔王とやら。お前の兵は飯を食っている最中に襲われても文句は言えんな？"]
    }
  },
  king: {
    id: "king", name: "国王レオンハルト四世", title: "王国", icon: "🏛",
    profile: "帳簿を読める王。読めるからこそ、止められなかった。",
    lines: {
      finale: ["……止めたかったと言えば、嘘になる。止められなかった、が正しい", "魔王殿。鉱山を手放せば、隣国が来る。それは、あなたの問題になった"]
    }
  },
  allen: {
    id: "allen", name: "勇者アレン", title: "勇者", icon: "👑",
    profile: "国境の開拓村の生まれ。魔族の追いはぎに家を焼かれた。人々を守ると決めている。",
    lines: {
      intro: ["ここから先は避難民がいる。通したければ、僕を倒せ"],
      raidNone: ["お前の軍は村を一つも焼いていないそうだな。……だが砦の兵は死んだ。それでも僕は退かない"],
      raidFew: ["お前の軍が焼いた村を見た。一つでも、僕には十分だ"],
      raidMany: ["幾つ焼いた？ 数えているか？ 僕は数えている"]
    }
  },
  mira: {
    id: "mira", name: "賢者ミラ", title: "勇者一行", icon: "📖",
    profile: "魔道書を経費で落とそうとして三度却下されている。",
    lines: { intro: ["魔王軍の給与体系について、学術的な興味があります。……戦いながらで結構です"] }
  }
};

// 名前だけの脇役（村長・使い・兵など）。cast に "n:elder" と書くと台詞の話者になる。
// tplId があれば種族の絵、無ければ icon の絵文字。st.story.npcs（救った村の若者など）も同じ書き方で引く。
const STORY_NPCS = {
  elder: { name: "村長", title: "ゴブリン村", icon: "👴", tplId: "goblin" },
  messenger: { name: "泥だらけの使い", title: "ゴブリン村", icon: "🏃", tplId: "goblin" },
  survivor: { name: "生き残りのゴブリン", title: "ゴブリン村", icon: "🔥", tplId: "goblin" },
  soldier: { name: "王国兵", title: "武器は捨てた", icon: "🛡" },
  radical: { name: "松明の魔族", title: "過激派", icon: "🔥" }
};

// 章。征服度（st.conquest）で引く。
const STORY_CHAPTERS = [
  { n: 1, id: "ch1", title: "名ばかりの魔王", conquest: [0, 0], goal: "ゴブリン村を救う" },
  { n: 2, id: "ch2", title: "奪われた鉱山", conquest: [1, 1], goal: "北の鉱山を取り戻す" },
  { n: 3, id: "ch3", title: "境界線", conquest: [2, 3], goal: "関所を落とし、盟約の写しを得る" },
  { n: 4, id: "ch4", title: "勇者", conquest: [4, 4], goal: "大神殿で勇者と会う" },
  { n: 5, id: "ch5", title: "魔族の分裂", conquest: [5, 5], goal: "魔族をまとめる" },
  { n: 6, id: "ch6", title: "王国遠征軍", conquest: [6, 6], goal: "遠征軍を退け、砦を落とす" },
  { n: 7, id: "ch7", title: "王都への道", conquest: [7, 7], goal: "人間の町を支配下に置く" },
  { n: 8, id: "ch8", title: "王国", conquest: [8, 99], goal: "王都・国王" }
];

// 幹。trigger: run_start / before_mission / after_battle。once は既定 true。
// text(st, s) の s は Story.helpers（名前の差し込み）。cast は { key: uid | "k:brennan" | "mormo" }。
// options が無ければ「続ける」一つ。html(st) は本文の下に足す追加の見た目（地図など）。
const STORY_BEATS = [
  {
    id: "throne", chapter: 1, trigger: "run_start", kicker: "即位",
    title: "名ばかりの魔王",
    cast(st) { return { mormo: "mormo" }; },
    text(st, s) {
      const staff = s.staffNames();
      return `玉座は埃をかぶっていた。前の魔王は、盟約の文書ごと消えた。\n`
        + `モルモ「おかえりなさいませ、魔王様。……いえ、初めまして、デス」\n`
        + `モルモ「ご報告デス。現在、魔王軍の所属者は……${staff.length + 1}名デス。${staff.join("殿、")}殿。……私を入れて、デス」\n`
        + `モルモ「王国軍が魔族領に砦を建てている、という噂は聞いています。ですが、誰も確かめに行けません。人が、いないので」\n`
        + `モルモ「まずは……面接、しましょうか。履歴書は私が集めておきましたデス」`;
    }
  },
  {
    id: "rescue_call", chapter: 1, trigger: "before_mission", kicker: "救援要請",
    title: "ゴブリン村が囲まれている",
    check(st) { return !(st.story.flags.rescueResolved); },
    cast(st) {
      const villager = Story.helpers(st).villager();
      return { mormo: "mormo", messenger: "n:messenger", brennan: "k:brennan", villager: villager ? villager.uid : undefined };
    },
    text(st, s) {
      const villager = s.villager();
      return `泥だらけのゴブリンが門をくぐってきた。膝が笑っている。\n`
        + `モルモ「ま、魔王様！ 救援要請デス！ ゴブリンの村が王国軍に包囲されています！ 三日は持たない、と……」\n`
        + (villager ? `使いは${villager.name}を見て目を丸くした。泥だらけの使い「お前……村を出たきりだったのに。戻ってきたのか」\n` : "")
        + `包囲しているのは「開拓保護隊」。名目は盗賊討伐。\n`
        + `伍長ブレンダン「盗賊討伐の令状はここにある！ ……え、村？ ここは盗賊の村だろう？」\n`
        + `モルモ「……行き先は、一つしかありませんネ。編成を、お願いしますデス」`;
    }
  },
  {
    id: "map_opens", chapter: 1, trigger: "after_battle", kicker: "地図",
    title: "ここだけじゃない",
    check(st) { return !!st.story.flags.rescueResolved; },
    cast(st) { return { mormo: "mormo", youth: st.story.npcs.villageYouth ? "n:villageYouth" : undefined, survivor: st.story.flags.villageLost ? "n:survivor" : undefined }; },
    text(st, s) {
      const saved = !!st.story.flags.villageSaved;
      const youth = st.story.npcs.villageYouth;
      return (saved
        ? `村の焚き火の前で、救助したゴブリンが北を指した。\n`
          + (youth ? `${youth.name}「ここだけじゃない。北の鉱山も、東の森も取られてる。砦が建ってる。……あんたら、本気で魔王軍なのか？」\n` : "")
        : `焼け跡から生き延びたゴブリンが、震える手で北を指した。\n`
          + `生き残りのゴブリン「ここだけじゃなかった。北の鉱山も、東の森も。……来てくれたのに、勝てなかったんだな」\n`)
        + `モルモは古い地図を広げた。王国軍の砦の印が、魔族領の中に点々と落ちている。\n`
        + `モルモ「魔王様……。思ったより、大きい話デスね」\n`
        + `モルモ「第一章、ですネ。……いえ、なんでもありません。帰りましょう」`;
    },
    html: "map"
  },
  {
    id: "ch2_open", chapter: 2, trigger: "after_battle", kicker: "第2章", title: "奪われた鉱山",
    cast(st) { return { mormo: "mormo", goldon: "k:goldon" }; },
    text(st, s) {
      return `北の鉱山。オークたちが掘り、王国の文官が数える。給金は出ていない。\n`
        + `鉱山監督ゴールドン「この鉱山は担保です。担保に手を出す者は、隣国の債権者と話していただく」\n`
        + `モルモ「担保……？ 王国は、誰かに借金があるのデスか？」\n`
        + `モルモ「魔王様。鉱山を返してもらうだけでは済まない気がしてきましたデス」`;
    }
  },
  {
    id: "ch3_open", chapter: 3, trigger: "after_battle", kicker: "第3章", title: "境界線",
    cast(st) { return { mormo: "mormo", vissel: "k:vissel" }; },
    text(st, s) {
      return `関所の書庫から、古い羊皮紙の写しが出てきた。境界盟約。前魔王と先代国王、二つの署名。\n`
        + `モルモ「……実は、知っていましたデス。でも文書が無くて、言っても誰も信じないので……」\n`
        + `法務官ヴィッセル「境界盟約は当事者の死により失効しております。前例が、あるのです」\n`
        + `法務官ヴィッセル「新しい魔王殿？ 存じ上げません。署名がございませんので」\n`
        + `モルモ「署名させるには、認めさせるしかない。認めさせるには……勝つしか、ないのデスね」`;
    }
  },
  {
    id: "ch4_open", chapter: 4, trigger: "after_battle", kicker: "第4章", title: "勇者",
    cast(st) { return { mormo: "mormo", allen: "k:allen", el: "k:el" }; },
    text(st, s) {
      const raids = (st.missionCounts || {}).raid || 0;
      const line = raids <= 0 ? KINGDOM_CAST.allen.lines.raidNone[0]
        : raids <= 2 ? KINGDOM_CAST.allen.lines.raidFew[0] : KINGDOM_CAST.allen.lines.raidMany[0];
      return `大神殿には避難民が詰めかけていた。人間の子供も、老いたコボルトもいる。\n`
        + `聖女エル「避難民の後ろに立たないで！ 前に立って！ ……あなたたちもです！」\n`
        + `一人の若者が、避難民の前に立った。剣は抜いていない。\n`
        + `勇者アレン「${line}」\n`
        + `モルモ「魔王様……あれが、勇者デス。悪い人には、見えませんネ」`;
    }
  },
  {
    id: "ch5_open", chapter: 5, trigger: "after_battle", kicker: "第5章", title: "魔族の分裂",
    cast(st) { return { mormo: "mormo", radical: "n:radical" }; },
    text(st, s) {
      const lost = !!st.story.flags.villageLost;
      return `魔王城の門前に、松明が並んだ。魔族の一団。要求は一つ。「人間の町を焼け」。\n`
        + (lost ? `先頭に立つのは、あの日救えなかったゴブリン村の生き残りだった。\n松明の魔族「あんたは来た。来て、負けた。だから今度は俺たちが行く」\n`
                : `先頭の者は魔王を見て言った。\n松明の魔族「あんたは村を救った。なら、次は人間の村を焼く番だろう？」\n`)
        + `モルモ「魔王様……。同じことをしたら、勇者の言うとおりになりますデス」\n`
        + `モルモ「でも、追い返したら軍が割れます。……どうしますか」`;
    }
  },
  {
    id: "ch6_open", chapter: 6, trigger: "after_battle", kicker: "第6章", title: "王国遠征軍",
    cast(st) { return { mormo: "mormo", graham: "k:graham" }; },
    text(st, s) {
      return `王都から本隊が動いた。旗は三列、荷馬車は数えきれない。\n`
        + `将軍グラハム「王都の連中は書類で戦争をする。俺は違う。ここで終わらせる」\n`
        + `モルモ「守っているだけでは、終わりません。……向こうから来る限り」\n`
        + `モルモ「魔王様。こちらから、砦を落としに行く番デス」`;
    }
  },
  {
    id: "ch7_open", chapter: 7, trigger: "after_battle", kicker: "第7章", title: "王都への道",
    cast(st) { return { mormo: "mormo" }; },
    text(st, s) {
      const raids = (st.missionCounts || {}).raid || 0;
      return `最初の人間の町が、門を開けた。降伏ではない。ただ、兵がいなくなっただけだ。\n`
        + (raids >= 3 ? `町の者は魔王軍の旗を見て家に引っ込んだ。焼かれた村の話は、ここまで届いている。\n`
                      : `町の者は魔王軍の旗を見て、恐る恐る出てきた。焼かれた村の話は、聞いていないらしい。\n`)
        + `モルモ「魔王様。この町の人たちは、明日から誰の民デスか？」\n`
        + `モルモ「食料庫が空です。食わせるか、搾るか。……線を引くのは、もう無理そうデスね」`;
    }
  },
  {
    id: "finale", chapter: 8, trigger: "after_battle", kicker: "第一幕・終", title: "では、明日から",
    check(st) { return (st.act || 1) >= 2 || st.phase === "clear"; },
    cast(st) { return { mormo: "mormo", king: "k:king" }; },
    text(st, s) {
      const oldest = s.oldestName();
      const fallen = st.fallenTotal || 0;
      return `王都。玉座の間。国王は逃げなかった——正確には、逃げる前に帳簿を閉じていた。\n`
        + `国王レオンハルト四世「……止めたかったと言えば、嘘になる。止められなかった、が正しい」\n`
        + `国王レオンハルト四世「魔王殿。鉱山を手放せば、隣国が来る。それは、あなたの問題になった」\n`
        + `窓の外に、王都の民がいる。食料庫は空。旧王国兵は武器を隠し、貴族は荷造りをし、門前では魔族が「人間に払わせろ」と叫んでいる。\n`
        + (oldest ? `${oldest}が、玉座の間の隅に立っている。第一章から、ずっとここにいる。\n` : "")
        + (fallen ? `名簿に線を引いた名前は、${fallen <= 2 ? "少ない" : fallen <= 6 ? "少なくない" : "数えたくない"}。\n` : `名簿に、線を引いた名前は一つもない。\n`)
        + `モルモ「魔王様。……では、明日からこの国をどうするのですか」\n`
        + `モルモ「王を倒すより、国を治める方が難しいそうデスよ。前の魔王様が、言っていました」\n`
        + `モルモ「魔王様。では、本日の業務を始めましょうか」`;
    }
  }
];

// 枝。slot: road / arrival / aftermath。check(st, party, mission) で接点のある者を返す（無ければ null）。
// text(st, c) の c は cast を解決したもの。effect(st, c, ctx) は実際の影響（敵の増減・資源・旗・痕跡）。
// ctx: { mission, enemyUnits(道中・現地のみ), notes, won(戦後のみ), stageData }
// 数値は本文に出さない。出すのは起きたことと台詞。
const STORY_SCENES = [
  // ── 道中 ──
  {
    id: "road_coward_supply", slot: "road", title: "逃げ足が見つけたもの",
    check(st, party) { return party.find(m => (m.traits || []).includes("coward") || (m.traits || []).includes("timid")) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid }; },
    text(st, c) {
      const found = !!c._found;
      return `街道の先に王国軍の斥候。${c.actor.name}は誰より早く反応した——逆方向に。\n`
        + (found
          ? `${c.actor.name}「見つけました！ 敵じゃなくて、敵の荷車を！ 干し肉とパンっす！」\n藪の中に置き去りの補給の荷車。逃げた先で、手柄を拾った。`
          : `${c.actor.name}「い、今のは偵察っす。戦術的後退っす」\n藪から戻ってくるまで、少し時間がかかった。`);
    },
    effect(st, c, ctx) {
      const found = U.chance(0.5);
      c._found = found;
      if (found) { st.food += 2; ctx.notes.push(`${c.actor.name}が逃げた先で補給の荷車を見つけた（食料が増えた）`); }
      Story.mark(st, "found_supply", c.actor.uid, { found });
    }
  },
  {
    id: "road_brute_charge", slot: "road", title: "命令の前に",
    check(st, party) { return party.find(m => ["brute", "first_strike", "charge"].some(t => (m.traits || []).includes(t))) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid }; },
    text(st, c) {
      return `王国軍の斥候が一人、丘の上に立っていた。まだ誰も命令していない。\n`
        + `${c.actor.name}「見えた！」\n`
        + (c._won
          ? `丘を駆け上がり、斥候が笛を吹く前に倒した。包囲に、穴が空いた。`
          : `丘を駆け上がった。斥候は笛を吹いた。丘の向こうから、返事の笛が聞こえた。\n${c.actor.name}「……あ」`);
    },
    effect(st, c, ctx) {
      const won = U.chance(0.6);
      c._won = won;
      if (!Array.isArray(ctx.enemyUnits)) return;
      if (won && ctx.enemyUnits.length > 1) {
        ctx.enemyUnits.pop();
        ctx.notes.push(`${c.actor.name}が斥候を倒し、敵が一人減った`);
      } else if (!won) {
        const base = ctx.enemyUnits[ctx.enemyUnits.length - 1];
        ctx.enemyUnits.push({ ...base, name: `増援の${base.name.replace(/^.*?の/, "")}` });
        ctx.notes.push(`${c.actor.name}の突撃で気づかれ、敵に増援が来た`);
      }
      Story.mark(st, "charged_early", c.actor.uid, { won });
    }
  },
  {
    id: "road_drunkard", slot: "road", title: "道端の酒場跡",
    check(st, party) { return party.find(m => (m.traits || []).includes("drunkard")) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid }; },
    text(st, c) {
      return `焼け落ちた酒場の跡。樽が一つ、無事だった。\n`
        + `${c.actor.name}「一杯だけ。一杯だけっすよ。景気づけに」\n`
        + `一杯では終わらなかった。到着は日が傾いてからになった。`;
    },
    effect(st, c, ctx) {
      Story.mark(st, "drank_on_road", c.actor.uid, {});
      ctx.notes.push(`${c.actor.name}が道中で飲んだ`);
    }
  },
  {
    id: "road_deserter", slot: "road", title: "この道は通らない",
    check(st, party) { return party.find(m => /王国軍の荷運び/.test(m.prevJob || "")) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid }; },
    text(st, c) {
      return `${c.actor.name}が街道の手前で足を止めた。\n`
        + `${c.actor.name}「この道は王国軍の補給路です。夜は通らない。……私が運んでたので」\n`
        + `脇道を抜けて、夜に着いた。見張りは、こちらに背を向けていた。`;
    },
    effect(st, c, ctx) {
      if (!Array.isArray(ctx.enemyUnits)) return;
      for (const u of ctx.enemyUnits) u.spd = Math.max(1, u.spd - 2);
      ctx.notes.push(`${c.actor.name}の案内で夜に着き、敵の出足が鈍った`);
      Story.mark(st, "night_route", c.actor.uid, {});
    }
  },
  // ── 現地 ──
  {
    id: "arrival_pack_village", slot: "arrival", missions: ["goblin_rescue"], title: "同族の矢",
    check(st, party) { return party.find(m => m.tplId === "goblin") || null; },
    cast(st, party) { return { actor: this.check(st, party).uid }; },
    text(st, c) {
      return `柵の向こうから、村のゴブリンが叫んだ。「${c.actor.race}だ！ 味方だ！」\n`
        + `${c.actor.name}「……なんか照れるっすね」\n`
        + `柵の隙間から石が飛んだ。狙いは悪いが、数は多い。`;
    },
    effect(st, c, ctx) {
      if (!Array.isArray(ctx.enemyUnits)) return;
      for (const u of ctx.enemyUnits) u.hp = Math.max(1, u.hp - Math.ceil(u.hp * 0.15));
      ctx.notes.push("村からの投石で、包囲の兵が先に傷ついていた");
      Story.mark(st, "village_helped", c.actor.uid, {});
    }
  },
  {
    id: "arrival_undead_fear", slot: "arrival", missions: ["goblin_rescue"], title: "門は開かない",
    check(st, party) { return party.find(m => (m.tags || []).includes("undead") || ["skeleton", "zombie", "necromancer", "lich"].includes(m.tplId)) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid }; },
    text(st, c) {
      return `柵の向こうで、村のゴブリンが${c.actor.name}を見た。見て、悲鳴を上げて、門を閉めた。\n`
        + `${c.actor.name}「……救援に来たんだが」\n`
        + `包囲している王国兵も${c.actor.name}を見た。見て、悲鳴を上げた。少なくとも、こちらは役に立った。`;
    },
    effect(st, c, ctx) {
      st.story.flags.villageFear = true;
      Story.mark(st, "village_feared", c.actor.uid, {});
    }
  },
  {
    id: "arrival_farm_raised", slot: "arrival", title: "農具を持った手",
    check(st, party) { return party.find(m => /人間の農家で育った/.test(m.prevJob || "")) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid, brennan: "k:brennan" }; },
    text(st, c) {
      return `王国兵の列が見えたとき、${c.actor.name}の手が止まった。\n`
        + `${c.actor.name}「……あの鎧。うちの村の駐屯兵と、同じだ」\n`
        + `伍長ブレンダン「……そこの、農具を持ったの。なぜ斬らない？」\n`
        + `${c.actor.name}は答えなかった。ただ、最初の一歩が遅れた。`;
    },
    effect(st, c, ctx) {
      Story.mark(st, "hesitated", c.actor.uid, {});
      ctx.notes.push(`${c.actor.name}は人間の兵を前に、最初の一歩が遅れた`);
    }
  },
  // ── 戦後（勝ったとき） ──
  {
    id: "after_village_thanks", slot: "aftermath", missions: ["goblin_rescue"], title: "村の焚き火",
    check(st, party, mission, ctx) { return ctx && ctx.won ? party[0] || null : null; },
    cast(st, party) {
      const cook = party.find(m => (m.traits || []).includes("demon_cook"));
      const eater = party.find(m => (m.traits || []).includes("big_eater"));
      const show = party.find(m => (m.traits || []).includes("show_off"));
      const native = party.find(m => /ゴブリン村の出/.test(m.prevJob || ""));
      const slime = party.find(m => m.tplId === "slime");
      return {
        actor: (native || cook || show || eater || slime || party[0]).uid,
        cook: cook ? cook.uid : undefined, eater: eater ? eater.uid : undefined,
        show: show ? show.uid : undefined, native: native ? native.uid : undefined,
        slime: slime ? slime.uid : undefined, elder: "n:elder", mormo: "mormo"
      };
    },
    text(st, c) {
      const g = c._grat || {};
      const lines = [`包囲が解けた。村の焚き火に、火が戻った。`];
      if (c.native) lines.push(`村長は${c.native.name}を見て、長く黙ってから言った。「……${c.native.name}。会計の帳簿、まだ合ってないぞ」\n${c.native.name}「数えるの苦手なんすよ、昔から」`);
      if (c.cook) lines.push(`${c.cook.name}が勝手に鍋を出した。村の備蓄と敵の携行食で、炊き出し。村中が並んだ。`);
      if (c.eater) lines.push(`${c.eater.name}は村の備蓄倉庫を見つけた。見つけて、入って、出てこなかった。\n翌朝、村長から請求書が届いた。`);
      if (c.show) lines.push(g.showOk
        ? `${c.show.name}が焚き火の前で演説を始めた。${c.show.name}「この村は、我が魔王軍が守った！」\n拍手が起きた。本人がいちばん驚いていた。`
        : `${c.show.name}が焚き火の前で演説を始めた。三行目で子供に「長い」と言われた。`);
      if (c.slime) lines.push(`${c.slime.name}に村の子供が群がった。村長「……あれは、何ですか」 モルモ「軍団員デス」`);
      if (st.story.flags.villageFear) lines.push(`門は最後まで半分しか開かなかった。感謝は、柵の隙間から渡された。`);
      lines.push(g.level === "high" ? `村長「魔王軍か。……本物だったんだな」 村の若いゴブリンが一人、後をついてきた。`
        : g.level === "low" ? `村長「助かった。……助かったが、次は事前に連絡をくれ」`
        : `村長「助かった。次に何か要るときは、言ってくれ」`);
      return lines.join("\n");
    },
    effect(st, c, ctx) {
      let score = 100;
      if (c.native) score += 20;
      if (c.cook) score += 25;
      if (c.eater) score -= 25;
      if (st.story.flags.villageFear) score -= 30;
      const showOk = c.show ? U.chance(0.5) : false;
      if (c.show) score += showOk ? 15 : -5;
      if (c.slime) score += 5;
      const level = score >= 125 ? "high" : score < 90 ? "low" : "mid";
      c._grat = { score, level, showOk };
      const food = level === "high" ? 3 : level === "low" ? 0 : 2;
      st.food += food;
      if (c.eater) { st.gold = Math.max(0, st.gold - 1); ctx.notes.push(`${c.eater.name}が村の備蓄を食い、村長から請求書が来た`); }
      if (food) ctx.notes.push(`村から感謝の食料を受け取った`);
      if (level === "high") st.renownBonus = Math.max(st.renownBonus || 0, 1);
      const youth = { name: Story.villageYouthName(st), savedBy: (ctx.party || []).map(m => m.uid), day: st.day, level };
      st.story.npcs.villageYouth = youth;
      st.story.flags.villageSaved = true;
      st.story.flags.rescueResolved = true;
      st.story.flags.villageGratitude = level;
      Story.mark(st, "saved_village", null, { level, party: (ctx.party || []).map(m => m.name).join("、") });
    }
  },
  {
    id: "after_village_lost", slot: "aftermath", missions: ["goblin_rescue"], title: "焼け跡",
    check(st, party, mission, ctx) { return ctx && !ctx.won ? (party[0] || { uid: null }) : null; },
    cast(st, party) { return party[0] ? { actor: party[0].uid } : {}; },
    text(st, c) {
      return `村は燃えていた。柵も、焚き火も、帳簿も。\n`
        + `生き残ったゴブリンが数人、丘の上からこちらを見ていた。何も言わなかった。\n`
        + `モルモ「……来た、というだけでは、足りませんでしたネ」`;
    },
    effect(st, c, ctx) {
      st.story.flags.villageLost = true;
      st.story.flags.rescueResolved = true;
      Story.mark(st, "abandoned_village", null, { party: (ctx.party || []).map(m => m.name).join("、") });
    }
  },
  {
    id: "after_eater_generic", slot: "aftermath", title: "戦場の弁当", weight: 0.5,
    check(st, party, mission, ctx) { return ctx && ctx.won && !mission.story ? party.find(m => (m.traits || []).includes("big_eater")) || null : null; },
    cast(st, party) { return { actor: this.check(st, party, {}, { won: true }).uid }; },
    text(st, c) {
      return `戦いが終わったあと、${c.actor.name}は敵の荷を漁っていた。\n`
        + `${c.actor.name}「こいつら、行軍用のチーズ持ってた。……戦の途中じゃないから、いいだろ」\n`
        + `帰り道、${c.actor.name}だけ荷物が重かった。`;
    },
    effect(st, c, ctx) { st.food += 1; ctx.notes.push(`${c.actor.name}が敵の荷から食料を持ち帰った`); Story.mark(st, "looted_food", c.actor.uid, {}); }
  },
  {
    id: "after_allure_defector", slot: "aftermath", title: "一人、ついてきた",
    check(st, party, mission, ctx) { return ctx && ctx.won ? party.find(m => ["allure", "enthrall"].some(t => (m.traits || []).includes(t))) || null : null; },
    cast(st, party) { return { actor: this.check(st, party, {}, { won: true }).uid, soldier: "n:soldier" }; },
    text(st, c) {
      return `帰り道、後ろから足音がついてきた。王国兵が一人。武器は捨てている。\n`
        + `王国兵「あの……${c.actor.name}さんの部隊に、入隊は……」\n`
        + `${c.actor.name}「面接は魔王様がなさるの。履歴書、持ってきた？」\n`
        + `王国兵「……持ってません」\n${c.actor.name}「じゃあ、次の機会にね」\n`
        + `兵は肩を落として帰っていった。王国軍の士気が、一人分だけ下がった。`;
    },
    effect(st, c, ctx) { st.alert = Math.max(0, st.alert - 1); ctx.notes.push(`${c.actor.name}に王国兵が一人ついてきかけた（王国の警戒が少し緩んだ）`); Story.mark(st, "charmed_soldier", c.actor.uid, {}); }
  }
];
