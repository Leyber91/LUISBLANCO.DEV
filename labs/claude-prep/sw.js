/* Blueprint 720 service worker 775745de0ea6: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-775745de0ea6";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-CG73UDlS.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-BvWGkdTy.js","/labs/claude-prep/assets/Breadcrumbs-C0Xu-tpt.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Card-D3uZ0UzV.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-vdQANRsE.js","/labs/claude-prep/assets/CoursePage-fU3bN6gm.js","/labs/claude-prep/assets/ExtraPage-wJ9ZDNcz.js","/labs/claude-prep/assets/FlashcardsHome-KEHdpSkM.js","/labs/claude-prep/assets/GuidePage-tuFikRLl.js","/labs/claude-prep/assets/GuidesIndex-ByAmPzn6.js","/labs/claude-prep/assets/HomePage-CK60a66d.js","/labs/claude-prep/assets/HomePage-CliqgeEs.css","/labs/claude-prep/assets/LabPage-Gd9mLVPN.js","/labs/claude-prep/assets/LabsHome-BvTqryAc.js","/labs/claude-prep/assets/LessonPage-2F2QmlC5.css","/labs/claude-prep/assets/LessonPage-Cgth6qag.js","/labs/claude-prep/assets/ListenBar-CNPnxawv.css","/labs/claude-prep/assets/ListenBar-CbJw_xgx.js","/labs/claude-prep/assets/ModulePage-CqSzdN7R.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-DZ4gNuiR.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-CPgbpV9_.js","/labs/claude-prep/assets/PlanPage-C9QDxy6l.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/PracticeHub-CB2XU8RF.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-C3k1z8gq.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressPage-DK-CNaLv.js","/labs/claude-prep/assets/ProgressRing-BJozwX_n.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-DljDeIKQ.js","/labs/claude-prep/assets/Results-C6soP45_.css","/labs/claude-prep/assets/Results-C9YuhiVA.js","/labs/claude-prep/assets/Review-B3tvvt6g.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-CL0dMsY0.js","/labs/claude-prep/assets/SessionRunner-DW7crHbT.js","/labs/claude-prep/assets/SessionRunner-EVVDBagj.css","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/SettingsPage-DNeWISPq.js","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-Dkaw_2hY.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/StatusChip-D_WGo0O1.js","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-C7Jo4cOs.js","/labs/claude-prep/assets/chevron-right-BXOFy7KP.js","/labs/claude-prep/assets/clock-W6BVaDjh.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-DGaIRCs1.js","/labs/claude-prep/assets/eye-BIC_w_fU.js","/labs/claude-prep/assets/file-text-DNn2Dqcr.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-BVlMHK5z.js","/labs/claude-prep/assets/gauge-CCSCA2wI.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-CP0vUxlG.js","/labs/claude-prep/assets/index-BW1plUG6.js","/labs/claude-prep/assets/index-BWhqVjN1.css","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-NGjBCVh4.js","/labs/claude-prep/assets/link-2-ecymEwwK.js","/labs/claude-prep/assets/list-checks-CfU5uoO1.js","/labs/claude-prep/assets/map-DGhDQGWh.js","/labs/claude-prep/assets/official-DWhEyeJs.js","/labs/claude-prep/assets/play-BgeA4JsU.js","/labs/claude-prep/assets/printer-S5CMob6d.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-Ca3922YB.js","/labs/claude-prep/assets/rotate-ccw-clock-DXyR4bTU.js","/labs/claude-prep/assets/sessions-BDw_uTfm.js","/labs/claude-prep/assets/shared-C9-eU8qa.js","/labs/claude-prep/assets/shared-DRmFlujv.js","/labs/claude-prep/assets/sparkles-bqPl6chE.js","/labs/claude-prep/assets/timer-DOHg9gJ4.js","/labs/claude-prep/assets/useScrollSpy-B_t_iRpT.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useSessions-BRzD42Wm.js","/labs/claude-prep/assets/zap-DG6cVh26.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("b720-") && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (req.mode === "navigate") {
    // Network first, so a new version shows as soon as it's published; the cached shell offline.
    event.respondWith(fetch(req).catch(() => caches.match(BASE + "index.html", { ignoreSearch: true })));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
