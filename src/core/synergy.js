// シナジー判定。units はロスターのモンスター（戦闘ユニットでも可）。
//
// ctx（発火の文脈）を第2引数で渡せる。狙いは「出撃5枠の奪い合い」を解くこと。
// 枠でしか数えられないと、ゴブリン3体と魔法職3体は永久に同時発動しない。
// ctx.pool（＝軍団全体）で数え、効果は出撃した者だけに乗せることで、
// 部門へ回した者も発火条件に参加できる。
//
// ctx を渡さない呼び出しでは pool は units になるので、従来どおり出撃隊だけで判定する。
const Synergy = {
  // 数える母集団。定義側は units（効果対象）と pool（発火条件）を使い分ける。
  pool(units, ctx) {
    return (ctx && Array.isArray(ctx.pool) && ctx.pool.length) ? ctx.pool : (units || []);
  },

  // 発動中のシナジー定義一覧を返す。
  // meta 型は「他のシナジーが何個発動しているか」を見るので、通常型を数えた後に判定する。
  active(units, ctx) {
    const base = { ...(ctx || {}) };
    base.pool = this.pool(units, ctx);
    const plain = SYNERGIES.filter(s => !s.meta && s.check(units, base));
    // grant 型（特性を貸すだけ）は meta の段数に数えない。接続は増やすが倍率の段は増やさない
    const counted = plain.filter(s => !s.grant);
    const metaCtx = { ...base, activeIds: counted.map(s => s.id), activeCount: counted.length };
    const metas = SYNERGIES.filter(s => s.meta && s.check(units, metaCtx));
    return plain.concat(metas);
  },

  // 戦闘ユニットに mods を適用する（merge 型は run.js が処理済みの前提）。
  // meta 型は通常型のあとに適用する。掛け算の2段目がここで乗る。
  applyAll(units, ctx) {
    const base = { ...(ctx || {}) };
    base.pool = this.pool(units, ctx);
    const act = this.active(units, base);
    const plain = act.filter(s => !s.meta && !s.grant);
    const applyCtx = { ...base, activeIds: plain.map(s => s.id), activeCount: plain.length };
    for (const s of act) {
      if (s.type !== "merge") s.apply(units, applyCtx);
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
      // ロスターのモンスターは alive を持たない（戦闘ユニットだけが持つ）。
      // 編成の予告では全員が生きている前提で測る。これが無いと《群れの本能》のように
      // 「生存中の味方」を数える特性が常に0になる
      alive: u.alive !== false,
      traits: (u.traits || []).slice(),
      tags: (u.tags || []).slice(),
      mods: { dmgMult: 1, takenMult: 1 }
    }));
  },

  // シナジー1つだけを適用したときの効き目
  measure(units, synergy, ctx) {
    const box = this.sandbox(units);
    // 予告も本番と同じ文脈で測る。ここが食い違うと編成画面だけ嘘をつく。
    const base = { ...(ctx || {}) };
    base.pool = (ctx && Array.isArray(ctx.pool)) ? this.sandbox(ctx.pool) : box;
    if (synergy.meta) {
      const plain = SYNERGIES.filter(s => !s.meta && !s.grant && s.check(box, base));
      base.activeIds = plain.map(s => s.id);
      base.activeCount = plain.length;
    }
    if (!synergy.check(box, base)) return null;
    if (synergy.type !== "merge") synergy.apply(box, base);
    const dmg = box.reduce((max, u) => Math.max(max, u.mods.dmgMult), 1);
    const taken = box.reduce((min, u) => Math.min(min, u.mods.takenMult), 1);
    return {
      dmgMult: dmg,
      takenMult: taken,
      affected: box.filter(u => u.mods.dmgMult > 1 || u.mods.takenMult < 1).length
    };
  },

  // このシナジーが「数えている」味方。1体抜くと効き目が落ちる者がそれにあたる。
  countedMembers(units, synergy, ctx) {
    const base = this.measure(units, synergy, ctx);
    if (!base) return [];
    return (units || []).filter((_, i) => {
      const without = units.filter((__, j) => j !== i);
      const after = this.measure(without, synergy, ctx);
      return !after || after.dmgMult < base.dmgMult || after.takenMult > base.takenMult;
    });
  },

  // 編成だけで決まる特性の効き目（《群れの本能》《忠犬》《血の気》など）を測る。
  // シナジーと同じく、説明文からではなく **実際に modDealt を呼んで** 倍率を読む。
  // 敵の状態やラウンドで変わるもの（卑怯者・先制・怪力）は、中立な状況を渡すことで
  // 自然に外れる。編成画面で見せたいのは「今この並びだから効いている」ぶんだけ。
  traitEffects(units) {
    const squad = this.sandbox(units);
    const effects = [];
    for (const attacker of squad) {
      let mult = 1;
      const names = [];
      for (const id of attacker.traits || []) {
        const trait = typeof TRAITS !== "undefined" ? TRAITS[id] : null;
        if (!trait || !trait.modDealt) continue;
        const ctx = {
          attacker, allies: squad, enemies: [],
          target: { hp: 100, maxHp: 100, alive: true, race: "", traits: [], tags: [] },
          round: 2, mult: 1, notes: [], rng: () => 0.5
        };
        try { trait.modDealt(ctx); } catch (e) { continue; }   // 状況を必要とする特性は測らない
        if (ctx.mult > 1) {
          mult *= ctx.mult;
          names.push({ id, name: trait.name, mult: ctx.mult, note: ctx.notes[ctx.notes.length - 1] || trait.name });
        }
      }
      if (names.length) effects.push({ uid: attacker.uid, name: attacker.name, race: attacker.race, mult, traits: names });
    }
    return effects;
  },

  // 採用画面の「この人材を今の軍団へ入れたら何が起きるか」。
  // links は戦闘計算ではなく公開情報の接続語彙であり、効果量を二重管理しない。
  // 応募者が作る事件を既存人材が受ける経路と、その逆だけを短く返す。
  connections(candidate, roster, facilities, options) {
    options = options || {};
    const activeIds = new Set(options.activeUids || []);
    const rosterByUid = new Map((roster || []).map(unit => [unit.uid, unit]));
    // 本番の activeRoster() と同じく、ロスター配列ではなく activeUids の順で組む。
    // 料理人選択と食欲同値時の対象はこの順序で決まる。
    const active = (options.activeUids || []).map(uid => rosterByUid.get(uid)).filter(Boolean);
    const maxDeploy = Number(options.maxDeploy) || Infinity;
    const legalDeployments = active.length < maxDeploy
      ? [{ units: active.concat(candidate), swapOut: null }]
      : active.map((swapOut, index) => ({
          units: active.map((unit, i) => i === index ? candidate : unit), swapOut
        }));
    const traitsOf = unit => (unit && unit.traits || []).map(id => ({ id, trait: TRAITS[id] }))
      .filter(entry => entry.trait && entry.trait.links);
    const candidateTraits = traitsOf(candidate);
    const armyTraits = (roster || []).flatMap(unit => traitsOf(unit).map(entry => ({ ...entry, unit, type: "unit" })));
    for (const facility of facilities || []) {
      if (facility && facility.links) armyTraits.push({ id: facility.id, trait: facility, unit: { name: facility.name }, type: "facility" });
    }
    const rows = [];
    const seen = new Set();
    const placementNeeds = entries => {
      const needs = ["採用"];
      const units = entries.filter(entry => entry.type !== "facility");
      if (units.some(entry => entry.candidate) || units.some(entry => !activeIds.has(entry.unit.uid))) {
        needs.push("出撃");
        if (active.length >= maxDeploy) needs.push("入れ替え");
      }
      return needs;
    };
    const add = (origin, signal, responder, extraNeeds) => {
      const requiredExisting = [origin, responder]
        .filter(entry => entry.type !== "facility" && !entry.candidate)
        .map(entry => entry.unit.uid);
      if (requiredExisting.length && !legalDeployments.some(deployment =>
        requiredExisting.every(uid => deployment.units.some(unit => unit.uid === uid)))) return;
      const key = `${origin.id}|${signal}|${responder.id}|${origin.unit.name}|${responder.unit.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      const facilityNeeds = [];
      for (const entry of [origin, responder]) {
        if (entry.type === "facility") facilityNeeds.push(...((options.facilityNeeds || {})[entry.id] || []));
      }
      const needs = placementNeeds([origin, responder]).concat(facilityNeeds, extraNeeds || []);
      const uniqueNeeds = [...new Set(needs)];
      rows.push({
        origin: { type: origin.type || "unit", name: origin.unit.name, ability: origin.trait.name },
        responder: { type: responder.type || "unit", name: responder.unit.name, ability: responder.trait.name },
        signal, needs: uniqueNeeds,
        readyRank: uniqueNeeds.some(need => !["採用", "出撃"].includes(need)) ? 2 : uniqueNeeds.includes("出撃") ? 1 : 0,
        sortKey: key
      });
    };
    for (const source of candidateTraits) {
      for (const signal of source.trait.links.emits || []) {
        for (const receiver of armyTraits) {
          if ((receiver.trait.links.reacts || []).includes(signal)) {
            add({ ...source, unit: candidate, type: "unit", candidate: true }, signal, receiver,
              signal === "食料消費" && !options.foodAvailable ? ["食料が必要"] : []);
          }
        }
      }
    }
    for (const source of armyTraits) {
      for (const signal of source.trait.links.emits || []) {
        for (const receiver of candidateTraits) {
          if ((receiver.trait.links.reacts || []).includes(signal)) {
            add(source, signal, { ...receiver, unit: candidate, type: "unit", candidate: true },
              signal === "食料消費" && !options.foodAvailable ? ["食料が必要"] : []);
          }
        }
      }
    }

    // 食事系は links の語彙一致だけでは「誰が食べるか」を決められない。
    // 本番と同じく出撃順の最初の料理人、食欲最大（同値なら出撃順先頭）を選ぶ。
    // 応募者が起点にも対象にもならず、採用前後で変わらない既存接続は候補にしない。
    const appetite = unit => Number((options.appetiteByUid || {})[unit.uid]) || 0;
    const hasFood = units => typeof options.foodAvailableFor === "function"
      ? !!options.foodAvailableFor(units) : !!options.foodAvailable;
    const mealOf = units => {
      if (!hasFood(units)) return null;
      const cook = units.find(unit => (unit.traits || []).includes("demon_cook")) || null;
      if (!cook) return null;
      const target = units.slice().sort((a, b) => appetite(b) - appetite(a))[0] || null;
      return target ? { cook, target } : null;
    };
    const mealTrials = legalDeployments.map(deployment => ({ ...deployment, meal: mealOf(deployment.units) }));
    const involved = mealTrials.filter(trial => trial.meal
      && (trial.meal.cook.uid === candidate.uid || trial.meal.target.uid === candidate.uid));
    if (involved.length) {
      const signatures = new Set(involved.map(trial => `${trial.meal.cook.uid}|${trial.meal.target.uid}`));
      const everyLegalChoiceInvolvesApplicant = involved.length === mealTrials.length;
      if (signatures.size === 1 && everyLegalChoiceInvolvesApplicant) {
        const { cook, target } = involved[0].meal;
        const cookTrait = traitsOf(cook).find(entry => entry.id === "demon_cook");
        const targetTrait = traitsOf(target).find(entry => entry.id === "big_eater")
          || { id: "meal_target", trait: { name: "食事強化" } };
        add({ ...cookTrait, unit: cook, type: "unit", candidate: cook.uid === candidate.uid }, "食事強化", {
          ...targetTrait, unit: target, type: "unit", candidate: target.uid === candidate.uid
        });
      } else {
        const key = `meal-uncertain|${candidate.uid || candidate.tplId || candidate.name}`;
        rows.push({
          origin: { type: "unit", name: candidate.name, ability: "食事接続候補" },
          responder: { type: "pending", name: "対象未確定", ability: "料理人・食欲最大対象" },
          signal: "入れ替え相手と出撃順で変化",
          needs: ["採用", "出撃", "入れ替え相手と配置を確定"], readyRank: 2, sortKey: key
        });
      }
    }

    // 種族・人数条件は links に現れない。実際の check を、現在編成と採用後の編成へ適用し、
    // 応募者によって初めて成立するものだけを候補にする。説明文の文字列から推測しない。
    const poolNow = roster || [];
    const poolAfter = poolNow.concat(candidate);
    for (const synergy of SYNERGIES.filter(s => !s.meta)) {
      const now = synergy.check(this.sandbox(active), { pool: this.sandbox(poolNow) });
      const byHire = synergy.check(this.sandbox(active), { pool: this.sandbox(poolAfter) });
      const legalMatches = legalDeployments.filter(deployment =>
        synergy.check(this.sandbox(deployment.units), { pool: this.sandbox(poolAfter) }));
      const byDeploy = legalMatches.length > 0;
      if (now || (!byHire && !byDeploy)) continue;
      const needs = ["採用"];
      if (!byHire) {
        needs.push("出撃");
        if (active.length >= maxDeploy) {
          const matchesEverySwap = legalMatches.length === legalDeployments.length;
          needs.push(matchesEverySwap ? "入れ替え" : "条件を保てる相手と入れ替え");
        }
      }
      const key = `synergy|${synergy.id}|${candidate.uid || candidate.tplId || candidate.name}`;
      rows.push({
        origin: { type: "unit", name: candidate.name, ability: candidate.race },
        responder: { type: "synergy", name: `《${synergy.name}》`, ability: synergy.desc },
        signal: synergy.condition, needs, readyRank: byHire ? 0 : (needs.includes("入れ替え") ? 2 : 1), sortKey: key
      });
    }

    return rows.sort((a, b) => a.readyRank - b.readyRank || a.sortKey.localeCompare(b.sortKey));
  },

  // 発動中なら「いまの効き目」と「もう1体増やしたとき／1体入れ替えたときの効き目」、
  // 未発動なら「あと何体で発動するか」を返す。すべて実測。
  // slots は出撃枠（省略時は無制限）。枠が埋まっているなら「増やす」ではなく
  // 「入れ替える」を出す。埋まった編成に「あと1体」と言っても操作できない。
  preview(units, options) {
    const squad = units || [];
    const slots = (options && options.slots) || Infinity;
    // 軍団全体を渡された場合だけ、枠の外を数えるシナジーが本番と同じ答えを出す。
    const basePool = (options && Array.isArray(options.pool)) ? options.pool : null;
    const ctx = basePool ? { pool: basePool } : null;
    // 「あと1体」を試すときは軍団側にも足す。発火条件が軍団全体を数えるようになったので、
    // 出撃隊にだけ足しても条件は動かず、案内が永久に出なくなる。
    const withMore = extra => basePool ? { pool: [...basePool, ...extra] } : null;
    return SYNERGIES.map(synergy => {
      const now = this.measure(squad, synergy, ctx);
      if (now) {
        const counted = this.countedMembers(squad, synergy, ctx);
        // 数えているのが軍団側なら、出撃隊から抜いても効き目は落ちない。
        // その場合 countedMembers は空になるので、軍団側から見本を取る。
        const sample = counted[0]
          || (basePool || []).find(u => {
            const without = (basePool || []).filter(x => x.uid !== u.uid);
            const after = this.measure(squad, synergy, { pool: without });
            return !after || after.dmgMult < now.dmgMult || after.takenMult > now.takenMult;
          });
        let next = null, swapOut = null, viaRecruit = false;
        // まず「軍団に1体増やす」を試す。枠が埋まっていても採用で伸ばせるなら、
        // 出撃枠の入れ替えより先にそれを案内する（枠を空ける必要がないため）。
        if (sample) {
          const grown = this.measure([...squad], synergy, withMore([{ ...sample }]));
          if (grown && (grown.dmgMult > now.dmgMult || grown.takenMult < now.takenMult)) {
            next = grown;
            viaRecruit = true;
          }
        }
        if (!next && sample && squad.length < slots) {
          const added = this.measure([...squad, { ...sample }], synergy, withMore([{ ...sample }]));
          if (added && (added.dmgMult > now.dmgMult || added.takenMult < now.takenMult)) next = added;
        } else if (!next && sample) {
          // 枠が埋まっている: 数えられていない者を1体、数えられている者へ替えてみる
          const countedIds = new Set(counted.map(u => u.uid));
          for (let i = 0; i < squad.length; i++) {
            if (countedIds.has(squad[i].uid)) continue;
            const trial = squad.map((u, j) => j === i ? { ...sample } : u);
            const after = this.measure(trial, synergy, ctx);
            if (after && (after.dmgMult > now.dmgMult || after.takenMult < now.takenMult)
              && (!next || after.dmgMult > next.dmgMult)) {
              next = after;
              swapOut = squad[i];
            }
          }
        }
        return {
          id: synergy.id, name: synergy.name, desc: synergy.desc, condition: synergy.condition,
          active: true, now, counted: counted.length, next, viaRecruit,
          nextRace: next ? (sample && sample.race) || null : null,
          swapOutRace: swapOut ? swapOut.race : null,
          swapOutName: swapOut ? swapOut.name : null
        };
      }
      // 未発動: 手持ちの誰かを増やして届くなら、あと何体かを出す。
      // 数えるのが軍団全体なので、増やす先も軍団（pool）でなければ条件は動かない。
      let need = null, by = null;
      const candidates = basePool && basePool.length ? basePool : squad;
      for (const member of candidates) {
        for (let add = 1; add <= 4; add++) {
          const extra = Array.from({ length: add }, () => ({ ...member }));
          const trial = [...squad, ...extra];
          if (this.measure(trial, synergy, withMore(extra))) {
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
