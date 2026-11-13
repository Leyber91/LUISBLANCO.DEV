/* Blueprint 720 service worker 85d19d5aa51b: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-85d19d5aa51b";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-Bj7T439a.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-DeTBNZwR.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-CgJgsv7k.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Card-QdZqdc3L.js","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-D5FSfnft.js","/labs/claude-prep/assets/CoursePage-Bebn23Ol.js","/labs/claude-prep/assets/ExtraPage-C0CU1Sp8.js","/labs/claude-prep/assets/FlashcardsHome-BgZwNN-G.js","/labs/claude-prep/assets/GuidePage-B34R_P4z.js","/labs/claude-prep/assets/GuidesIndex-BW8PGYHB.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-DWAgdQ_J.js","/labs/claude-prep/assets/LabPage-BH3P9_Wt.js","/labs/claude-prep/assets/LabsHome-BcFhelWx.js","/labs/claude-prep/assets/LessonPage-BvSjxFjb.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-Bb6YdlrI.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-C2ydpDnI.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-CTA0dopD.js","/labs/claude-prep/assets/PlanPage-CIIOp69X.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/PracticeHub-CRCDNgSK.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-CR1D8-11.js","/labs/claude-prep/assets/ProgressPage-Aq_uqvFk.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-Cd-BCRyp.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-BhqJ1abH.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/Results-B_WioC-9.css","/labs/claude-prep/assets/Results-Hh4vGa63.js","/labs/claude-prep/assets/Review-DgDVLsmq.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-CIUssfkp.js","/labs/claude-prep/assets/SessionRunner-DjRXngf4.js","/labs/claude-prep/assets/SessionRunner-sO46mvvv.css","/labs/claude-prep/assets/SettingsPage-1AegwGmP.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-Dw-xDkf0.js","/labs/claude-prep/assets/StatusChip-BTqdGxYp.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-R1lsJfmn.js","/labs/claude-prep/assets/chevron-right-DpIlrg5X.js","/labs/claude-prep/assets/clock-DYV0kdL9.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-D8aMWpLp.js","/labs/claude-prep/assets/eye-Bo5QmeG-.js","/labs/claude-prep/assets/file-text-uXzooAEj.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-q8I65yJE.js","/labs/claude-prep/assets/gauge-CBT6wWow.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-Boqmh3s7.js","/labs/claude-prep/assets/index-CMmp_RtJ.css","/labs/claude-prep/assets/index-DYHRMVsn.js","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-CY7ZAfBX.js","/labs/claude-prep/assets/link-2-DIre7JlD.js","/labs/claude-prep/assets/list-checks-jRWI2I_2.js","/labs/claude-prep/assets/map-Die8H257.js","/labs/claude-prep/assets/official-BqomPOgz.js","/labs/claude-prep/assets/play-BlcZ6siS.js","/labs/claude-prep/assets/printer-CViO9O0D.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-DPP1m9Zi.js","/labs/claude-prep/assets/rotate-ccw-clock-lffciZny.js","/labs/claude-prep/assets/sessions-0eiAMXbO.js","/labs/claude-prep/assets/shared-CIkM1HGD.js","/labs/claude-prep/assets/shared-DyeaT9aL.js","/labs/claude-prep/assets/sparkles-BwFuqDxt.js","/labs/claude-prep/assets/timer-BI8XGPvA.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-lwtfNGBW.js","/labs/claude-prep/assets/useSessions-CZGG-2Hc.js","/labs/claude-prep/assets/zap-C1bO0GKB.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
