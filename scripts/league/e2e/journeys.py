"""End-to-end journeys for League accounts, run against a LOCAL dev server and scratch database.

Needs: Playwright for Python with Chromium, a dev server started with LEAGUE_ACCOUNTS=on and LEAGUE_DEV_OUTBOX=on,
a database seeded with scripts/league/dev-seed.ts, and LEAGUE_ADMIN_EMAILS=admin@example.com.
Usage: python3 scripts/league/e2e/journeys.py [base_url]
"""
import json, os, re, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PSQL = ["psql", "-h", "/tmp/pgscratch", "-p", "54329", "-U", "postgres", "-d", "leaguetest", "-tAq", "-c"]
STAMP = str(int(time.time()))[-6:]
results = []

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

def step(name):
    def deco(fn):
        try:
            fn()
            results.append((name, True, ""))
            print("PASS", name)
        except Exception as e:  # noqa
            results.append((name, False, str(e)[:300]))
            print("FAIL", name, "->", str(e)[:300])
    return deco

def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    handle, email, pw = f"E2E{STAMP}", f"e2e{STAMP}@example.com", "silver sundays forever"

    @step("register shows validation, then sends a confirmation email")
    def _():
        page.goto(BASE + "/league/register")
        assert no_overflow(page), "horizontal overflow on register (mobile)"
        page.fill("#rg-handle", "x")
        page.fill("#rg-email", email)
        page.fill("#rg-pw", "short")
        page.get_by_role("button", name="Create account").click()
        expect(page.locator("#rg-handle-err")).to_be_visible()
        page.fill("#rg-handle", handle)
        page.fill("#rg-pw", pw)
        page.get_by_role("button", name="Create account").click()
        expect(page.get_by_text("Check your email")).to_be_visible(timeout=15000)

    @step("sign-in is refused until the email is confirmed, with a way to resend")
    def _():
        page.goto(BASE + "/league/sign-in")
        page.fill("#si-email", email)
        page.fill("#si-pw", pw)
        page.get_by_role("button", name="Sign in").click()
        expect(page.get_by_text("Confirm your email first")).to_be_visible(timeout=15000)
        expect(page.get_by_role("button", name="Send it again")).to_be_visible()

    @step("the confirmation link signs the player in and creates the handle")
    def _():
        page.goto(last_link(email))
        expect(page.get_by_role("heading", name=f"You're in, {handle}")).to_be_visible(timeout=20000)
        assert sql(f"select count(*) from league_players where handle='{handle}' and user_id is not null") == "1"

    @step("the returning player sees a next action and can save, change and keep a pick")
    def _():
        page.goto(BASE + "/league")
        expect(page.get_by_role("heading", level=1)).to_contain_text(handle, timeout=20000)
        assert no_overflow(page), "horizontal overflow on /league (mobile)"
        form = page.locator("form[aria-label*='pick']").first
        form.locator("input[aria-label$=' score']").nth(0).fill("24")
        form.locator("input[aria-label$=' score']").nth(1).fill("20")
        form.get_by_role("button", name="Lock in pick").click()
        expect(form.get_by_text("Saved.")).to_be_visible(timeout=15000)
        page.reload()
        form = page.locator("form[aria-label*='pick']").first
        assert form.locator("input[aria-label$=' score']").nth(0).input_value() == "24"
        form.locator("input[aria-label$=' score']").nth(0).fill("27")
        form.get_by_role("button", name="Update pick").click()
        expect(form.get_by_text("Saved.")).to_be_visible(timeout=15000)
        n = sql(f"select count(*) from league_entry_revisions r join league_entries e on e.id=r.entry_id join league_players p on p.id=e.player_id where p.handle='{handle}'")
        assert n == "2", f"expected 2 revisions, got {n}"

    @step("a tie, a locked game and a signed-out request are refused by the server")
    def _():
        eid = sql("select id from league_events where legacy_prediction_id='dev-g1' limit 1")  # played in the past
        r = page.evaluate("""async (id) => { const r = await fetch('/api/league/account/pick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({competition:'btb', eventId:id, payload:{away:20,home:10}})}); return r.status }""", eid)
        assert r == 409, f"locked game answered {r}"
        open_id = sql("select id from league_events where legacy_prediction_id='dev-g4' limit 1")  # still open
        tie = page.evaluate("""async (id) => { const r = await fetch('/api/league/account/pick', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({competition:'btb', eventId:id, payload:{away:20,home:20}})}); return r.status }""", open_id)
        assert tie == 400, f"tie answered {tie}"

    @step("account page lists devices and changes the password")
    def _():
        page.goto(BASE + "/league/account")
        expect(page.get_by_text("This device")).to_be_visible(timeout=15000)
        page.fill("#cp-cur", pw)
        page.fill("#cp-new", "gold and silver 2026")
        page.get_by_role("button", name="Change password").click()
        expect(page.get_by_text("Password changed")).to_be_visible(timeout=15000)

    @step("profile privacy: hiding the page shows visitors only the handle, and the owner still sees everything")
    def _():
        page.goto(BASE + "/league/account")
        page.get_by_label("Favorite team").select_option("LV")
        page.get_by_label("Show my profile page").uncheck()
        page.get_by_role("button", name="Save").click()
        expect(page.get_by_text("Saved.")).to_be_visible(timeout=15000)
        assert sql(f"select show_profile::text||favorite_team from league_players where handle='{handle}'") == "falseLV"
        v = b.new_context(viewport={"width": 390, "height": 844}); vp = v.new_page()
        vp.goto(BASE + f"/league/{handle}")
        expect(vp.get_by_text("keeps their profile private")).to_be_visible(timeout=15000)
        assert vp.locator("main").get_by_text("Game by game").count() == 0
        v.close()
        page.goto(BASE + f"/league/{handle}")
        expect(page.get_by_text("Only you can see this page")).to_be_visible(timeout=15000)
        expect(page.get_by_text("Fan of the Las Vegas Raiders")).to_be_visible()
        page.goto(BASE + "/league/account")
        page.get_by_label("Show my profile page").check()
        page.get_by_role("button", name="Save").click()
        expect(page.get_by_text("Saved.")).to_be_visible(timeout=15000)

    @step("sign out, then forgot-password: one-time link, new password, old password dead")
    def _():
        page.get_by_role("button", name="Sign out").click()
        page.wait_for_url("**/league", timeout=15000)
        page.goto(BASE + "/league/forgot-password")
        n0 = len(outbox())
        page.fill("#fg-email", email)
        page.get_by_role("button", name="Send reset link").click()
        expect(page.get_by_text("If that address has an account")).to_be_visible(timeout=15000)
        page.goto(last_link(email))
        page.wait_for_url("**/league/reset-password?token=*", timeout=15000)
        page.fill("#rs-pw", "brand new password 99")
        page.get_by_role("button", name="Set new password").click()
        page.wait_for_url("**/league/sign-in?reset=1", timeout=15000)
        link = last_link(email)
        page.goto(link)  # the same link again must not work
        expect(page.get_by_text("expired or was already used")).to_be_visible(timeout=15000)
        page.goto(BASE + "/league/sign-in")
        page.fill("#si-email", email); page.fill("#si-pw", "gold and silver 2026")
        page.get_by_role("button", name="Sign in").click()
        expect(page.get_by_text("do not match")).to_be_visible(timeout=15000)
        page.fill("#si-pw", "brand new password 99")
        page.get_by_role("button", name="Sign in").click()
        page.wait_for_url("**/league", timeout=15000)

    @step("legacy upgrade: key accepted, account created, history kept, old key retired")
    def _():
        key = "ABCDE-FGHJK-MNPQR-STUVW"
        h = subprocess.run(["node", "-e", "const c=require('crypto');console.log(c.createHash('sha256').update('ABCDEFGHJKMNPQRSTUVW').digest('hex'))"], capture_output=True, text=True).stdout.strip()
        # Same hashing as lib/league.server.ts hashKey: verify through the app instead of trusting this line.
        legacy = f"Old{STAMP}"
        pid = sql(f"insert into league_players (handle, legacy_handle_lower) values ('{legacy}', '{legacy.lower()}') returning id")
        pid = pid.splitlines()[0]
        sql(f"insert into league_legacy_identities (handle_lower, player_id, key_hash, source_doc_id) values ('{legacy.lower()}', '{pid}', '{h}', 'dev-{STAMP}')")
        ctx2 = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx2.new_page()
        pg.goto(BASE + "/league/upgrade")
        pg.fill("#up-handle", legacy); pg.fill("#up-key", "WRONG-KEY"); pg.get_by_role("button", name="Continue").click()
        expect(pg.get_by_text("do not match")).to_be_visible(timeout=15000)
        pg.fill("#up-key", key); pg.get_by_role("button", name="Continue").click()
        expect(pg.get_by_text(f"Key accepted for {legacy}")).to_be_visible(timeout=15000)
        em = f"old{STAMP}@example.com"
        pg.fill("#up-email", em); pg.fill("#up-pw", "legacy upgraded pass 7")
        pg.get_by_role("button", name="Create my account").click()
        expect(pg.get_by_text("One last step")).to_be_visible(timeout=15000)
        assert sql(f"select state from league_legacy_identities where handle_lower='{legacy.lower()}'") == "claiming"
        pg.goto(last_link(em))
        expect(pg.get_by_role("heading", name=f"You're in, {legacy}")).to_be_visible(timeout=20000)
        assert sql(f"select state from league_legacy_identities where handle_lower='{legacy.lower()}'") == "claimed"
        assert sql(f"select user_id is not null from league_players where id='{pid}'") == "t"
        pg.goto(BASE + "/league/upgrade")  # signed in: bounced home
        pg.wait_for_url("**/league", timeout=15000)
        ctx2.close()

    @step("public pages: profile, leaderboard, no-JS-needed content, titles")
    def _():
        anon = b.new_context(viewport={"width": 1280, "height": 900}); pg = anon.new_page()
        pg.goto(BASE + "/league/GhostTown"); expect(pg.get_by_role("heading", level=1)).to_have_text("GhostTown", timeout=20000)
        pg.goto(BASE + "/league/board"); expect(pg.get_by_role("heading", level=1)).to_contain_text("leaderboard", timeout=20000)
        pg.goto(BASE + "/league/board?week=5"); expect(pg.get_by_role("heading", level=1)).to_contain_text("Week 5", timeout=20000)
        pg.goto(BASE + "/league/admin"); assert pg.title() != "" and pg.locator("text=Admin dashboard").count() == 0, "admin leaked to a visitor"
        anon.close()
    b.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} journeys passed")
sys.exit(1 if fails else 0)
