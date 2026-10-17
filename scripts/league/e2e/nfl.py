"""End-to-end journeys for the public NFL winners league, against a LOCAL dev server and scratch database.

Prerequisites as for journeys.py, with a database seeded by scripts/league/dev-seed.ts (which also seeds the NFL weeks).
Usage: python3 scripts/league/e2e/nfl.py [base_url]
"""
import json, os, re, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = ["psql", "-h", "/tmp/pgscratch", "-p", "54329", "-U", "postgres", "-d", "leaguetest", "-tAq", "-c"]
STAMP = str(int(time.time()))[-6:]
PW = "silver sundays forever 77"
COMP = "nfl-winners-2026"

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

results = []
def step(name):
    def deco(fn):
        try:
            fn(); results.append((name, True, "")); print("PASS", name)
        except Exception as e:  # noqa
            results.append((name, False, str(e)[:400])); print("FAIL", name, "->", str(e)[:400])
    return deco

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    handle, email = f"Nfl{STAMP}", f"nfl{STAMP}@example.com"
    ctx = b.new_context(viewport={"width": 390, "height": 844}); page = ctx.new_page()

    @step("a visitor sees the week, the standings and a way in, but cannot pick")
    def _():
        page.goto(BASE + "/league/nfl")
        expect(page.get_by_role("heading", level=1)).to_contain_text("Pick every winner", timeout=20000)
        expect(page.get_by_role("link", name="Create a free account")).to_be_visible()
        assert no_overflow(page), "overflow on mobile (visitor)"
        radios = page.get_by_role("radio")
        assert radios.count() >= 8
        assert all(radios.nth(i).is_disabled() for i in range(radios.count()))
        s = page.evaluate("""async () => (await fetch('/api/league/account/pick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({competition:'winners', eventId:'00000000-0000-0000-0000-000000000000', payload:{pick:'home'}})})).status""")
        assert s == 401, f"signed-out pick answered {s}"

    @step("a new player signs up, then the NFL page shows their progress")
    def _():
        page.goto(BASE + "/league/register")
        page.fill("#rg-handle", handle); page.fill("#rg-email", email); page.fill("#rg-pw", PW)
        page.get_by_role("button", name="Create account").click()
        expect(page.get_by_text("Check your email").first).to_be_visible(timeout=20000)
        page.goto(last_link(email)); page.wait_for_url("**/league/verified*", timeout=20000)
        page.goto(BASE + "/league/nfl")
        expect(page.get_by_role("heading", level=1)).to_contain_text(handle, timeout=20000)
        expect(page.get_by_text("Make your picks").first).to_be_visible()

    @step("tapping a team saves the pick right away and it survives a reload")
    def _():
        page.goto(BASE + "/league/nfl?week=6")
        groups = page.get_by_role("radiogroup")
        open_group = None
        for i in range(groups.count()):
            g = groups.nth(i)
            if g.get_by_role("radio").first.is_enabled():
                open_group = g; break
        assert open_group is not None, "no open game"
        open_group.get_by_role("radio").nth(1).click()
        card = open_group.locator("xpath=ancestor::li[1]")
        expect(card.get_by_text("Saved")).to_be_visible(timeout=15000)
        expect(open_group.get_by_role("radio").nth(1)).to_have_attribute("aria-checked", "true")
        assert sql(f"select count(*) from league_entries n join league_players p on p.id=n.player_id where p.handle='{handle}' and n.competition_id='{COMP}'") == "1"
        page.reload()
        picked = page.locator("[role=radio][aria-checked=true]")
        assert picked.count() == 1, f"{picked.count()} picks after reload"

    @step("changing a pick keeps the history and the progress bar counts picks")
    def _():
        group = page.locator("[role=radiogroup]:has([role=radio][aria-checked=true])").first
        group.get_by_role("radio").nth(0).click()
        expect(group.locator("xpath=ancestor::li[1]").get_by_text("Saved")).to_be_visible(timeout=15000)
        assert sql(f"select count(*) from league_entry_revisions r join league_entries n on n.id=r.entry_id join league_players p on p.id=n.player_id where p.handle='{handle}'") == "2"
        expect(page.get_by_text(re.compile(r"1 of \d+ open games? picked"))).to_be_visible()

    @step("a locked game cannot be picked, in the page or through the API")
    def _():
        locked = sql("select id from league_events where nfl_game_id like 'dev-nfl-6-0'")
        s = page.evaluate("""async (id) => (await fetch('/api/league/account/pick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({competition:'winners', eventId:id, payload:{pick:'home'}})})).status""", locked)
        assert s == 409, f"locked game answered {s}"
        expect(page.get_by_text("Picks locked").first).to_be_visible()
        expect(page.get_by_text(re.compile(r"\d+ picks")).first).to_be_visible()  # the crowd split shows once locked

    @step("a tampered pick value is refused")
    def _():
        open_id = sql("select id from league_events where nfl_game_id like 'dev-nfl-7-1'")
        s = page.evaluate("""async (id) => (await fetch('/api/league/account/pick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({competition:'winners', eventId:id, payload:{pick:'both'}})})).status""", open_id)
        assert s == 400, f"answered {s}"
        s2 = page.evaluate("""async (id) => (await fetch('/api/league/account/pick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({competition:'winners', eventId:id, payload:{away:20, home:10}})})).status""", open_id)
        assert s2 == 400, f"score payload answered {s2}"

    @step("last week shows results, outcomes and the standings")
    def _():
        page.goto(BASE + "/league/nfl?week=5")
        expect(page.get_by_text("Final").first).to_be_visible(timeout=15000)
        expect(page.get_by_role("table").first).to_be_visible()
        expect(page.get_by_text("Weekly champions")).to_be_visible()
        assert no_overflow(page), "overflow on mobile (week 5)"

    @step("week links move between weeks")
    def _():
        page.goto(BASE + "/league/nfl")
        page.get_by_role("navigation", name="Choose a week").get_by_role("link", name="7").click()
        page.wait_for_url("**week=7", timeout=15000)
        expect(page.locator("#picks-h")).to_have_text("Week 7")

    @step("switched off, the whole league answers 404 and the home page stops advertising it")
    def _():
        sql(f"update league_competitions set enabled=false where id='{COMP}'")
        try:
            assert page.goto(BASE + "/league/nfl").status == 404
            page.goto(BASE + "/league")
            expect(page.get_by_text("Coming soon").first).to_be_visible(timeout=15000)
        finally:
            sql(f"update league_competitions set enabled=true where id='{COMP}'")

    @step("desktop layout has no sideways scrolling either")
    def _():
        d = b.new_context(viewport={"width": 1280, "height": 900}); pg = d.new_page()
        pg.goto(BASE + "/league/nfl"); expect(pg.get_by_role("heading", level=1)).to_be_visible(timeout=20000)
        assert no_overflow(pg); d.close()

    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} NFL journeys passed")
sys.exit(1 if failed else 0)
