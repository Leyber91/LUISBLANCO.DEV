/* Blueprint 720 service worker f3e3123faa77: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-f3e3123faa77";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-009nrjhl.js","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/Badge-BO9du9en.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-Cg2nId_4.js","/labs/claude-prep/assets/Card-7NCxJHif.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-BueY-gOX.js","/labs/claude-prep/assets/CoursePage-D9oYnLsY.js","/labs/claude-prep/assets/ExtraPage-DBiuHKeU.js","/labs/claude-prep/assets/FlashcardsHome-Bo3mAggX.js","/labs/claude-prep/assets/GuidePage-CZj83LJn.js","/labs/claude-prep/assets/GuidesIndex-Bp89nIas.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-s7XpRsHF.js","/labs/claude-prep/assets/LabPage-CmccHMbZ.js","/labs/claude-prep/assets/LabsHome-dWiX4C7J.js","/labs/claude-prep/assets/LessonPage-CkkvNVZT.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-Cc4W7mfF.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-DkCh5I7B.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-Cs5C737v.js","/labs/claude-prep/assets/PlanPage-BH5pg6SN.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BoLV6zDk.js","/labs/claude-prep/assets/PracticeHub-BwOFi-ca.css","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-CByp7Trd.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressPage-r3_PRoCO.js","/labs/claude-prep/assets/ProgressRing-C51TxgyT.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/QuestionStrip-B1dtAZJm.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/Results-Cpva7bJE.js","/labs/claude-prep/assets/Results-Yf5C-HoN.css","/labs/claude-prep/assets/Review-cox3x4Wk.js","/labs/claude-prep/assets/Segmented-BYXdJNAg.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/SessionRunner-CCctdAiU.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/SettingsPage-YjfkdVod.js","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-CcpXWMi_.js","/labs/claude-prep/assets/StatusChip-Bl94ygNM.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-DBBe5PJA.js","/labs/claude-prep/assets/chevron-right-BW83UEKx.js","/labs/claude-prep/assets/clock-BQjZmoc-.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-D5NTmkCS.js","/labs/claude-prep/assets/eye-BjQ5xwki.js","/labs/claude-prep/assets/file-text-DuGS6IxU.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-CR27MuFD.js","/labs/claude-prep/assets/gauge-Csrl_0HW.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-Dg6yKafI.js","/labs/claude-prep/assets/index-5t8CmUm2.js","/labs/claude-prep/assets/index-XzgECSjT.css","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/link-2-RPUGL9cF.js","/labs/claude-prep/assets/list-checks-C7om2IP-.js","/labs/claude-prep/assets/map-ABrFnvQ1.js","/labs/claude-prep/assets/official--HgDfqVa.js","/labs/claude-prep/assets/play-99PYpDq0.js","/labs/claude-prep/assets/printer-Dr7YMc1f.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-Dz8EIxst.js","/labs/claude-prep/assets/rotate-ccw-clock-CTBnW7le.js","/labs/claude-prep/assets/sessions-B6G21aWF.js","/labs/claude-prep/assets/shared-CB-WuYHS.js","/labs/claude-prep/assets/shared-DQKsLtJm.js","/labs/claude-prep/assets/sparkles-BNSsOgL4.js","/labs/claude-prep/assets/timer-CJ_MdGDQ.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-jC5uRVfs.js","/labs/claude-prep/assets/useSessions-pwm4Ibrt.js","/labs/claude-prep/assets/zap-Bv2_E3w2.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
