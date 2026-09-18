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

// 聞き返し役の口調。a は Story.pickAsker の { name, gender }。male / female の順。
const ASK = (a, male, female) => (a && a.gender === "female") ? female : male;

const KINGDOM_CAST = {
  brennan: {
    id: "brennan", name: "伍長ブレンダン", title: "開拓保護隊", icon: "🗡",
    profile: "王国軍の若い下士官。教本どおりに動くのが誇り。令状に書いてあることは全部本当だと思っている。",
    lines: {
      intro: ["我々は開拓民を守る命令を受けている。この村が襲撃の拠点でないという保証は、あるのか", "王国軍開拓保護隊、伍長ブレンダン。令状に従い、包囲を継続する"],
      win: ["訓練どおりだ！ 報告書にはそう書く！", "ふう……。教本は正しかった。たぶん"],
      lose: ["報告書には……なんと書けば……", "退却！ 教本第九章、退却！ 誰か九章持ってないか！？"],
      hesitate: ["……そこの、農具を持ったの。なぜ斬らない？"]
    }
  },
  private: {
    id: "private", name: "兵卒ポル", title: "開拓保護隊", icon: "🪖",
    profile: "ブレンダンの部下。伍長を尊敬しているが、目の前のものはちゃんと見える。",
    lines: { aside: ["伍長、ここゴブリンしか住んでませんけど……", "伍長、令状の村の名前、ここじゃないです"] }
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
    id: "throne", chapter: 1, trigger: "run_start", kicker: "即位", bg: "throne",
    title: "名ばかりの魔王",
    // 自己紹介はいつものモルモ全面画面で（紙芝居の前に一度だけ）。
    mormo: {
      expression: "welcome", kicker: "はじめまして",
      text: "おかえりなさいませ、魔王様。……いえ、初めまして、デス。\n"
        + "私はモルモ。前の魔王様のもとで、宰相見習いをしていた者デス。\n"
        + "宰相というのは、魔王様の右腕。書類と人事とお金を預かる役目デス。\n\n"
        + "前の魔王様は、ある日とつぜん、お姿を消されました。大事な文書を持ったまま。\n"
        + "魔王がいなくなると、給料が出ません。給料が出ないと聞いて、みんな出ていきました。\n\n"
        + "残ったのは、門番のガンツ殿と、書類と、私デス。書類は逃げませんので。\n"
        + "魔王様が玉座に座られたので、今日から私は魔王様の宰相デス。……勝手に、そう決めましたデス。"
    },
    cast(st, h) { const a = h.asker(); return { mormo: "mormo", asker: a ? a.uid : undefined }; },
    text(st, s) {
      const staff = s.staffNames();
      const g = s.asker();
      const A = (m, f) => ASK(g, m, f);
      return `玉座の間。玉座には埃が積もっている。前の魔王が消えてから、誰も座っていなかった。\n`
        + `モルモ「ご報告デス。現在、魔王軍の所属者は……${staff.length + 1}名デス。${staff.join("殿、")}殿と、私デス。戦える者は、いません」\n`
        + (g ? `${g.name}「${A("俺は戦えるぞ", "あたしは戦えるけど")}」\nモルモ「${g.name}殿は門番デス。門を離れたら、誰が門を守るんデスか」\n${g.name}「${A("……そうか。じゃあ戦えないな", "……そっか。じゃあ戦えないね")}」\n` : "")
        + `モルモ「魔王様、まず、いまの世界のことを話しますネ。少し長くなりますが、大事なことデス」\n`
        + `モルモ「この世界には、人間と、私たち魔族がいます。昔は、しょっちゅう戦っていました」\n`
        + `モルモ「でも、ずっと昔に、前の魔王様と、人間の王様が約束をしたんデス。『人間は平野と町に住む。魔族は山と森と荒野に住む。お互いの土地には入らない』。この約束を、境界盟約（きょうかいめいやく）と呼びます」\n`
        + (g ? `${g.name}「めいやく」\nモルモ「約束のこと、デス。紙に書いて、二人が名前を書いた約束デス」\n${g.name}「${A("じゃあ、約束って言えばいいだろ", "じゃあ、約束って言えばいいのに")}」\nモルモ「……はい。約束デス」\n` : "")
        + `モルモ「その約束のおかげで、何十年も、人間と魔族は戦わずに済んでいました。魔王の一番の仕事は、魔族をまとめて、この約束を守らせることだったんデス」\n`
        + `モルモ「ところが最近、王国の兵隊が、魔族の土地に入ってきています。砦を建てて、鉱山や森を取っている……という噂デス」\n`
        + (g ? `${g.name}「${A("約束を破ってるのか", "約束を破ってるってこと？")}」\nモルモ「分かりません。噂だけで、誰も確かめに行けていないんデス。人が、いないので」\n` : "")
        + `モルモ「だから魔王様の最初の仕事は、人を集めることデス。履歴書は集めておきました」\n`
        + `モルモ「……正直に言いますと、強そうな人は一人もいません。前の魔王軍に残っていたのは、この程度の応募者デス」\n`
        + `モルモ「でも、いないよりはましデス。この人たちで、魔王軍を作りましょう」`;
    }
  },
  {
    id: "rescue_call", chapter: 1, trigger: "before_mission", kicker: "救援要請", bg: "throne",
    mormo: {
      expression: "panic", kicker: "緊急",
      text: "ま、魔王様！ 門の外に、泥だらけのゴブリンが……！\n"
        + "ゴブリンの村からの使いデス。村が王国の兵隊に囲まれていて、三日ももたない、と。\n\n"
        + "……初めての出撃が、いきなり救援デス。\n"
        + "出撃は、面接で採った者の中から選びます。少ないなら全員連れて行っても構いませんヨ。"
    },
    check(st) { return !(st.story.flags.rescueResolved); },
    cast(st, h) {
      const villager = h.villager(), a = h.asker();
      return { mormo: "mormo", messenger: "n:messenger", brennan: "k:brennan", private: "k:private",
        villager: villager ? villager.uid : undefined, asker: a ? a.uid : undefined };
    },
    text(st, s) {
      const villager = s.villager(), g = s.asker();
      const A = (m, f) => ASK(g, m, f);
      return `泥だらけのゴブリンが、門をくぐってきた。走り通しだったらしく、膝が笑っている。\n`
        + `泥だらけの使い「た、助けてくれ。村が、囲まれてる。人間の兵隊に」\n`
        + (villager ? `使いは${villager.name}を見て、目を丸くした。\n泥だらけの使い「お前……村を出たきりだったのに。戻ってきたのか」\n` : "")
        + (g ? `${g.name}「${A("人間の兵隊？ 人間は平野に住むんじゃなかったのか。約束だろ", "人間の兵隊？ 人間は平野に住むんじゃなかったの？ 約束でしょ")}」\nモルモ「そのはずデス。ゴブリンの村は魔族の土地。人間の兵隊が来るのは、約束破りデス」\n` : "")
        + `モルモ「使いの人。囲んでいるのは、どんな兵隊デスか」\n`
        + `泥だらけの使い「『開拓保護隊』って旗を立ててる。開拓民を守る部隊だって」\n`
        + (g ? `${g.name}「かいたくみん」\nモルモ「人間の中で、新しい土地に引っ越して畑を作る人たちのことデス。王国は、その人たちを守るという名目で、兵隊を出しているんデス」\n${g.name}「${A("でも、ゴブリンの村に開拓民はいないだろ", "でも、ゴブリンの村に開拓民なんていないでしょ")}」\nモルモ「……いませんネ。だから、おかしいんデス」\n` : "")
        + `泥だらけの使い「隊長は若い伍長で、令状ってやつを持ってた。『この村は盗賊の拠点だから討伐する』って書いてあるんだと」\n`
        + `伍長ブレンダン「我々は開拓民を守る命令を受けている。この村が襲撃の拠点でないという保証は、あるのか」\n`
        + `兵卒ポル「伍長、ここゴブリンしか住んでませんけど……」\n`
        + `伍長ブレンダン「保証には、ならん」\n`
        + `モルモ「……使いの人が、伍長の言葉をそのまま覚えてきてくれました。伍長は、本気で『盗賊の村だ』と思っているみたいデス」\n`
        + (g ? `${g.name}「${A("じゃあ、話せば分かるんじゃないか", "じゃあ、話せば分かるんじゃない？")}」\nモルモ「三日ももたない村を囲んで、話し合いの時間はありません。まず囲みを解いて、村を助ける。話はそのあとデス」\n` : "")
        + `モルモ「魔王様。行き先は、一つしかありませんネ。編成を、お願いしますデス」`;
    }
  },
  {
    id: "map_opens", chapter: 1, trigger: "after_battle", kicker: "地図",
    title: "ここだけじゃない",
    bg(st) { return st.story.flags.villageLost ? "ruins" : "village"; },
    check(st) { return !!st.story.flags.rescueResolved; },
    mormo: {
      expression: "worried", kicker: "地図の見方",
      text: "魔王様、城から古い地図を持ってきました。\n"
        + "赤い印（⚔）が、王国の兵隊が建てた砦のある場所。旗（🏳）が、私たちが取り戻した場所デス。\n\n"
        + "これからの作戦会議では、魔王城に隣り合う場所から順に選べます。\n"
        + "人間の土地は『落とす』、魔族の土地は『従える』。\n"
        + "……印、思ったより多いデスね。"
    },
    cast(st, h) {
      const a = h.asker();
      return { mormo: "mormo", youth: st.story.npcs.villageYouth ? "n:villageYouth" : undefined,
        survivor: st.story.flags.villageLost ? "n:survivor" : undefined, asker: a ? a.uid : undefined };
    },
    text(st, s) {
      const saved = !!st.story.flags.villageSaved;
      const youth = st.story.npcs.villageYouth;
      const g = s.asker();
      const A = (m, f) => ASK(g, m, f);
      const head = saved
        ? `村の焚き火の前。救助したゴブリンの若者が、北を指した。\n`
          + (youth ? `${youth.name}「助かったよ。……でも、ここだけじゃないんだ」\n${youth.name}「北の鉱山も、東の森も、王国の兵隊に取られてる。砦が建ってる。オークもコボルトも、追い出された」\n${youth.name}「あんたら、本気で魔王軍なのか？ 本気なら、そっちも何とかしてくれよ」\n` : "")
        : `焼け跡。生き延びたゴブリンが、震える手で北を指した。\n`
          + `生き残りのゴブリン「ここだけじゃなかった。北の鉱山も、東の森も、取られてる」\n生き残りのゴブリン「……来てくれたのに、勝てなかったんだな」\n`;
      return head
        + `城に戻って、モルモが古い地図を広げた。王国軍の砦の印が、魔族の土地の中に点々と落ちている。\n`
        + (g ? `${g.name}「${A("……この赤いの、全部、人間の砦か", "……この赤いの、全部、人間の砦なの？")}」\nモルモ「そうデス。約束では、人間はこの線より向こうにいるはずでした。いまは、こちら側に砦が七つ」\n${g.name}「約束破りが、七つ」\nモルモ「はい。しかも、ゴブリンの村を囲んでいた伍長は、破っているつもりがありませんでした。上の人が『盗賊討伐』と命令すれば、兵隊はそれを信じます」\n${g.name}「${A("じゃあ、悪いのは上の人か", "じゃあ、悪いのは上の人ってこと？")}」\nモルモ「……それも、まだ分かりません。順番に、確かめに行くしかないデス」\n` : "")
        + `モルモ「魔王様……。思ったより、大きい話デスね」\n`
        + `モルモ「まず北の鉱山からデス。オークたちが追い出されたと聞きました。……第一章、ですネ。いえ、なんでもありません。帰りましょう」`;
    },
    html: "map"
  },
  {
    id: "ch2_open", chapter: 2, trigger: "after_battle", kicker: "第2章", title: "奪われた鉱山", bg: "mine",
    cast(st, h) { const a = h.asker(); return { mormo: "mormo", goldon: "k:goldon", asker: a ? a.uid : undefined }; },
    text(st, s) {
      const g = s.asker();
      const A = (m, f) => ASK(g, m, f);
      return `北の鉱山。もともとオークたちが掘っていた鉱山だ。いまは王国の兵隊が守り、王国の文官が帳簿をつけている。\n`
        + `オークたちは追い出されず、そのまま働かされている。給金は出ていない。\n`
        + `鉱山監督ゴールドン「採掘量は先月比で一割増。オークの皆さんには感謝しております。無給ですが」\n`
        + `モルモ「なぜ、そこまでしてこの鉱山が要るんデスか」\n`
        + `鉱山監督ゴールドン「王都の冬は、この鉱山の石炭で暖を取る。王国軍の剣は、この鉱山の鉄で打つ。お金だって、ここの銀で鋳（い）る。……この鉱山が止まれば、王都が止まる」\n`
        + (g ? `${g.name}「${A("じゃあ、返してくれって言っても、返さないのか", "じゃあ、返してって言っても、返さないの？")}」\nモルモ「返したら、王都の人たちが冬に凍えて、兵隊の剣がなくなって、お金が作れなくなる。王様の立場なら、簡単には返せませんネ」\n${g.name}「${A("でも、オークの鉱山だろ", "でも、オークの鉱山でしょ")}」\nモルモ「はい。オークの鉱山デス。だから、私たちも引けません」\n` : "")
        + `鉱山監督ゴールドン「この鉱山は担保です。担保に手を出す者は、隣国の債権者と話していただく」\n`
        + (g ? `${g.name}「たんぽ？ さいけんしゃ？」\nモルモ「……私にも、まだ分かりません。王国は、誰かにお金を借りているのかもしれません。それは、あとで分かるはずデス」\n` : "")
        + `モルモ「魔王様。鉱山を返してもらうだけでは、済まない気がしてきましたデス」`;
    }
  },
  {
    id: "ch3_open", chapter: 3, trigger: "after_battle", kicker: "第3章", title: "境界線", bg: "checkpoint",
    cast(st, h) { const a = h.asker(); return { mormo: "mormo", vissel: "k:vissel", asker: a ? a.uid : undefined }; },
    text(st, s) {
      const g = s.asker();
      const A = (m, f) => ASK(g, m, f);
      return `関所。人間の土地と魔族の土地の境目にある、石の門だ。書庫から、古い羊皮紙の写しが出てきた。\n`
        + `モルモ「……これ、境界盟約デス。前の魔王様と、先代の王様の約束。二人の名前が書いてあります」\n`
        + (g ? `${g.name}「${A("約束の紙か。これを見せれば、人間は引くんじゃないか", "約束の紙ね。これを見せれば、人間は引くんじゃない？")}」\n` : "")
        + `モルモ「……実は、この約束のことは、前から知っていましたデス。でも紙が無くて、言っても誰も信じないので、黙っていました」\n`
        + `王国から、法務官が来た。法律を扱う役人だ。\n`
        + `法務官ヴィッセル「境界盟約は、当事者の死により失効しております。前例が、あるのです」\n`
        + (g ? `${g.name}「しっこう？」\nモルモ「『もう効かない』という意味デス。この約束は、前の魔王様と先代の王様、二人の間の約束でした。二人ともいなくなったから、約束は消えた……と、王国は言っているんデス」\n${g.name}「${A("約束した本人がいないと、約束は消えるのか？", "約束した本人がいないと、約束って消えるの？")}」\nモルモ「紙の上では、そういう決まりもあります。でも、この約束は何十年も、みんなが守ってきました。関所も、鉱山の境も、全部この約束で決まっていたんデス。紙一枚で『無かったこと』にされたら、私たちは困ります」\n` : "")
        + `法務官ヴィッセル「新しい魔王殿？ 存じ上げません。署名がございませんので」\n`
        + (g ? `${g.name}「${A("魔王様の名前を書けばいいんじゃないか", "魔王様の名前を書けばいいんじゃない？")}」\nモルモ「書くには、王様が『この魔王を相手として認める』と言わなければなりません。いまの王国は、魔王様を魔王だと認めていないんデス」\n${g.name}「${A("じゃあ、どうすれば認める", "じゃあ、どうすれば認めてくれるの")}」\nモルモ「……勝つしか、ないデスね。認めさせるには」\n` : "")
        + `モルモ「魔王様。約束を見せても、駄目でした。次は、力で認めさせる番デス」`;
    }
  },
  {
    id: "ch4_open", chapter: 4, trigger: "after_battle", kicker: "第4章", title: "勇者", bg: "temple",
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
    id: "ch5_open", chapter: 5, trigger: "after_battle", kicker: "第5章", title: "魔族の分裂", bg: "gate",
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
    id: "ch6_open", chapter: 6, trigger: "after_battle", kicker: "第6章", title: "王国遠征軍", bg: "camp",
    cast(st) { return { mormo: "mormo", graham: "k:graham" }; },
    text(st, s) {
      return `王都から本隊が動いた。旗は三列、荷馬車は数えきれない。\n`
        + `将軍グラハム「王都の連中は書類で戦争をする。俺は違う。ここで終わらせる」\n`
        + `モルモ「守っているだけでは、終わりません。……向こうから来る限り」\n`
        + `モルモ「魔王様。こちらから、砦を落としに行く番デス」`;
    }
  },
  {
    id: "ch7_open", chapter: 7, trigger: "after_battle", kicker: "第7章", title: "王都への道", bg: "town",
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
    id: "finale", chapter: 8, trigger: "after_battle", kicker: "第一幕・終", title: "では、明日から", bg: "capital",
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
// 「過去」を読む小道具。痕跡 story のタグを本人で引く。
const STORY_PAST = {
  has(st, uid, tag) { return typeof Traces !== "undefined" && Traces.query(st.traces, { kind: "story", object: tag, subject: uid }).length > 0; },
  last(st, uid, tag) { return typeof Traces !== "undefined" ? Traces.last(st.traces, { kind: "story", object: tag, subject: uid }) : null; },
  // その痕跡のあとに、仲間が倒れたか（自分のせいで、と本人は思っている）
  mateDownedAfter(st, uid, tag) {
    const t = this.last(st, uid, tag);
    if (!t || typeof Traces === "undefined") return false;
    return Traces.query(st.traces, { kinds: ["downed", "fallen", "carried"], since: t.seq }).some(x => x.subject !== uid);
  },
  // 人間の軍に倒された仲間がいるか（去った者の記録）
  mateKilledByHumans(st) { return (st.departed || []).some(d => d.cause === "fallen" && d.army && !/反乱|魔界/.test(d.army)); }
};

const STORY_SCENES = [
  // ── 道中 ──
  {
    id: "road_coward_supply", slot: "road", title: "逃げ足が見つけたもの",
    check(st, party) { return party.find(m => (m.traits || []).includes("coward") || (m.traits || []).includes("timid")) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid }; },
    // 同じ「臆病」でも、状況・関係・過去で結果が変わる。
    //   初陣           → 逃げる（偵察と言い張る）
    //   仲間に負傷者   → 逃げずに残る（自分より弱い者がいる）
    //   前に逃げた痕跡 → 今回だけ踏みとどまる（覚えている）
    //   強欲を併せ持つ → 逃げた先で荷物を漁る（手柄になる）
    // 結果の選び方は「接点が強い順」。同じ特性が毎回同じ場面にならないための最初の見本。
    resolve(st, c, party) {
      const me = c.actor;
      const fledBefore = Story.count(st, "fled") > 0 && Traces.query(st.traces, { kind: "story", object: "fled", subject: me.uid }).length > 0;
      const injuredMate = party.find(m => m.uid !== me.uid && (m.injured || 0) > 0);
      const greedy = (me.traits || []).includes("greedy") || (me.traits || []).includes("pickpocket");
      const firstSortie = !((me.record || {}).battles > 0);
      if (fledBefore) return "stand_memory";
      if (injuredMate) return { kind: "stand_mate", mate: injuredMate };
      if (greedy) return U.chance(0.7) ? "loot" : "flee";
      return firstSortie ? "flee" : (U.chance(0.5) ? "loot" : "flee");
    },
    text(st, c) {
      const r = c._r || "flee";
      const n = c.actor.name;
      if (r === "stand_memory") return `街道の先に王国軍の斥候。${n}の足が一瞬、後ろへ向いた。\n${n}「……前に逃げたとき、どうなったか覚えてる」\n足は、前に戻った。震えたままだったが、戻った。`;
      if (r.kind === "stand_mate") return `街道の先に王国軍の斥候。${n}は逃げなかった。\n${n}「${r.mate.name}、まだ足引きずってるじゃないっすか。……先に行くっす」\n本人がいちばん驚いた顔をしていた。`;
      if (r === "loot") return `街道の先に王国軍の斥候。${n}は誰より早く反応した——逆方向に。\n${n}「見つけました！ 敵じゃなくて、敵の荷車を！ 干し肉とパンっす！」\n藪の中に置き去りの補給の荷車。逃げた先で、手柄を拾った。`;
      return `街道の先に王国軍の斥候。${n}は誰より早く反応した——逆方向に。\n${n}「い、今のは偵察っす。戦術的後退っす」\n藪から戻ってくるまで、少し時間がかかった。`;
    },
    effect(st, c, ctx) {
      const r = this.resolve(st, c, ctx.party || []);
      c._r = r;
      if (r === "loot") { st.food += 2; ctx.notes.push(`${c.actor.name}が逃げた先で補給の荷車を見つけた（食料が増えた）`); Story.mark(st, "found_supply", c.actor.uid, {}); }
      else if (r === "flee") { ctx.notes.push(`${c.actor.name}が道中で一度逃げた`); Story.mark(st, "fled", c.actor.uid, {}); }
      else Story.mark(st, "stood_ground", c.actor.uid, { why: r.kind || r });
    }
  },
  {
    id: "road_brute_charge", slot: "road", title: "命令の前に",
    check(st, party) { return party.find(m => ["brute", "first_strike", "charge"].some(t => (m.traits || []).includes(t))) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid }; },
    // 前に突っ込んで仲間が倒れた → 今回は命令を待つ／見栄っ張りが見ている → 必ず突っ込む／
    // 仲間に臆病者がいる → 一人で突っ込んで孤立（誰もついてこない）／それ以外 → 勝つか、気づかれるか
    resolve(st, c, party) {
      const me = c.actor;
      if (STORY_PAST.mateDownedAfter(st, me.uid, "charged_early")) return "wait";
      const watcher = party.find(m => m.uid !== me.uid && (m.traits || []).includes("show_off"));
      const coward = party.find(m => m.uid !== me.uid && ((m.traits || []).includes("coward") || (m.traits || []).includes("timid")));
      if (watcher) return { kind: "showoff", who: watcher, won: U.chance(0.75) };
      if (coward) return { kind: "alone", who: coward };
      return { kind: "plain", won: U.chance(0.6) };
    },
    text(st, c) {
      const r = c._r || { kind: "plain", won: true }; const n = c.actor.name;
      const head = `王国軍の斥候が一人、丘の上に立っていた。まだ誰も命令していない。\n`;
      if (r === "wait") return head + `${n}の足が一歩出て、止まった。\n${n}「……前に、先に行って。誰かが倒れた」\n${n}は命令を待った。斥候は笛を吹かなかった。`;
      if (r.kind === "showoff") return head + `${r.who.name}が見ている。${n}は見られていることに気づいた。\n${n}「見てろ！」\n`
        + (r.won ? `丘を駆け上がり、斥候が笛を吹く前に倒した。${r.who.name}「今の、私の方が上手くやれた」` : `丘を駆け上がった。斥候は笛を吹いた。${r.who.name}「……見なかったことにする」`);
      if (r.kind === "alone") return head + `${n}「行くぞ！」\n誰もついてこなかった。${r.who.name}は藪の中にいた。\n${n}は一人で丘の上にいた。斥候も、その仲間も、${n}を見ていた。`;
      return head + `${n}「見えた！」\n` + (r.won ? `丘を駆け上がり、斥候が笛を吹く前に倒した。包囲に、穴が空いた。` : `丘を駆け上がった。斥候は笛を吹いた。丘の向こうから、返事の笛が聞こえた。\n${n}「……あ」`);
    },
    effect(st, c, ctx) {
      const r = this.resolve(st, c, ctx.party || []); c._r = r;
      const units = Array.isArray(ctx.enemyUnits) ? ctx.enemyUnits : null;
      const won = r === "wait" ? null : r.kind === "alone" ? false : r.won;
      if (units && won === true && units.length > 1) { units.pop(); ctx.notes.push(`${c.actor.name}が斥候を倒し、敵が一人減った`); }
      else if (units && won === false && r.kind !== "alone") { const b = units[units.length - 1]; units.push({ ...b, name: `増援の${b.name.replace(/^.*?の/, "")}` }); ctx.notes.push(`${c.actor.name}の突撃で気づかれ、敵に増援が来た`); }
      else if (units && r.kind === "alone") { for (const u of units) u.atk = u.atk + 1; ctx.notes.push(`${c.actor.name}が一人で突っ込み、敵が勢いづいた`); }
      if (r === "wait") { ctx.notes.push(`${c.actor.name}は今回、命令を待った`); Story.mark(st, "waited", c.actor.uid, {}); }
      else Story.mark(st, "charged_early", c.actor.uid, { won: !!won, how: r.kind });
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
    // 同族のゴブリンが同行 → 取りなす（門は半分開く）／料理人が同行 → 骸骨の前に鍋を置いて誤魔化す／それ以外 → 門は閉まる
    resolve(st, c, party) {
      const me = c.actor;
      const gob = party.find(m => m.uid !== me.uid && m.tplId === "goblin");
      const cook = party.find(m => m.uid !== me.uid && (m.traits || []).includes("demon_cook"));
      if (gob) return { kind: "vouch", who: gob };
      if (cook) return { kind: "pot", who: cook };
      return "fear";
    },
    text(st, c) {
      const r = c._r || "fear"; const n = c.actor.name;
      const head = `柵の向こうで、村のゴブリンが${n}を見た。見て、悲鳴を上げた。\n`;
      if (r.kind === "vouch") return head + `${r.who.name}「待て待て、うちの人！ 骨だけど、うちの人！」\n門は半分だけ開いた。${n}「……半分か」`;
      if (r.kind === "pot") return head + `${r.who.name}が${n}の前に鍋を置いた。湯気で骨が見えなくなった。\n${r.who.name}「炊き出しです」\n村のゴブリンは鍋を見た。鍋しか見なかった。門が開いた。`;
      return head + `門が閉まった。\n${n}「……救援に来たんだが」\n包囲している王国兵も${n}を見た。見て、悲鳴を上げた。少なくとも、こちらは役に立った。`;
    },
    effect(st, c, ctx) {
      const r = this.resolve(st, c, ctx.party || []); c._r = r;
      st.story.flags.villageFear = (r === "fear");
      st.story.flags.villageHalfDoor = (r.kind === "vouch");
      Story.mark(st, r === "fear" ? "village_feared" : "village_vouched", c.actor.uid, { how: r.kind || r });
    }
  },
  {
    id: "arrival_farm_raised", slot: "arrival", title: "鍬を持った手",
    check(st, party) { return party.find(m => /人間の農家で育った/.test(m.prevJob || "")) || null; },
    cast(st, party) { return { actor: this.check(st, party).uid, brennan: "k:brennan" }; },
    // 初めて人間と戦う → ためらう／前にためらって仲間が倒れた → 今回は斬る／
    // 親しい仲間（一緒に戦った者）が人間に倒されている → 激昂／二度目以降 → もう迷わない
    resolve(st, c, party) {
      const me = c.actor;
      if (STORY_PAST.mateKilledByHumans(st) && STORY_PAST.has(st, me.uid, "hesitated")) return "rage";
      if (STORY_PAST.mateDownedAfter(st, me.uid, "hesitated")) return "strike";
      if (STORY_PAST.has(st, me.uid, "hesitated")) return "steady";
      return "hesitate";
    },
    text(st, c) {
      const r = c._r || "hesitate"; const n = c.actor.name;
      const head = `${n}は人間の農家で育った。武器を持ったことがない。いま手にしているのは、村から持ってきた鍬（くわ）だ。\n王国兵の列が見えたとき、`;
      if (r === "rage") return head + `${n}の手は止まらなかった。\n${n}「……前は、止まった。それで誰かが死んだ」\n伍長ブレンダン「そこの、農具を持ったの——」\n${n}は答えなかった。最初の一歩が、誰より早かった。`;
      if (r === "strike") return head + `${n}の手が一瞬止まり、動いた。\n${n}「前にためらって、仲間が倒れた。……もう、いい」\n最初の一歩は、遅れなかった。`;
      if (r === "steady") return head + `${n}は息を吐いた。\n${n}「二度目だ。……慣れたくは、ないが」`;
      return head + `${n}の手が止まった。\n${n}「……あの鎧。うちの村を守ってくれてた兵隊と、同じ鎧だ」\n${n}「あの人たちは、悪い人じゃなかった。畑を荒らす獣を追い払ってくれた」\n伍長ブレンダン「……そこの、鍬を持ったの。なぜ斬らない？」\n${n}は答えなかった。ただ、最初の一歩が遅れた。人間に育てられた魔族は、人間を殴るのに時間がかかる。`;
    },
    effect(st, c, ctx) {
      const r = this.resolve(st, c, ctx.party || []); c._r = r;
      const units = Array.isArray(ctx.enemyUnits) ? ctx.enemyUnits : null;
      if (r === "hesitate") { ctx.notes.push(`${c.actor.name}は人間の兵を前に、最初の一歩が遅れた`); Story.mark(st, "hesitated", c.actor.uid, {}); }
      else if (r === "rage") { if (units && units[0]) units[0].def = Math.max(0, units[0].def - 2); ctx.notes.push(`${c.actor.name}が真っ先に踏み込み、敵の前衛が崩れた`); Story.mark(st, "raged", c.actor.uid, {}); }
      else Story.mark(st, "struck", c.actor.uid, { how: r });
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
      if (c._cook === "soup") lines.push(`${c.cook.name}が勝手に鍋を出した。村の備蓄と敵の携行食で、炊き出し。村中が並んだ。`);
      if (c._cook === "fence") lines.push(`${c.cook.name}が鍋を出した。門は半分しか開かないので、柵の隙間から椀を渡した。村中が柵に並んだ。`);
      if (c._cook === "eaten") lines.push(`${c.cook.name}が鍋を出した。${c.eater.name}が鍋の前に立った。村人が並ぶ前に、鍋は空になった。\n${c.cook.name}「……二杯目からは有料です」`);
      if (c._eat === "bill") lines.push(`${c.eater.name}は村の備蓄倉庫を見つけた。見つけて、入って、出てこなかった。\n翌朝、村長から請求書が届いた。`);
      if (c._eat === "hidden") lines.push(`${c.eater.name}は村の備蓄倉庫を見つけた。空だった。\n村長「噂は聞いている。先に隠した」 ${c.eater.name}「……噂って何すか」`);
      if (c._show === "memorial") lines.push(`${c.show.name}が焚き火の前に立った。いつもの演説ではなかった。\n${c.show.name}「……ここまで来られなかった奴がいる。名前を言う」\n誰も「長い」とは言わなかった。`);
      else if (c._show === "ok") lines.push(`${c.show.name}が焚き火の前で演説を始めた。${c.show.name}「この村は、我が魔王軍が守った！」\n拍手が起きた。本人がいちばん驚いていた。`);
      else if (c._show === "flop") lines.push(`${c.show.name}が焚き火の前で演説を始めた。三行目で子供に「長い」と言われた。`);
      if (c.slime) lines.push(`${c.slime.name}に村の子供が群がった。村長「……あれは、何ですか」 モルモ「軍団員デス」`);
      if (st.story.flags.villageFear) lines.push(`門は最後まで半分しか開かなかった。感謝は、柵の隙間から渡された。`);
      lines.push(g.level === "high" ? `村長「魔王軍か。……本物だったんだな」 村の若いゴブリンが一人、後をついてきた。`
        : g.level === "low" ? `村長「助かった。……助かったが、次は事前に連絡をくれ」`
        : `村長「助かった。次に何か要るときは、言ってくれ」`);
      return lines.join("\n");
    },
    // 葉ごとの決め方（特性 → 同行者 → 状況 → 過去）
    //   大食漢：料理人が同行 → 鍋の方を食う（請求書なし）／前に敵の飯を漁った噂が先回り → 備蓄は隠されていた／それ以外 → 備蓄を食って請求書
    //   見栄っ張り：戦死者が出ている → 追悼の演説（必ず届く）／前に演説が受けた → 調子に乗る（高確率で成功）／初めて → 五分
    //   料理人：門が半分 → 柵越しに配る（届くが半分）／大食漢が同行 → 鍋は一人に食われる／それ以外 → 炊き出し
    resolveEater(st, c) {
      if (!c.eater) return null;
      if (c.cook) return "pot";
      if ((typeof Traces !== "undefined" && Traces.summary(st.traces, c.eater.uid).ate >= 2) || STORY_PAST.has(st, c.eater.uid, "looted_food")) return "hidden";
      return "bill";
    },
    resolveShow(st, c) {
      if (!c.show) return null;
      if ((st.fallenTotal || 0) > 0) return "memorial";
      const last = STORY_PAST.last(st, c.show.uid, "speech");
      if (last && last.data && last.data.ok) return U.chance(0.8) ? "ok" : "flop";
      return U.chance(0.5) ? "ok" : "flop";
    },
    resolveCook(st, c) {
      if (!c.cook) return null;
      if (st.story.flags.villageHalfDoor) return "fence";
      if (c.eater) return "eaten";
      return "soup";
    },
    effect(st, c, ctx) {
      let score = 100;
      const eat = this.resolveEater(st, c), show = this.resolveShow(st, c), cook = this.resolveCook(st, c);
      c._eat = eat; c._show = show; c._cook = cook;
      if (c.native) score += 20;
      if (cook === "soup") score += 25; else if (cook === "fence") score += 12; else if (cook === "eaten") score += 5;
      if (eat === "bill") score -= 25; else if (eat === "hidden") score -= 10;
      if (st.story.flags.villageFear) score -= 30;
      if (st.story.flags.villageHalfDoor) score -= 10;
      const showOk = show === "ok" || show === "memorial";
      if (show) score += show === "memorial" ? 20 : showOk ? 15 : -5;
      if (c.slime) score += 5;
      const level = score >= 125 ? "high" : score < 90 ? "low" : "mid";
      c._grat = { score, level, showOk };
      const food = level === "high" ? 3 : level === "low" ? 0 : 2;
      st.food += food;
      if (eat === "bill") { st.gold = Math.max(0, st.gold - 1); ctx.notes.push(`${c.eater.name}が村の備蓄を食い、村長から請求書が来た`); Story.mark(st, "village_bill", c.eater.uid, {}); }
      if (show) Story.mark(st, "speech", c.show.uid, { ok: showOk, how: show });
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
    id: "after_village_lost", slot: "aftermath", missions: ["goblin_rescue"], title: "焼け跡", bg: "ruins",
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
