/* Blueprint 720 service worker 8da002f610c0: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-8da002f610c0";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-JKU9gNL-.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-DBCepgc7.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-JrUhqQOb.js","/labs/claude-prep/assets/Card-DaDs_dAT.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-D6xEbKFn.js","/labs/claude-prep/assets/CoursePage-_Gclbwub.js","/labs/claude-prep/assets/ExtraPage-z-jJSgIf.js","/labs/claude-prep/assets/FlashcardsHome-CNAancYE.js","/labs/claude-prep/assets/GuidePage-DHbHJs7V.js","/labs/claude-prep/assets/GuidesIndex-Cy80yLbF.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-k9QgeTDi.js","/labs/claude-prep/assets/LabPage-BAzQTCdf.js","/labs/claude-prep/assets/LabsHome-DGSHIhha.js","/labs/claude-prep/assets/LessonPage-6M1tANde.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-BoK0Y6P3.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-CsN4URKv.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-COMnchk-.js","/labs/claude-prep/assets/PlanPage-Bo6be0ea.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BwOFi-ca.css","/labs/claude-prep/assets/PracticeHub-Z8F0i8Ll.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-CbQI2NjA.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressPage-Dlj7Lgh_.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/ProgressRing-DGZHEBku.js","/labs/claude-prep/assets/QuestionStrip-7VcOp3T_.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/Results-CGdbnaLN.js","/labs/claude-prep/assets/Results-Yf5C-HoN.css","/labs/claude-prep/assets/Review-B4YVnyL1.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-CT3LDu7n.js","/labs/claude-prep/assets/SessionRunner-Dv3MdGQ_.css","/labs/claude-prep/assets/SessionRunner-DvqShx_Q.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/SettingsPage-Dg4Br2Ik.js","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-Dm8BTeAX.js","/labs/claude-prep/assets/StatusChip-B76SC4I9.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/WarmupRunner-VI9eW3Nx.js","/labs/claude-prep/assets/chevron-right-dDW9LZ9E.js","/labs/claude-prep/assets/clock-7-gsLA1E.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-Ck4nwOLO.js","/labs/claude-prep/assets/eye-CiSaY9W2.js","/labs/claude-prep/assets/file-text-XD7HPVMp.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-CkKdW8Nm.js","/labs/claude-prep/assets/gauge-DCwo9xfj.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-UTuyBJfI.js","/labs/claude-prep/assets/index-WnCg8dXp.js","/labs/claude-prep/assets/index-XzgECSjT.css","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-3qsOjxMX.js","/labs/claude-prep/assets/link-2-DWx8GPPN.js","/labs/claude-prep/assets/list-checks-BWQX3yVw.js","/labs/claude-prep/assets/map-D6oCErIQ.js","/labs/claude-prep/assets/official-BtSSpz8y.js","/labs/claude-prep/assets/play-DCyr9OJU.js","/labs/claude-prep/assets/printer-CCnF5Eq5.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-DTkfz5_q.js","/labs/claude-prep/assets/rotate-ccw-clock-B35SoFfP.js","/labs/claude-prep/assets/sessions-BPvjyRO8.js","/labs/claude-prep/assets/shared-RTbTbQX2.js","/labs/claude-prep/assets/shared-Xis2OVoS.js","/labs/claude-prep/assets/sparkles-Dzq0YMVY.js","/labs/claude-prep/assets/timer-BJBUKnlZ.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-Bj89Imvz.js","/labs/claude-prep/assets/useSessions-5z6WmULu.js","/labs/claude-prep/assets/zap-PNw4JNcD.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
