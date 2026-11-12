/* Blueprint 720 service worker df83585f0685: keeps the app shell for offline use. GitHub API calls pass through untouched. */
const VERSION = "b720-df83585f0685";
const BASE = "/labs/claude-prep/";
const PRECACHE = ["/labs/claude-prep/","/labs/claude-prep/assets/ActivityCalendar-1X7YYG0j.css","/labs/claude-prep/assets/ActivityCalendar-CqEqWUan.js","/labs/claude-prep/assets/Badge-BuYB41b-.css","/labs/claude-prep/assets/Badge-DTBysZKC.js","/labs/claude-prep/assets/Breadcrumbs-CcLlUkza.css","/labs/claude-prep/assets/Breadcrumbs-DC9s6u8P.js","/labs/claude-prep/assets/Card-DEeBYL5i.js","/labs/claude-prep/assets/Card-DhqAn6c3.css","/labs/claude-prep/assets/Checkbox-BgvTmyTz.css","/labs/claude-prep/assets/Checkbox-DX--WddU.js","/labs/claude-prep/assets/CoursePage-DOjnT-9M.js","/labs/claude-prep/assets/ExtraPage-DdkD7-6t.js","/labs/claude-prep/assets/FlashcardsHome-B8Np_F_P.js","/labs/claude-prep/assets/GuidePage-BaPPP1sc.js","/labs/claude-prep/assets/GuidesIndex-DYjkudXh.js","/labs/claude-prep/assets/HomePage-CVorQ2Mp.css","/labs/claude-prep/assets/HomePage-ItFaLlC2.js","/labs/claude-prep/assets/LabPage-Dfo_DTf-.js","/labs/claude-prep/assets/LabsHome-BJePHbUn.js","/labs/claude-prep/assets/LessonPage-CgAMhDqc.js","/labs/claude-prep/assets/LessonPage-Dg6yzOQN.css","/labs/claude-prep/assets/ModulePage-CE5SoKMG.js","/labs/claude-prep/assets/Official-BcinHwf5.css","/labs/claude-prep/assets/Official-DIPvQ8Ud.js","/labs/claude-prep/assets/PageHeader-Ba5RBz8o.css","/labs/claude-prep/assets/PageHeader-c8D0SNGI.js","/labs/claude-prep/assets/PlanPage-D-RI-eRg.js","/labs/claude-prep/assets/PlanPage-DAjcvshf.css","/labs/claude-prep/assets/PracticeHub-BwOFi-ca.css","/labs/claude-prep/assets/PracticeHub-DCouT6Ss.js","/labs/claude-prep/assets/ProgressBar-Bh9HxKSr.css","/labs/claude-prep/assets/ProgressBar-nE0WqhdS.js","/labs/claude-prep/assets/ProgressPage-A0d4neog.js","/labs/claude-prep/assets/ProgressPage-CKm1a-wg.css","/labs/claude-prep/assets/ProgressRing-Ckv0tSB7.css","/labs/claude-prep/assets/ProgressRing-CqbMFGea.js","/labs/claude-prep/assets/QuestionStrip-DYoUgTEw.css","/labs/claude-prep/assets/QuestionStrip-jqKZDdpW.js","/labs/claude-prep/assets/Results-COPv7SIV.js","/labs/claude-prep/assets/Results-Yf5C-HoN.css","/labs/claude-prep/assets/Review-BHeVlJWk.js","/labs/claude-prep/assets/Segmented-C3yZeNZI.css","/labs/claude-prep/assets/Segmented-DAQlrwSA.js","/labs/claude-prep/assets/SessionRunner-C4TUcQwE.js","/labs/claude-prep/assets/SettingsPage-CV_CDLQr.js","/labs/claude-prep/assets/SettingsPage-D1BIfEYG.css","/labs/claude-prep/assets/StatTile-Byz9Rdti.css","/labs/claude-prep/assets/StatTile-Ch3WTYz-.js","/labs/claude-prep/assets/StatusChip-1drIQtyz.js","/labs/claude-prep/assets/StatusChip-DP_AVLsR.css","/labs/claude-prep/assets/WarmupRunner-B0Plh81K.js","/labs/claude-prep/assets/WarmupRunner-Bo1-10Ch.css","/labs/claude-prep/assets/chevron-right-BOFnolnt.js","/labs/claude-prep/assets/clock-GPNlSPUZ.js","/labs/claude-prep/assets/course-DQt-TF4t.css","/labs/claude-prep/assets/course.module-BRlthR7a.js","/labs/claude-prep/assets/drills-DeeZ1wxw.js","/labs/claude-prep/assets/eye-CYgfHM8c.js","/labs/claude-prep/assets/file-text-utQ49Kap.js","/labs/claude-prep/assets/flashcards-CCxTTvDc.css","/labs/claude-prep/assets/flashcards.module-DDb_kOwG.js","/labs/claude-prep/assets/gauge-BLAR7YQQ.js","/labs/claude-prep/assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","/labs/claude-prep/assets/geist-latin-wght-italic-dTnRTFFJ.woff2","/labs/claude-prep/assets/geist-latin-wght-normal-BgDaEnEv.woff2","/labs/claude-prep/assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","/labs/claude-prep/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","/labs/claude-prep/assets/graduation-cap-CCBfh_lh.js","/labs/claude-prep/assets/index-D3rCbX-s.js","/labs/claude-prep/assets/index-XzgECSjT.css","/labs/claude-prep/assets/labState-CTLpfhgB.css","/labs/claude-prep/assets/labState-WtK7A48C.js","/labs/claude-prep/assets/link-2-p1ml2_wg.js","/labs/claude-prep/assets/list-checks-DdZMVRuJ.js","/labs/claude-prep/assets/map-CzsUUjGz.js","/labs/claude-prep/assets/official-DAx5DRzs.js","/labs/claude-prep/assets/play-3jZBYOGO.js","/labs/claude-prep/assets/printer-Dzqjhndu.js","/labs/claude-prep/assets/reading-Armbrtc1.js","/labs/claude-prep/assets/reading-QLwNhZpw.css","/labs/claude-prep/assets/rotate-ccw-clock-CWuizc7w.js","/labs/claude-prep/assets/rotate-ccw-lyieEwfO.js","/labs/claude-prep/assets/sessions-DRKaW1st.js","/labs/claude-prep/assets/shared-ovge5ZcY.js","/labs/claude-prep/assets/shared-z5I0CK_Q.js","/labs/claude-prep/assets/sparkles-DbO3WImb.js","/labs/claude-prep/assets/timer-BKP4UeHq.js","/labs/claude-prep/assets/useScrollSpy-Bhm26PMz.css","/labs/claude-prep/assets/useScrollSpy-CMQHQwF2.js","/labs/claude-prep/assets/useSessions-Bjm5JN0U.js","/labs/claude-prep/assets/zap-D-7wuVlL.js","/labs/claude-prep/favicon.svg","/labs/claude-prep/icons/apple-touch-icon.png","/labs/claude-prep/icons/icon-192.png","/labs/claude-prep/icons/icon-512.png","/labs/claude-prep/icons/icon-maskable-512.png","/labs/claude-prep/index.html","/labs/claude-prep/licenses/OFL-Geist.txt","/labs/claude-prep/manifest.webmanifest"];
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
