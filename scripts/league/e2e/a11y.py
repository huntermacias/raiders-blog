"""Structural accessibility audit of the League pages, against a LOCAL dev server and scratch database.

This is not a replacement for a full audit tool (no colour-contrast or screen-reader testing). It catches the structural
mistakes that break assistive technology: missing names and labels, heading order, duplicate ids, broken aria
references, tiny touch targets, unlabeled tables, missing landmarks.
Usage: python3 scripts/league/e2e/a11y.py [base_url]
"""
import json, os, re, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = ["psql", "-h", "/tmp/pgscratch", "-p", "54329", "-U", "postgres", "-d", "leaguetest", "-tAq", "-c"]
PW = "silver sundays forever 77"

def sql(q):
    return subprocess.run(PSQL + [q], capture_output=True, text=True, check=True).stdout.strip()

AUDIT = """
() => {
  const out = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (e) => {
    const l = e.getAttribute('aria-label'); if (l && l.trim()) return l.trim();
    const lb = e.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(/\\s+/).map(i => document.getElementById(i)?.textContent || '').join(' ').trim(); if (t) return t; }
    if (e.labels && e.labels.length) { const t = Array.from(e.labels).map(x => x.textContent).join(' ').trim(); if (t) return t; }
    const t = (e.textContent || '').trim(); if (t) return t;
    const img = e.querySelector('img[alt]'); if (img && img.alt.trim()) return img.alt.trim();
    const svgt = e.querySelector('svg title'); if (svgt) return svgt.textContent.trim();
    const ti = e.getAttribute('title'); if (ti) return ti.trim();
    return '';
  };
  const h1 = document.querySelectorAll('h1'); if (h1.length !== 1) out.push('expected one h1, found ' + h1.length);
  if (!document.documentElement.lang) out.push('html has no lang');
  if (!document.querySelector('main, [role=main]')) out.push('no main landmark');
  let prev = 0; document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { if (!vis(h)) return; const n = +h.tagName[1]; if (prev && n > prev + 1) out.push('heading jumps h' + prev + ' to h' + n + ': ' + h.textContent.trim().slice(0, 40)); prev = n; });
  const ids = {}; document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; }); Object.keys(ids).forEach(i => { if (ids[i] > 1) out.push('duplicate id ' + i); });
  document.querySelectorAll('img').forEach(i => { if (!i.hasAttribute('alt')) out.push('img without alt: ' + (i.src || '').slice(-40)); });
  document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(e => { if (vis(e) && !name(e)) out.push('unlabeled field: ' + (e.id || e.name || e.type)); });
  document.querySelectorAll('button,[role=button],[role=radio],[role=tab]').forEach(e => { if (vis(e) && !name(e)) out.push('button without name: ' + e.outerHTML.slice(0, 80)); });
  document.querySelectorAll('a[href]').forEach(e => { if (vis(e) && !name(e)) out.push('link without name: ' + e.getAttribute('href')); });
  document.querySelectorAll('[aria-controls]').forEach(e => { e.getAttribute('aria-controls').split(/\\s+/).forEach(i => { if (!document.getElementById(i)) out.push('aria-controls points nowhere: ' + i); }); });
  document.querySelectorAll('[aria-describedby]').forEach(e => { e.getAttribute('aria-describedby').split(/\\s+/).forEach(i => { if (i && !document.getElementById(i)) out.push('aria-describedby points nowhere: ' + i + ' on ' + (e.id || e.tagName)); }); });
  document.querySelectorAll('table').forEach(t => { if (vis(t) && !t.querySelector('caption') && !t.getAttribute('aria-label') && !t.getAttribute('aria-labelledby')) out.push('table without caption'); });
  document.querySelectorAll('[role=radiogroup],[role=tablist],form[aria-label]').forEach(e => { if (!name(e) && e.getAttribute('role')) out.push(e.getAttribute('role') + ' without a name'); });
  if (innerWidth <= 480) document.querySelectorAll('button,[role=radio],[role=tab],input:not([type=hidden]),select').forEach(e => { if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 24) out.push('target under 24px: ' + (name(e) || e.id).slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push('horizontal scroll');
  return out;
}
"""

problems = []
def audit(page, label):
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    found = page.evaluate(AUDIT)
    print(("OK   " if not found else "FAIL ") + label)
    for f in found:
        print("       -", f)
        problems.append((label, f))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    handle = sql("select handle from league_players where legacy_handle_lower is not null order by handle limit 1")
    # A_VP=mobile or A_VP=desktop runs one viewport, for machines where a dev server cannot hold both runs in memory.
    for vpname, vp in [("mobile", {"width": 390, "height": 844}), ("desktop", {"width": 1280, "height": 900})]:
        if os.environ.get("A_VP") and os.environ["A_VP"] != vpname:
            continue
        ctx = b.new_context(viewport=vp); page = ctx.new_page()
        for path in ["/league", "/league/board", "/league/nfl", "/league/nfl?week=5", "/league/nfl/confidence", "/league/nfl/confidence?week=5", "/league/nfl/upsets", "/league/nfl/upsets?week=5", "/league/nfl/share?mode=confidence&week=5&view=board", f"/league/{handle}", "/league/sign-in", "/league/register", "/league/forgot-password", "/league/upgrade"]:
            page.goto(BASE + path); audit(page, f"{vpname} visitor {path}")
        ctx.close()
        # signed-in player and admin
        for who, em in [("player", None), ("admin", "admin@example.com")]:
            if who == "player":
                em = sql("select email from \"user\" where email like 'nfl%@example.com' or email like 'fmt%@example.com' order by \"createdAt\" desc limit 1")
            if not em:
                print("SKIP", who, "(no such account; run nfl.py/admin.py first)"); continue
            ctx = b.new_context(viewport=vp); page = ctx.new_page()
            page.goto(BASE + "/league/sign-in"); page.fill("#si-email", em); page.fill("#si-pw", PW)
            page.get_by_role("button", name="Sign in").click(); page.wait_for_url(re.compile(r".*/league(/.*)?$"), timeout=20000); page.wait_for_load_state("networkidle"); time.sleep(2)
            for path in ["/league", "/league/nfl", "/league/nfl/confidence?week=7", "/league/nfl/upsets?week=7", "/league/nfl/confidence?week=5", "/league/account"] + (["/league/admin"] if who == "admin" else []):
                page.goto(BASE + path); audit(page, f"{vpname} {who} {path}")
            if who == "admin":
                page.goto(BASE + "/league/admin")
                for t in ["Games", "Members", "Rules", "Audit log"]:
                    page.get_by_role("tab", name=t).click(); time.sleep(1.2); audit(page, f"{vpname} admin tab {t}")
            ctx.close()
    b.close()
print(f"\n{len(problems)} problem(s)")
sys.exit(1 if problems else 0)
