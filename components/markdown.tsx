"use client";
import React from "react";

/** Minimal, safe markdown renderer (no HTML injection): headings, bullets, numbered lists, tables, **bold**, *italic*, `code`. */
function inline(t: string, key: number): React.ReactNode {
  const parts = t.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return <React.Fragment key={key}>{parts.map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("`") && p.endsWith("`") ? <code key={i} className="rounded bg-slate-200 px-1 text-[12px]">{p.slice(1, -1)}</code> : p.length > 2 && p.startsWith("*") && p.endsWith("*") ? <i key={i}>{p.slice(1, -1)}</i> : p)}</React.Fragment>;
}

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
    if (/^\s*([-*•]|\d+\.)\s+/.test(l)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\./.test(l);
      while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, "")); i++; }
      const L = ordered ? "ol" : "ul";
      out.push(<L key={k++} className={`my-1 ml-4 space-y-0.5 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</L>);
      continue;
    }
    if (/^#{1,4}\s/.test(l)) { out.push(<div key={k++} className="mt-2 font-semibold">{inline(l.replace(/^#+\s/, ""), 0)}</div>); i++; continue; }
    if (l.trim() === "") { i++; continue; }
    out.push(<p key={k++} className="my-1 leading-relaxed">{inline(l, 0)}</p>);
    i++;
  }
  return <div>{out}</div>;
}
