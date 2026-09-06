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
// 登場人物選び。指定の種族を優先し、居なければ同じ部門の誰かで代用する。
// 種族で固く絞ると、その種族を採っていないランでイベントが一生出ない。
const EV_PICK = (pool, tplId) => {
  if (!pool || !pool.length) return null;
  const liked = tplId ? pool.filter(m => m.tplId === tplId) : [];
  return U.pick(liked.length ? liked : pool);
};

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
    id: "wage_protest",
    title: "給与抗議",
    weight: 9,
    check(st) {
      return !st.laborDispute && st.roster.some(m => (m.unpaidStreak || 0) >= 2);
    },
    cast(st) {
      const pool = st.roster.filter(m => (m.unpaidStreak || 0) >= 2);
      if (!pool.length) return null;
      const longest = Math.max(...pool.map(m => m.unpaidStreak || 0));
      return { actor: U.pick(pool.filter(m => (m.unpaidStreak || 0) === longest)).uid };
    },
    text(st, c) {
      const accountants = st.roster.filter(m => Aptitude.of(m).wage > 0).length;
      return `${c.actor.name}が未払い${c.actor.unpaidStreak}回分の給与明細を掲げ、食堂前で抗議を始めた。\n`
        + (accountants
          ? `会計経験者${accountants}名が金額を検算したため、モルモは「だいたい」で逃げられない。`
          : `要求額はどんぶり勘定だが、払っていない事実だけは正確だった。`);
    },
    options: [
      {
        label: "緊急清算する（6G）",
        check(st) { return st.gold >= 6; },
        apply(st, c) {
          st.gold -= 6;
          c.actor.unpaid = false;
          c.actor.unpaidStreak = 0;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 25, 0, 100);
          return `6Gを清算し、${c.actor.name}の未払いを解消した。忠誠+25。\n抗議の横断幕は食堂のテーブルクロスへ戻った。`;
        }
      },
      {
        label: "給与+2Gの労働協約を結ぶ",
        apply(st, c) {
          c.actor.salary += 2;
          c.actor.unpaid = false;
          c.actor.unpaidStreak = 0;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 15, 0, 100);
          return `${c.actor.name}の給与を今後+2Gとし、未払いを協約へ振り替えた。忠誠+15。\n`
            + `モルモは「振り替え」の意味を聞かないことにした。`;
        }
      },
      {
        label: "要求書を無視する",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 10, 0, 100);
          st.laborDispute = { stage: "march", actorUid: c.actor.uid, startedTurn: st.turn };
          return `要求書は魔王印のない紙として返却された。${c.actor.name}の忠誠-10。\n`
            + `翌朝、廊下の奥から行進の練習が聞こえ始めた。`;
        }
      }
    ]
  },

  {
    id: "strike_march",
    title: "ストライキ行進",
    weight: 30,
    check(st) { return !!st.laborDispute && st.laborDispute.stage === "march" && st.roster.length > 0; },
    cast(st) {
      const wanted = st.laborDispute && st.laborDispute.actorUid;
      const actor = st.roster.find(m => m.uid === wanted)
        || st.roster.slice().sort((a, b) => (a.loyalty || 0) - (b.loyalty || 0))[0];
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      const unpaid = st.roster.filter(m => m.unpaid || (m.unpaidStreak || 0) > 0).length;
      return `${c.actor.name}を先頭に、鍋と盾を打ち鳴らすストライキ行進が玉座の間へ到着した。\n`
        + `参加者は未払い経験者${unpaid}名と、昼休みなので付いてきた者たち。要求は「払え、休ませろ、食堂の椅子を増やせ」。`;
    },
    options: [
      {
        label: "全員へ緊急支給する（8G）",
        check(st) { return st.gold >= 8; },
        apply(st) {
          st.gold -= 8;
          for (const m of st.roster) {
            if (m.unpaid || (m.unpaidStreak || 0) > 0) m.loyalty = U.clamp(m.loyalty + 18, 0, 100);
            m.unpaid = false;
            m.unpaidStreak = 0;
          }
          st.laborDispute = null;
          return `8Gを緊急支給し、全員の未払いを解消した。対象者の忠誠+18。\n行進は給料袋を数える会へ変更された。`;
        }
      },
      {
        label: "代表を生活部門の労務担当にする（給与+1G）",
        apply(st, c) {
          Game.assignDepartment(c.actor.uid, "support");
          c.actor.salary += 1;
          c.actor.unpaid = false;
          c.actor.unpaidStreak = 0;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 30, 0, 100);
          for (const m of st.roster) if (m.uid !== c.actor.uid) m.loyalty = U.clamp(m.loyalty + 5, 0, 100);
          st.laborDispute = null;
          return `${c.actor.name}を生活部門の労務担当へ異動。給与+1G、本人の忠誠+30、全員+5。\n`
            + `戦力は一人減ったが、苦情の提出先が初めてできた。`;
        }
      },
      {
        label: "魔王親衛隊に鎮圧させる",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 45, 0, 100);
          for (const m of st.roster) if (m.uid !== c.actor.uid) m.loyalty = U.clamp(m.loyalty - 8, 0, 100);
          st.laborDispute = null;
          return `行進を強制解散。${c.actor.name}の忠誠-45、ほか全員-8。\n廊下は静かになった。要求書は地下で増刷されている。`;
        }
      }
    ]
  },

  {
    id: "wage_demand",
    title: "賃上げ要求",
    weight: 4,
    check(st) {
      return !st.laborDispute
        && !st.roster.some(m => (m.unpaidStreak || 0) >= 2)
        && st.roster.some(m =>
        (m.unpaid && (m.unpaidStreak || 0) < 2) || (!m.unpaid && m.loyalty < 55));
    },
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
  },

  // ── 部門・資源から起きる事件 ────────────────────────
  // 戦闘や給与だけでなく、「前の勤務で誰をどこへ置いたか」が次の事件になる。
  {
    id: "kitchen_takeover",
    title: "食堂占拠",
    weight: 4,
    check(st) {
      const report = st.lastDepartmentReport;
      return !!report && report.foodShortage > 0
        && st.roster.some(m => Aptitude.of(m).appetite > 0);
    },
    cast(st) {
      // 戦闘部門の腹ペコを優先する。「戦力を生活へ回すか」が選択になるため。
      const hungry = st.roster.filter(m => Aptitude.of(m).appetite > 0);
      const combat = hungry.filter(m => Game.departmentOf(m).id === "combat");
      const pool = combat.length ? combat : hungry;
      if (!pool.length) return null;
      const maxAppetite = Math.max(...pool.map(m => Aptitude.of(m).appetite));
      return { actor: U.pick(pool.filter(m => Aptitude.of(m).appetite === maxAppetite)).uid };
    },
    text(st, c) {
      const shortage = st.lastDepartmentReport.foodShortage;
      return `食料が${shortage}足りず、${c.actor.name}が食堂に立てこもった。\n`
        + `「腹が減った。食わせるまで、ここは俺たちの城だ」――城の中で城を取られた。`;
    },
    options: [
      {
        label: "地上から緊急購入する（4G）",
        check(st) { return st.gold >= 4; },
        apply(st) {
          st.gold -= 4;
          st.food += 4;
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 5, 0, 100);
          return `4Gで食料4をかき集めた。全員の忠誠+5。\n食堂は解放されたが、請求書だけが残った。`;
        }
      },
      {
        label: "占拠犯を生活部門の炊事責任者にする（給与+1G）",
        apply(st, c) {
          Game.assignDepartment(c.actor.uid, "support");
          const food = Math.max(1, Aptitude.of(c.actor).food);
          c.actor.salary += 1;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 15, 0, 100);
          st.food += food;
          return `${c.actor.name}を生活部門へ異動した。給与+1G、忠誠+15、食料+${food}。\n`
            + `占拠犯が、そのまま食堂長になった。魔王軍ではよくある人事だ。`;
        }
      },
      {
        label: "兵糧攻めにする",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 30, 0, 100);
          for (const m of st.roster) {
            if (m.uid !== c.actor.uid) m.loyalty = U.clamp(m.loyalty - 5, 0, 100);
          }
          return `${c.actor.name}が折れた。忠誠-30、見ていた全員の忠誠-5。\n`
            + `食料は増えなかった。空腹と恨みだけが残った。`;
        }
      }
    ]
  },

  {
    id: "surplus_rations",
    title: "余った食料の行方",
    weight: 3,
    check(st) {
      const report = st.lastDepartmentReport;
      return !!report && report.foodProduced > 0 && report.foodShortage === 0
        && st.food >= Math.max(3, Game.foodNeed() + 2)
        && Game.departmentRoster("support").length > 0;
    },
    cast(st) {
      const workers = Game.departmentRoster("support");
      if (!workers.length) return null;
      const best = Math.max(...workers.map(m => Aptitude.of(m).food));
      return { actor: U.pick(workers.filter(m => Aptitude.of(m).food === best)).uid };
    },
    text(st, c) {
      return `${c.actor.name}が、生活部門で余った食料${st.food}個の処分伺いを持ってきた。\n`
        + `「備蓄に回しますか、皆で食べますか。それとも……地上では高く売れますヨ」`;
    },
    options: [
      {
        label: "魔王軍宴会を開く（食料3）",
        check(st) { return st.food >= 3; },
        apply(st) {
          st.food -= 3;
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 10, 0, 100);
          return `食料3を使って宴会を開いた。全員の忠誠+10。\n翌朝、戦闘部門の半分が食堂で寝ていた。`;
        }
      },
      {
        label: "地上へ横流しする（食料2）",
        check(st) { return st.food >= 2; },
        apply(st, c) {
          st.food -= 2;
          st.gold += 5;
          c.actor.loyalty = U.clamp(c.actor.loyalty - 8, 0, 100);
          return `食料2を横流しして5Gを得た。${c.actor.name}の忠誠-8。\n`
            + `帳簿には「自然蒸発」と記された。食料は蒸発しない。`;
        }
      },
      {
        label: "非常食として封印する",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty + 3, 0, 100);
          return `食料はそのまま備蓄した。${c.actor.name}の忠誠+3。\n`
            + `堅実な判断すぎて、モルモは報告書のオチを失った。`;
        }
      }
    ]
  },

  {
    id: "facility_credit",
    title: "施設完成の功績争い",
    weight: 4,
    check(st) {
      const report = st.lastDepartmentReport;
      return !!report && report.facilityAfter > report.facilityBefore
        && Game.departmentRoster("support").length > 0;
    },
    cast(st) {
      const builders = Game.departmentRoster("support");
      if (!builders.length) return null;
      const best = Math.max(...builders.map(m => Aptitude.of(m).material));
      return { actor: U.pick(builders.filter(m => Aptitude.of(m).material === best)).uid };
    },
    text(st, c) {
      const facility = FACILITIES.find(f => f.id === st.activeFacilityId)
        || FACILITY_LEVELS[st.facilityLevel] || FACILITY_LEVELS[0];
      return `新施設「${facility.name}」が完成した。${c.actor.name}が泥だらけで表彰を待っている。\n`
        + `一方、モルモは完成報告書の功績欄に、すでに魔王様の名前を書いてしまった。`;
    },
    options: [
      {
        label: "完成報奨金を出す（3G）",
        check(st) { return st.gold >= 3; },
        apply(st, c) {
          st.gold -= 3;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 30, 0, 100);
          return `${c.actor.name}へ3Gを支給した。忠誠+30。\n`
            + `建設部門では、次の工事の希望者が急に増えた。`;
        }
      },
      {
        label: "功労者の名を施設につける（給与+1G）",
        apply(st, c) {
          c.actor.salary += 1;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 18, 0, 100);
          for (const m of Game.departmentRoster("support")) {
            if (m.uid !== c.actor.uid) m.loyalty = U.clamp(m.loyalty + 5, 0, 100);
          }
          return `施設は「${c.actor.name}記念」と命名された。給与+1G、忠誠+18。\n`
            + `看板だけは、建物より立派に作られた。`;
        }
      },
      {
        label: "式典を中止し、予算を建材へ戻す",
        apply(st, c) {
          st.materials += 2;
          c.actor.loyalty = U.clamp(c.actor.loyalty - 20, 0, 100);
          return `式典予算を建材2へ戻した。${c.actor.name}の忠誠-20。\n`
            + `合理的な判断だった。誰も拍手はしなかった。`;
        }
      }
    ]
  },

  {
    id: "seasoning_disaster",
    title: "まかないの味付け大失敗",
    weight: 3,
    check(st) {
      const report = st.lastDepartmentReport;
      return !!report && report.foodProduced > 0 && Game.departmentRoster("support").length > 0;
    },
    cast(st) {
      const workers = Game.departmentRoster("support");
      if (!workers.length) return null;
      const best = Math.max(...workers.map(m => Aptitude.of(m).food));
      return { actor: U.pick(workers.filter(m => Aptitude.of(m).food === best)).uid };
    },
    text(st, c) {
      const skilled = Aptitude.of(c.actor).food >= 4;
      return `${c.actor.name}が今日のまかないを一口すすり、無言で鍋の蓋を閉じた。\n`
        + (skilled
          ? `生活適性の高さで食べ物の形には戻したらしい。味だけが戻らなかった。`
          : `モルモの角が、湯気だけで少し曲がった。料理ではなく事故の報告である。`);
    },
    options: [
      {
        label: "予定どおり配膳する",
        apply(st, c) {
          const penalty = Aptitude.of(c.actor).food >= 4 ? 3 : 8;
          let affected = 0;
          for (const m of st.roster) {
            if (Aptitude.of(m).appetite === 0) continue;
            m.loyalty = U.clamp(m.loyalty - penalty, 0, 100);
            affected++;
          }
          return `${affected}名が完食し、忠誠-${penalty}。食料は減らさずに済んだ。\n`
            + `食事を必要としない者だけが、今日ほど自分の体質に感謝した日はない。`;
        }
      },
      {
        label: "作り直す（食料2）",
        check(st) { return st.food >= 2; },
        apply(st, c) {
          st.food -= 2;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 12, 0, 100);
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 3, 0, 100);
          return `食料2を使って作り直した。全員の忠誠+3、${c.actor.name}はさらに+12。\n`
            + `二鍋目は普通だった。普通がこれほど尊いとは。`;
        }
      },
      {
        label: "正式な炊事責任者に任命する（給与+1G）",
        apply(st, c) {
          c.actor.salary += 1;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 18, 0, 100);
          st.food += 1;
          return `${c.actor.name}を炊事責任者に任命した。給与+1G、忠誠+18、試作品から食料1を回収。\n`
            + `失敗を役職で解決するのは、魔王軍にも人間界にもある。`;
        }
      }
    ]
  },

  {
    id: "cleaning_dispute",
    title: "掃除当番論争",
    weight: 3,
    check(st) {
      const workers = Game.departmentRoster("support");
      return workers.length >= 1 && st.roster.length >= 2;
    },
    cast(st) {
      const workers = Game.departmentRoster("support");
      const cleaners = workers.filter(m => (m.job || "").includes("掃除"));
      const actor = U.pick(cleaners.length ? cleaners : workers);
      const others = st.roster.filter(m => m.uid !== actor.uid);
      const differentRace = others.filter(m => m.race !== actor.race);
      const other = U.pick(differentRace.length ? differentRace : others);
      return other ? { actor: actor.uid, other: other.uid } : null;
    },
    text(st, c) {
      const accusation = c.actor.race === c.other.race
        ? `廊下の汚れを互いの勤務態度のせいにしている。`
        : `廊下の汚れを互いの種族のせいにしている。`;
      return `${c.actor.name}（${c.actor.race}）と${c.other.name}（${c.other.race}）が、${accusation}\n`
        + `論争は掃除当番表より長く、廊下はまだ汚い。`;
    },
    options: [
      {
        label: "交代制の当番表を作る（食料1）",
        check(st) { return st.food >= 1; },
        apply(st, c) {
          st.food -= 1;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 10, 0, 100);
          c.other.loyalty = U.clamp(c.other.loyalty + 10, 0, 100);
          return `食料1を当番手当として出した。二人の忠誠+10。\n当番表は読める者が少ないので、絵で描かれた。`;
        }
      },
      {
        label: "履歴書の職歴で担当を決める",
        apply(st, c) {
          const cleaner = [c.actor, c.other].find(m => (m.job || "").includes("掃除"));
          if (cleaner) {
            cleaner.loyalty = U.clamp(cleaner.loyalty + 18, 0, 100);
            st.food += 2;
            return `${cleaner.name}の職歴「${cleaner.job}」が初めて正式に評価された。忠誠+18、衛生改善で食料+2。`;
          }
          c.actor.loyalty = U.clamp(c.actor.loyalty - 8, 0, 100);
          c.other.loyalty = U.clamp(c.other.loyalty - 8, 0, 100);
          return `二人の履歴書に掃除経験はなかった。押しつけ合いが再開し、両者の忠誠-8。`;
        }
      },
      {
        label: "片方を建設部門へ異動する",
        apply(st, c) {
          const moved = Aptitude.of(c.actor).material >= Aptitude.of(c.other).material ? c.actor : c.other;
          Game.assignDepartment(moved.uid, "support");
          moved.loyalty = U.clamp(moved.loyalty - 5, 0, 100);
          const stayed = moved.uid === c.actor.uid ? c.other : c.actor;
          stayed.loyalty = U.clamp(stayed.loyalty + 8, 0, 100);
          return `${moved.name}を建設部門へ異動した。本人の忠誠-5、残った${stayed.name}の忠誠+8。\n`
            + `廊下は静かになった。建設現場が騒がしくなった。`;
        }
      }
    ]
  },

  {
    id: "iron_ants",
    title: "鉄アリ発生",
    weight: 3,
    check(st) { return st.materials >= 1 && Game.departmentRoster("support").length > 0; },
    cast(st) {
      const builders = Game.departmentRoster("support");
      if (!builders.length) return null;
      const best = Math.max(...builders.map(m => Aptitude.of(m).material));
      return { actor: U.pick(builders.filter(m => Aptitude.of(m).material === best)).uid };
    },
    text(st, c) {
      return `建材置き場から、鉄をかじる音がする。${c.actor.name}が鉄アリの巣を見つけた。\n`
        + `すでに建材の角が丸い。アリの顎だけが四角く育っている。`;
    },
    options: [
      {
        label: "被害ごと焼き払う（建材2）",
        check(st) { return st.materials >= 2; },
        apply(st, c) {
          st.materials -= 2;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 5, 0, 100);
          return `巣と建材2をまとめて焼却した。${c.actor.name}の忠誠+5。\n`
            + `問題は消えた。資材も消えた。`;
        }
      },
      {
        label: "建築担当に巣を解体させる",
        apply(st, c) {
          const skilled = Aptitude.of(c.actor).material >= 4;
          const gain = skilled ? 3 : 1;
          st.materials += gain;
          c.actor.hp = Math.max(1, c.actor.hp - (skilled ? 1 : 4));
          c.actor.loyalty = U.clamp(c.actor.loyalty + (skilled ? 12 : 4), 0, 100);
          return `${c.actor.name}が巣を解体し、建材${gain}を回収した。最大HP-${skilled ? 1 : 4}、忠誠+${skilled ? 12 : 4}。\n`
            + (skilled ? `適材適所である。アリには不適だった。` : `回収量より噛み跡の方が多い。`);
        }
      },
      {
        label: "地上の鍛冶屋へ売る（建材1）",
        check(st) { return st.materials >= 1; },
        apply(st, c) {
          st.materials -= 1;
          st.gold += 4;
          c.actor.loyalty = U.clamp(c.actor.loyalty - 6, 0, 100);
          return `巣を建材1ごと売り払い、4Gを得た。${c.actor.name}の忠誠-6。\n`
            + `鍛冶屋は返品不可の札を見落とした。`;
        }
      }
    ]
  },

  // ── ここから14本は 2026-09-05 追加（作業表 E）。
  // すべて「得だが後で祟る」選択肢を1つ持ち、祟りは Game.oweDebt() で数戦後へ預ける。
  // 即座に効かせると「後で祟る」が成立せず、ただの割の悪い取引になる。

  {
    id: "paid_leave",
    title: "有休の申請",
    weight: 4,
    check(st) {
      return Game.departmentRoster("combat").some(m => (m.unpaidStreak || 0) === 0);
    },
    cast(st) {
      const pool = Game.departmentRoster("combat").filter(m => (m.unpaidStreak || 0) === 0);
      const actor = EV_PICK(pool, "goblin");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が控えめに手を挙げている。\n`
        + `「あの、有給消化で次の戦いは休みたいっす」\n`
        + `「危険手当も出ましたし、実家に顔を出したいっすね」`;
    },
    options: [
      {
        label: "有給を認める（12G）",
        check(st) { return st.gold >= 12; },
        apply(st, c) {
          st.gold -= 12;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 15, 0, 100);
          return `12Gの休暇手当を渡した。${c.actor.name}の忠誠+15。\n`
            + `荷物をまとめる速さだけは、軍で一番だった。`;
        }
      },
      {
        label: "手当は後払いだと言って出勤させる",
        apply(st, c) {
          Game.oweDebt({ kind: "loyalty_one", uid: c.actor.uid, amount: -30, battlesLeft: 3,
            text: `${c.actor.name}の後払いの手当` });
          Game.oweDebt({ kind: "unpaid_one", uid: c.actor.uid, amount: 1, battlesLeft: 3,
            text: "約束の手当が出ないまま" });
          return `${c.actor.name}は納得しないまま持ち場へ戻った。いま払うものは無い。\n`
            + `「うう……3戦したら、ちゃんとくださいっすよ……」`;
        }
      },
      {
        label: "却下する",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 20, 0, 100);
          return `申請書は却下印とともに返された。${c.actor.name}の忠誠-20。\n`
            + `魔界の有給消化率は、今年も0%である。`;
        }
      }
    ]
  },

  {
    id: "black_market",
    title: "人間の商人",
    weight: 3,
    check(st) { return st.gold >= 50 && Game.departmentRoster("support").length > 0; },
    cast(st) {
      const actor = EV_PICK(Game.departmentRoster("support"), "kobold");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が、目深にフードをかぶった人間を連れてきた。\n`
        + `「ワン！　……失礼。王国の闇商人が、建材を安く卸すと」\n`
        + `商人は帳面を叩いて笑った。「代わりに、城の図面をちょっとね」`;
    },
    options: [
      {
        label: "裏取引に応じる（30G）",
        check(st) { return st.gold >= 30; },
        apply(st, c) {
          st.gold -= 30;
          st.materials += 15;
          Game.oweDebt({ kind: "alert", amount: 2, battlesLeft: 2, text: "城の図面が王国へ渡り" });
          return `30Gで建材15を仕入れた。（備蓄 ${st.materials}）\n`
            + `商人は上機嫌で去った。図面の写しを、二部も抱えて。`;
        }
      },
      {
        label: "正規の価格で買い取る（50G）",
        check(st) { return st.gold >= 50; },
        apply(st) {
          st.gold -= 50;
          st.materials += 10;
          return `50Gを払い、後ろ暗いところのない建材10を得た。（備蓄 ${st.materials}）\n`
            + `商人は「魔王のくせに真面目ですね」と失礼な感想を残した。`;
        }
      },
      {
        label: "追い返す",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 3, 0, 100);
          return `商人は舌打ちをして帰った。${c.actor.name}の忠誠-3。\n`
            + `手柄になると思って連れてきた分、しっぽが下がっている。`;
        }
      }
    ]
  },

  {
    id: "weed_soup",
    title: "雑草のスープ",
    weight: 5,
    check(st) { return st.food < 3 && Game.departmentRoster("support").length > 0; },
    cast(st) {
      const actor = EV_PICK(Game.departmentRoster("support"), "slime");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が、ぐらぐら煮え立つ鍋を指している。\n`
        + `「どくそう、煮た。たべられる、たぶん」\n`
        + `鍋からは、見たことのない色の湯気が立っていた。`;
    },
    options: [
      {
        label: "配給して腹を満たさせる",
        apply(st, c) {
          st.food += 10;
          Game.oweDebt({ kind: "maxhp_all", amount: 8, battlesLeft: 1, text: "例のスープが効いてきて" });
          return `食料10を確保した。（備蓄 ${st.food}）\n`
            + `${c.actor.name}は満足そうに震えている。効き目が出るのは、たぶん明日だ。`;
        }
      },
      {
        label: "捨てさせる",
        apply(st, c) {
          for (const m of Game.departmentRoster("support")) m.loyalty = U.clamp(m.loyalty - 5, 0, 100);
          return `鍋は裏庭に空けられた。生活部門の忠誠-5。\n`
            + `「せっかく、だいたのに……」と${c.actor.name}が縮んだ。土が煙を上げている。`;
        }
      }
    ]
  },

  {
    id: "keepsake",
    title: "忘れた私物",
    weight: 3,
    check(st) { return (st.lastFallen || []).length > 0 && st.roster.length > 0; },
    cast(st) {
      const actor = EV_PICK(st.roster, "zombie");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      const gone = (st.lastFallen || [])[0];
      return `${c.actor.name}（${c.actor.race}）が、古ぼけた袋を大事そうに抱えている。\n`
        + `「ううぅ……${gone ? gone.name : "あいつ"}の遺品です（重いです）」\n`
        + `袋の口からは、使いこまれた道具と、貯めこんだ給料袋が覗いていた。`;
    },
    options: [
      {
        label: "売却して軍資金にする",
        apply(st) {
          st.gold += 40;
          Game.oweDebt({ kind: "loyalty_all", amount: -15, battlesLeft: 3,
            text: "遺品を売った話が広まり" });
          return `遺品は40Gに換わった。（所持金 ${st.gold}G）\n`
            + `帳簿には「雑収入」とだけ記された。誰も何も言わなかった。今は。`;
        }
      },
      {
        label: "遺族に送ってやる（10G）",
        check(st) { return st.gold >= 10; },
        apply(st, c) {
          st.gold -= 10;
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 10, 0, 100);
          return `送料10Gを払い、袋は遺族のもとへ送られた。全員の忠誠+10。\n`
            + `${c.actor.name}が深々と頭を下げた。「……感謝（します）」`;
        }
      }
    ]
  },

  {
    id: "rumor",
    title: "不穏な噂話",
    weight: 4,
    check(st) { return !st.laborDispute && st.roster.filter(m => m.loyalty < 65).length >= 2; },
    cast(st) {
      const actor = EV_PICK(st.roster.filter(m => m.loyalty < 65), "orc");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が、柱の影で腕を組んでいる。\n`
        + `「この魔王、本当に勝算はあるのか」\n`
        + `「手当も薄い。王国に降ったほうがマシかもしれん」`;
    },
    options: [
      {
        label: "特別手当を配る（40G）",
        check(st) { return st.gold >= 40; },
        apply(st) {
          st.gold -= 40;
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 15, 0, 100);
          return `40Gを袋に分けて配った。全員の忠誠+15。\n`
            + `噂は止んだ。金で買えるものだったので、また買い直す日が来る。`;
        }
      },
      {
        label: "見せしめに減給する",
        apply(st, c) {
          const cut = Math.min(10, Math.max(1, c.actor.salary));
          c.actor.salary = Math.max(0, c.actor.salary - cut);
          Game.oweDebt({ kind: "dispute", uid: c.actor.uid, battlesLeft: 2,
            text: `減給された${c.actor.name}が仲間を集め` });
          return `${c.actor.name}の給料を${cut}下げた。人件費はその分だけ軽くなる。\n`
            + `オークは何も言わずに去った。何も言わないほうが、たいてい怖い。`;
        }
      }
    ]
  },

  {
    id: "kitchen_blaze",
    title: "厨房の大暴走",
    weight: 3,
    check(st) { return st.activeFacilityId === "grand_kitchen" && (st.facilityLevel || 0) >= 1; },
    cast(st) {
      const actor = EV_PICK(Game.departmentRoster("support").concat(st.roster), "ogre");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `巨大厨房から、猛烈な煙と火柱が上がっている。\n`
        + `「メシ、焦げた！　釜、爆発するぞ！」\n`
        + `${c.actor.name}（${c.actor.race}）が煤だらけで鍋つかみを振り回していた。`;
    },
    options: [
      {
        label: "建材を投じて緊急補修する（建材10）",
        check(st) { return st.materials >= 10; },
        apply(st) {
          st.materials -= 10;
          return `建材10で釜を締め直した。（備蓄 ${st.materials}）\n`
            + `厨房は無事。焦げた匂いだけが三日ほど残った。`;
        }
      },
      {
        label: "そのまま稼働を続けさせる",
        apply(st) {
          st.food += 20;
          Game.oweDebt({ kind: "facilityLevel", amount: -1, battlesLeft: 1,
            text: "釜の亀裂が広がり" });
          return `火を落とさずに炊き切った。食料20を確保。（備蓄 ${st.food}）\n`
            + `釜の腹に、指が入るほどの亀裂が走っている。まだ持つ。たぶん一戦は。`;
        }
      }
    ]
  },

  {
    id: "transfer_demand",
    title: "配属換えの直訴",
    weight: 4,
    check(st) { return Game.departmentRoster("support").length >= 2; },
    cast(st) {
      const actor = EV_PICK(Game.departmentRoster("support"), "imp");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）がニヤニヤしながら飛んできた。\n`
        + `「ヒヒッ！　土掘りはもう飽きたよ！」\n`
        + `「前線に出してくれなきゃ、現場をちょっと荒らしちゃうぞ」`;
    },
    options: [
      {
        label: "戦闘部門へ配属換えする",
        apply(st, c) {
          c.actor.department = "combat";
          c.actor.loyalty = U.clamp(c.actor.loyalty + 10, 0, 100);
          return `${c.actor.name}を戦闘部門へ移した。忠誠+10。\n`
            + `建材が減る分、前線の嫌がらせは増える。`;
        }
      },
      {
        label: "ボーナスで引き留める（20G）",
        check(st) { return st.gold >= 20; },
        apply(st, c) {
          st.gold -= 20;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 5, 0, 100);
          return `20Gを握らせた。${c.actor.name}の忠誠+5。\n`
            + `小銭を数えながら、ぶつぶつ言いつつ資材置き場へ戻っていった。`;
        }
      },
      {
        label: "無視して作業を続けさせる",
        apply(st, c) {
          st.materials += 10;
          Game.oweDebt({ kind: "materials", amount: -15, battlesLeft: 2,
            text: `${c.actor.name}が資材置き場で「ちょっと」やって` });
          return `直訴は握りつぶした。今期の建材は10増えた。（備蓄 ${st.materials}）\n`
            + `インプは笑顔で戻っていった。笑顔で戻るときが、いちばん良くない。`;
        }
      }
    ]
  },

  {
    id: "surrender_letter",
    title: "降伏勧告状",
    weight: 3,
    check(st) { return (st.alert || 0) >= 5 && st.roster.length > 0; },
    cast(st) {
      const actor = EV_PICK(st.roster, "skeleton");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `モルモが青い顔で封筒を持ってきた。「魔王様、王国から降伏勧告デス」\n`
        + `${c.actor.name}（${c.actor.race}）が中身をあらためる。\n`
        + `「カタカタ……『今なら命だけは助ける』と。あと、贈答品が添えてあります」`;
    },
    options: [
      {
        label: "贈答品だけ奪って破り捨てる",
        apply(st) {
          st.food += 15;
          st.gold += 20;
          Game.oweDebt({ kind: "alert", amount: 3, battlesLeft: 2,
            text: "使者が半泣きで帰ったせいで" });
          return `勧告状は暖炉へ、贈答品は食堂へ。食料+15、20G。（備蓄 ${st.food}／${st.gold}G）\n`
            + `高級肉は大変おいしくいただいた。使者は手ぶらで帰された。`;
        }
      },
      {
        label: "正式に拒絶の返書を送る",
        apply(st) {
          st.alert = Math.max(0, st.alert + 1);
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 5, 0, 100);
          return `礼を尽くした断りの手紙を送った。王国警戒度+1（現在 ${st.alert}）、全員の忠誠+5。\n`
            + `「うちの魔王、字がうまい」——士気が上がる理由はいつも小さい。`;
        }
      }
    ]
  },

  {
    id: "feast_hangover",
    title: "宴の翌日",
    weight: 4,
    check(st) { return !!st.feastPending && st.roster.length > 0; },
    cast(st) {
      const actor = EV_PICK(st.roster, "skeleton");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が頭を抱えて揺れている。\n`
        + `「カタカタ……飲みすぎました……」\n`
        + `「関節がどれも他人の物のようで、立てません……」`;
    },
    options: [
      {
        label: "薬湯を買って与える（15G）",
        check(st) { return st.gold >= 15; },
        apply(st, c) {
          st.gold -= 15;
          const heal = Math.max(1, Math.round(c.actor.hp * 0.05));
          c.actor.hp += heal;
          return `15Gの薬湯を飲ませた。${c.actor.name}の最大HP+${heal}。\n`
            + `骨にしみたらしい。「……生前より効きます」`;
        }
      },
      {
        label: "酔い覚ましにしごく",
        apply(st, c) {
          Game.oweDebt({ kind: "maxhp_one", uid: c.actor.uid, amount: 20, battlesLeft: 1,
            text: `無理に動かした${c.actor.name}の関節が` });
          return `${c.actor.name}を叩き起こして走らせた。金はかからない。\n`
            + `「カタカタ、カタ……ご容赦を……」乾いた音が、どこか外れて聞こえる。`;
        }
      }
    ]
  },

  {
    id: "soul_advance",
    title: "禁断の契約",
    weight: 3,
    check(st) {
      return st.activeFacilityId === "graveyard" && st.roster.some(m => m.tplId === "necromancer");
    },
    cast(st) {
      const actor = EV_PICK(st.roster.filter(m => m.tplId === "necromancer"), "necromancer");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が、儀式陣の前で穏やかに微笑んでいる。\n`
        + `「墓地の霊力を前借りすれば、いますぐ資金に換えられます」\n`
        + `「死者は文句を言いません。……しばらくは」`;
    },
    options: [
      {
        label: "霊力の前借りを許可する",
        apply(st, c) {
          st.gold += 55;
          Game.oweDebt({ kind: "facilityLevel", amount: -1, battlesLeft: 3,
            text: "前借りした霊力の穴が空いて" });
          Game.oweDebt({ kind: "loyalty_all", amount: -10, battlesLeft: 3,
            text: "夜ごとの悲鳴で誰も眠れず" });
          return `陣から金貨が湧いた。55G。（所持金 ${st.gold}G）\n`
            + `${c.actor.name}が几帳面に帳面をつけている。返済期限の欄がある。`;
        }
      },
      {
        label: "儀式をやめさせる",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty + 5, 0, 100);
          return `陣は消された。${c.actor.name}の忠誠+5。\n`
            + `「ふむ、賢明です。前借りは、労務管理でいちばん揉めますので」`;
        }
      }
    ]
  },

  {
    id: "resignation",
    title: "退職の相談",
    weight: 3,
    check(st) { return st.roster.length >= 3 && st.roster.some(m => m.loyalty < 65); },
    cast(st) {
      const actor = EV_PICK(st.roster.filter(m => m.loyalty < 65), "mage");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が、折り目のついた紙を差し出した。\n`
        + `「前職をクビになって以来、ここで働いてきましたが」\n`
        + `「そろそろ田舎へ帰って、研究に専念したいのです」`;
    },
    options: [
      {
        label: "退職金を払って見送る（40G）",
        check(st) { return st.gold >= 40; },
        apply(st, c) {
          st.gold -= 40;
          st.roster = st.roster.filter(m => m.uid !== c.actor.uid);
          st.activeUids = st.activeUids.filter(uid => uid !== c.actor.uid);
          return `退職金40Gを渡した。${c.actor.name}は軍を去った。（所持金 ${st.gold}G）\n`
            + `別れ際、researchのメモを一枚だけ置いていった。読めない字だった。`;
        }
      },
      {
        label: "給与を増額して引き留める",
        apply(st, c) {
          c.actor.salary += 10;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 30, 0, 100);
          return `${c.actor.name}の給料を+10した。忠誠+30。\n`
            + `「それだけの研究費が出るなら、残りましょう」——退職願は灰皿へ。`;
        }
      },
      {
        label: "退職金は出せないと突っぱねる",
        apply(st, c) {
          Game.oweDebt({ kind: "desert", uid: c.actor.uid, amount: -20, battlesLeft: 2,
            text: `${c.actor.name}が夜のうちに` });
          return `退職願は突き返された。いま出ていく金は一枚もない。\n`
            + `${c.actor.name}は苦い顔で紙を畳んだ。畳み方が、やけに丁寧だった。`;
        }
      }
    ]
  },

  {
    id: "veteran_rookie",
    title: "古参と新入り",
    weight: 4,
    check(st) { return st.roster.length >= 5; },
    cast(st) {
      if (st.roster.length < 2) return null;
      const sorted = st.roster.slice().sort((a, b) => Game.power(b) - Game.power(a));
      const actor = sorted[0], other = sorted[sorted.length - 1];
      if (!actor || !other || actor.uid === other.uid) return null;
      return { actor: actor.uid, other: other.uid };
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が ${c.other.name}（${c.other.race}）を睨みつけている。\n`
        + `「おい新入り、おれの取り分を勝手に食ったな」\n`
        + `${c.other.name}「たべた。みんなの、おなじ、だとおもった」`;
    },
    options: [
      {
        label: "古参に特別手当を出す（15G）",
        check(st) { return st.gold >= 15; },
        apply(st, c) {
          st.gold -= 15;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 5, 0, 100);
          return `15Gで手を打った。${c.actor.name}の忠誠+5。\n`
            + `古参は黙った。新入りは、まだ何が起きたか分かっていない。`;
        }
      },
      {
        label: "新入りを叱って古参の取り分を増やす",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty + 10, 0, 100);
          c.other.loyalty = U.clamp(c.other.loyalty - 20, 0, 100);
          Game.oweDebt({ kind: "loyalty_dept", dept: "support", amount: -15, battlesLeft: 3,
            text: "新入りいびりの噂が厨房まで届き" });
          return `${c.actor.name}の忠誠+10、${c.other.name}の忠誠-20。金はかからない。\n`
            + `新入りは縮こまった。それを見ていた者が、食堂に何人かいた。`;
        }
      }
    ]
  },

  {
    id: "ledger_fraud",
    title: "帳簿の不正",
    weight: 3,
    check(st) { return st.activeFacilityId === "extortion_ledger" && st.roster.length > 0; },
    cast(st) {
      const actor = EV_PICK(st.roster.filter(m => (m.job || "").includes("会計")).length
        ? st.roster.filter(m => (m.job || "").includes("会計")) : st.roster, "imp");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `モルモが帳簿を叩いている。「魔王様、取り立て額が合いませんデス！」\n`
        + `${c.actor.name}（${c.actor.race}）が横から覗き込み、口笛を吹いた。\n`
        + `「ヒヒッ、誰かが数字をいじって、差額をこっちに回してるね」`;
    },
    options: [
      {
        label: "裏金をそのまま軍資金に組み込む",
        apply(st) {
          st.gold += 40;
          Game.oweDebt({ kind: "facilityLevel", amount: -1, battlesLeft: 2,
            text: "不正が露見して取り立て網が破れ" });
          return `差額40Gを金庫へ入れた。（所持金 ${st.gold}G）\n`
            + `モルモが「これ、計算し直さなくていいんデスか」と三度たずねた。`;
        }
      },
      {
        label: "厳密に調査して正す（10G）",
        check(st) { return st.gold >= 10; },
        apply(st) {
          st.gold -= 10;
          st.facilityLevel = (st.facilityLevel || 0) + 1;
          return `調査費10Gを投じ、帳簿を締め直した。施設Lv.${st.facilityLevel}。\n`
            + `恐喝は、信用商売である。`;
        }
      }
    ]
  },

  {
    id: "tapestry",
    title: "魔王様の織物",
    weight: 4,
    check(st) { return st.gold >= 30 && Game.departmentRoster("support").length > 0; },
    cast(st) {
      const actor = EV_PICK(Game.departmentRoster("support"), "goblin");
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が、巨大な布をばさりと広げた。\n`
        + `「魔王様の特大タペストリー、作ったっす！」\n`
        + `「広場に飾れば士気は爆上がりっすよ。買い取ってほしいっす！」`;
    },
    options: [
      {
        label: "買い取って広場に飾る（30G）",
        check(st) { return st.gold >= 30; },
        apply(st) {
          st.gold -= 30;
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 10, 0, 100);
          return `30Gで買い上げ、広場に掲げた。全員の忠誠+10。\n`
            + `顔は似ていない。だが、でかい。魔界ではそれが正義である。`;
        }
      },
      {
        label: "切り売りして材料費を回収する",
        apply(st) {
          st.gold += 20;
          Game.oweDebt({ kind: "loyalty_dept", dept: "support", amount: -15, battlesLeft: 3,
            text: "織物を切り売りされた件が尾を引き" });
          return `布は端から売られ、20Gになった。（所持金 ${st.gold}G）\n`
            + `作業場の壁に、下絵だけが貼られたまま残っている。`;
        }
      },
      {
        label: "飾るのを断る",
        apply(st, c) {
          c.actor.loyalty = U.clamp(c.actor.loyalty - 5, 0, 100);
          return `丁重に断った。${c.actor.name}の忠誠-5。\n`
            + `巨大な布は、たたまれて資材置き場のいちばん下になった。`;
        }
      }
    ]
  },

  // ── 残業の請求書（連鎖ビルドの出口） ───────────────────
  // 深い連鎖は戦闘中に「残業」として積み上がる（Game.applyOvertime）。
  // ここはその数字が軍団の外へ漏れ出す場所。連鎖で壊すほど、盤外が荒れる。
  {
    id: "labor_inspection",
    title: "労基署の抜き打ち",
    weight: 22,
    // 軍団全体の残業が一定を超えると来る。一度対応すれば累計はリセットされる
    check(st) { return (st.overtimeTotal || 0) >= 12 && st.roster.length > 0; },
    cast(st) {
      const actor = st.roster.slice()
        .sort((a, b) => (b.overtimeHours || 0) - (a.overtimeHours || 0))[0];
      return actor ? { actor: actor.uid } : null;
    },
    text(st, c) {
      const fine = Math.min(24, Math.ceil((st.overtimeTotal || 0) / 2));
      return `魔界労働基準監督署のインプが、判子とバインダーを持って玉座の間に立っている。
`
        + `「通報がありました。累計残業 ${st.overtimeTotal}時間。とくに ${c.actor.name}さん、`
        + `${c.actor.overtimeHours || 0}時間。これ、連鎖のたびに働かせてますよね？」
`
        + `是正勧告書の下書きには、すでに罰金 ${fine}G と書いてある。`
        + (st.laborRecordFalsified ? `\n前回の書き換えの控えも、同じバインダーに挟まっている。罰金は倍額だ。` : "");
    },
    options: [
      {
        label: "罰金を払って是正する",
        check(st) { return st.gold >= Game.laborFine(); },
        apply(st) {
          const fine = Game.laborFine();
          st.gold -= fine;
          st.overtimeTotal = 0;
          st.laborRecordFalsified = false;
          for (const m of st.roster) {
            m.overtimeHours = 0;
            m.loyalty = U.clamp(m.loyalty + 12, 0, 100);
          }
          return `罰金${fine}Gを支払い、勤務表を作り直した。累計残業はリセット。全員の忠誠+12。
`
            + `インプは「次は倍です」と言い残した。倍の根拠は示されなかった。`;
        }
      },
      {
        label: "帳簿を書き換える（会計職が必要）",
        check(st) { return st.roster.some(m => (m.job || "").includes("会計")); },
        apply(st, c) {
          st.overtimeTotal = 0;
          for (const m of st.roster) m.overtimeHours = 0;
          st.laborRecordFalsified = true;
          c.actor.loyalty = U.clamp(c.actor.loyalty - 8, 0, 100);
          return `会計係が一晩で勤務表を書き直した。累計残業は「0時間」になった。
`
            + `${c.actor.name}は自分が働いていないことになった書類を読み、忠誠-8。
`
            + `罰金はない。書類の控えはインプ側にもある。`;
        }
      },
      {
        label: "監督官を引き抜いて労務顧問にする（8G）",
        check(st) { return st.gold >= 8 && !st.laborAdvisor; },
        apply(st) {
          st.gold -= 8;
          st.overtimeTotal = 0;
          st.laborAdvisor = true;
          for (const m of st.roster) m.overtimeHours = 0;
          return `8Gを提示したところ、インプは判子をしまって「有給、あります？」と聞いた。
`
            + `**労務顧問を雇い入れた。以後、残業による忠誠低下は半分になる。**
`
            + `ただし残業した戦いごとに顧問料${Game.LABOR_ADVISOR_FEE}Gが要る。払えなければ帰る。`;
        }
      },
      {
        label: "魔王の権威で追い返す",
        apply(st) {
          st.overtimeTotal = Math.floor((st.overtimeTotal || 0) / 2);
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty - 10, 0, 100);
          return `「ここは魔界だ」と言ったら、インプは「魔界の法です」と言った。それでも追い返した。
`
            + `全員の忠誠-10。累計残業は半分だけ揉み消せた。
`
            + `軍団は、自分たちの側に法がついていたことを知ってしまった。`;
        }
      }
    ]
  },

  {
    id: "karoshi",
    title: "働きすぎた者",
    weight: 38,
    // 個人の残業が積みすぎたとき。連鎖で毎回同じ隊を回しているほど早く来る
    check(st) { return st.roster.some(m => (m.overtimeHours || 0) >= 15); },
    cast(st) {
      const pool = st.roster.filter(m => (m.overtimeHours || 0) >= 15);
      if (!pool.length) return null;
      return { actor: pool.sort((a, b) => (b.overtimeHours || 0) - (a.overtimeHours || 0))[0].uid };
    },
    text(st, c) {
      return `${c.actor.name}（${c.actor.race}）が、朝の点呼で立ったまま動かなくなった。
`
        + `累計残業 ${c.actor.overtimeHours}時間。倒れる直前まで、次の連鎖の順番を数えていたという。
`
        + `モルモが小さな声で「これ、たぶん、いちばんまずいやつです」と言った。`;
    },
    options: [
      {
        label: "手厚く弔う（5G）",
        check(st) { return st.gold >= 5; },
        apply(st, c) {
          st.gold -= 5;
          const name = c.actor.name;
          st.roster = st.roster.filter(m => m.uid !== c.actor.uid);
          st.activeUids = st.activeUids.filter(uid => uid !== c.actor.uid);
          st.pendingVacancies = (st.pendingVacancies || 0) + 1;
          st.fallenTotal = (st.fallenTotal || 0) + 1;
          st.lastFallen = [{ name, race: c.actor.race }];
          st.fallenRoll = (st.fallenRoll || []).concat(st.lastFallen);
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty + 14, 0, 100);
          return `5Gで葬儀を出した。${name}は軍を去った。残った全員の忠誠+14。
`
            + `魔王が最後まで立ち会ったことは、翌日には全部門へ伝わっていた。`;
        }
      },
      {
        label: "労災として処理する（保険金6G）",
        apply(st, c) {
          st.gold += 6;
          const name = c.actor.name;
          st.roster = st.roster.filter(m => m.uid !== c.actor.uid);
          st.activeUids = st.activeUids.filter(uid => uid !== c.actor.uid);
          st.pendingVacancies = (st.pendingVacancies || 0) + 1;
          st.fallenTotal = (st.fallenTotal || 0) + 1;
          st.lastFallen = [{ name, race: c.actor.race }];
          st.fallenRoll = (st.fallenRoll || []).concat(st.lastFallen);
          for (const m of st.roster) m.loyalty = U.clamp(m.loyalty - 12, 0, 100);
          return `「勤務中の事故」として申請し、保険金6Gが下りた。${name}は軍を去った。全員の忠誠-12。
`
            + `書類の「原因」の欄には、魔王直筆で「不運」と書かれている。`;
        }
      },
      {
        label: "叩き起こして休ませる（この者は次の戦いに出せない）",
        apply(st, c) {
          c.actor.overtimeHours = 0;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 25, 0, 100);
          c.actor.restingTurns = 1;
          Game.assignDepartment(c.actor.uid, "support");
          st.activeUids = st.activeUids.filter(uid => uid !== c.actor.uid);
          return `水をかけたら起きた。${c.actor.name}を生活部門へ回し、次の戦いは休ませる。
`
            + `本人の残業は0に戻り、忠誠+25。
`
            + `「休んでいいんすか」と三回聞かれた。`;
        }
      }
    ]
  },

  {
    id: "overtime_bragging",
    title: "残業自慢",
    weight: 14,
    check(st) {
      return st.roster.length >= 2 && st.roster.some(m => (m.overtimeHours || 0) >= 6);
    },
    cast(st) {
      const pool = st.roster.filter(m => (m.overtimeHours || 0) >= 6);
      if (!pool.length) return null;
      const a = pool.sort((x, y) => (y.overtimeHours || 0) - (x.overtimeHours || 0))[0];
      const b = U.pick(st.roster.filter(m => m.uid !== a.uid));
      return b ? { actor: a.uid, other: b.uid } : null;
    },
    text(st, c) {
      return `食堂で ${c.actor.name} が「先月${c.actor.overtimeHours}時間」と言い、`
        + `${c.other.name} が「それ自慢することっすか」と言い、
`
        + `${c.actor.name} が「自慢ですけど」と言った。空気が二つに割れている。`;
    },
    options: [
      {
        label: "表彰する（月間MVPの盾を作る・2G）",
        check(st) { return st.gold >= 2; },
        apply(st, c) {
          st.gold -= 2;
          c.actor.loyalty = U.clamp(c.actor.loyalty + 20, 0, 100);
          c.other.loyalty = U.clamp(c.other.loyalty - 10, 0, 100);
          return `2Gで盾を打たせ、${c.actor.name}を表彰した。本人の忠誠+20、${c.other.name}の忠誠-10。
`
            + `盾には「よく働いた」とだけ彫らせた。他に書くことがなかった。`;
        }
      },
      {
        label: "残業を減らすと宣言する",
        apply(st, c) {
          st.overtimeTotal = Math.max(0, (st.overtimeTotal || 0) - 6);
          for (const m of st.roster) {
            m.overtimeHours = Math.max(0, (m.overtimeHours || 0) - 6);
            m.loyalty = U.clamp(m.loyalty + 6, 0, 100);
          }
          return `魔王が「今後は残業を減らす」と宣言した。全員の残業記録-6時間、忠誠+6。
`
            + `${c.actor.name}だけが少し不満そうだった。減らす当てはない。`;
        }
      },
      {
        label: "二人とも黙らせる",
        apply(st, c) {
          for (const m of [c.actor, c.other]) m.loyalty = U.clamp(m.loyalty - 5, 0, 100);
          st.gold += 1;
          return `二人を持ち場へ戻した。両者の忠誠-5。
`
            + `食堂の回転が上がり、光熱費が1G浮いた。`;
        }
      }
    ]
  }
];
