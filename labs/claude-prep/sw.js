/* Blueprint 720 service worker cbb3b92c11ce: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-cbb3b92c11ce";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-DnvjtsQf.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-Rc_5emsh.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-CvJGdHfu.js","/labs/claude-prep/assets/Card-Bly77GEK.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-XUjVsZCM.js","/labs/claude-prep/assets/CoursePage-DFJQOxZv.js","/labs/claude-prep/assets/ExtraPage-BwmJQDOk.js","/labs/claude-prep/assets/FlashcardsHome-DlyLHMaf.js","/labs/claude-prep/assets/GuidePage-Dbai0XCw.js","/labs/claude-prep/assets/GuidesIndex-DWGKxH_F.js","/labs/claude-prep/assets/HomePage-0EATNp7M.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/LabPage-C2YQGS72.js","/labs/claude-prep/assets/LabsHome-DiAefDuD.js","/labs/claude-prep/assets/LessonPage-Bb874UHy.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-BPVjNvwG.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-DKdI3RMF.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-IJSvIjHs.js","/labs/claude-prep/assets/PlanPage-BmfmQI31.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BwOFi-ca.css","/labs/claude-prep/assets/PracticeHub-CjgoC3u0.js","/labs/claude-prep/assets/ProgressBar-B36raNKJ.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressPage-BUiIlQ4K.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-BCErHZvv.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-_enlIe-z.js","/labs/claude-prep/assets/Results-Dg9ZxF0l.js","/labs/claude-prep/assets/Results-Yf5C-HoN.css","/labs/claude-prep/assets/Review-Dk-orfDy.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-tX5fCocN.js","/labs/claude-prep/assets/SessionRunner-B1Hu7fhB.js","/labs/claude-prep/assets/SessionRunner-Dv3MdGQ_.css","/labs/claude-prep/assets/SettingsPage-BdwQDeGU.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-BBbgEmOG.js","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/StatusChip-DiWKPFky.js","/labs/claude-prep/assets/WarmupRunner-3w9EUgPw.js","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/chevron-right-8dqpivGX.js","/labs/claude-prep/assets/clock-2z8WppVv.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-DdGxI6n6.js","/labs/claude-prep/assets/eye-l1MDL1EP.js","/labs/claude-prep/assets/file-text-BvqPkck-.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-Q1ufr7u5.js","/labs/claude-prep/assets/gauge-1W7njN38.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-CPcO7MaM.js","/labs/claude-prep/assets/index-Bi3rDsQ6.css","/labs/claude-prep/assets/index-BsqB2Qmm.js","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-DZtUdDFh.js","/labs/claude-prep/assets/link-2-CEajBrZ5.js","/labs/claude-prep/assets/list-checks-BWXOd3-v.js","/labs/claude-prep/assets/map-CDnog3T-.js","/labs/claude-prep/assets/official-CIXzGTVE.js","/labs/claude-prep/assets/play-Bsc8A5vX.js","/labs/claude-prep/assets/printer-Xq9pnlKm.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-DRWpXW5u.js","/labs/claude-prep/assets/rotate-ccw-clock-BxiOzIAh.js","/labs/claude-prep/assets/sessions-DuRceESR.js","/labs/claude-prep/assets/shared-BXOj1TC8.js","/labs/claude-prep/assets/shared-DNzdNbvF.js","/labs/claude-prep/assets/sparkles-Bk9IK1mt.js","/labs/claude-prep/assets/timer-B_8vSUmY.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-g77rB3Iv.js","/labs/claude-prep/assets/useSessions-duZgg43z.js","/labs/claude-prep/assets/zap-C-umOgAU.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
