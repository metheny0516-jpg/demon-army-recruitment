// ラン中の小さな事実を積む器。本体への記録・表示の接続はまだ行わない。
const TRACE_KINDS = {
  late: { label: "遅刻", template: "{subject}が遅れて着いた（{data.rounds}ラウンド）" },
  ate: { label: "食事", template: "{subject}が{object}の携行食を食べた" },
  fermented: { label: "発酵", template: "{subject}が{object}の発酵糧食で酔った" },
  downed: { label: "戦闘不能", template: "{subject}が戦闘で倒れた（{data.round}ラウンド）" },
  fallen: { label: "戦死", template: "{subject}が戦死した（{data.army}）" },
  revived: { label: "蘇生", template: "{subject}が{object}に蘇生された（{data.trait}）" },
  retreated: { label: "撤退", template: "{data.army}が撤退した（担がれた者: {data.carried}）" },
  carried: { label: "担ぎ帰り", template: "{subject}が{data.army}で担がれて帰った" },
  hired: { label: "採用", template: "{subject}が採用された（{data.day}日目）" },
  promoted: { label: "昇進", template: "{subject}が{data.rank}に昇進した" },
  fired: { label: "解雇", template: "{subject}を解雇した" },
  deserted: { label: "逃亡", template: "{subject}が軍を去った" },
  retired: { label: "引退", template: "{subject}が引退した" },
  ordered: { label: "号令", template: "{subject}に「{data.skill}」と命じた" },
  defended: { label: "防衛", template: "{data.army}から城を守った" },
  ransacked: { label: "荒らされた", template: "{data.army}に城を荒らされた" },
  act: { label: "幕", template: "第{data.act}幕が始まった" }
};

const Traces = {
  MAX: 400,
  MAX_KINDS: 17,
  protectedKinds: new Set(["fallen", "retreated"]),

  record(list, trace) {
    if (!Array.isArray(list) || !this.validate(trace).ok) return null;
    const entry = {
      seq: this.nextSeq(list), day: trace.day ?? null, turn: trace.turn ?? null,
      kind: trace.kind, subject: trace.subject, object: trace.object ?? null,
      data: this.copyData(trace.data || {})
    };
    list.push(entry);
    this.prune(list, this.MAX);
    return entry;
  },

  query(list, filter = {}) {
    if (!Array.isArray(list)) return [];
    const has = key => Object.prototype.hasOwnProperty.call(filter, key) && filter[key] !== undefined;
    return list.filter(trace => {
      if (has("kind") && trace.kind !== filter.kind) return false;
      if (has("subject") && trace.subject !== filter.subject) return false;
      if (has("object") && trace.object !== filter.object) return false;
      if (has("since") && !(trace.seq > filter.since)) return false;
      if (has("kinds") && (!Array.isArray(filter.kinds) || !filter.kinds.includes(trace.kind))) return false;
      return true;
    }).slice().sort((a, b) => b.seq - a.seq);
  },

  count(list, filter) { return this.query(list, filter).length; },
  last(list, filter) { return this.query(list, filter)[0] || null; },

  forUnit(list, uid) {
    if (!Array.isArray(list)) return [];
    return list.filter(trace => trace.subject === uid || trace.object === uid)
      .slice().sort((a, b) => b.seq - a.seq);
  },

  summary(list, uid) {
    return this.forUnit(list, uid).filter(trace => trace.subject === uid)
      .reduce((summary, trace) => {
        summary[trace.kind] = (summary[trace.kind] || 0) + 1;
        return summary;
      }, {});
  },

  describe(trace, nameOf) {
    const kind = TRACE_KINDS[trace?.kind];
    if (!kind) return "";
    const name = typeof nameOf === "function" ? nameOf : () => undefined;
    return kind.template.replace(/\{(subject|object|data\.[^}]+)\}/g, (token, key) => {
      if (key === "subject") return this.describeValue(trace.subject, name);
      if (key === "object") return this.describeValue(trace.object, name);
      return this.describeData(trace.data?.[key.slice(5)]);
    });
  },

  prune(list, cap) {
    if (!Array.isArray(list)) return list;
    const limit = Math.max(0, Math.floor(Number.isFinite(cap) ? cap : this.MAX));
    while (list.length > limit) {
      let oldest = -1;
      for (let i = 0; i < list.length; i++) {
        if (this.protectedKinds.has(list[i]?.kind)) continue;
        if (oldest < 0 || (list[i]?.seq ?? Infinity) < (list[oldest]?.seq ?? Infinity)) oldest = i;
      }
      if (oldest < 0) break;
      list.splice(oldest, 1);
    }
    return list;
  },

  validate(trace) {
    if (!trace || typeof trace !== "object" || Array.isArray(trace)) return { ok: false, reason: "trace" };
    if (!Object.prototype.hasOwnProperty.call(TRACE_KINDS, trace.kind)) return { ok: false, reason: "kind" };
    if (!this.isUid(trace.subject, true)) return { ok: false, reason: "subject" };
    if (!this.isObject(trace.object)) return { ok: false, reason: "object" };
    if (!this.isShallowData(trace.data ?? {})) return { ok: false, reason: "data" };
    return { ok: true, reason: null };
  },

  nextSeq(list) {
    return list.reduce((max, trace) => Math.max(max, Number.isFinite(trace?.seq) ? trace.seq : 0), 0) + 1;
  },

  isUid(value, nullable) {
    return (nullable && value === null) || (typeof value === "number" && Number.isFinite(value));
  },

  isObject(value) {
    return value === undefined || value === null || this.isUid(value, false) || typeof value === "string";
  },

  isShallowData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    return Object.values(data).every(value => {
      if (value === null || ["string", "boolean"].includes(typeof value)) return true;
      if (typeof value === "number") return Number.isFinite(value);
      return Array.isArray(value) && value.every(item => item === null || ["string", "boolean"].includes(typeof item) || (typeof item === "number" && Number.isFinite(item)));
    });
  },

  copyData(data) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.slice() : value]));
  },

  describeValue(value, nameOf) {
    if (value === null || value === undefined) return "誰か";
    if (typeof value === "string") return value;
    return nameOf(value) || "誰か";
  },

  describeData(value) {
    if (value === null || value === undefined) return "誰か";
    return Array.isArray(value) ? value.join("、") : String(value);
  }
};
