import { WINDOWS_TIME_ZONES } from '@pipe/core';

/**
 * Isolate-side source of the `ExecuteScriptV2` globals Blip documents besides `request.fetchAsync`
 * (INVENTARIO §2.4, P9): `time.parseDate`, `time.dateToString`, `time.sleep` and the `context`
 * object. Everything here is plain JavaScript evaluated inside the isolate; the only host calls are
 * the two References the sandbox passes in (`$0` = sleep, `$1` = context bridge, or `undefined`).
 *
 * Date text follows .NET custom format strings (`yyyy-MM-dd HH:mm:ss`, `dd/MM/yyyy`, `'literal'`,
 * `fff`, `tt`, `K`, `zzz`) and the one-letter standard formats (`o`, `s`, `u`, `d`, `D`, `t`, `T`,
 * `g`, `G`, `f`, `F`, `M`, `Y`), as Blip runs scripts on .NET (ClearScript). Culture names come from
 * the isolate's `Intl`; the patterns of `pt-BR`, `en-US` and the invariant culture are built in.
 * ponytail: the default format (`yyyy-MM-dd'T'HH:mm:ss.fffffffK`) and the `setVariableAsync`
 * expiration unit (milliseconds, or TimeSpan text) are provisional until a Blip capture confirms them.
 */

/** `time.sleep` ceiling per call; the action's time limit still bounds the total. */
export const MAX_SLEEP_MS = 5_000;
/** `context.*Async` calls allowed per script execution. */
export const MAX_CONTEXT_CALLS = 200;

