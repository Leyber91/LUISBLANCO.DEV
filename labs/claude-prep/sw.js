/* Blueprint 720 service worker 105ccbddf237: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-105ccbddf237";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-DkL9INGs.js","/labs/claude-prep/assets/Badge-1ysZgWnY.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Breadcrumbs-Bn8Yyapu.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Card-CMZRdXP7.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-Ds5n0_Zn.js","/labs/claude-prep/assets/CoursePage-B2oVYNVk.js","/labs/claude-prep/assets/ExtraPage-dGD-e5bL.js","/labs/claude-prep/assets/FlashcardsHome-DRICPFRg.js","/labs/claude-prep/assets/GuidePage-BjPeSClT.js","/labs/claude-prep/assets/GuidesIndex-CMpPi_xN.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-kWfLPU75.js","/labs/claude-prep/assets/LabPage-_FOqIY2G.js","/labs/claude-prep/assets/LabsHome-BtoqEMSC.js","/labs/claude-prep/assets/LessonPage-D2_-vA2W.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-BxUOT-0Z.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-DNB3owNI.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-DWmVVFij.js","/labs/claude-prep/assets/PlanPage-BGRLnynk.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-0-2TZO--.js","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/ProgressBar-07zrmyPD.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressPage-CJii7HRI.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/ProgressRing-Cz_TIQxh.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-fZeRFLeE.js","/labs/claude-prep/assets/Results-BqbwdRF8.css","/labs/claude-prep/assets/Results-D-jIf3DW.js","/labs/claude-prep/assets/Review-RAJsER_Z.js","/labs/claude-prep/assets/Segmented-Bcmy7LH0.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/SessionRunner-ZWhNSe8N.js","/labs/claude-prep/assets/SessionRunner-sO46mvvv.css","/labs/claude-prep/assets/SettingsPage-Cz_461-H.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-DiHPKqIr.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/StatusChip-Dllx0JTo.js","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-DLT5-lPP.js","/labs/claude-prep/assets/chevron-right-DvZ45TDM.js","/labs/claude-prep/assets/clock-Chd0GLaJ.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-DLtgwnEF.js","/labs/claude-prep/assets/eye-UnIUtKtR.js","/labs/claude-prep/assets/file-text-D-RDoDoJ.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-Bj-_vu4Q.js","/labs/claude-prep/assets/gauge-DncxUP0c.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-KhQZpjiD.js","/labs/claude-prep/assets/index-CMmp_RtJ.css","/labs/claude-prep/assets/index-ChUTe1rq.js","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-BzEPIuxw.js","/labs/claude-prep/assets/link-2-D2VjHIKU.js","/labs/claude-prep/assets/list-checks-KnQIcR9-.js","/labs/claude-prep/assets/map-DVKvILvv.js","/labs/claude-prep/assets/official-Ca8Y4dRk.js","/labs/claude-prep/assets/play-CoCD5m2i.js","/labs/claude-prep/assets/printer-6QXezIrW.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-DVemQMDH.js","/labs/claude-prep/assets/rotate-ccw-clock-BMHf4LkP.js","/labs/claude-prep/assets/sessions-Knek7zJ-.js","/labs/claude-prep/assets/shared-B90ySlOp.js","/labs/claude-prep/assets/shared-C71q8Bts.js","/labs/claude-prep/assets/sparkles-DK0_yDlJ.js","/labs/claude-prep/assets/timer-BZc9IuDm.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-CGyPFDJ7.js","/labs/claude-prep/assets/useSessions-BCjkY31O.js","/labs/claude-prep/assets/zap-zPfCieTU.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
