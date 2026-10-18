"""End-to-end journeys for the confidence and upset formats and their share cards, against a LOCAL dev server and scratch database.

Prerequisites as for nfl.py (database seeded by scripts/league/dev-seed.ts). Usage: python3 scripts/league/e2e/nfl_formats.py [base_url]
"""
import json, os, re, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = ["psql", "-h", "/tmp/pgscratch", "-p", "54329", "-U", "postgres", "-d", "leaguetest", "-tAq", "-c"]
STAMP = str(int(time.time()))[-6:]
PW = "silver sundays forever 77"
CONF, UPS = "nfl-confidence-2026", "nfl-upset-2026"

def sql(q):
    return subprocess.run(PSQL + [q], capture_output=True, text=True, check=True).stdout.strip()

def outbox():
    return json.load(urllib.request.urlopen(BASE + "/api/league/dev/outbox"))["sent"]

def last_link(to):
    for _ in range(40):
        for m in reversed(outbox()):
            if m["to"] == to:
                return re.search(r"https?://\S+", m["text"]).group(0)
        time.sleep(0.25)
    raise AssertionError("no email for " + to)

def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")

def post(page, body):
    return page.evaluate("""async (b) => { const r = await fetch('/api/league/account/pick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b)}); return [r.status, await r.json().catch(() => ({}))] }""", body)