export function v2ApiPrelude(timeZone: string): string {
  return `(() => {
  const D = Date, UTC = D.UTC, sleepRef = $0, contextRef = $1;
  const DEFAULT_TZ = ${JSON.stringify(timeZone)};
  const WINDOWS = ${JSON.stringify(WINDOWS_TIME_ZONES)};
  const DEFAULT_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.fffffffK";
  const zoneOf = (tz) => {
    if (tz === undefined || tz === null || tz === '') return DEFAULT_TZ;
    const id = Object.prototype.hasOwnProperty.call(WINDOWS, String(tz)) ? WINDOWS[String(tz)] : String(tz);
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: id }).resolvedOptions().timeZone;
    } catch {
      throw new Error("Fuso horário desconhecido: '" + tz + "'.");
    }
  };
  const zoneFormats = new Map();
  const offsetAt = (t, zone) => {
    let f = zoneFormats.get(zone);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric',
        day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', era: 'short' });
      zoneFormats.set(zone, f);
    }
    const p = {};
    for (const x of f.formatToParts(new D(t))) p[x.type] = x.value;
    const year = p.era === 'BC' || p.era === 'B' ? 1 - p.year : +p.year;
    const s = t - (((t % 1000) + 1000) % 1000);
    const w = new D(0);
    w.setUTCFullYear(year, p.month - 1, +p.day);
    w.setUTCHours(+p.hour, +p.minute, +p.second, 0);
    return w.getTime() - s;
  };
  const fromWall = (w, zone) => { const t = w - offsetAt(w, zone); return w - offsetAt(t, zone); };

  const cultureNames = new Map();
  const namesOf = (culture) => {
    const key = culture || 'en-US';
    let n = cultureNames.get(key);
    if (n) return n;
    let loc = key;
    try { new Intl.DateTimeFormat(loc); } catch { loc = 'en-US'; }
    const pick = (o, t) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...o }).format(new D(t)).replace(/\\.$/, '');
    n = { months: [], monthsShort: [], days: [], daysShort: [] };
    for (let m = 0; m < 12; m++) {
      n.months.push(pick({ month: 'long' }, UTC(2021, m, 1)));
      n.monthsShort.push(pick({ month: 'short' }, UTC(2021, m, 1)));
    }
    for (let i = 0; i < 7; i++) {
      // 2021-01-03 was a Sunday.
      n.days.push(pick({ weekday: 'long' }, UTC(2021, 0, 3 + i)));
      n.daysShort.push(pick({ weekday: 'short' }, UTC(2021, 0, 3 + i)));
    }
    cultureNames.set(key, n);
    return n;
  };

  const PATTERNS = {
    invariant: { d: 'MM/dd/yyyy', D: 'dddd, dd MMMM yyyy', t: 'HH:mm', T: 'HH:mm:ss', M: 'MMMM dd', Y: 'yyyy MMMM' },
    'en-us': { d: 'M/d/yyyy', D: 'dddd, MMMM d, yyyy', t: 'h:mm tt', T: 'h:mm:ss tt', M: 'MMMM d', Y: 'MMMM yyyy' },
    'pt-br': { d: 'dd/MM/yyyy', D: "dddd, d' de 'MMMM' de 'yyyy", t: 'HH:mm', T: 'HH:mm:ss', M: "d' de 'MMMM", Y: "MMMM' de 'yyyy" },
  };
  const patternsOf = (culture) => PATTERNS[String(culture || 'invariant').toLowerCase()] || PATTERNS['en-us'];
  const standard = (format, culture) => {
    const p = patternsOf(culture);
    switch (format) {
      case 'o': case 'O': return { format: "yyyy-MM-dd'T'HH:mm:ss.fffffffK" };
      case 's': return { format: "yyyy-MM-dd'T'HH:mm:ss" };
      case 'u': return { format: "yyyy-MM-dd HH:mm:ss'Z'", utc: true };
      case 'd': case 'D': case 't': case 'T': case 'M': case 'm': case 'Y': case 'y':
        return { format: p[format.length === 1 && 'my'.includes(format) ? format.toUpperCase() : format] };
      case 'g': return { format: p.d + ' ' + p.t };
      case 'G': return { format: p.d + ' ' + p.T };
      case 'f': return { format: p.D + ' ' + p.t };
      case 'F': return { format: p.D + ' ' + p.T };
      default: throw new Error("Formato de data inválido: '" + format + "'.");
    }
  };

  const TOKEN_CHARS = 'yMdHhmsfFtKzg';
  const tokenize = (format) => {
    const out = [];
    for (let i = 0; i < format.length;) {
      const c = format[i];
      if (c === "'" || c === '"') {
        const j = format.indexOf(c, i + 1);
        const end = j < 0 ? format.length : j;
        out.push({ lit: format.slice(i + 1, end) });
        i = end + 1;
      } else if (c === '\\\\') {
        out.push({ lit: format[i + 1] || '' });
        i += 2;
      } else if (c === '%') {
        i += 1;
      } else if (TOKEN_CHARS.includes(c)) {
        let j = i;
        while (format[j] === c) j++;
        out.push({ tok: c, n: j - i });
        i = j;
      } else {
        out.push({ lit: c });
        i += 1;
      }
    }
    return out;
  };

  const pad = (v, n) => String(v).padStart(n, '0');
  const offsetText = (off, withColon, full) => {
    const a = Math.abs(off) / 60000, sign = off < 0 ? '-' : '+';
    const h = Math.floor(a / 60), m = Math.round(a % 60);
    if (!full) return sign + (withColon ? pad(h, 2) : String(h));
    return sign + pad(h, 2) + ':' + pad(m, 2);
  };

  const render = (t, format, zone, culture) => {
    let utc = false;
    if (format.length === 1) ({ format, utc = false } = standard(format, culture));
    if (utc) zone = 'UTC';
    const off = offsetAt(t, zone);
    const w = new D(t + off);
    const f = { y: w.getUTCFullYear(), M: w.getUTCMonth() + 1, d: w.getUTCDate(), dow: w.getUTCDay(),
      H: w.getUTCHours(), m: w.getUTCMinutes(), s: w.getUTCSeconds(), ms: w.getUTCMilliseconds() };
    const names = namesOf(culture);
    let out = '';
    for (const x of tokenize(format)) {
      if (x.lit !== undefined) { out += x.lit; continue; }
      const n = x.n;
      switch (x.tok) {
        case 'y': out += n === 1 ? String(f.y % 100) : n === 2 ? pad(f.y % 100, 2) : pad(f.y, n); break;
        case 'M': out += n <= 2 ? pad(f.M, n) : n === 3 ? names.monthsShort[f.M - 1] : names.months[f.M - 1]; break;
        case 'd': out += n <= 2 ? pad(f.d, n) : n === 3 ? names.daysShort[f.dow] : names.days[f.dow]; break;
        case 'H': out += pad(f.H, Math.min(n, 2)); break;
        case 'h': out += pad(f.H % 12 || 12, Math.min(n, 2)); break;
        case 'm': out += pad(f.m, Math.min(n, 2)); break;
        case 's': out += pad(f.s, Math.min(n, 2)); break;
        case 'f': out += pad(f.ms, 3).padEnd(7, '0').slice(0, Math.min(n, 7)); break;
        case 'F': {
          const digits = pad(f.ms, 3).padEnd(7, '0').slice(0, Math.min(n, 7)).replace(/0+$/, '');
          // .NET drops the separator before an all-zero F fraction.
          if (!digits && out.endsWith('.')) out = out.slice(0, -1);
          out += digits;
          break;
        }
        case 't': out += (f.H < 12 ? 'AM' : 'PM').slice(0, n === 1 ? 1 : 2); break;
        case 'K': out += zone === 'UTC' ? 'Z' : offsetText(off, true, true); break;
        case 'z': out += offsetText(off, n >= 2, n >= 3); break;
        case 'g': out += f.y > 0 ? 'A.D.' : 'B.C.'; break;
      }
    }
    return out;
  };

  const escapeRe = (s) => s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  const alternatives = (list) => '(' + list.map(escapeRe).sort((a, b) => b.length - a.length).join('|') + ')';
  const OFFSET_RE = '(Z|[+-]\\\\d{1,2}(?::?\\\\d{2})?)';
  const parseOffset = (text) => {
    if (/^z$/i.test(text)) return 0;
    const m = /^([+-])(\\d{1,2})(?::?(\\d{2}))?$/.exec(text);
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60000;
  };

  const parseExact = (text, format, zone, culture) => {
    if (format.length === 1) format = standard(format, culture).format;
    const names = namesOf(culture);
    const fields = [];
    let re = '';
    for (const x of tokenize(format)) {
      if (x.lit !== undefined) { re += escapeRe(x.lit); continue; }
      const n = x.n;
      const num = (min, max) => { re += '(\\\\d{' + min + ',' + max + '})'; };
      switch (x.tok) {
        case 'y': n <= 2 ? num(n === 1 ? 1 : 2, 2) : num(n, Math.max(n, 4)); fields.push(n <= 2 ? 'yy' : 'y'); break;
        case 'M':
          if (n <= 2) { num(n, 2); fields.push('M'); }
          else { re += alternatives(n === 3 ? names.monthsShort : names.months); fields.push(n === 3 ? 'MMM' : 'MMMM'); }
          break;
        case 'd':
          if (n <= 2) { num(n, 2); fields.push('d'); }
          else { re += alternatives(n === 3 ? names.daysShort : names.days); fields.push('dow'); }
          break;
        case 'H': case 'h': case 'm': case 's': num(Math.min(n, 2), 2); fields.push(x.tok); break;
        case 'f': num(Math.min(n, 7), Math.min(n, 7)); fields.push('f'); break;
        case 'F': num(0, Math.min(n, 7)); fields.push('f'); break;
        case 't': re += n === 1 ? '([AP])' : '(AM|PM)'; fields.push('t'); break;
        case 'K': case 'z': re += OFFSET_RE; fields.push('off'); break;
        case 'g': re += '(A\\\\.D\\\\.|B\\\\.C\\\\.|AD|BC)'; fields.push('era'); break;
      }
    }
    const m = new RegExp('^' + re + '$', 'i').exec(text);
    if (!m) return null;
    const v = { y: 1, M: 1, d: 1, H: 0, m: 0, s: 0, ms: 0, pm: null, off: null };
    fields.forEach((k, i) => {
      const raw = m[i + 1];
      const lower = (list) => list.map((s) => s.toLowerCase()).indexOf(raw.toLowerCase());
      if (k === 'y') v.y = Number(raw);
      else if (k === 'yy') v.y = (Number(raw) < 50 ? 2000 : 1900) + Number(raw);
      else if (k === 'M') v.M = Number(raw);
      else if (k === 'MMM') v.M = lower(names.monthsShort) + 1;
      else if (k === 'MMMM') v.M = lower(names.months) + 1;
      else if (k === 'd') v.d = Number(raw);
      else if (k === 'H' || k === 'h') v.H = Number(raw);
      else if (k === 'm') v.m = Number(raw);
      else if (k === 's') v.s = Number(raw);
      else if (k === 'f') v.ms = raw ? Math.floor(Number(raw.padEnd(3, '0').slice(0, 3))) : 0;
      else if (k === 't') v.pm = /^p/i.test(raw);
      else if (k === 'off') v.off = parseOffset(raw);
    });
    if (v.pm !== null) {
      if (v.H < 1 || v.H > 12) return null;
      v.H = (v.H % 12) + (v.pm ? 12 : 0);
    }
    return build(v, zone);
  };

  const build = (v, zone) => {
    if (v.M < 1 || v.M > 12 || v.d < 1 || v.H > 23 || v.m > 59 || v.s > 59) return null;
    const w = new D(0);
    w.setUTCFullYear(v.y, v.M - 1, v.d);
    w.setUTCHours(v.H, v.m, v.s, v.ms);
    // Rejects 31/02 and the like: the fields must survive the round trip.
    if (w.getUTCDate() !== v.d || w.getUTCMonth() !== v.M - 1) return null;
    return v.off !== null ? w.getTime() - v.off : fromWall(w.getTime(), zone);
  };

  const ISO = /^(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[T ](\\d{1,2}):(\\d{2})(?::(\\d{2})(?:[.,](\\d{1,7}))?)?)?\\s*(Z|[+-]\\d{2}(?::?\\d{2})?)?$/i;
  const parseAny = (text, zone, culture) => {
    const iso = ISO.exec(text);
    if (iso) {
      return build({ y: +iso[1], M: +iso[2], d: +iso[3], H: +(iso[4] || 0), m: +(iso[5] || 0), s: +(iso[6] || 0),
        ms: iso[7] ? Number(iso[7].padEnd(3, '0').slice(0, 3)) : 0, off: iso[8] ? parseOffset(iso[8]) : null }, zone);
    }
    const p = patternsOf(culture);
    const loose = (f) => f.replace(/(^|[^d])dd(?!d)/g, '$1d').replace(/(^|[^M])MM(?!M)/g, '$1M').replace(/HH/g, 'H').replace(/hh/g, 'h');
    for (const f of [p.d + ' ' + p.T, p.d + ' ' + p.t, p.d, p.D + ' ' + p.T, p.D + ' ' + p.t, p.D]) {
      const t = parseExact(text, loose(f), zone, culture);
      if (t !== null) return t;
    }
    // RFC 1123 and other texts with an explicit zone.
    const t = D.parse(text);
    return t === t && /(gmt|utc|z|[+-]\\d{2}:?\\d{2})\\s*$/i.test(text) ? t : null;
  };

  const optionsOf = (options) => {
    if (options === undefined || options === null) return {};
    if (typeof options !== 'object') throw new Error('As opções de data devem ser um objeto.');
    if (options.format !== undefined && options.format !== null && typeof options.format !== 'string') {
      throw new Error("A opção 'format' deve ser um texto.");
    }
    return options;
  };

  const parseDate = (date, options) => {
    const o = optionsOf(options);
    const text = String(date === undefined || date === null ? '' : date).trim();
    const zone = zoneOf(o.timeZone);
    const culture = o.culture ? String(o.culture) : undefined;
    const t = o.format ? parseExact(text, o.format, zone, culture) : parseAny(text, zone, culture);
    if (t === null || t !== t) {
      throw new Error(o.format
        ? "A data '" + text + "' não está no formato '" + o.format + "'."
        : "Não foi possível interpretar a data '" + text + "'.");
    }
    return new D(t);
  };

  const dateToString = (date, options) => {
    const o = optionsOf(options);
    let t;
    if (date instanceof D) t = date.getTime();
    else if (typeof date === 'number') t = date;
    else if (typeof date === 'string') t = parseDate(date, { timeZone: o.timeZone, culture: o.culture }).getTime();
    else throw new Error('time.dateToString precisa de uma data.');
    if (t !== t) throw new Error('Data inválida.');
    return render(t, o.format || DEFAULT_FORMAT, zoneOf(o.timeZone), o.culture ? String(o.culture) : undefined);
  };

  const sleep = (milliseconds) => {
    const ms = Number(milliseconds);
    if (!Number.isFinite(ms) || ms < 0) throw new Error('time.sleep precisa de um número de milissegundos.');
    if (ms > ${MAX_SLEEP_MS}) throw new Error('time.sleep aceita no máximo ${MAX_SLEEP_MS} ms por chamada.');
    // Blocks only this isolate's thread; the host event loop keeps running.
    sleepRef.applySyncPromise(undefined, [ms], { arguments: { copy: true } });
  };

  globalThis.time = Object.freeze({ parseDate, dateToString, sleep });

  if (contextRef) {
    const call = async (args) => {
      const r = await contextRef.apply(undefined, args, { arguments: { copy: true }, result: { promise: true, copy: true } });
      if (!r.ok) throw new Error(r.message);
      return r.value;
    };
    const asText = (value) => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      if (value instanceof D) return dateToString(value);
      if (typeof value === 'object') return JSON.stringify(value) ?? '';
      return String(value);
    };
    const expirationOf = (e) => (typeof e === 'number' || typeof e === 'string' ? e : null);
    globalThis.context = Object.freeze({
      getVariableAsync: (name) => call(['get', String(name)]),
      setVariableAsync: async (name, value, expiration) => {
        await call(['set', String(name), asText(value), expirationOf(expiration)]);
      },
      deleteVariableAsync: async (name) => {
        await call(['delete', String(name)]);
      },
    });
  }
})();
`;
}
