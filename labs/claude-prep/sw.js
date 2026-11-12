/* Blueprint 720 service worker 6de9f2a45083: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-6de9f2a45083";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-BS4c6msW.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-DqGHgP4J.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-v7GPXwK_.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Card-DodIqjSH.js","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-Ds0oTTju.js","/labs/claude-prep/assets/CoursePage-csnMy_s_.js","/labs/claude-prep/assets/ExtraPage-BeDA2Hrv.js","/labs/claude-prep/assets/FlashcardsHome-H6kDX_53.js","/labs/claude-prep/assets/GuidePage-fS-HP7l7.js","/labs/claude-prep/assets/GuidesIndex-Du-On7me.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-D3dEGk5x.js","/labs/claude-prep/assets/LabPage-DSM2cdBh.js","/labs/claude-prep/assets/LabsHome--z2XUnSb.js","/labs/claude-prep/assets/LessonPage-DeUx5MeU.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-2gy-eSX4.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-BcqE-Zet.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-IRHi1g2w.js","/labs/claude-prep/assets/PlanPage-BWrLa6Un.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BwOFi-ca.css","/labs/claude-prep/assets/PracticeHub-DB9vS6zc.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-DvdRLXto.js","/labs/claude-prep/assets/ProgressPage-BD8-Ahz-.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-BihJumME.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-8G1Kceg9.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/Results-DMLnGwya.js","/labs/claude-prep/assets/Results-Yf5C-HoN.css","/labs/claude-prep/assets/Review-BhfiDpAT.js","/labs/claude-prep/assets/Segmented-BqYPCR3E.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/SessionRunner-CTqvbK2I.css","/labs/claude-prep/assets/SessionRunner-DVIf-qZQ.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/SettingsPage-DwfxQY5A.js","/labs/claude-prep/assets/StatTile-BQIqayN_.js","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatusChip-CVlTwdIU.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-yQIAd08e.js","/labs/claude-prep/assets/chevron-right-bhTeLh3N.js","/labs/claude-prep/assets/clock-CyvwLqn9.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-M3MRjLBp.js","/labs/claude-prep/assets/eye-DyYyRQGv.js","/labs/claude-prep/assets/file-text-BdcwOpKh.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-jF-OT8j7.js","/labs/claude-prep/assets/gauge-ClLa5SVk.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-D8tUgvFc.js","/labs/claude-prep/assets/index-BP-6lWiU.js","/labs/claude-prep/assets/index-XzgECSjT.css","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-NpSJE-9x.js","/labs/claude-prep/assets/link-2-DzhKZnxu.js","/labs/claude-prep/assets/list-checks-U7vm4s1v.js","/labs/claude-prep/assets/map-3z0QYAlx.js","/labs/claude-prep/assets/official-BMZDoM2a.js","/labs/claude-prep/assets/play-G6aB9xS3.js","/labs/claude-prep/assets/printer-C5bqmq63.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-DXwa2Jzg.js","/labs/claude-prep/assets/rotate-ccw-clock-GFBAoPuO.js","/labs/claude-prep/assets/sessions-DEL1AJmW.js","/labs/claude-prep/assets/shared-BwJYpUbq.js","/labs/claude-prep/assets/shared-tqDG3ht_.js","/labs/claude-prep/assets/sparkles-Db9uiaIp.js","/labs/claude-prep/assets/timer-CjIKw_dq.js","/labs/claude-prep/assets/useScrollSpy-9InkYnpB.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useSessions-CA4c1Nin.js","/labs/claude-prep/assets/zap-CPwE7pgx.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
