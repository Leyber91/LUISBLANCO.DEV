/* Blueprint 720 service worker 5497a05830a1: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-5497a05830a1";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-BOPqlzGR.js","/labs/claude-prep/assets/Badge-Bjns_Fpj.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-CjptnLsw.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Card-DxPFhe1g.js","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-DGL2A_tA.js","/labs/claude-prep/assets/CoursePage-q35oYDpF.js","/labs/claude-prep/assets/ExtraPage-D4A92pGC.js","/labs/claude-prep/assets/FlashcardsHome-Cr5jtafj.js","/labs/claude-prep/assets/GuidePage-BIYAi2a3.js","/labs/claude-prep/assets/GuidesIndex-C-pqoDkW.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-Ctbl-yMt.js","/labs/claude-prep/assets/LabPage-7l5CUmY3.js","/labs/claude-prep/assets/LabsHome-CtUURERl.js","/labs/claude-prep/assets/LessonPage-BxWSBcP1.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ListenBar-DKVhVR27.js","/labs/claude-prep/assets/ListenBar-kNZkOGTO.css","/labs/claude-prep/assets/ModulePage-BqvCbYqQ.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-DNuF63cd.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-BetRm5q8.js","/labs/claude-prep/assets/PlanPage-C0ke_gXb.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/PracticeHub-Cu5Y39vG.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-DP-wWtN0.js","/labs/claude-prep/assets/ProgressPage-BFQ9Co3d.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-Ch476SiG.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-Dn4tQYUp.js","/labs/claude-prep/assets/Results-B_WioC-9.css","/labs/claude-prep/assets/Results-CpD3ncgf.js","/labs/claude-prep/assets/Review-DaRZLW5L.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-wJv0e008.js","/labs/claude-prep/assets/SessionRunner-CGyw9Upc.js","/labs/claude-prep/assets/SessionRunner-sO46mvvv.css","/labs/claude-prep/assets/SettingsPage-BmlB43jM.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-CuCRvlp4.js","/labs/claude-prep/assets/StatusChip-CATTtIO6.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-HNBpr8z2.js","/labs/claude-prep/assets/chevron-right-sFsBmxTl.js","/labs/claude-prep/assets/clock-By4bTxNV.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-BCK4XM7D.js","/labs/claude-prep/assets/eye-DydEXaeY.js","/labs/claude-prep/assets/file-text-BjYEw2mi.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-C3TTAENW.js","/labs/claude-prep/assets/gauge-CyToc8VN.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-DvrpWhrt.js","/labs/claude-prep/assets/index-CMmp_RtJ.css","/labs/claude-prep/assets/index-Ck6itVV3.js","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-xtuV-2So.js","/labs/claude-prep/assets/link-2-B5paUqSM.js","/labs/claude-prep/assets/list-checks-PGtb2foq.js","/labs/claude-prep/assets/map--69bfC6X.js","/labs/claude-prep/assets/official-BajH0xM4.js","/labs/claude-prep/assets/play-B7U0j4AU.js","/labs/claude-prep/assets/printer-DDIyaRbs.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-Dk1GhDZu.js","/labs/claude-prep/assets/rotate-ccw-clock-rkUBRsA9.js","/labs/claude-prep/assets/sessions-CbWM7rx6.js","/labs/claude-prep/assets/shared-DI9dilQe.js","/labs/claude-prep/assets/shared-Du_kHJQ3.js","/labs/claude-prep/assets/sparkles-CiHR0s8H.js","/labs/claude-prep/assets/timer-CrMbcTCp.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-Dss9MRxY.js","/labs/claude-prep/assets/useSessions-CeRXRklk.js","/labs/claude-prep/assets/zap-D88McJ3u.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
