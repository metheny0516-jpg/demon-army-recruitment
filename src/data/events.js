// 戦闘と戦闘の間に起きる「ハプニング」。
//
// ── 契約 ──────────────────────────────────────────────
//   id      一意のID
//   title   見出し
//   weight  抽選の重み（大きいほど出やすい）
//   check(st)        いま発生しうるか
//   cast(st)         登場人物を uid で返す { actor, other? }。組めなければ null
//   text(st, c)      本文。c は uid をモンスターに解決したもの
//   options[]        選択肢。1つだけなら「了解」を押すだけの通知になる
//     label(st, c)   ボタンの文言（文字列でも関数でもよい）
//     apply(st, c)   効果を適用し、結果テキストを返す
//
// 新しいイベントはこの配列に足すだけでよい。ロジック側の変更は要らない。
//
// 効果の書き方: st.gold / m.loyalty / m.salary / m.hp などを直接いじる。
// 離脱判定（忠誠0以下）はイベント適用後に run.js がまとめて行う。
const EVENTS = [
  {
    id: "infighting",
    title: "仲間割れ",
    weight: 5,
    // 不満のある者が2体以上いると起きる
    check(st) { return st.roster.filter(m => m.loyalty < 65).length >= 2; },
    cast(st) {
      const pool = st.roster.filter(m => m.loyalty < 65);
      if (pool.length < 2) return null;
      const a = U.pick(pool);
      const b = U.pick(pool.filter(m => m.uid !== a.uid));
      if (!b) return null;
      return { actor: a.uid, other: b.uid };
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）と ${c.other.name}（${c.other.race}）が食堂で殴り合いを始めた。\n`
        + `どうやら${U.pick(["取り分", "寝床の場所", "手柄の横取り", "誰が一番強いか"])}を巡って揉めているらしい。`;
    },
    options: [
      {
        label: "強い方を罰する（見せしめ）",
        apply(st, c) {
          const strong = Game.power(c.actor) >= Game.power(c.other) ? c.actor : c.other;
          const weak = strong === c.actor ? c.other : c.actor;
          strong.loyalty = U.clamp(strong.loyalty - 25, 0, 100);
          weak.loyalty = U.clamp(weak.loyalty + 15, 0, 100);
          return `${strong.name}を鞭打ちにした。${strong.name}の忠誠-25、${weak.name}の忠誠+15。\n`
            + `軍に静けさが戻った。良くない種類の静けさだ。`;
        }
      },
      {
        label: "放っておく",
        apply(st, c) {
          for (const m of [c.actor, c.other]) m.loyalty = U.clamp(m.loyalty - 12, 0, 100);
          const hurt = U.pick([c.actor, c.other]);
          hurt.hp = Math.max(1, hurt.hp - Math.ceil(hurt.hp * 0.15));
          return `二人は気が済むまで殴り合った。両者の忠誠-12。\n`
            + `${hurt.name}は負傷し、最大HPが${Math.ceil(hurt.hp * 0.15 / 0.85)}下がった。`;
        }
      },
      {
        label: "両方に酒を振る舞う（3G）",
        check(st) { return st.gold >= 3; },
        apply(st, c) {
          st.gold -= 3;
          for (const m of [c.actor, c.other]) m.loyalty = U.clamp(m.loyalty + 18, 0, 100);
          return `酒樽を開けた。3G を失ったが、二人は肩を組んで歌い始めた。両者の忠誠+18。`;
        }
      }
    ]
  },

  {
    id: "wage_demand",
    title: "賃上げ要求",
    weight: 4,
    check(st) { return st.roster.some(m => m.unpaid || m.loyalty < 55); },
    cast(st) {
      const pool = st.roster.filter(m => m.unpaid || m.loyalty < 55);
      return pool.length ? { actor: U.pick(pool).uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}が書類を片手に執務室へ来た。\n`
        + `「${U.pick(["同業他社の相場を調べました", "この労働環境で、この額は", "紹介した手前、言いにくいんですが"])}。`
        + `月${c.actor.salary}Gから、+2G でいかがでしょう」`;
    },
    options: [
      {
        label: "要求を飲む（給与+2G/戦）",
        apply(st, c) {
          c.actor.salary += 2;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 30, 0, 100);
          return `${c.actor.name}の給与が ${c.actor.salary}G になった。忠誠+30。\n`
            + `「話の分かる魔王様で助かります」`;
        }
      },
      {
        label: "却下する",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 30, 0, 100);
          return `${c.actor.name}は無言で部屋を出て行った。忠誠-30。\n`
            + `「……わかりました。ええ、わかりましたとも」`;
        }
      }
    ]
  },

  {
    id: "headhunted",
    title: "勇者軍からの引き抜き",
    weight: 3,
    check(st) { return st.roster.some(m => m.loyalty < 60) && st.stage >= 3; },
    cast(st) {
      const pool = st.roster.filter(m => m.loyalty < 60);
      return pool.length ? { actor: U.pick(pool).uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}の懐から、勇者軍の名刺が落ちた。\n`
        + `「待遇はこちらの方が上だと言われまして……いえ、まだ返事はしてません」`;
    },
    options: [
      {
        label: "慰留金を積む（6G）",
        check(st) { return st.gold >= 6; },
        apply(st, c) {
          st.gold -= 6;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 40, 0, 100);
          return `6G を握らせた。${c.actor.name}は名刺を燃やした。忠誠+40。`;
        }
      },
      {
        label: "好きにしろと言う",
        apply(st, c) {
          if (U.chance(0.5)) {
            c.actor.loyalty = 0;
            return `${c.actor.name}は翌朝、荷物ごと消えていた。`;
          }
          c.actor.loyalty = U.clamp(c.actor.loyalty + 10, 0, 100);
          return `${c.actor.name}は残った。「試しただけですよ」忠誠+10。`;
        }
      },
      {
        label: "その場で解雇する",
        apply(st, c) {
          st.roster = st.roster.filter(m => m.uid !== c.actor.uid);
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty - 8, 0, 100);
          return `${c.actor.name}は即日解雇された。\n`
            + `見ていた者たちの忠誠が-8。恐怖は統治の道具だが、安くはない。`;
        }
      }
    ]
  },

  {
    id: "rats",
    title: "金庫のネズミ",
    weight: 3,
    check(st) { return st.gold >= 4; },
    cast(st) { return {}; },
    text(st) {
      const loss = Math.max(1, Math.floor(st.gold * 0.25));
      return `金庫にネズミが巣を作っていた。${loss}G 分の紙幣が巣材になっている。\n`
        + `魔界の通貨は紙製だった。誰も疑問に思わなかった。`;
    },
    options: [
      {
        label: "……",
        apply(st) {
          const loss = Math.max(1, Math.floor(st.gold * 0.25));
          st.gold -= loss;
          return `${loss}G を失った（残り ${st.gold}G）。ネズミは元気に走り去った。`;
        }
      }
    ]
  },

  {
    id: "gambling",
    title: "深夜の賭博",
    weight: 3,
    check(st) { return st.roster.length >= 2 && st.gold >= 2; },
    cast(st) { return { actor: U.pick(st.roster).uid }; },
    text(st, c) {
      return `${c.actor.name}が軍資金を持ち出して賭場に出入りしている。\n`
        + `「増やして返すつもりだったんです。本当です」`;
    },
    options: [
      {
        label: "結果を聞く",
        apply(st, c) {
          if (U.chance(0.4)) {
            const win = U.randInt(4, 10);
            st.gold += win;
            c.actor.loyalty = U.clamp(c.actor.loyalty + 10, 0, 100);
            return `${win}G 増えて戻ってきた。${c.actor.name}は英雄扱いされている。忠誠+10。\n`
              + `軍全体に良くない成功体験が刻まれた。`;
          }
          const loss = Math.min(st.gold, U.randInt(3, 8));
          st.gold -= loss;
          c.actor.loyalty = U.clamp(c.actor.loyalty - 15, 0, 100);
          return `${loss}G が消えた（残り ${st.gold}G）。${c.actor.name}は正座している。忠誠-15。`;
        }
      }
    ]
  },

  {
    id: "necro_incident",
    title: "無断実験",
    weight: 4,
    check(st) {
      return st.roster.some(m => m.traits.includes("necromancy"))
        && st.roster.some(m => !m.traits.includes("necromancy"));
    },
    cast(st) {
      const necro = st.roster.find(m => m.traits.includes("necromancy"));
      const pool = st.roster.filter(m => m.uid !== necro.uid);
      return pool.length ? { actor: necro.uid, other: U.pick(pool).uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}が${c.other.name}を実験台にしているところを目撃された。\n`
        + `「生きたまま試した方が、良いデータが取れるので」`;
    },
    options: [
      {
        label: "実験を許可する",
        apply(st, c) {
          c.other.hp = Math.max(1, c.other.hp - 5);
          c.other.atk += 3;
          c.other.loyalty = U.clamp(c.other.loyalty - 20, 0, 100);
          c.actor.loyalty = U.clamp(c.actor.loyalty + 15, 0, 100);
          return `${c.other.name}は最大HP-5、攻撃+3 になった。忠誠-20。\n`
            + `${c.actor.name}は満足げだ。忠誠+15。「次は誰にしましょう」`;
        }
      },
      {
        label: "やめさせる",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 15, 0, 100);
          c.other.loyalty = U.clamp(c.other.loyalty + 20, 0, 100);
          return `${c.actor.name}は渋々器具を片付けた。忠誠-15。\n`
            + `${c.other.name}は魔王を見る目が変わった。忠誠+20。`;
        }
      }
    ]
  },

  {
    id: "welfare",
    title: "福利厚生の提案",
    weight: 3,
    check(st) { return st.roster.length >= 2 && st.gold >= 5; },
    cast(st) { return { actor: U.pick(st.roster).uid }; },
    text(st, c) {
      return `${c.actor.name}が提案書を出してきた。\n`
        + `「${U.pick(["医務室", "食堂の改装", "週休の導入", "慰安旅行（地上）"])}を。士気に関わります」`;
    },
    options: [
      {
        label: "予算を出す（5G）",
        check(st) { return st.gold >= 5; },
        apply(st) {
          st.gold -= 5;
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 15, 0, 100);
          return `5G を投じた。全員の忠誠+15。\n`
            + `魔王軍史上初の福利厚生である。`;
        }
      },
      {
        label: "却下する",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 10, 0, 100);
          return `提案書は破り捨てられた。${c.actor.name}の忠誠-10。`;
        }
      }
    ]
  },

  {
    id: "orc_duel",
    title: "決闘",
    weight: 3,
    check(st) { return st.roster.filter(m => m.race === "オーク" || m.race === "オーガ").length >= 2; },
    cast(st) {
      const pool = st.roster.filter(m => m.race === "オーク" || m.race === "オーガ");
      const a = U.pick(pool);
      const b = U.pick(pool.filter(m => m.uid !== a.uid));
      return b ? { actor: a.uid, other: b.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}と${c.other.name}が決闘を始めた。止める者はいない。\n`
        + `「どちらが強いか、はっきりさせておく必要がある」`;
    },
    options: [
      {
        label: "見届ける",
        apply(st, c) {
          const winner = U.chance(0.5) ? c.actor : c.other;
          const loser = winner === c.actor ? c.other : c.actor;
          winner.atk += 2;
          winner.loyalty = U.clamp(winner.loyalty + 10, 0, 100);
          loser.hp = Math.max(1, loser.hp - Math.ceil(loser.hp * 0.2));
          loser.loyalty = U.clamp(loser.loyalty - 5, 0, 100);
          return `${winner.name}が勝った。攻撃+2、忠誠+10。\n`
            + `${loser.name}は最大HPが2割減り、忠誠-5。しかし遺恨はないらしい。`;
        }
      }
    ]
  }
];
