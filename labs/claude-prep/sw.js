/* Blueprint 720 service worker 3fb890b75850: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-3fb890b75850";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-C4muMdMG.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-DSqdJ3ID.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-ChALEWHT.js","/labs/claude-prep/assets/Card-COsoyexP.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-COB8Pj0s.js","/labs/claude-prep/assets/CoursePage-DKjiicO2.js","/labs/claude-prep/assets/ExtraPage-C2fQE-25.js","/labs/claude-prep/assets/FlashcardsHome-CUtrTnp6.js","/labs/claude-prep/assets/GuidePage-HzaIItLc.js","/labs/claude-prep/assets/GuidesIndex-yhRDLAGF.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-DQYgBy8b.js","/labs/claude-prep/assets/LabPage-DSzJxY7q.js","/labs/claude-prep/assets/LabsHome-BLr17kTv.js","/labs/claude-prep/assets/LessonPage-CDh3lqlG.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-D7x1OGNb.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-DK2OwdzT.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-By22WbQV.js","/labs/claude-prep/assets/PlanPage-D8EKaDqK.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/PracticeHub-CMl8_L_X.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-BqytJ2Xi.js","/labs/claude-prep/assets/ProgressPage-0cYK7cqO.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-BSxC2Ont.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-zPgZQciO.js","/labs/claude-prep/assets/Results-BIhJ04vC.js","/labs/claude-prep/assets/Results-BqbwdRF8.css","/labs/claude-prep/assets/Review-DsoNdZCl.js","/labs/claude-prep/assets/Segmented-B3HmDaE2.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/SessionRunner-C0FwnYJi.js","/labs/claude-prep/assets/SessionRunner-sO46mvvv.css","/labs/claude-prep/assets/SettingsPage-C-eqO6C_.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-cdkTObhP.js","/labs/claude-prep/assets/StatusChip-BqpjC8Y5.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-CoxdMHWH.js","/labs/claude-prep/assets/chevron-right-CZzJtrQd.js","/labs/claude-prep/assets/clock--L8cmukZ.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-DxXHAaFf.js","/labs/claude-prep/assets/eye-C8JEUYwR.js","/labs/claude-prep/assets/file-text-66NDDyXX.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-BnhsVIdl.js","/labs/claude-prep/assets/gauge-DxmPJnJ-.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-DW7UbKd5.js","/labs/claude-prep/assets/index-CMmp_RtJ.css","/labs/claude-prep/assets/index-DxJNlt6B.js","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-SQGayKhh.js","/labs/claude-prep/assets/link-2-CUAH1fTE.js","/labs/claude-prep/assets/list-checks-O09xefDu.js","/labs/claude-prep/assets/map-DxBsbe4Y.js","/labs/claude-prep/assets/official-C1XSynsQ.js","/labs/claude-prep/assets/play-DUqyMsrs.js","/labs/claude-prep/assets/printer-rDIpMYMO.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-CMfX_HFC.js","/labs/claude-prep/assets/rotate-ccw-clock-CvLIuC9B.js","/labs/claude-prep/assets/sessions-7_KHchFx.js","/labs/claude-prep/assets/shared-BuiRWPgW.js","/labs/claude-prep/assets/shared-C349-DL0.js","/labs/claude-prep/assets/sparkles-CqOEcJRW.js","/labs/claude-prep/assets/timer-CnUdMuWY.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-Lq9ld9E6.js","/labs/claude-prep/assets/useSessions-ESAHJQTE.js","/labs/claude-prep/assets/zap-CAoKMS_D.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