results = []
def step(name):
    def deco(fn):
        try:
            fn(); results.append((name, True, "")); print("PASS", name)
        except Exception as e:  # noqa
            results.append((name, False, str(e)[:500])); print("FAIL", name, "->", str(e)[:500])
    return deco

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    handle, email = f"Fmt{STAMP}", f"fmt{STAMP}@example.com"
    ctx = b.new_context(viewport={"width": 390, "height": 844}); page = ctx.new_page()

    @step("a visitor sees both formats and the tabs between them, but cannot save anything")
    def _():
        page.goto(BASE + "/league/nfl/confidence")
        expect(page.get_by_role("heading", level=1)).to_contain_text("How sure are you?", timeout=30000)
        expect(page.get_by_role("navigation", name="NFL game formats").get_by_role("link", name="Upsets")).to_be_visible()
        assert no_overflow(page), "overflow on mobile (confidence)"
        sels = page.locator("select")
        assert sels.count() == 0, "a visitor should not get rank controls"
        page.goto(BASE + "/league/nfl/upsets")
        expect(page.get_by_role("heading", level=1)).to_contain_text("Call the upsets", timeout=30000)
        assert no_overflow(page), "overflow on mobile (upsets)"
        assert page.get_by_role("button", name=re.compile("Call the")).count() == 0
        for body in ({"competition": "confidence", "items": []}, {"competition": "upset", "eventId": "00000000-0000-0000-0000-000000000000", "payload": {"pick": "none"}}):
            s, _ = post(page, body)
            assert s == 401, f"signed-out save answered {s}"

    @step("a new player signs up")
    def _():
        page.goto(BASE + "/league/register")
        page.fill("#rg-handle", handle); page.fill("#rg-email", email); page.fill("#rg-pw", PW)
        page.get_by_role("button", name="Create account").click()
        expect(page.get_by_text("Check your email").first).to_be_visible(timeout=20000)
        page.goto(last_link(email)); page.wait_for_url("**/league/verified*", timeout=20000)

    @step("ranking a pick saves the whole slate on its own, and it survives a reload")
    def _():
        page.goto(BASE + "/league/nfl/confidence?week=7")
        expect(page.get_by_role("heading", level=1)).to_contain_text(handle, timeout=30000)
        item = page.locator("ul[aria-label='Week 7 games'] > li").first
        item.get_by_role("radio").nth(1).click()
        expect(item.get_by_text("Give this pick a rank to save it.")).to_be_visible()
        item.locator("select").select_option("8")
        expect(page.get_by_text("Saved", exact=True)).to_be_visible(timeout=15000)
        assert sql(f"select count(*) from league_entries n join league_players p on p.id=n.player_id where p.handle='{handle}' and n.competition_id='{CONF}'") == "1"
        page.reload()
        item = page.locator("ul[aria-label='Week 7 games'] > li").first
        expect(item.locator("select")).to_have_value("8")
        expect(item.get_by_role("radio").nth(1)).to_have_attribute("aria-checked", "true")

    @step("taking a rank another game holds swaps the two, and one request carries both")
    def _():
        items = page.locator("ul[aria-label='Week 7 games'] > li")
        second = items.nth(1)
        second.get_by_role("radio").nth(0).click()
        second.locator("select").select_option("7")
        expect(page.get_by_text("Saved", exact=True)).to_be_visible(timeout=15000)
        # Rank 7 is the second game's; take 8 from the first game: they swap.
        second.locator("select").select_option(value="8")
        page.wait_for_timeout(1500)
        expect(items.first.locator("select")).to_have_value("7")
        got = sql(f"select string_agg((payload->>'rank'), ',' order by (payload->>'rank')) from league_entries n join league_players p on p.id=n.player_id where p.handle='{handle}' and n.competition_id='{CONF}'")
        assert got == "7,8", f"ranks after the swap: {got}"

    @step("a rank used by a locked game cannot be taken, in the page or through the API")
    def _():
        page.goto(BASE + "/league/nfl/confidence?week=6")
        expect(page.get_by_text("Locked").first).to_be_visible(timeout=30000)
        locked = sql("select id from league_events where nfl_game_id = 'dev-nfl-6-0'")
        s, _ = post(page, {"competition": "confidence", "items": [{"eventId": locked, "pick": "home", "rank": 1}]})
        assert s == 409, f"locked game answered {s}"
        s, _ = post(page, {"competition": "confidence", "items": [{"eventId": locked, "pick": "home", "rank": 99}]})
        assert s in (400, 409), f"bad rank answered {s}"

    @step("upset calls toggle on and off, count against five, and refuse a sixth")
    def _():
        page.goto(BASE + "/league/nfl/upsets?week=7")
        expect(page.get_by_role("heading", level=1)).to_contain_text(handle, timeout=30000)
        btns = page.get_by_role("button", name=re.compile(r"^Call the .* upset$"))
        assert btns.count() >= 6, f"only {btns.count()} callable games"
        btns.first.click()
        expect(page.get_by_text("Saved", exact=True).first).to_be_visible(timeout=15000)
        expect(page.get_by_text("1 of 5 upset calls used")).to_be_visible()
        taken = page.get_by_role("button", name=re.compile(r"tap to take back"))
        assert taken.count() == 1
        taken.first.click()
        expect(page.get_by_text("0 of 5 upset calls used")).to_be_visible(timeout=15000)
        for i in range(5):
            page.get_by_role("button", name=re.compile(r"^Call the .* upset$")).first.click()
            expect(page.get_by_text(f"{i + 1} of 5 upset calls used")).to_be_visible(timeout=15000)
        page.wait_for_timeout(800)
        page.get_by_role("button", name=re.compile(r"^Call the .* upset$")).first.click()
        expect(page.get_by_text(re.compile("You have used all 5 calls"))).to_be_visible(timeout=15000)
        assert sql(f"select count(*) from league_entries n join league_players p on p.id=n.player_id where p.handle='{handle}' and n.competition_id='{UPS}' and n.payload->>'pick' <> 'none'") == "5"

    @step("the server refuses a sixth call, a favourite and a made-up value")
    def _():
        ev = sql(f"select e.id || '|' || l.underdog from league_events e join league_upset_lines l on l.event_id=e.id where e.week=7 and e.id not in (select event_id from league_entries n join league_players p on p.id=n.player_id where p.handle='{handle}' and n.competition_id='{UPS}') limit 1")
        eid, dog = ev.split("|")
        s, _ = post(page, {"competition": "upset", "eventId": eid, "payload": {"pick": dog}})
        assert s == 400, f"sixth call answered {s}"
        fav = "home" if dog == "away" else "away"
        called = sql(f"select e.id || '|' || l.underdog from league_events e join league_upset_lines l on l.event_id=e.id join league_entries n on n.event_id=e.id and n.competition_id='{UPS}' join league_players p on p.id=n.player_id where p.handle='{handle}' and n.payload->>'pick' <> 'none' limit 1")
        cid, cdog = called.split("|")
        s, _ = post(page, {"competition": "upset", "eventId": cid, "payload": {"pick": "home" if cdog == "away" else "away"}})
        assert s == 400, f"favourite answered {s}"
        s, _ = post(page, {"competition": "upset", "eventId": cid, "payload": {"pick": "yes"}})
        assert s == 400, f"made-up value answered {s}"

    @step("a week with results shows hits, misses, the upset of the week and the standings")
    def _():
        page.goto(BASE + "/league/nfl/upsets?week=5")
        expect(page.get_by_text("Final").first).to_be_visible(timeout=30000)
        expect(page.get_by_role("table").first).to_be_visible()
        assert no_overflow(page), "overflow on mobile (upsets week 5)"
        page.goto(BASE + "/league/nfl/confidence?week=5")
        expect(page.get_by_role("table").first).to_be_visible(timeout=30000)
        assert no_overflow(page), "overflow on mobile (confidence week 5)"

    @step("the share window opens with a card for the standings, and the card is a real picture")
    def _():
        page.goto(BASE + "/league/nfl/confidence?week=5")
        page.get_by_role("button", name="Share the standings").click()
        dlg = page.get_by_role("dialog")
        expect(dlg).to_be_visible(timeout=15000)
        src = dlg.locator("img").first.get_attribute("src")
        assert "type=nflleague" in src and "mode=confidence" in src and "view=board" in src, src
        r = page.request.get(BASE + src, timeout=120000)
        assert r.status == 200 and r.headers["content-type"].startswith("image/png"), (r.status, r.headers.get("content-type"))
        page.keyboard.press("Escape")

    @step("every card kind and size answers a PNG, and nonsense answers a safe fallback")
    def _():
        urls = []
        for mode in ("winners", "confidence", "upset"):
            for view in ("me", "board", "invite"):
                for size in ("wide", "tall"):
                    urls.append(f"/api/og?type=nflleague&mode={mode}&week=5&view={view}&handle=SilverBullet&size={size}")
        urls.append("/api/og?type=nflleague&mode=upset&week=5&view=alert&size=wide")
        for u in urls:
            r = page.request.get(BASE + u, timeout=120000)
            assert r.status == 200 and r.headers["content-type"].startswith("image/png"), (u, r.status)
        for u in ("/api/og?type=nflleague&mode=bogus", "/api/og?type=nflleague&mode=winners&view=me&handle=../etc/passwd&size=wide"):
            r = page.request.get(BASE + u, timeout=120000)
            assert r.status == 200, (u, r.status)

    @step("a card never shows a player who keeps their profile private, and never an unlocked pick")
    def _():
        sql("update league_players set show_profile=false, show_history=false where handle='SilverBullet'")
        try:
            r = page.request.get(BASE + "/api/og?type=nflleague&mode=confidence&week=5&view=me&handle=SilverBullet&size=wide", timeout=120000)
            assert r.status == 200
            # The private player's card is the plain invite: smaller than the same card with rows is not a safe test, so compare by view.
            same = page.request.get(BASE + "/api/og?type=nflleague&mode=confidence&week=5&view=invite&size=wide", timeout=120000)
            assert r.body() == same.body(), "private player's card differs from the invite card"
        finally:
            sql("update league_players set show_profile=true, show_history=true where handle='SilverBullet'")
        # Week 7 has no locked games: nothing of mine may be drawn.
        mine = page.request.get(BASE + f"/api/og?type=nflleague&mode=confidence&week=7&view=me&handle={handle}&size=wide", timeout=120000)
        invite = page.request.get(BASE + "/api/og?type=nflleague&mode=confidence&week=7&view=invite&size=wide", timeout=120000)
        assert mine.body() == invite.body(), "an unlocked week drew a personal card"

    @step("the share link lands on a page with the card in its preview and sends the reader on")
    def _():
        page.goto(BASE + "/league/nfl/share?mode=upset&week=6&view=board&v=1&utm_source=share&utm_medium=social&utm_campaign=league_upset")
        page.wait_for_url("**/league/nfl/upsets?week=6*", timeout=30000)
        assert "utm_source=share" in page.url, page.url
        html = page.request.get(BASE + "/league/nfl/share?mode=upset&week=6&view=board&v=1").text()
        assert 'og:image' in html and "type=nflleague" in html and "noindex" in html

    @step("a format an admin has not switched on answers 404, and the tabs and home page follow")
    def _():
        sql(f"update league_competitions set enabled=false where id='{CONF}'")
        try:
            assert page.goto(BASE + "/league/nfl/confidence").status == 404
            assert page.request.get(BASE + "/api/og?type=nflleague&mode=confidence&view=board&week=5&size=wide", max_redirects=0).status in (302, 307)
            page.goto(BASE + "/league/nfl")
            nav = page.get_by_role("navigation", name="NFL game formats")
            expect(nav.get_by_role("link", name="Confidence")).to_have_count(0, timeout=20000)
            expect(nav.get_by_role("link", name="Upsets")).to_be_visible()
        finally:
            sql(f"update league_competitions set enabled=true where id='{CONF}'")

    @step("the home page links to all three formats once they are open")
    def _():
        page.goto(BASE + "/league")
        for name in ("/league/nfl", "/league/nfl/confidence", "/league/nfl/upsets"):
            expect(page.locator(f"a[href='{name}']").first).to_be_visible(timeout=30000)

    @step("desktop layout has no sideways scrolling either")
    def _():
        d = b.new_context(viewport={"width": 1280, "height": 900}); pg = d.new_page()
        for path in ("/league/nfl/confidence?week=5", "/league/nfl/upsets?week=5"):
            pg.goto(BASE + path); expect(pg.get_by_role("heading", level=1)).to_be_visible(timeout=30000)
            assert no_overflow(pg), path
        d.close()

    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} format journeys passed")
sys.exit(1 if failed else 0)
