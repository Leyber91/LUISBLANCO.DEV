/* Blueprint 720 service worker 5663d36e56df: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-5663d36e56df";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-DHxWTCho.js","/labs/claude-prep/assets/Badge-B_3-MIHO.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Breadcrumbs-BHk_xzlo.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Card-BtyMWNYT.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BRoS6x1K.js","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/CoursePage-D4Zb4aRF.js","/labs/claude-prep/assets/ExtraPage-CHia_exP.js","/labs/claude-prep/assets/FlashcardsHome-DOJey-sO.js","/labs/claude-prep/assets/GuidePage-C4m2UzlO.js","/labs/claude-prep/assets/GuidesIndex-9muixTmR.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-DtEnUSyX.js","/labs/claude-prep/assets/LabPage-BzeJi0GU.js","/labs/claude-prep/assets/LabsHome-DxGDYlNL.js","/labs/claude-prep/assets/LessonPage-DXmfwGUl.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-CHQ2hjXv.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-CwWvZ4X7.js","/labs/claude-prep/assets/PageHeader-B1HjBXF7.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PlanPage-BQJZHwKh.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BVdt5bb9.css","/labs/claude-prep/assets/PracticeHub-DE_lOWtm.js","/labs/claude-prep/assets/ProgressBar--TYDorgy.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressPage-BUKz3SQX.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/ProgressRing-tQgF-fzP.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-DYztJKOD.js","/labs/claude-prep/assets/Results-Bm3JyrfG.js","/labs/claude-prep/assets/Results-Yf5C-HoN.css","/labs/claude-prep/assets/Review-sTY7g3z0.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-qddN00At.js","/labs/claude-prep/assets/SessionRunner-DMfRyldc.js","/labs/claude-prep/assets/SessionRunner-Dv3MdGQ_.css","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/SettingsPage-D7VVjuyE.js","/labs/claude-prep/assets/StatTile-BFrg1pTz.js","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatusChip-CSaS_nG-.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-DTA_jjcw.js","/labs/claude-prep/assets/chevron-right-BUlM8PSl.js","/labs/claude-prep/assets/clock-DfTq1oIi.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-DQ2pRyKi.js","/labs/claude-prep/assets/eye-CtrFs97l.js","/labs/claude-prep/assets/file-text-BPpaVpck.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-BZhNDX4Q.js","/labs/claude-prep/assets/gauge-yzDs2vAp.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-CQn9ja9f.js","/labs/claude-prep/assets/index-BROubrDy.js","/labs/claude-prep/assets/index-Bi3rDsQ6.css","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-B53tUmGg.js","/labs/claude-prep/assets/link-2-B0G3Euwz.js","/labs/claude-prep/assets/list-checks-CzmORg-a.js","/labs/claude-prep/assets/map-D7xM7NOD.js","/labs/claude-prep/assets/official-BrZ6xTol.js","/labs/claude-prep/assets/play-D7UVhJpz.js","/labs/claude-prep/assets/printer-5Av5jk26.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-clock-DFyypcPW.js","/labs/claude-prep/assets/rotate-ccw-uNP3HcGV.js","/labs/claude-prep/assets/sessions-Co8HjBjj.js","/labs/claude-prep/assets/shared-BkHSNTE9.js","/labs/claude-prep/assets/shared-DCMilyPs.js","/labs/claude-prep/assets/sparkles-BYu1PqDL.js","/labs/claude-prep/assets/timer-CwpMxlJH.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-DfgYkQKW.js","/labs/claude-prep/assets/useSessions-CZsQ2M4T.js","/labs/claude-prep/assets/zap-B8GaNVs-.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
