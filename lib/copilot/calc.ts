/** Safe arithmetic evaluator (no eval). Grammar: expr := term (('+'|'-') term)*; term := pow (('*'|'/'|'%') pow)*;
 *  pow := unary ('^' pow)?; unary := '-' unary | primary; primary := number | ident '(' args ')' | '(' expr ')'. */
const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt,
  round: (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
};

export function evaluate(src: string): number {
  // Numbers must be plain (no thousands separators); commas only separate function arguments.
  const s = src.replace(/₹/g, "");
  let i = 0;
  const ws = () => { while (s[i] === " ") i++; };
  const peek = () => { ws(); return s[i]; };
  const expr = (): number => {
    let v = term();
    for (;;) { const c = peek(); if (c === "+") { i++; v += term(); } else if (c === "-") { i++; v -= term(); } else return v; }
  };
  const term = (): number => {
    let v = pow();
    for (;;) {
      const c = peek();
      if (c === "*") { i++; v *= pow(); }
      else if (c === "/") { i++; const d = pow(); if (d === 0) throw new Error("division by zero"); v /= d; }
      else if (c === "%") { i++; v %= pow(); }
      else return v;
    }
  };
  const pow = (): number => { const b = unary(); if (peek() === "^") { i++; return b ** pow(); } return b; };
  const unary = (): number => { if (peek() === "-") { i++; return -unary(); } if (peek() === "+") { i++; return unary(); } return primary(); };
  const primary = (): number => {
    const c = peek();
    if (c === "(") { i++; const v = expr(); if (peek() !== ")") throw new Error("missing )"); i++; return v; }
    const num = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = /^[a-z]+/i.exec(s.slice(i));
    if (id && FUNCS[id[0].toLowerCase()]) {
      i += id[0].length;
      if (peek() !== "(") throw new Error(`expected ( after ${id[0]}`);
      i++;
      const args: number[] = [];
      if (peek() !== ")") { args.push(expr()); while (peek() === ",") { i++; args.push(expr()); } }
      if (peek() !== ")") throw new Error("missing )");
      i++;
      return FUNCS[id[0].toLowerCase()](...args);
    }
    throw new Error(`unexpected '${s.slice(i, i + 10)}'`);
  };
  const v = expr();
  if (peek() !== undefined) throw new Error(`unexpected '${s.slice(i, i + 10)}'`);
  if (!isFinite(v)) throw new Error("result is not finite");
  return Math.round(v * 1e6) / 1e6;
}
