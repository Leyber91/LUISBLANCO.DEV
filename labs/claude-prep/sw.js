/* Blueprint 720 service worker 1ae18d03eb7a: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-1ae18d03eb7a";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-DApH9Tgf.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-DT106i-p.js","/labs/claude-prep/assets/Breadcrumbs-C_egJdl5.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Card-IIKIg6RU.js","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-CIq_UMXs.js","/labs/claude-prep/assets/CoursePage-DBjJhjAf.js","/labs/claude-prep/assets/ExtraPage-CNmSXmsg.js","/labs/claude-prep/assets/FlashcardsHome-CRyQmFJW.js","/labs/claude-prep/assets/GuidePage-LGrEhswT.js","/labs/claude-prep/assets/GuidesIndex-D2LKkTmA.js","/labs/claude-prep/assets/HomePage-Bz-vw8hO.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/LabPage-8p-XBPdd.js","/labs/claude-prep/assets/LabsHome-cKzUXcV0.js","/labs/claude-prep/assets/LessonPage-1vnC9I4R.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ListenBar-2yY_H27P.js","/labs/claude-prep/assets/ListenBar-kNZkOGTO.css","/labs/claude-prep/assets/ModulePage-BbSijcZ_.js","/labs/claude-prep/assets/Official-BRXnkb1y.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-D0mpjMoE.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PlanPage-D_xFeqq_.js","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/PracticeHub-DOLtf8Q4.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-sn0Emcs0.js","/labs/claude-prep/assets/ProgressPage-BNh91oWU.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-CWE9M77e.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-GUCd_CHk.js","/labs/claude-prep/assets/Results-B_WioC-9.css","/labs/claude-prep/assets/Results-DJah2DjU.js","/labs/claude-prep/assets/Review-DSxpWdOr.js","/labs/claude-prep/assets/Segmented-BRl9WISj.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/SessionRunner-Wf6kA_aq.js","/labs/claude-prep/assets/SessionRunner-sO46mvvv.css","/labs/claude-prep/assets/SettingsPage-CwsdDFXd.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-Dg9j8qBo.js","/labs/claude-prep/assets/StatusChip-Cx4b1Zt1.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-B9oO3Etf.js","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/chevron-right-DWMmQQFr.js","/labs/claude-prep/assets/clock-5UGtb-JJ.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-oqRbTh3d.js","/labs/claude-prep/assets/eye-Cxpp5Z-R.js","/labs/claude-prep/assets/file-text-CAk2al9l.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-HMcCBuUS.js","/labs/claude-prep/assets/gauge-DzRNGaM7.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-B9Jl9_pg.js","/labs/claude-prep/assets/index-CMmp_RtJ.css","/labs/claude-prep/assets/index-D-GqsMgU.js","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-9nXPRDIh.js","/labs/claude-prep/assets/link-2-CbR7DVKI.js","/labs/claude-prep/assets/list-checks-Dr31Zi1v.js","/labs/claude-prep/assets/map-BR383adq.js","/labs/claude-prep/assets/official-BdxZTjLH.js","/labs/claude-prep/assets/play-Bg4JtzD2.js","/labs/claude-prep/assets/printer-B1gINiaB.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-BYvCyhKO.js","/labs/claude-prep/assets/rotate-ccw-clock-Dv7TEtij.js","/labs/claude-prep/assets/sessions-DJX9jvTt.js","/labs/claude-prep/assets/shared-BmJU2PUg.js","/labs/claude-prep/assets/shared-DnH1jltZ.js","/labs/claude-prep/assets/sparkles-KriUKlG-.js","/labs/claude-prep/assets/timer-B7mS8eXA.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-CyDqHjta.js","/labs/claude-prep/assets/useSessions-CUdQ3wzH.js","/labs/claude-prep/assets/zap-CREJIpzx.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
