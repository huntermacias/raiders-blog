"""End-to-end journeys for the League admin dashboard, against a LOCAL dev server and scratch database.

Same prerequisites as journeys.py (dev server with LEAGUE_ACCOUNTS=on, LEAGUE_DEV_OUTBOX=on, LEAGUE_ADMIN_EMAILS=admin@example.com,
database seeded with scripts/league/dev-seed.ts). Usage: python3 scripts/league/e2e/admin.py [base_url]
"""
import json, os, re, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = ["psql", "-h", "/tmp/pgscratch", "-p", "54329", "-U", "postgres", "-d", "leaguetest", "-tAq", "-c"]
STAMP = str(int(time.time()))[-6:]
PW = "silver sundays forever 77"

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

def sign_up(b, handle, email, vp):
    ctx = b.new_context(viewport=vp); pg = ctx.new_page()
    pg.goto(BASE + "/league/register")
    pg.fill("#rg-handle", handle); pg.fill("#rg-email", email); pg.fill("#rg-pw", PW)
    pg.get_by_role("button", name="Create account").click()
    expect(pg.get_by_text("Check your email").first).to_be_visible(timeout=20000)
    pg.goto(last_link(email)); pg.wait_for_url("**/league/verified*", timeout=20000)
    return ctx, pg

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pctx, ppage = sign_up(b, f"Plain{STAMP}", f"plain{STAMP}@example.com", {"width": 390, "height": 844})
    actx = apage = None

    @step("a signed-in player who is not an admin gets a plain 404, page and API")
    def _():
        r = ppage.goto(BASE + "/league/admin")
        assert r.status == 404, f"page answered {r.status}"
        s = ppage.evaluate("""async () => (await fetch('/api/league/account/admin', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'overview'})})).status""")
        assert s == 404, f"api answered {s}"

    @step("a visitor who is signed out gets the same 404")
    def _():
        c = b.new_context(); pg = c.new_page()
        assert pg.goto(BASE + "/league/admin").status == 404
        s = pg.evaluate("""async () => (await fetch('/api/league/account/admin', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action:'overview'})})).status""")
        assert s == 404; c.close()

    @step("an email on the allow-list is still not an admin until a row exists in the admin table")
    def _():
        global actx, apage
        actx, apage = sign_up(b, f"Boss{STAMP}", "admin@example.com", {"width": 1280, "height": 900}) if not sql("select 1 from \"user\" where email='admin@example.com'") else (None, None)
        if actx is None:
            raise AssertionError("admin@example.com already exists; re-seed the database first")
        assert apage.goto(BASE + "/league/admin").status == 404
        uid = sql("select id from \"user\" where email='admin@example.com'")
        sql(f"insert into league_admins (user_id, added_by) values ('{uid}', 'e2e-setup')")

    @step("the admin sees the dashboard, with tabs that work by keyboard")
    def _():
        apage.goto(BASE + "/league/admin")
        expect(apage.get_by_role("heading", name="Run the League")).to_be_visible(timeout=20000)
        expect(apage.get_by_role("tab", name="Overview")).to_have_attribute("aria-selected", "true")
        expect(apage.get_by_text("Beat the Blogger").first).to_be_visible(timeout=15000)
        apage.get_by_role("tab", name="Overview").focus()
        apage.keyboard.press("ArrowRight")
        expect(apage.get_by_role("tab", name="Games")).to_have_attribute("aria-selected", "true")

    @step("setting a final score needs a reason of ten characters, then regrades and records it")
    def _():
        apage.get_by_role("tab", name="Games").click()
        card = apage.locator("li", has_text="Week 3").first
        expect(card).to_be_visible(timeout=15000)
        card.get_by_role("button", name="Correct score").click()
        form = apage.get_by_role("form", name=re.compile("Set the final score"))
        form.get_by_label(re.compile("score$")).nth(0).fill("31")
        form.get_by_label(re.compile("score$")).nth(1).fill("3")
        confirm = form.get_by_role("button", name="Confirm")
        form.get_by_label(re.compile("Reason")).fill("too short")
        expect(confirm).to_be_disabled()
        form.get_by_label(re.compile("Reason")).fill("Box score showed 31-3 after a stat correction.")
        expect(confirm).to_be_enabled()
        confirm.click()
        expect(card.get_by_text("score set by admin")).to_be_visible(timeout=15000)
        assert sql("select away_score||'-'||home_score from league_events where legacy_prediction_id='dev-g1'") == "31-3"
        assert sql("select count(*) from league_audit_log where action='result.correct'") == "1"

    @step("the board really changed and the old grades are still on record")
    def _():
        n = int(sql("select count(*) from league_grades where event_id=(select id from league_events where legacy_prediction_id='dev-g1')"))
        cur = int(sql("select count(*) from league_current_grades where event_id=(select id from league_events where legacy_prediction_id='dev-g1')"))
        assert n == 2 * cur, f"{n} grades, {cur} current"

    @step("members: search, open a member, remove one of their picks, put it back")
    def _():
        target = sql("select handle from league_players p where exists (select 1 from league_entries e where e.player_id=p.id) order by handle limit 1")
        apage.get_by_role("tab", name="Members").click()
        apage.get_by_label(re.compile("Handle starts with")).fill(target)
        apage.get_by_role("button", name="Search").click()
        apage.get_by_role("button", name=re.compile(f"^{target}")).first.click()
        expect(apage.get_by_role("heading", name=target)).to_be_visible(timeout=15000)
        pick = apage.locator("li", has_text="Week").filter(has=apage.get_by_role("button", name="Remove pick")).first
        pick.get_by_role("button", name="Remove pick").click()
        form = apage.get_by_role("form", name=re.compile("Remove this pick")).first
        form.get_by_label(re.compile("Reason")).fill("Entered by mistake during testing.")
        form.get_by_role("button", name="Confirm").click()
        expect(apage.get_by_text("removed", exact=True).first).to_be_visible(timeout=15000)
        assert sql("select count(*) from league_entries where voided_at is not null") == "1"
        apage.get_by_role("button", name="Put back").first.click()
        form = apage.get_by_role("form", name="Put back").first
        form.get_by_label(re.compile("Reason")).fill("Test finished, restoring the pick.")
        form.get_by_role("button", name="Confirm").click()
        expect(apage.get_by_role("button", name="Put back")).to_have_count(0, timeout=15000)
        assert sql("select count(*) from league_entries where voided_at is not null") == "0"

    @step("rules: versions are shown, bad rules are refused, good rules publish for the future only")
    def _():
        apage.get_by_role("tab", name="Rules").click()
        expect(apage.get_by_text("Version 1").first).to_be_visible(timeout=15000)
        apage.get_by_role("button", name="Publish new rules").first.click()
        form = apage.get_by_role("form", name=re.compile("Publish the next version")).first
        form.get_by_label("Rules (JSON)").fill('{"winner": -5, "margin": [], "exactScore": 1}')
        form.get_by_label(re.compile("Reason")).fill("Trying a bad rule set on purpose.")
        form.get_by_role("button", name="Confirm").click()
        expect(form.get_by_text(re.compile("whole numbers"))).to_be_visible(timeout=15000)
        assert sql("select count(*) from league_scoring_policies where version>1") == "0"

    @step("audit log lists the change with its reason and filters by action")
    def _():
        apage.get_by_role("tab", name="Audit log").click()
        expect(apage.get_by_text("Box score showed 31-3").first).to_be_visible(timeout=15000)
        apage.get_by_label("Action starts with").fill("policy.")
        apage.get_by_role("button", name="Filter").click()
        expect(apage.get_by_text("Nothing matches.")).to_be_visible(timeout=15000)

    @step("every admin tab fits a phone screen without sideways scrolling")
    def _():
        ph = b.new_context(viewport={"width": 390, "height": 844}, storage_state=actx.storage_state()); pg = ph.new_page()
        pg.goto(BASE + "/league/admin"); expect(pg.get_by_role("heading", name="Run the League")).to_be_visible(timeout=20000)
        for t in ["Overview", "Games", "Members", "Rules", "Audit log"]:
            pg.get_by_role("tab", name=t).click(); time.sleep(1.2)
            assert no_overflow(pg), f"{t} overflows on mobile"
        ph.close()

    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} admin journeys passed")
sys.exit(1 if failed else 0)
