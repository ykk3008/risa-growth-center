"use client";
import React from "react";

/** Minimal, safe markdown renderer (no HTML injection): headings, bullets, numbered lists, tables, **bold**, *italic*, `code`. */
function inline(t: string, key: number): React.ReactNode {
  const parts = t.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return <React.Fragment key={key}>{parts.map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("`") && p.endsWith("`") ? <code key={i} className="rounded bg-slate-200 px-1 text-[12px]">{p.slice(1, -1)}</code> : p.length > 2 && p.startsWith("*") && p.endsWith("*") ? <i key={i}>{p.slice(1, -1)}</i> : p)}</React.Fragment>;
}

const LIST = /^\s*([-*•]|\d+\.)\s+/;
const indentOf = (s: string) => s.length - s.trimStart().length;

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      out.push(<div key={k++} className="my-1 overflow-x-auto"><table className="text-xs"><tbody>{rows.map((r, ri) => <tr key={ri} className={ri === 0 ? "font-semibold" : "border-t border-slate-200"}>{r.map((c, ci) => <td key={ci} className="px-1.5 py-0.5 align-top">{inline(c, ci)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (LIST.test(l)) {
      // Collect the list, allowing blank lines between items; indented items become sub-bullets of the item above.
      type It = { text: string; kids: string[] };
      const base = indentOf(l);
      const ordered = /^\s*\d+\./.test(l);
      const startNum = ordered ? parseInt(l.trim(), 10) || 1 : 1;
      const items: It[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (cur.trim() === "") {
          const next = lines.slice(i + 1).find((x) => x.trim() !== "");
          if (next !== undefined && LIST.test(next)) { i++; continue; }
          break;
        }
        if (!LIST.test(cur)) {
          // a wrapped continuation line indented under an item
          if (indentOf(cur) > base && items.length) { items[items.length - 1].kids.push(cur.trim()); i++; continue; }
          break;
        }
        const body = cur.replace(LIST, "");
        if (indentOf(cur) > base && items.length) items[items.length - 1].kids.push(body);
        else items.push({ text: body, kids: [] });
        i++;
      }
      const L = ordered ? "ol" : "ul";
      out.push(<L key={k++} start={ordered ? startNum : undefined} className={`my-1 ml-4 space-y-0.5 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((it, j) => (
        <li key={j}>{inline(it.text, j)}{it.kids.length > 0 && <ul className="ml-4 mt-0.5 list-[circle] space-y-0.5">{it.kids.map((c, ci) => <li key={ci}>{inline(c, ci)}</li>)}</ul>}</li>
      ))}</L>);
      continue;
    }
    if (/^#{1,4}\s/.test(l)) { out.push(<div key={k++} className="mt-2 font-semibold">{inline(l.replace(/^#+\s/, ""), 0)}</div>); i++; continue; }
    if (l.trim() === "") { i++; continue; }
    out.push(<p key={k++} className="my-1 leading-relaxed">{inline(l, 0)}</p>);
    i++;
  }
  return <div>{out}</div>;
}
