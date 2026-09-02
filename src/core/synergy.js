// シナジー判定。units はロスターのモンスター（戦闘ユニットでも可）。
const Synergy = {
  // 発動中のシナジー定義一覧を返す
  active(units) {
    return SYNERGIES.filter(s => s.check(units));
  },
  // 戦闘ユニットに mods を適用する（merge 型は run.js が処理済みの前提）
  applyAll(units) {
    const act = this.active(units);
    for (const s of act) {
      if (s.type !== "merge") s.apply(units);
    }
    return act;
  },

  // ── 編成画面の予告 ─────────────────────────────
  // 「いま何倍か」「あと1体でどうなるか」を、シナジー定義を書き換えずに導出する。
  // 効果量は定義に書かせず**実際に apply して測る**。data 層に説明文を二重管理させると、
  // 効果を変えたときに表示だけ古いまま残る（そして誰も気づかない）。
  //
  // 使い捨てのユニット像を作って1つずつ適用し、結果の mods を読む。
  // 実際の戦闘には一切触らない。
  sandbox(units) {
    return (units || []).map(u => ({
      ...u,
      traits: (u.traits || []).slice(),
      tags: (u.tags || []).slice(),
      mods: { dmgMult: 1, takenMult: 1 }
    }));
  },

  // シナジー1つだけを適用したときの効き目
  measure(units, synergy) {
    const box = this.sandbox(units);
    if (!synergy.check(box)) return null;
    if (synergy.type !== "merge") synergy.apply(box);
    const dmg = box.reduce((max, u) => Math.max(max, u.mods.dmgMult), 1);
    const taken = box.reduce((min, u) => Math.min(min, u.mods.takenMult), 1);
    return {
      dmgMult: dmg,
      takenMult: taken,
      affected: box.filter(u => u.mods.dmgMult > 1 || u.mods.takenMult < 1).length
    };
  },

  // このシナジーが「数えている」味方。1体抜くと効き目が落ちる者がそれにあたる。
  countedMembers(units, synergy) {
    const base = this.measure(units, synergy);
    if (!base) return [];
    return (units || []).filter((_, i) => {
      const without = units.filter((__, j) => j !== i);
      const after = this.measure(without, synergy);
      return !after || after.dmgMult < base.dmgMult || after.takenMult > base.takenMult;
    });
  },

  // 発動中なら「いまの効き目」と「もう1体増やしたとき／1体入れ替えたときの効き目」、
  // 未発動なら「あと何体で発動するか」を返す。すべて実測。
  // slots は出撃枠（省略時は無制限）。枠が埋まっているなら「増やす」ではなく
  // 「入れ替える」を出す。埋まった編成に「あと1体」と言っても操作できない。
  preview(units, options) {
    const squad = units || [];
    const slots = (options && options.slots) || Infinity;
    return SYNERGIES.map(synergy => {
      const now = this.measure(squad, synergy);
      if (now) {
        const counted = this.countedMembers(squad, synergy);
        const sample = counted[0];
        let next = null, swapOut = null;
        if (sample && squad.length < slots) {
          const added = this.measure([...squad, { ...sample }], synergy);
          if (added && (added.dmgMult > now.dmgMult || added.takenMult < now.takenMult)) next = added;
        } else if (sample) {
          // 枠が埋まっている: 数えられていない者を1体、数えられている者へ替えてみる
          const countedIds = new Set(counted.map(u => u.uid));
          for (let i = 0; i < squad.length; i++) {
            if (countedIds.has(squad[i].uid)) continue;
            const trial = squad.map((u, j) => j === i ? { ...sample } : u);
            const after = this.measure(trial, synergy);
            if (after && (after.dmgMult > now.dmgMult || after.takenMult < now.takenMult)
              && (!next || after.dmgMult > next.dmgMult)) {
              next = after;
              swapOut = squad[i];
            }
          }
        }
        return {
          id: synergy.id, name: synergy.name, desc: synergy.desc, condition: synergy.condition,
          active: true, now, counted: counted.length, next,
          nextRace: next ? (sample && sample.race) || null : null,
          swapOutRace: swapOut ? swapOut.race : null,
          swapOutName: swapOut ? swapOut.name : null
        };
      }
      // 未発動: 手持ちの誰かを増やして届くなら、あと何体かを出す
      let need = null, by = null;
      for (const member of squad) {
        for (let add = 1; add <= 4; add++) {
          const trial = [...squad, ...Array.from({ length: add }, () => ({ ...member }))];
          if (synergy.check(this.sandbox(trial))) {
            if (need === null || add < need) { need = add; by = member; }
            break;
          }
        }
      }
      return {
        id: synergy.id, name: synergy.name, desc: synergy.desc, condition: synergy.condition,
        active: false, now: null, counted: 0, next: null,
        need, needRace: by ? by.race : null
      };
    });
  }
};
