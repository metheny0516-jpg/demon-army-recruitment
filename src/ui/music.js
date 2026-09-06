// BGM =「魔王軍の行進曲」。鳴っているパートは軍団そのもの。
//
//   Music.describe(state) → descriptor → Music.apply(descriptor)
//   （ゲーム状態の解釈）    （契約）      （Web Audio・後で実素材へ差し替え可能）
//
// descriptor が唯一の契約である。describe() は純関数で DOM も Audio も触らないので
// node から検証できる（tools/test-music.js）。音が安っぽいという評価が出ても、
// 捨てるのは apply() 以下の合成だけで済む。設計の根拠は docs/BGM_DESIGN.md。
const Music = {
  // ── 契約側 ────────────────────────────────
  // レイヤー名。実素材へ差し替えるときもこの名前と gain の意味を保つこと。
  LAYERS: ["drum", "bass", "brass", "choir", "bells", "slime"],

  // 通常進行と戦闘は旋律そのものを分ける。軍団状態を伝える Web Audio レイヤーは
  // どちらにも重ね、「場面差」と「自分の編成が鳴る」の両方を残す。
  TRACKS: {
    campaign: { url: "assets/bgm/raiders-march.ogg", bpm: 123, gain: 1.08 },
    battle: { url: "assets/bgm/battle-theme.ogg", bpm: 126, gain: .98 }
  },
  SCENE_GAIN: {
    title: .72, recruit: .78, mission: .86, battle: .96,
    final: 1, victory: .9, defeat: .62
  },

  SCENES: {
    // 実曲の速度を大きく変えると音質が落ちるため、場面差は約±8%に収める。
    // root は実曲の E minor に合わせる。再生速度ぶんの移調は freq() 側で追従する。
    title:   { bpm: 114, root: 82.407, drive: .35 },
    recruit: { bpm: 117, root: 82.407, drive: .45 },
    mission: { bpm: 121, root: 82.407, drive: .55 },
    battle:  { bpm: 126, root: 82.407, drive: .85 },
    final:   { bpm: 132, root: 82.407, drive: 1.0 },
    victory: { bpm: 123, root: 82.407, drive: .7 },
    defeat:  { bpm: 108, root: 82.407, drive: .25 }
  },

  // 自然的短音階。行進曲なので短調で通す。
  SCALE: [0, 2, 3, 5, 7, 8, 10],

  // 1小節16ステップ。p は「頭数がどれだけ揃えば鳴るか」の閾値。
  BASS_PATTERN: [
    { step: 0,  deg: 0, p: .20 }, { step: 3,  deg: 0, p: .80 },
    { step: 4,  deg: 4, p: .40 }, { step: 6,  deg: 2, p: 1.00 },
    { step: 8,  deg: 0, p: .20 }, { step: 11, deg: 3, p: .80 },
    { step: 12, deg: 4, p: .60 }, { step: 14, deg: 6, p: 1.00 }
  ],

  // 軍団の状態を descriptor に翻訳する。純関数。
  describe(state, opts = {}) {
    const scene = this.SCENES[opts.scene] ? opts.scene : "recruit";
    const preset = this.SCENES[scene];
    const roster = (state && state.roster) || [];
    const activeIds = new Set((state && state.activeUids) || []);
    const active = activeIds.size ? roster.filter(m => activeIds.has(m.uid)) : roster.slice(0, 5);
    const head = active.length;

    const has = (m, tag) => Array.isArray(m.tags) && m.tags.includes(tag);
    const undead = active.filter(m => has(m, "undead")).length;
    const caster = active.filter(m => has(m, "caster")).length;
    const slime = active.filter(m => typeof m.race === "string" && m.race.includes("スライム")).length;
    const generals = active.filter(m => m.rankId === "general").length;

    // 不満。未払いは「サボって演奏しない」、低忠誠は「ピッチと拍がよれる」。
    const unpaid = active.filter(m => m.unpaid).length;
    const avgLoyalty = head ? active.reduce((s, m) => s + (Number(m.loyalty) || 0), 0) / head : 100;
    const unrest = this.clamp(
      (head ? unpaid / head : 0) * .65 + Math.max(0, (55 - avgLoyalty) / 55) * .5, 0, 1
    );

    const alert = this.clamp(((state && state.alert) || 0) / 10, 0, 1);
    const drive = preset.drive;
    const broken = scene === "defeat";

    return {
      scene,
      // 警戒度が上がるほど行軍が急く。不満が募るほど足並みが鈍る。
      bpm: Math.round(preset.bpm * (1 + alert * .12) * (1 - unrest * .08)),
      root: preset.root,
      alert, unrest,
      head, undead, caster, slime, generals, unpaid,
      layers: {
        drum:  { gain: broken ? .35 : .55 + alert * .25, hats: alert > .35 || scene === "battle" || scene === "final" },
        bass:  { gain: broken ? .3 : .5 + drive * .3, density: head / 5 },
        brass: { gain: this.clamp(generals * .55, 0, 1) * drive },
        choir: { gain: this.clamp(undead / 3, 0, 1) * (.45 + drive * .35) },
        bells: { gain: this.clamp(caster / 3, 0, 1) * (.35 + drive * .35) },
        slime: { gain: slime ? this.clamp(.3 + (slime - 1) * .2, 0, .8) : 0 }
      }
    };
  },

  clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || 0)); },

  // ── 再生側（差し替え可能） ────────────────
  // 効果音は単発の強調表現、BGMは常時鳴り続ける下敷きなので、同じ音量では
  // BGM側が埋もれて聞こえなくなる。効果音より控えめに、しかし無音とは
  // はっきり区別できる音量に上げてある（元は .3 で、上のhiss()の減衰バグと
  // 重なって実質ほぼ無音になっていた）。
  // 合成レイヤーは実曲より十分小さくし、「曲」ではなく編成差の手触りにする。
  MIX: .2,
  LOOKAHEAD: .14,
  TICK: 25,

  enabled: true,
  desc: null,
  out: null,
  ctx: null,
  track: null,
  trackNode: null,
  trackGain: null,
  trackTone: null,
  trackDirect: false,
  trackFailed: false,
  trackKey: null,
  timer: null,
  step: 0,
  nextTime: 0,
  voices: new Set(),
  rng: Math.random,

  init() {
    try { this.enabled = localStorage.getItem("maou_bgm") !== "0"; } catch (e) {}
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.suspend();
        else if (this.desc) this.start();
      });
    }
    this.mountControl();
  },

  mountControl() {
    if (typeof document === "undefined") return;
    const box = document.getElementById("sound-control");
    if (!box || box.querySelector("#bgm-toggle")) return;
    const button = document.createElement("button");
    button.id = "bgm-toggle";
    button.type = "button";
    button.className = "sound-toggle bgm-toggle sound-extra";
    button.title = "BGM（魔王軍の行進曲）のオン・オフ";
    button.setAttribute("aria-label", "BGMのオン・オフ");
    button.addEventListener("click", () => this.setEnabled(!this.enabled));
    box.insertBefore(button, box.firstChild);
    this.renderControl();
  },

  renderControl() {
    if (typeof document === "undefined") return;
    const button = document.getElementById("bgm-toggle");
    if (!button) return;
    // 音量パネルは画面に重なる固定要素なので、常時の横幅を増やすと下の「解雇」へ
    // 近づく（tier0 の誤タップ対策が実際に落ちた）。だから音量スライダーと同じく
    // 触れたときだけ現れる扱いにし、表示も記号1文字に留めてある。
    button.textContent = "♪";
    button.classList.toggle("bgm-off", !this.enabled);
    button.setAttribute("aria-pressed", this.enabled ? "false" : "true");
  },

  setEnabled(value) {
    this.enabled = !!value;
    try { localStorage.setItem("maou_bgm", this.enabled ? "1" : "0"); } catch (e) {}
    this.renderControl();
    if (!this.enabled) this.stop();
    else if (this.desc) this.start();
  },

  // ゲーム側の入口。状態と場面を渡すだけでよい。
  update(state, opts = {}) {
    this.apply(this.describe(state, opts));
  },

  apply(desc) {
    this.desc = desc;
    if (this.enabled) this.start();
  },

  start() {
    if (!this.enabled || !this.desc || typeof Sound === "undefined") return false;
    if (Sound.muted || !Sound.unlock()) return false;
    this.ctx = Sound.ctx;
    if (!this.ctx) return false;
    if (!this.out) {
      this.out = this.ctx.createGain();
      this.out.gain.value = this.MIX;
      this.out.connect(Sound.master);
    }
    this.ensureTrack();
    this.syncTrackSource();
    this.syncTrack();
    if (this.track && this.track.paused !== false) {
      const played = this.track.play();
      if (played && played.catch) played.catch(() => {});
    }
    if (!this.timer) {
      this.nextTime = this.ctx.currentTime + .06;
      this.step = 0;
      this.timer = setInterval(() => this.tick(), this.TICK);
      this.tick();
    }
    return true;
  },

  ensureTrack() {
    if (this.track || this.trackFailed || typeof Audio === "undefined") return !!this.track;
    const audio = new Audio();
    audio.preload = "auto";
    audio.loop = true;
    const spec = this.trackSpec();
    audio.src = spec.url;
    this.trackKey = this.trackName();
    audio.preservesPitch = false;
    audio.mozPreservesPitch = false;
    audio.webkitPreservesPitch = false;
    if (audio.addEventListener) audio.addEventListener("error", () => { this.trackFailed = true; });
    if (audio.load) audio.load();
    this.track = audio;

    // MediaElementSource が使えるブラウザでは Sound.master を通し、スライダーと
    // ミュートを効果音と完全に共有する。file:// 等で作れない場合だけ直接音量へ落とす。
    if (this.ctx && this.ctx.createMediaElementSource && this.ctx.createBiquadFilter) {
      try {
        this.trackNode = this.ctx.createMediaElementSource(audio);
        this.trackTone = this.ctx.createBiquadFilter();
        this.trackTone.type = "lowpass";
        this.trackGain = this.ctx.createGain();
        this.trackNode.connect(this.trackTone);
        this.trackTone.connect(this.trackGain);
        this.trackGain.connect(Sound.master);
        audio.volume = 1;
      } catch (e) {
        this.trackDirect = true;
      }
    } else {
      this.trackDirect = true;
    }
    return true;
  },

  trackName() {
    return this.desc && (this.desc.scene === "battle" || this.desc.scene === "final")
      ? "battle" : "campaign";
  },

  trackSpec() {
    return this.TRACKS[this.trackName()] || this.TRACKS.campaign;
  },

  syncTrackSource() {
    if (!this.track || !this.desc) return;
    const name = this.trackName();
    if (this.trackKey === name) return;
    const wasPlaying = this.track.paused === false;
    if (this.track.pause) this.track.pause();
    this.track.src = this.TRACKS[name].url;
    this.track.currentTime = 0;
    this.trackKey = name;
    this.trackFailed = false;
    if (this.track.load) this.track.load();
    if (wasPlaying && this.enabled) {
      const played = this.track.play();
      if (played && played.catch) played.catch(() => {});
    }
  },

  trackLevel() {
    if (!this.desc) return 0;
    const scene = this.SCENE_GAIN[this.desc.scene] == null ? .78 : this.SCENE_GAIN[this.desc.scene];
    // 不満な軍団は演奏が少し痩せる。ただし実曲そのものは止めず、行軍の芯は残す。
    return this.trackSpec().gain * scene * (1 - this.desc.unrest * .16);
  },

  trackRate() {
    return this.desc ? this.clamp(this.desc.bpm / this.trackSpec().bpm, .86, 1.1) : 1;
  },

  syncTrack() {
    if (!this.track || !this.desc) return;
    const level = this.trackLevel();
    this.track.playbackRate = this.trackRate();
    if (this.trackGain) {
      if (this.trackGain.gain.setTargetAtTime) this.trackGain.gain.setTargetAtTime(level, this.ctx.currentTime, .12);
      else this.trackGain.gain.value = level;
    }
    if (this.trackTone) {
      // アンデッドと敗北は高域を少し曇らせる。外部曲を壊さない範囲の色付け。
      const undeadDarkness = this.clamp(this.desc.layers.choir.gain, 0, 1) * 3200;
      const defeatDarkness = this.desc.scene === "defeat" ? 5200 : 0;
      const cutoff = Math.max(5200, 18000 - undeadDarkness - defeatDarkness - this.desc.unrest * 1800);
      if (this.trackTone.frequency.setTargetAtTime) this.trackTone.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, .15);
      else this.trackTone.frequency.value = cutoff;
    }
    if (this.trackDirect) {
      const master = typeof Sound !== "undefined" && !Sound.muted ? Sound.volume : 0;
      this.track.volume = this.clamp(master * level, 0, 1);
    }
  },

  suspend() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const node of this.voices) { try { node.stop(); } catch (e) {} }
    this.voices.clear();
    if (this.track && this.track.pause) this.track.pause();
  },

  stop() { this.suspend(); },

  tick() {
    if (!this.ctx || !this.desc) return;
    const horizon = this.ctx.currentTime + this.LOOKAHEAD;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 64) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += 60 / Math.max(30, this.desc.bpm) / 4;
      this.step = (this.step + 1) % 16;
    }
  },

  // 不満は「サボり」として現れる。鳴るはずの音が確率で抜ける。
  slacking(weight) {
    return this.rng() < this.desc.unrest * weight;
  },

  // 低忠誠は音程のよれになる。
  wobble() {
    return (this.rng() - .5) * this.desc.unrest * 90;
  },

  freq(deg, octave = 0) {
    const scale = this.SCALE;
    const idx = ((deg % scale.length) + scale.length) % scale.length;
    const oct = octave + Math.floor(deg / scale.length);
    // preservesPitch=false の実曲と同じ比率で移調し、薄い合成レイヤーを調内に保つ。
    return this.desc.root * this.trackRate() * Math.pow(2, (scale[idx] + oct * 12) / 12);
  },

  scheduleStep(step, time) {
    const d = this.desc;
    const L = d.layers;
    const jitter = (this.rng() - .5) * d.unrest * .045;
    const at = time + Math.max(0, jitter);
    const broken = d.scene === "defeat";

    // 足音。行軍そのものなので、これだけはサボりにくい。
    if (L.drum.gain > 0 && step % 4 === 0 && !this.slacking(.2)) {
      this.thump(at, L.drum.gain * (step === 0 ? 1 : .72));
    }
    if (L.drum.hats && step % 2 === 1 && !this.slacking(.7)) {
      this.tick_(at, L.drum.gain * .16);
    }
    if (L.drum.gain > 0 && !broken && (step === 4 || step === 12) && !this.slacking(.5)) {
      this.snare(at, L.drum.gain * .34);
    }

    // 行進ベース。出撃隊の頭数がそのまま音数になる。
    for (const note of this.BASS_PATTERN) {
      if (note.step !== step || L.bass.density < note.p) continue;
      if (this.slacking(.85)) continue;
      this.marchNote(this.freq(note.deg, 0), .26, L.bass.gain * .16, at);
    }

    // 号令ラッパ。将軍がいると軍が音でも変わる。デチューンした2声を重ね、
    // 単純な鋸波1本より角の取れた、合唱っぽい厚みを出す（ユニゾン）。
    if (L.brass.gain > .02 && (step === 0 || step === 8) && !this.slacking(.6)) {
      [0, 4, 7].forEach((deg, i) => this.unison(this.freq(deg, 0), .42, {
        type: "sawtooth", gain: L.brass.gain * .055, filter: 1500,
        detune: this.wobble(), at: at + i * .012
      }));
    }

    // 不気味なコーラス。アンデッドの厚み。
    if (L.choir.gain > .02 && step === 0 && !this.slacking(.35)) {
      [0, 3, 7].forEach(deg => this.voice(this.freq(deg, 0), 60 / Math.max(30, d.bpm) * 4, {
        type: "sine", gain: L.choir.gain * .05, filter: 900, detune: this.wobble() - 6, at
      }));
    }

    // 魔法の鈴。術者が増えるほど煌びやか。ごく軽いユニゾンで、
    // 単純な三角波1本の「安っぽさ」を和らげる（きらめきの質感）。
    if (L.bells.gain > .02 && step % 4 === 2 && !this.slacking(.75)) {
      this.unison(this.freq((step / 2) % 7, 2), .3, {
        type: "triangle", gain: L.bells.gain * .035, filter: 4200, detune: this.wobble(), at
      }, 5);
    }

    // 間の抜けた裏拍。真面目な行進曲を台無しにする係。
    if (L.slime.gain > .02 && (step === 7 || step === 15) && !this.slacking(.4)) {
      this.voice(this.freq(2, 0), .22, {
        type: "sine", gain: L.slime.gain * .07, filter: 700,
        to: this.freq(0, -1), detune: this.wobble(), at
      });
    }
  },

  voice(freq, dur, opts = {}) {
    if (!this.ctx || !this.out) return;
    const now = opts.at != null ? opts.at : this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    let tail = osc;
    if (this.ctx.createBiquadFilter && opts.filter) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = opts.filter;
      osc.connect(filter);
      tail = filter;
    }
    osc.type = opts.type || "triangle";
    osc.frequency.setValueAtTime(Math.max(20, freq), now);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), now + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const peak = Math.max(.0015, opts.gain || .04);
    gain.gain.setValueAtTime(.0012, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(.03, dur / 4));
    gain.gain.exponentialRampToValueAtTime(.0012, now + dur);
    tail.connect(gain);
    gain.connect(this.out);
    this.hold(osc);
    osc.start(now);
    osc.stop(now + dur + .02);
  },

  // 単純な波形1本を、わずかにデチューンした2声で挟んで鳴らす（ユニゾン）。
  // 効果音と同じ「合成っぽい」薄さの原因は、倍音の少ない波形を単音で鳴らしている
  // ことそのものにある。音量ではなく音の作り方を変える対策として足した。
  unison(freq, dur, opts = {}, cents = 9) {
    const base = opts.gain || .04;
    this.voice(freq, dur, { ...opts, gain: base * .7 });
    this.voice(freq, dur, { ...opts, gain: base * .4, detune: (opts.detune || 0) + cents });
    this.voice(freq, dur, { ...opts, gain: base * .4, detune: (opts.detune || 0) - cents });
  },

  // 行進ベースの1音。スマホの小型スピーカーは110Hz未満の帯域をほぼ再生できないため、
  // 基音をroot付近（旧実装の1オクターブ上）まで上げたうえで、オクターブ上の倍音を
  // 控えめに重ねる。基音が鳴らないスピーカーでも、耳はこの倍音から元のピッチを
  // 補って聞き取る（欠落基音の錯覚）。低いオクターブに置いたまま音量だけ上げても、
  // 出せない帯域は出せないので解決しない。
  marchNote(freq, dur, gain, at) {
    this.voice(freq, dur, { type: "triangle", gain, filter: 900, detune: this.wobble(), at });
    this.voice(freq * 2, dur * .75, { type: "sine", gain: gain * .38, filter: 2400, detune: this.wobble(), at });
  },

  thump(at, gain) {
    const root = this.desc.root;
    // 芯（旧実装は root/2〜root/3.4 ≒ 32〜55Hz で、スマホでは事実上出ない帯域だった）。
    this.voice(root * .85, .15, { type: "sine", gain: gain * .22, to: root * .55, at });
    // オクターブ上の倍音。基音が聞こえないスピーカーでも踏み込みのピッチを伝える。
    this.voice(root * 1.7, .09, { type: "triangle", gain: gain * .13, to: root * 1.05, at });
    // 踏み込みの芯を中域のクリックで補う（既存）。
    this.hiss(at, .04, gain * .24, 2400, "bandpass");
  },

  snare(at, gain) { this.hiss(at, .09, gain * .5, 1900, "bandpass"); },
  tick_(at, gain) { this.hiss(at, .035, gain * .5, 5200, "highpass"); },

  hiss(at, dur, gain, freq, type) {
    if (!this.ctx || !this.out || typeof Sound === "undefined" || !Sound.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    const amp = this.ctx.createGain();
    let tail = source;
    if (this.ctx.createBiquadFilter) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      source.connect(filter);
      tail = filter;
    }
    // 以前は末尾で *.12 していたため、効果音と比べて実質1桁近く小さい音量になっていた
    // （スネア・ハイハットが聞き取れないほど小さく、実質的に「BGMが鳴らない」状態を作っていた）。
    amp.gain.setValueAtTime(Math.max(.0025, gain * .5), at);
    amp.gain.exponentialRampToValueAtTime(.0012, at + dur);
    tail.connect(amp);
    amp.connect(this.out);
    source.buffer = Sound.noiseBuffer;
    this.hold(source);
    source.start(at, this.rng() * .5);
    source.stop(at + dur + .02);
  },

  hold(node) {
    this.voices.add(node);
    node.onended = () => this.voices.delete(node);
  }
};
