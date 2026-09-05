// 90年代RPG風の短い効果音を Web Audio API で合成する。
// 外部音源へ依存せず、cue()/battle() の呼び口を保てば後から実素材へ差し替えられる。
const Sound = {
  ctx: null,
  master: null,
  noiseBuffer: null,
  active: new Set(),
  media: new Set(),
  samples: new Map(),
  sampleSeq: 0,
  SAMPLE_ROLES: { basun: "pierce", gachan: "guard", zushi: "blunt", zuba: "slash" },
  PHYSICAL_SAMPLES: [
    "assets/sfx/candidates/candidate-antum-thwack-08.wav",
    "assets/sfx/candidates/candidate-antum-thwack-09.wav"
  ],
  physicalSeq: 0,
  volume: 0.55,
  muted: false,

  init() {
    this.load();
    this.mountControls();
  },

  load() {
    try {
      const rawVolume = localStorage.getItem("maou_volume");
      const savedVolume = Number(rawVolume);
      if (rawVolume !== null && Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) this.volume = savedVolume;
      this.muted = localStorage.getItem("maou_muted") === "1";
    } catch (e) {}
  },

  save() {
    try {
      localStorage.setItem("maou_volume", String(this.volume));
      localStorage.setItem("maou_muted", this.muted ? "1" : "0");
    } catch (e) {}
  },

  mountControls() {
    if (typeof document === "undefined" || document.getElementById("sound-control")) return;
    const box = document.createElement("div");
    box.id = "sound-control";
    box.className = "sound-control";
    box.innerHTML = `<button class="sound-toggle" id="sound-toggle" type="button" aria-label="効果音のオン・オフ"></button>
      <label class="sound-slider" title="効果音の音量">
        <span>音量</span><input id="sound-volume" type="range" min="0" max="100" step="5">
      </label>`;
    document.body.appendChild(box);
    box.querySelector("#sound-toggle").addEventListener("click", () => {
      this.setMuted(!this.muted);
      if (!this.muted) {
        this.unlock();
        this.cue("confirm");
      }
    });
    box.querySelector("#sound-volume").addEventListener("input", ev => {
      this.setVolume(Number(ev.target.value) / 100);
      if (this.muted && this.volume > 0) this.setMuted(false);
      this.unlock();
    });
    box.querySelector("#sound-volume").addEventListener("change", () => this.cue("confirm"));
    this.renderControls();
  },

  renderControls() {
    if (typeof document === "undefined") return;
    const button = document.getElementById("sound-toggle");
    const range = document.getElementById("sound-volume");
    if (button) {
      button.textContent = this.muted || this.volume === 0 ? "🔇 OFF" : `🔊 ${Math.round(this.volume * 100)}%`;
      button.setAttribute("aria-pressed", this.muted ? "true" : "false");
    }
    if (range) range.value = String(Math.round(this.volume * 100));
  },

  setMuted(value) {
    this.muted = !!value;
    this.applyGain();
    this.save();
    this.renderControls();
  },

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    this.applyGain();
    this.save();
    this.renderControls();
  },

  unlock() {
    if (this.muted || typeof window === "undefined") return false;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    if (!this.ctx) {
      this.ctx = new AudioCtor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      if (this.ctx.createBuffer) {
        this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const noise = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
      }
      this.applyGain(true);
      this.preloadSamples();
    }
    if (this.ctx.state !== "running" && this.ctx.resume) {
      const resumed = this.ctx.resume();
      if (resumed && resumed.catch) resumed.catch(() => {});
    }
    return true;
  },

  applyGain(immediate) {
    if (!this.master || !this.ctx) return;
    const value = this.muted ? 0 : this.volume;
    if (immediate || !this.master.gain.setTargetAtTime) this.master.gain.value = value;
    else this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.015);
    for (const audio of this.media) audio.volume = value * .82;
    // BGMが MediaElementSource を使えない file:// 環境でも、共通スライダーへ追従させる。
    if (typeof Music !== "undefined" && Music.syncTrack) Music.syncTrack();
  },

  preloadSamples() {
    if (typeof Audio === "undefined" || this.samples.size) return;
    for (const family of ["basun", "gachan", "zushi", "zuba"]) {
      for (const variant of ["a", "b", "c"]) {
        const url = `assets/sfx/recorded/${this.SAMPLE_ROLES[family]}-${variant}.wav`;
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = url;
        if (audio.load) audio.load();
        this.samples.set(url, audio);
      }
    }
    for (const url of this.PHYSICAL_SAMPLES) {
      const audio = new Audio(url);
      audio.preload = "auto";
      if (audio.load) audio.load();
      this.samples.set(url, audio);
    }
  },

  playSample(family, data = {}) {
    if (this.muted || typeof Audio === "undefined") return false;
    this.preloadSamples();
    const variant = ["a", "b", "c"][this.sampleSeq++ % 3];
    const url = family === "physical"
      ? this.PHYSICAL_SAMPLES[this.physicalSeq++ % this.PHYSICAL_SAMPLES.length]
      : `assets/sfx/recorded/${this.SAMPLE_ROLES[family]}-${variant}.wav`;
    const prototype = this.samples.get(url);
    const audio = prototype && prototype.cloneNode ? prototype.cloneNode() : new Audio(url);
    const boost = Number(data.boost) || 1;
    audio.volume = Math.min(1, this.volume * (family === "physical" ? .9 : family === "zushi" ? .9 : .78) * boost);
    // Speed changes timing, not the weight/pitch of every blow.
    audio.playbackRate = data.heavy ? .9 : 1;
    while (this.media.size >= 4) {
      const oldest = this.media.values().next().value;
      oldest.pause(); this.media.delete(oldest);
    }
    this.media.add(audio);
    const cleanup = () => this.media.delete(audio);
    if (audio.addEventListener) audio.addEventListener("ended", cleanup, { once: true });
    const played = audio.play();
    if (played && played.catch) played.catch(cleanup);
    return true;
  },

  tone(freq, duration, opts = {}) {
    if (!this.unlock()) return;
    const now = this.ctx.currentTime + (opts.delay || 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(Math.max(20, freq), now);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), now + duration);
    if (opts.detune) osc.detune.value = opts.detune;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.002, opts.gain || 0.07), now + Math.min(.018, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    this.track(osc);
    osc.start(now);
    osc.stop(now + duration + .02);
  },

  noise(duration, opts = {}) {
    if (!this.unlock() || !this.noiseBuffer) return;
    const now = this.ctx.currentTime + (opts.delay || 0);
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    let tail = source;
    if (this.ctx.createBiquadFilter) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = opts.filterType || "lowpass";
      filter.frequency.value = opts.filter || 1200;
      source.connect(filter);
      tail = filter;
    }
    gain.gain.setValueAtTime(Math.max(0.002, opts.gain || 0.05), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    tail.connect(gain);
    gain.connect(this.master);
    source.buffer = this.noiseBuffer;
    this.track(source);
    source.start(now, Math.random() * Math.max(0, 1 - duration));
    source.stop(now + duration + .02);
  },

  track(node) {
    this.active.add(node);
    node.onended = () => this.active.delete(node);
  },

  stopAll() {
    for (const node of this.active) {
      try { node.stop(); } catch (e) {}
    }
    this.active.clear();
    for (const audio of this.media) {
      try { audio.pause(); audio.currentTime = 0; } catch (e) {}
    }
    this.media.clear();
  },

  chord(freqs, duration, opts = {}) {
    freqs.forEach((freq, i) => this.tone(freq, duration, { ...opts, delay: (opts.delay || 0) + i * (opts.stagger || 0) }));
  },

  cue(name, data = {}) {
    if (this.muted) return;
    if (name === "attack") {
      this.playSample("physical", data);
      return;
    }
    if (name === "guard") { this.playSample("gachan", data); return; }
    const pace = 1 / Math.sqrt(Math.max(1, data.speed || 1));
    switch (name) {
      case "click":
        this.tone(520, .045 * pace, { type: "triangle", gain: .025, to: 620 });
        break;
      case "confirm":
        this.tone(440, .08 * pace, { type: "triangle", gain: .045, to: 660 });
        break;
      case "mormo": {
        // 台詞の一音ずつを読ませる軽い声。文字ごとに少し高さを揺らし、機械音を避ける。
        const notes = [294, 330, 349, 392, 330];
        const freq = notes[(data.index || 0) % notes.length];
        this.tone(freq, .038, { type: "triangle", gain: .022, to: freq * .94 });
        break;
      }
      case "hire":
        this.noise(.075 * pace, { gain: .035, filter: 700 });
        this.tone(150, .11 * pace, { type: "square", gain: .05, to: 105, delay: .015 });
        break;
      case "shuffle":
        this.noise(.16 * pace, { gain: .032, filter: 1800, filterType: "bandpass" });
        this.tone(620, .035 * pace, { type: "square", gain: .018, delay: .035 });
        this.tone(760, .035 * pace, { type: "square", gain: .018, delay: .105 });
        break;
      case "dismiss":
        this.tone(260, .18 * pace, { type: "triangle", gain: .04, to: 105 });
        break;
      case "deploy":
        this.tone(110, .24 * pace, { type: "sawtooth", gain: .055, to: 82 });
        this.tone(165, .18 * pace, { type: "square", gain: .035, delay: .08 });
        break;
      case "round":
        this.tone(740, .09 * pace, { type: "square", gain: .045, to: 520 });
        this.tone(980, .1 * pace, { type: "triangle", gain: .04, delay: .11 * pace });
        break;
      case "attack": {
        const power = Math.max(0, Math.min(3, data.emphasis || 0));
        this.noise((.08 + power * .025) * pace, { gain: .035 + power * .012, filter: 1800 + power * 500 });
        this.tone(data.enemy ? 185 : 235, (.11 + power * .03) * pace, {
          type: "sawtooth", gain: .035 + power * .009, to: 72, delay: .035 * pace
        });
        break;
      }
      case "magic":
        this.tone(880, .16 * pace, { type: "square", gain: .045, to: 220 });
        this.tone(1175, .12 * pace, { type: "triangle", gain: .03, to: 440, delay: .035 });
        break;
      case "death":
        this.tone(190, .34 * pace, { type: "sawtooth", gain: .055, to: 48 });
        break;
      case "revive":
        [330, 440, 660].forEach((freq, i) => this.tone(freq, .22 * pace, {
          type: "triangle", gain: .045, to: freq * 1.25, delay: i * .09 * pace
        }));
        break;
      case "heal":
        this.chord([523, 659], .18 * pace, { type: "sine", gain: .035, stagger: .045 * pace });
        break;
      case "guard":
        this.tone(260, .12 * pace, { type: "square", gain: .055, to: 210 });
        this.tone(780, .08 * pace, { type: "square", gain: .025, delay: .025 });
        break;
      case "synergy": {
        const bases = { general_command: 392, king_slime: 294, legion_of_dead: 220, arcane_circle: 330 };
        const base = bases[data.id] || 349;
        this.chord([base, base * 1.25, base * 1.5], .38 * pace, {
          type: "triangle", gain: .045, stagger: .065 * pace
        });
        break;
      }
      case "promotion":
        [440, 554, 659, 880].forEach((freq, i) => this.tone(freq, .34 * pace, {
          type: "triangle", gain: .045, delay: i * .075 * pace
        }));
        this.tone(110, .4 * pace, { type: "square", gain: .025 });
        break;
      // OVERKILLと伝播にはこれまで音が無かった。オーナー選定済みの打撃原音
      // （thwack 08/09）をそのまま使い、段数ぶん強く・重ねて鳴らす。
      // 新しい合成音は作らない（過去に何度も失敗しているため）。
      case "overkill_hit": {
        const weight = Math.max(1, Math.min(4, Number(data.weight) || 1));
        this.playSample("physical", { ...data, heavy: true, boost: 1 + 0.12 * weight });
        if (weight >= 2) setTimeout(() => this.playSample("physical", { ...data, heavy: true }), 70);
        if (weight >= 4) setTimeout(() => this.playSample("physical", { ...data, heavy: true }), 145);
        break;
      }
      case "incident":
        this.tone(233, .34 * pace, { type: "sawtooth", gain: .05, to: 175 });
        this.tone(220, .34 * pace, { type: "square", gain: .035, to: 142, detune: -12 });
        this.noise(.2 * pace, { gain: .025, filter: 900 });
        break;
      case "final":
        this.chord([82, 123, 165], .72 * pace, { type: "sawtooth", gain: .045, stagger: .05 });
        break;
      case "win":
        // 約3.2秒のオリジナル凱旋句。戦闘速度で音程や曲の長さを変えない。
        [[392,0,.16],[392,.21,.16],[392,.42,.16],[523,.68,.42],
          [494,1.16,.20],[440,1.42,.20],[494,1.68,.24],[523,2.02,1.1]]
          .forEach(([freq,delay,duration]) => this.tone(freq,duration,{type:"triangle",gain:.065,delay}));
        this.chord([196,247,294], .7, {type:"triangle",gain:.018,delay:1.25});
        this.chord([131,262,330,392], 1.12, {type:"triangle",gain:.022,delay:2.02});
        break;
      case "lose":
        [294, 233, 175, 117].forEach((freq, i) => this.tone(freq, .3 * pace, {
          type: "sawtooth", gain: .045, to: freq * .82, delay: i * .11 * pace
        }));
        break;
      case "skip":
        this.noise(.09, { gain: .025, filter: 2500, filterType: "highpass" });
        this.tone(900, .08, { type: "square", gain: .025, to: 1400 });
        break;
    }
  },

  ui(action) {
    if (action === "skiplog") return;
    if (action === "hire") return this.cue("hire");
    if (action === "reroll") return this.cue("shuffle");
    if (action === "fire") return this.cue("dismiss");
    if (action === "deploy") return this.cue("deploy");
    if (action === "retry") return this.cue("revive");
    if (["missionpick", "eventpick", "new"].includes(action)) return this.cue("confirm");
    this.cue("click");
  },

  battle(event, options = {}) {
    const data = { ...options, emphasis: event.emphasis || 0, id: event.id };
    switch (event.type) {
      case "battle_start": if (options.final) this.cue("final", data); break;
      case "round_start": this.cue("round", data); break;
      case "attack": this.cue(options.attackKind === "magic" ? "magic" : "attack", { ...data, enemy: options.fromSide === "enemy" }); break;
      case "splash": this.cue(event.label === "仲間割れ" ? "attack" : "magic", data); break;
      case "death": this.cue("death", data); break;
      case "revive": this.cue("revive", data); break;
      case "heal": this.cue("heal", data); break;
      case "survive": this.cue("guard", data); break;
      case "synergy": this.cue("synergy", data); break;
      // 見せ場は音でも段を作る。積んだ数・余剰の大きさで打撃の重さが変わる。
      case "overkill":
        this.cue("overkill_hit", { ...data, weight: event.percent >= 300 ? 4 : event.percent >= 100 ? 3 : 1 });
        break;
      case "trait_trigger":
        if (event.traitId === "overload" || event.traitId === "chain_massacre") {
          this.cue("overkill_hit", { ...data, weight: Math.min(4, Math.max(2, (event.chainDepth || 2) - 1)) });
        }
        break;
      case "incident": this.cue("incident", data); break;
      case "result": this.cue(event.victory ? "win" : "lose", data); break;
    }
  }
};
