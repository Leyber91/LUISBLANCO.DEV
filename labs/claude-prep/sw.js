/* Blueprint 720 service worker 302b44cb6e5d: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-302b44cb6e5d";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-DmGCG6WR.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-j2Sy1Tjo.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-CrOK9eVu.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Card-H3n2WWMW.js","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-CKc9kbID.js","/labs/claude-prep/assets/CoursePage-ChUWitL_.js","/labs/claude-prep/assets/ExtraPage--RVaTGIs.js","/labs/claude-prep/assets/FlashcardsHome-jj08Z6js.js","/labs/claude-prep/assets/GuidePage-B7cPc9Qi.js","/labs/claude-prep/assets/GuidesIndex-TaCSd3_k.js","/labs/claude-prep/assets/HomePage-36f-RxAT.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/LabPage-Cq4UEaYC.js","/labs/claude-prep/assets/LabsHome-4cSCAIde.js","/labs/claude-prep/assets/LessonPage-DCYx3KsY.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-Bn-xHb1Z.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-C0xeYI15.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-CMHoaqGl.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PlanPage-nC23Jk9J.js","/labs/claude-prep/assets/PracticeHub-BwOFi-ca.css","/labs/claude-prep/assets/PracticeHub-DGuoUGVf.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-DRxP8lRg.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressPage-DWIwHj4i.js","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/ProgressRing-ClLabJco.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-yWhx2a1z.js","/labs/claude-prep/assets/Results-BMXTqU-Q.js","/labs/claude-prep/assets/Results-Yf5C-HoN.css","/labs/claude-prep/assets/Review-BruSzw1x.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-Cr_cDnoQ.js","/labs/claude-prep/assets/SessionRunner-CdWvJQjs.js","/labs/claude-prep/assets/SessionRunner-Ck2Q8IuA.css","/labs/claude-prep/assets/SettingsPage-B2YhNaWo.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-KbXEjX5K.js","/labs/claude-prep/assets/StatusChip-CHqk9Mnv.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-3OnlITXL.js","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/chevron-right-DF9lpSDs.js","/labs/claude-prep/assets/clock-DBE0JBQx.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-B-xDswBi.js","/labs/claude-prep/assets/eye-D9UBZK85.js","/labs/claude-prep/assets/file-text-D1flhS3b.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-B5GWWHmc.js","/labs/claude-prep/assets/gauge-CO7EIxRu.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-CzdTgwV3.js","/labs/claude-prep/assets/index-CyRnE4cR.js","/labs/claude-prep/assets/index-XzgECSjT.css","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/lightbulb-BWsyUJSg.js","/labs/claude-prep/assets/link-2-ChzG4hhB.js","/labs/claude-prep/assets/list-checks-WY8RZdUR.js","/labs/claude-prep/assets/map-B4rdlnk-.js","/labs/claude-prep/assets/official-CnXVbQfH.js","/labs/claude-prep/assets/play-BVdwtZcm.js","/labs/claude-prep/assets/printer-C6BOKwXg.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-DE1nP9a1.js","/labs/claude-prep/assets/rotate-ccw-clock-CnnUmKVu.js","/labs/claude-prep/assets/sessions-cz5s0gaS.js","/labs/claude-prep/assets/shared-C6XdRUmF.js","/labs/claude-prep/assets/shared-D9nU-l2w.js","/labs/claude-prep/assets/sparkles-DGvw2Hye.js","/labs/claude-prep/assets/timer-Xj3m3CtQ.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-OEEX7yOm.js","/labs/claude-prep/assets/useSessions-BH18yzij.js","/labs/claude-prep/assets/zap-Cxm1WnWa.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
