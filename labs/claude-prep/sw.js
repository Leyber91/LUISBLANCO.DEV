/* Blueprint 720 service worker 16f538cce546: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-16f538cce546";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-nJsdysfC.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-YTck6uRV.js","/labs/claude-prep/assets/Breadcrumbs-BoBznxRT.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Card-DyHA71U-.js","/labs/claude-prep/assets/Checkbox-0xjG1HRT.js","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/CoursePage-CflcSHvv.js","/labs/claude-prep/assets/ExtraPage-BiZwCXnp.js","/labs/claude-prep/assets/FlashcardsHome-D2VLW7l0.js","/labs/claude-prep/assets/GuidePage-5C0tk5pU.js","/labs/claude-prep/assets/GuidesIndex-GrOuZFK3.js","/labs/claude-prep/assets/HomePage-CliqgeEs.css","/labs/claude-prep/assets/HomePage-DgUI36Uq.js","/labs/claude-prep/assets/LabPage-CihH60rf.js","/labs/claude-prep/assets/LabsHome-CN3TNNi_.js","/labs/claude-prep/assets/LessonPage-2F2QmlC5.css","/labs/claude-prep/assets/LessonPage-TRQMvgp4.js","/labs/claude-prep/assets/ListenBar-BelOUtDE.js","/labs/claude-prep/assets/ListenBar-CNPnxawv.css","/labs/claude-prep/assets/ModulePage-CZw0bvPQ.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-DMUFRx9l.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-zPByI7dR.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PlanPage-mdvrYAS9.js","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/PracticeHub-CXDXngxo.js","/labs/claude-prep/assets/ProgressBar-BIHtR0ZN.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressPage-D_lSnPt8.js","/labs/claude-prep/assets/ProgressRing-Bqah1Fc5.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-BchYETow.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/Results-C6soP45_.css","/labs/claude-prep/assets/Results-dF2tNRah.js","/labs/claude-prep/assets/Review-CL4NPEIt.js","/labs/claude-prep/assets/Segmented-BO6kWdSq.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/SessionRunner-EVVDBagj.css","/labs/claude-prep/assets/SessionRunner-cop5HqUN.js","/labs/claude-prep/assets/SettingsPage-B2TvFq4s.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-C4rqhHxc.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/StatusChip-DxgZz0pL.js","/labs/claude-prep/assets/WarmupRunner-4JlL2RCw.js","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/chevron-right-CD1oeRdE.js","/labs/claude-prep/assets/clock-epWKNIg1.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-B8XUTIFB.js","/labs/claude-prep/assets/eye-DX7IpjrP.js","/labs/claude-prep/assets/file-text-DTo9J7sY.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-DKCb4ZC2.js","/labs/claude-prep/assets/gauge-BoxXaT83.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-DYvObo_6.js","/labs/claude-prep/assets/index-CN57sjHA.css","/labs/claude-prep/assets/index-COWaLWy6.js","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-CenrLz30.js","/labs/claude-prep/assets/link-2-B9dBOa0Q.js","/labs/claude-prep/assets/list-checks-DNjebFPP.js","/labs/claude-prep/assets/map-D8OTt210.js","/labs/claude-prep/assets/official-iMB8snil.js","/labs/claude-prep/assets/play-C6GLjJn8.js","/labs/claude-prep/assets/printer-Cxfe8ig6.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-clock-CBk70aWE.js","/labs/claude-prep/assets/rotate-ccw-lIzNzP-C.js","/labs/claude-prep/assets/sessions-BC1Aqz2r.js","/labs/claude-prep/assets/shared-CrzWL_tT.js","/labs/claude-prep/assets/shared-Tfh5ornH.js","/labs/claude-prep/assets/sparkles-CnAggC0a.js","/labs/claude-prep/assets/timer-C7gMjgoN.js","/labs/claude-prep/assets/useScrollSpy-B6WuDset.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useSessions-DU-YybSd.js","/labs/claude-prep/assets/zap-B47gJTEI.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
