/* Blueprint 720 service worker ed6a303103b5: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-ed6a303103b5";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-Cqj1o6oC.js","/labs/claude-prep/assets/Badge-BeRplKA5.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-Dr_YF-Wy.js","/labs/claude-prep/assets/Card-DRnjqAU8.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-wZGqMgTP.js","/labs/claude-prep/assets/CoursePage-CxJ7iJ9x.js","/labs/claude-prep/assets/ExtraPage-DWi10xVf.js","/labs/claude-prep/assets/FlashcardsHome-xKAWCP-y.js","/labs/claude-prep/assets/GuidePage-CH_UKCTi.js","/labs/claude-prep/assets/GuidesIndex-BP5ChAFF.js","/labs/claude-prep/assets/HomePage-BrYt_j8Z.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/LabPage-jlgSTrwx.js","/labs/claude-prep/assets/LabsHome-16AVaeYn.js","/labs/claude-prep/assets/LessonPage-2yXHzbIO.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-DsXUTb_5.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-CnVLC4Ez.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-CiT1kme_.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PlanPage-h5jcNYZN.js","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/PracticeHub-C2NeVPje.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-DW-6b4nS.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressPage-CL7Gia4V.js","/labs/claude-prep/assets/ProgressRing-BkEHv1MR.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-DbOTfs4Y.js","/labs/claude-prep/assets/Results-B2d5XF6_.js","/labs/claude-prep/assets/Results-B_WioC-9.css","/labs/claude-prep/assets/Review-pXWK6Xt2.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-a8lDPSgy.js","/labs/claude-prep/assets/SessionRunner-BIKQkfSL.js","/labs/claude-prep/assets/SessionRunner-sO46mvvv.css","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/SettingsPage-Dd6_lohH.js","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-ChjL71Yb.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/StatusChip-yBN34eRX.js","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-SsBlyAGi.js","/labs/claude-prep/assets/chevron-right-C9E_ZRPj.js","/labs/claude-prep/assets/clock-BdIs9Dt9.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-hmUaflS8.js","/labs/claude-prep/assets/eye-DuVPgVI3.js","/labs/claude-prep/assets/file-text-CQF3wRTr.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-2h_DRcuA.js","/labs/claude-prep/assets/gauge-AM0qosp1.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-ChpFViiX.js","/labs/claude-prep/assets/index-CMmp_RtJ.css","/labs/claude-prep/assets/index-Ua7xwmvc.js","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-BfqsYar5.js","/labs/claude-prep/assets/link-2-D56Dsb_q.js","/labs/claude-prep/assets/list-checks-CMDoMyq2.js","/labs/claude-prep/assets/map-Xr76sBs5.js","/labs/claude-prep/assets/official-BWsZJ2JJ.js","/labs/claude-prep/assets/play-ByGArMUQ.js","/labs/claude-prep/assets/printer-DcM8Ndla.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-DUFyDFkp.js","/labs/claude-prep/assets/rotate-ccw-clock-CQibhYk2.js","/labs/claude-prep/assets/sessions-CosmVfv6.js","/labs/claude-prep/assets/shared-BXj4bnF7.js","/labs/claude-prep/assets/shared-DqZB7fWZ.js","/labs/claude-prep/assets/sparkles-CkjzhpFE.js","/labs/claude-prep/assets/timer-Cn-QT6hK.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-OWn4muMJ.js","/labs/claude-prep/assets/useSessions-DWz1EzSe.js","/labs/claude-prep/assets/zap-PHUGxtlS.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
