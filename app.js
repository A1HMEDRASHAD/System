// ==========================================================================
// Safaqat System ERP - Institutional Master Engine (app.js - Part 1 of 2)
// Architecture: 3 Files Only | Monochrome UI + Zero-Trust Security + ERP Core
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================================================
// 1. الإعدادات المركزية، الحسابات السيادية، والحماية من الثغرات (Security Core)
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDtdAxJqFhc1nsViYRkMVw9FXzCKeYhT5I",
  authDomain: "safaqat-system.firebaseapp.com",
  projectId: "safaqat-system",
  storageBucket: "safaqat-system.firebasestorage.app",
  messagingSenderId: "847357037344",
  appId: "1:847357037344:web:fe71887332dfe8f35b2545",
  measurementId: "G-1KQB3XREKE"
};

const HIDDEN_SUPER_ADMINS = [
  "rawialshamal@gmail.com",
  "a1hmedrashad@gmail.com",
  "safaqatkitabiya@gmail.com"
];

function isSuperAdminEmail(email) {
  if (!email) return false;
  return HIDDEN_SUPER_ADMINS.includes(String(email).trim().toLowerCase());
}

const IMGBB_API_KEY = "8daac9827176202a80700d2e41aaebd8";

// تطهير المدخلات النصية لمنع هجمات حقن الأكواد (Anti-XSS Sanitizer)
function cleanText(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// تهيئة Firebase مع حفظ الجلسة المشفرة محلياً بشكل دائم
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) => console.warn("Persistence:", e));

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
const db = getFirestore(app);

// ==========================================================================
// 2. توليد تطبيق الويب التقدمي (PWA) والوضع الليلي/النهاري المونوكروم
// ==========================================================================
const MONO_APP_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#09090b"/>
  <rect x="14" y="14" width="228" height="228" rx="36" fill="none" stroke="#fafafa" stroke-width="4"/>
  <text x="128" y="138" text-anchor="middle" font-family="Tajawal, Arial, sans-serif" font-weight="900" font-size="68" fill="#fafafa">صفقات</text>
  <text x="128" y="182" text-anchor="middle" font-family="monospace" font-weight="700" font-size="22" letter-spacing="3" fill="#a1a1aa">SYSTEM</text>
</svg>`);

function initMonochromePWAAndTheme() {
  const manifestData = {
    name: "نظام صفقات | Safaqat System",
    short_name: "نظام صفقات",
    description: "النظام المؤسسي لإدارة النشر والتوزيع والمستودعات والمحافظ المالية",
    start_url: window.location.href.split("?")[0],
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    dir: "rtl",
    lang: "ar",
    icons: [
      { src: MONO_APP_ICON, sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
      { src: MONO_APP_ICON, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
    ]
  };

  const blob = new Blob([JSON.stringify(manifestData)], { type: "application/json" });
  const manifestUrl = URL.createObjectURL(blob);
  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = manifestUrl;

  const savedTheme = localStorage.getItem("safaqat_mono_theme") || "light";
  applyThemeMode(savedTheme);
}

function applyThemeMode(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("safaqat_mono_theme", theme);
  const icon = document.getElementById("theme-icon");
  if (icon) {
    icon.className = theme === "dark" ? "ri-sun-line" : "ri-contrast-2-line";
  }
}

document.getElementById("btn-theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyThemeMode(next);
  renderSalesChart();
});

initMonochromePWAAndTheme();

// ==========================================================================
// 3. الحالة المركزية ومصفوفة الصلاحيات الـ 8 (Central State)
// ==========================================================================
const FULL_PERMS = {
  sell: true,
  addBook: true,
  deleteBook: true,
  authors: true,
  payouts: true,
  expenses: true,
  financeView: true,
  reports: true
};

const state = {
  currentUser: null,
  userEmail: "",
  userRole: null, // 'super_admin' | 'employee' | 'author'
  permissions: { ...FULL_PERMS },
  userProfile: {
    displayName: ""
  },
  currentAuthorProfile: null,
  selectedBookDetailId: null,
  selectedAuthorDetailId: null,
  selectedLibraryDetailId: null,
  selectedExhibitionDetailId: null,
  inspectingStaffEmail: null,

  activeBookFilter: "all",
  activeFinRange: "all",
  finDateFrom: "",
  finDateTo: "",
  logDateFrom: "",
  logDateTo: "",
  returnViewBeforePdf: "view-contracts",

  authors: [],
  books: [],
  warehouses: [],
  editions: [],
  libraries: [],
  libraryTransactions: [],
  exhibitions: [],
  sales: [],
  expenses: [],
  payouts: [],
  staff: [],
  notifications: [],
  activityLogs: [],

  chartInstance: null,
  currentChartType: "bar",
  confirmCallback: null,
  deferredPwaPrompt: null,
  unsubscribers: []
};

// ==========================================================================
// 4. محرك التنقل، القائمة الجانبية (☰)، والشريط السفلي العائم (Navigation)
// ==========================================================================
const sideDrawer = document.getElementById("side-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const quickAddSheet = document.getElementById("quick-add-sheet");

function openDrawer() {
  sideDrawer.classList.add("open");
  drawerBackdrop.classList.add("open");
}

function closeDrawer() {
  sideDrawer.classList.remove("open");
  drawerBackdrop.classList.remove("open");
}

document.getElementById("btn-open-drawer").addEventListener("click", openDrawer);
document.getElementById("btn-close-drawer").addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);

function navigateToView(viewId) {
  closeDrawer();
  quickAddSheet.classList.remove("show");

  document.querySelectorAll(".app-view").forEach((sec) => {
    sec.style.display = "none";
  });

  const target = document.getElementById(viewId);
  if (target) target.style.display = "block";

  document.querySelectorAll("#drawer-nav-list .drawer-link").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-nav") === viewId);
  });

  document.querySelectorAll(".floating-dock .dock-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-dock") === viewId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("#drawer-nav-list .drawer-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.getAttribute("data-nav");
    if (v === "view-profile") resetAuditLogsToMe();
    navigateToView(v);
  });
});

document.querySelectorAll(".floating-dock .dock-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.getAttribute("data-dock");
    if (v === "view-profile") resetAuditLogsToMe();
    navigateToView(v);
  });
});

document.getElementById("btn-dock-quick-add").addEventListener("click", () => {
  quickAddSheet.classList.toggle("show");
});
document.getElementById("btn-close-quick-add").addEventListener("click", () => {
  quickAddSheet.classList.remove("show");
});
quickAddSheet.addEventListener("click", (e) => {
  if (e.target === quickAddSheet) quickAddSheet.classList.remove("show");
});

document.getElementById("brand-home-trigger").addEventListener("click", () => {
  navigateToView(state.userRole === "author" ? "view-author-portal" : "view-dashboard");
});
document.getElementById("btn-header-guide").addEventListener("click", () => navigateToView("view-guide"));
document.getElementById("btn-header-notif").addEventListener("click", () => navigateToView("view-notifications"));
document.getElementById("btn-hero-warehouses").addEventListener("click", () => navigateToView("view-warehouses"));
document.getElementById("btn-hero-books").addEventListener("click", () => navigateToView("view-contracts"));
document.getElementById("btn-dash-all-books").addEventListener("click", () => navigateToView("view-contracts"));
document.getElementById("btn-low-stock-goto").addEventListener("click", () => navigateToView("view-warehouses"));

document.querySelectorAll(".js-back-view").forEach((btn) => {
  btn.addEventListener("click", () => {
    navigateToView(btn.getAttribute("data-target") || "view-dashboard");
  });
});

// ==========================================================================
// 5. محرك الحفظ المؤقت التلقائي في المتصفح (Auto-Save Drafts)
// ==========================================================================
const DRAFT_PREFIX = "safaqat_erp_draft_";
const DRAFT_VIEW_KEY = "safaqat_erp_draft_view";

function initAutoSaveEngine() {
  document.querySelectorAll("[data-draft]").forEach((input) => {
    const key = input.getAttribute("data-draft");
    const saved = localStorage.getItem(DRAFT_PREFIX + key);
    if (saved !== null && input.value === "") {
      input.value = saved;
    }
    input.addEventListener("input", () => {
      localStorage.setItem(DRAFT_PREFIX + key, input.value);
      const view = input.closest(".app-view");
      if (view && view.id) localStorage.setItem(DRAFT_VIEW_KEY, view.id);
    });
  });

  document.querySelectorAll(".js-clear-draft").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prefix = btn.getAttribute("data-prefix");
      clearDraftPrefix(prefix);
      const form = btn.closest("form");
      if (form) form.reset();
      showToast("تم مسح المسودة المؤقتة");
    });
  });
}

function clearDraftPrefix(prefix) {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith(DRAFT_PREFIX + prefix)) localStorage.removeItem(k);
  });
  localStorage.removeItem(DRAFT_VIEW_KEY);
  document.getElementById("draft-banner").style.display = "none";
}

function restoreDraftPrefix(prefix) {
  document.querySelectorAll(`[data-draft^="${prefix}"]`).forEach((input) => {
    const val = localStorage.getItem(DRAFT_PREFIX + input.getAttribute("data-draft"));
    if (val !== null) input.value = val;
  });
}

function checkDraftBanner() {
  const savedView = localStorage.getItem(DRAFT_VIEW_KEY);
  const banner = document.getElementById("draft-banner");
  if (!savedView || state.userRole === "author") {
    banner.style.display = "none";
    return;
  }
  const hasData = Object.keys(localStorage).some(
    (k) => k.startsWith(DRAFT_PREFIX) && (localStorage.getItem(k) || "").trim() !== ""
  );
  if (!hasData) {
    localStorage.removeItem(DRAFT_VIEW_KEY);
    banner.style.display = "none";
    return;
  }
  banner.style.display = "flex";
  document.getElementById("btn-restore-draft").onclick = () => {
    banner.style.display = "none";
    populateAllSelects();
    navigateToView(savedView);
  };
  document.getElementById("btn-discard-draft").onclick = () => {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k);
    });
    localStorage.removeItem(DRAFT_VIEW_KEY);
    banner.style.display = "none";
    showToast("تم تجاهل المسودة");
  };
}

initAutoSaveEngine();

// ==========================================================================
// 6. الأدوات المساعدة العامة (العملة، التواريخ، رفع الصور، جوجل درايف)
// ==========================================================================
function formatEGP(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " ج.م";
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function getBaseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function buildWhatsAppUrl(phone, text = "") {
  if (!phone) return "#";
  let cleaned = String(phone).replace(/[^\d+]/g, "");
  if (cleaned.startsWith("01") && cleaned.length === 11) {
    cleaned = "2" + cleaned;
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

function showToast(msg, icon = "ri-check-line") {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast-item";
  el.innerHTML = `<i class="${icon}"></i><span>${cleanText(msg)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 220);
  }, 3100);
}

function askConfirm(title, msg, onYes) {
  document.getElementById("confirm-title-text").textContent = title;
  document.getElementById("confirm-msg-text").textContent = msg;
  state.confirmCallback = onYes;
  document.getElementById("modal-confirm").classList.add("show");
}

document.getElementById("btn-confirm-exec").addEventListener("click", async () => {
  document.getElementById("modal-confirm").classList.remove("show");
  if (typeof state.confirmCallback === "function") {
    await state.confirmCallback();
    state.confirmCallback = null;
  }
});

async function uploadCompressedImage(file, maxWidth = 880, quality = 0.78) {
  if (!file) return null;
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (ev) => {
      const img = new Image();
      img.src = ev.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });

  const form = new FormData();
  form.append("key", IMGBB_API_KEY);
  form.append("image", base64);
  const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
  const json = await res.json();
  if (json?.success && json?.data?.url) return json.data.url;
  throw new Error("Image upload failed");
}

function parseDriveUrl(rawUrl) {
  if (!rawUrl || !rawUrl.trim()) return null;
  const u = rawUrl.trim();
  const m = u.match(/[-\w]{25,}/);
  if (m && m[0]) {
    return {
      previewUrl: `https://drive.google.com/file/d/${m[0]}/preview`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${m[0]}`
    };
  }
  return { previewUrl: u, downloadUrl: u };
}

function getContractInfo(startDate, months, isTerminated = false) {
  if (isTerminated) {
    return { endDateStr: "-", daysLeft: -999, label: "عقد مفسوخ / ملغي", badgeClass: "neg", isExpiring: true };
  }
  if (!startDate || !months) {
    return { endDateStr: "غير محدد", daysLeft: 365, label: "عقد ساري", badgeClass: "pos", isExpiring: false };
  }
  const start = new Date(startDate);
  const end = new Date(start);
  end.setMonth(end.getMonth() + Number(months));
  const days = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const endDateStr = end.toISOString().split("T")[0];

  if (days < 0) {
    return { endDateStr, daysLeft: days, label: `منتهي منذ ${Math.abs(days)} يوم`, badgeClass: "neg", isExpiring: true };
  } else if (days <= 35) {
    return { endDateStr, daysLeft: days, label: `ينتهي خلال ${days} يوم`, badgeClass: "neg", isExpiring: true };
  }
  return { endDateStr, daysLeft: days, label: `ساري (${days} يوم)`, badgeClass: "pos", isExpiring: false };
}

function isDateWithinRange(dateStr, fromStr, toStr) {
  if (!dateStr) return true;
  if (fromStr && dateStr < fromStr) return false;
  if (toStr && dateStr > toStr) return false;
  return true;
}

function sortDesc(list) {
  return [...list].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

async function logAudit(actionTitle, detailsText) {
  if (!state.userEmail) return;
  try {
    await addDoc(collection(db, "activity_logs"), {
      actorEmail: state.userEmail,
      actorName: state.userProfile.displayName || state.userEmail,
      actorRole: state.userRole,
      actionTitle,
      detailsText,
      dateString: getTodayStr(),
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.warn("Log note:", e);
  }
}

function clearListeners() {
  state.unsubscribers.forEach((u) => typeof u === "function" && u());
  state.unsubscribers = [];
}

// ==========================================================================
// 7. بوابة الدخول وحارس الصلاحيات (Authentication & Gatekeeper)
// ==========================================================================
document.getElementById("btn-google-login").addEventListener("click", async () => {
  document.getElementById("auth-error-box").style.display = "none";
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    const box = document.getElementById("auth-error-box");
    document.getElementById("auth-error-text").textContent = "تعذر تسجيل الدخول عبر Google. تأكد من اتصال الإنترنت.";
    box.style.display = "block";
  }
});

document.getElementById("btn-profile-logout").addEventListener("click", () => {
  document.getElementById("modal-logout").classList.add("show");
});
document.getElementById("btn-portal-logout").addEventListener("click", () => {
  document.getElementById("modal-logout").classList.add("show");
});
document.getElementById("btn-confirm-logout-now").addEventListener("click", async () => {
  document.getElementById("modal-logout").classList.remove("show");
  clearListeners();
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  clearListeners();
  const authScreen = document.getElementById("auth-screen");
  const appScreen = document.getElementById("app-screen");
  const errBox = document.getElementById("auth-error-box");
  const errText = document.getElementById("auth-error-text");

  if (!user || !user.email) {
    state.currentUser = null;
    authScreen.style.display = "flex";
    appScreen.style.display = "none";
    return;
  }

  const email = user.email.trim().toLowerCase();
  state.currentUser = user;
  state.userEmail = email;

  try {
    const profSnap = await getDoc(doc(db, "user_profiles", email));
    state.userProfile.displayName = profSnap.exists()
      ? profSnap.data().displayName || user.displayName || email.split("@")[0]
      : user.displayName || email.split("@")[0];

    // 1. الإدارة العليا
    if (isSuperAdminEmail(email)) {
      state.userRole = "super_admin";
      state.permissions = { ...FULL_PERMS };
      launchWorkspace();
      return;
    }

    // 2. الموظفون
    const staffSnap = await getDocs(query(collection(db, "staff"), where("email", "==", email)));
    if (!staffSnap.empty) {
      const s = staffSnap.docs[0].data();
      if (s.restricted) {
        await signOut(auth);
        errText.textContent = "تم تجميد وتقييد حسابك مؤقتاً من قِبل الإدارة.";
        errBox.style.display = "block";
        authScreen.style.display = "flex";
        appScreen.style.display = "none";
        return;
      }
      state.userRole = "employee";
      const p = s.permissions || {};
      state.permissions = {
        sell: p.sell !== undefined ? !!p.sell : true,
        addBook: p.addBook !== undefined ? !!p.addBook : true,
        deleteBook: !!p.deleteBook,
        authors: p.authors !== undefined ? !!p.authors : true,
        payouts: !!p.payouts,
        expenses: !!p.expenses,
        financeView: !!p.financeView,
        reports: p.reports !== undefined ? !!p.reports : true
      };
      if (!profSnap.exists() && s.name) state.userProfile.displayName = s.name;
      launchWorkspace();
      return;
    }

    // 3. المؤلفون
    const authorSnap = await getDocs(query(collection(db, "authors"), where("email", "==", email)));
    if (!authorSnap.empty) {
      const aDoc = authorSnap.docs[0];
      const aData = aDoc.data();
      if (aData.restricted) {
        await signOut(auth);
        errText.textContent = "تم تقييد وصول هذا الحساب مؤقتاً. يرجى مراجعة إدارة الدار.";
        errBox.style.display = "block";
        authScreen.style.display = "flex";
        appScreen.style.display = "none";
        return;
      }
      state.userRole = "author";
      state.currentAuthorProfile = { id: aDoc.id, ...aData };
      state.userProfile.displayName = aData.name || state.userProfile.displayName;
      launchWorkspace();
      return;
    }

    // 4. غير مصرح
    await signOut(auth);
    errText.textContent = `الحساب (${email}) غير مسجل في النظام. الدخول للمعتمدين فقط.`;
    errBox.style.display = "block";
    authScreen.style.display = "flex";
    appScreen.style.display = "none";
  } catch (err) {
    console.error("Auth gate error:", err);
    errText.textContent = "تعذر التحقق من الصلاحيات. تأكد من إعدادات قاعدة البيانات.";
    errBox.style.display = "block";
  }
});

// ==========================================================================
// 8. إطلاق الواجهة وضبط الصلاحيات والاستماع الفوري (Workspace & Listeners)
// ==========================================================================
function launchWorkspace() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";

  updateUserIdentityUI();
  renderComprehensiveGuide();

  const dockWrap = document.getElementById("floating-dock-container");
  const calcBtn = document.getElementById("btn-open-calculator");

  if (state.userRole === "author") {
    // عزل تام لبوابة المؤلف
    dockWrap.style.display = "none";
    calcBtn.style.display = "none";
    document.getElementById("btn-header-guide").style.display = "none";
    document.getElementById("btn-header-notif").style.display = "none";
    document.getElementById("btn-open-drawer").style.display = "none";

    navigateToView("view-author-portal");
    startAuthorIsolatedListeners(state.currentAuthorProfile.id);
    return;
  }

  const p = state.permissions;
  dockWrap.style.display = "flex";
  calcBtn.style.display = "inline-flex";
  document.getElementById("btn-header-guide").style.display = "inline-flex";
  document.getElementById("btn-header-notif").style.display = "inline-flex";
  document.getElementById("btn-open-drawer").style.display = "inline-flex";

  document.getElementById("dlink-authors").style.display = p.authors ? "flex" : "none";
  document.getElementById("dlink-libraries").style.display = p.authors ? "flex" : "none";
  document.getElementById("dlink-exhibitions").style.display = p.authors ? "flex" : "none";
  document.getElementById("dock-btn-authors").style.display = p.authors ? "flex" : "none";

  document.getElementById("dlink-warehouses").style.display = p.addBook || p.sell ? "flex" : "none";
  document.getElementById("dlink-finance").style.display = p.financeView || p.expenses ? "flex" : "none";
  document.getElementById("dlink-staff").style.display = state.userRole === "super_admin" ? "flex" : "none";

  document.getElementById("btn-top-add-contract").style.display = p.addBook ? "inline-flex" : "none";
  document.getElementById("qadd-contract").style.display = p.addBook ? "flex" : "none";
  document.getElementById("qadd-edition").style.display = p.addBook ? "flex" : "none";
  document.getElementById("qadd-author").style.display = p.authors ? "flex" : "none";
  document.getElementById("qadd-library").style.display = p.authors ? "flex" : "none";
  document.getElementById("qadd-exhibition").style.display = p.authors ? "flex" : "none";
  document.getElementById("qadd-payout").style.display = p.payouts ? "flex" : "none";
  document.getElementById("qadd-expense").style.display = p.expenses ? "flex" : "none";

  document.getElementById("dashboard-wallet-metrics").style.display = p.financeView ? "grid" : "none";
  document.getElementById("btn-notif-new").style.display = state.userRole === "super_admin" ? "inline-flex" : "none";

  checkDraftBanner();
  navigateToView("view-dashboard");
  startERPListeners();
}

function updateUserIdentityUI() {
  const roleAr =
    state.userRole === "super_admin"
      ? "الإدارة العليا"
      : state.userRole === "employee"
      ? "موظف معتمد"
      : "بوابة المؤلف";

  const name = state.userProfile.displayName || "مستخدم";
  const initial = name.trim()[0] || "ص";

  document.getElementById("header-sub-role").textContent = `${name} • ${roleAr}`;
  document.getElementById("drawer-user-name").textContent = name;
  document.getElementById("drawer-user-role").textContent = roleAr;
  document.getElementById("drawer-user-initials").textContent = initial;

  document.getElementById("profile-card-name").textContent = name;
  document.getElementById("profile-card-email").textContent = state.userEmail;
  document.getElementById("profile-card-role").textContent = roleAr;
  document.getElementById("profile-card-initials").textContent = initial;
  document.getElementById("profile-name-input").value = name;

  const h = new Date().getHours();
  const greet =
    h >= 4 && h < 12
      ? `صباح الخير والبركة، أ. ${name}`
      : h >= 12 && h < 17
      ? `مساء النشاط والتوفيق، أ. ${name}`
      : `مساء الخير، أ. ${name}`;
  document.getElementById("greeting-headline").textContent = greet;
}

function startERPListeners() {
  const uAuthors = onSnapshot(collection(db, "authors"), (snap) => {
    state.authors = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    populateAllSelects();
    renderAuthorsDirectory();
    if (state.selectedAuthorDetailId) renderAuthorDetailPage(state.selectedAuthorDetailId);
    updateHouseWalletMetrics();
  });

  const uWarehouses = onSnapshot(collection(db, "warehouses"), async (snap) => {
    state.warehouses = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    if (state.warehouses.length === 0 && state.userRole === "super_admin") {
      await addDoc(collection(db, "warehouses"), {
        name: "المستودع الرئيسي للدار",
        location: "المقر الرئيسي",
        isDefault: true,
        createdAt: serverTimestamp()
      });
      return;
    }
    populateAllSelects();
    renderWarehousesView();
  });

  const uEditions = onSnapshot(collection(db, "editions"), (snap) => {
    state.editions = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderWarehousesView();
    if (state.selectedBookDetailId) renderSingleBookDetail(state.selectedBookDetailId);
  });

  const uBooks = onSnapshot(collection(db, "books"), (snap) => {
    state.books = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    populateAllSelects();
    updateBookFilterPills();
    renderDashboardBooks();
    renderContractsBooksGrid();
    renderWarehousesView();
    if (state.selectedBookDetailId) renderSingleBookDetail(state.selectedBookDetailId);
    if (state.selectedAuthorDetailId) renderAuthorDetailPage(state.selectedAuthorDetailId);
    if (state.selectedExhibitionDetailId) renderExhibitionDetailPage(state.selectedExhibitionDetailId);
    updateHouseWalletMetrics();
    renderSalesChart();
  });

  const uLibs = onSnapshot(collection(db, "libraries"), (snap) => {
    state.libraries = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderLibrariesGrid();
    if (state.selectedLibraryDetailId) renderLibraryDetailPage(state.selectedLibraryDetailId);
  });

  const uLibTx = onSnapshot(collection(db, "library_transactions"), (snap) => {
    state.libraryTransactions = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderLibrariesGrid();
    renderWarehousesView();
    if (state.selectedLibraryDetailId) renderLibraryDetailPage(state.selectedLibraryDetailId);
    if (state.selectedBookDetailId) renderSingleBookDetail(state.selectedBookDetailId);
  });

  const uExh = onSnapshot(collection(db, "exhibitions"), (snap) => {
    state.exhibitions = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    populateAllSelects();
    renderExhibitionsGrid();
    if (state.selectedExhibitionDetailId) renderExhibitionDetailPage(state.selectedExhibitionDetailId);
    if (state.selectedBookDetailId) renderSingleBookDetail(state.selectedBookDetailId);
  });

  const uSales = onSnapshot(collection(db, "sales"), (snap) => {
    state.sales = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderFinanceTimeline();
    if (state.selectedExhibitionDetailId) renderExhibitionDetailPage(state.selectedExhibitionDetailId);
    updateHouseWalletMetrics();
  });

  const uExp = onSnapshot(collection(db, "expenses"), (snap) => {
    state.expenses = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderFinanceTimeline();
    if (state.selectedBookDetailId) renderSingleBookDetail(state.selectedBookDetailId);
    if (state.selectedExhibitionDetailId) renderExhibitionDetailPage(state.selectedExhibitionDetailId);
    updateHouseWalletMetrics();
  });

  const uPay = onSnapshot(collection(db, "payouts"), (snap) => {
    state.payouts = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderFinanceTimeline();
    renderAuthorsDirectory();
    if (state.selectedAuthorDetailId) renderAuthorDetailPage(state.selectedAuthorDetailId);
    updateHouseWalletMetrics();
  });

  const uNotif = onSnapshot(collection(db, "notifications"), (snap) => {
    state.notifications = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderNotificationsView();
  });

  const uLogs = onSnapshot(collection(db, "activity_logs"), (snap) => {
    state.activityLogs = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderAuditLogs();
    if (state.userRole === "super_admin") renderStaffGrid();
  });

  if (state.userRole === "super_admin") {
    const uStaff = onSnapshot(collection(db, "staff"), (snap) => {
      state.staff = sortDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      renderStaffGrid();
      populateAllSelects();
    });
    state.unsubscribers.push(uStaff);
  }

  state.unsubscribers.push(uAuthors, uWarehouses, uEditions, uBooks, uLibs, uLibTx, uExh, uSales, uExp, uPay, uNotif, uLogs);
}

// ==========================================================================
// 9. البحث الذكي الشامل، محفظة الدار، والمؤشر البياني (Dashboard & Search)
// ==========================================================================
const globalSearchInput = document.getElementById("global-smart-search");
const quickSearchPanel = document.getElementById("quick-search-panel");
const quickSearchResults = document.getElementById("quick-search-results");

globalSearchInput.addEventListener("input", () => {
  const q = globalSearchInput.value.trim().toLowerCase();
  if (!q) {
    quickSearchPanel.style.display = "none";
    return;
  }

  const mBooks = state.books.filter(
    (b) => (b.title || "").toLowerCase().includes(q) || (b.authorName || "").toLowerCase().includes(q) || (b.isbn || "").toLowerCase().includes(q)
  );
  const mAuthors = state.authors.filter(
    (a) => (a.name || "").toLowerCase().includes(q) || (a.email || "").toLowerCase().includes(q)
  );
  const mLibs = state.libraries.filter((l) => (l.name || "").toLowerCase().includes(q));
  const mExhs = state.exhibitions.filter((x) => (x.name || "").toLowerCase().includes(q));

  quickSearchPanel.style.display = "block";

  if (!mBooks.length && !mAuthors.length && !mLibs.length && !mExhs.length) {
    quickSearchResults.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 12px;">لا توجد نتائج مطابقة لـ "${cleanText(globalSearchInput.value)}"</p>`;
    return;
  }

  let html = "";
  if (mAuthors.length) {
    html += `<div style="margin-bottom: 10px;"><strong style="font-size: 12px;">المؤلفون (${mAuthors.length}):</strong>` +
      mAuthors.slice(0, 3).map((a) => `
        <div class="list-row" style="cursor: pointer; padding: 9px 12px; margin-top: 4px;" data-action="open-author" data-id="${a.id}">
          <span><i class="ri-quill-pen-line"></i> <strong>${cleanText(a.name)}</strong> (${cleanText(a.email)})</span>
          <span class="badge invert">ملف المؤلف</span>
        </div>`).join("") + `</div>`;
  }
  if (mLibs.length) {
    html += `<div style="margin-bottom: 10px;"><strong style="font-size: 12px;">المكتبات (${mLibs.length}):</strong>` +
      mLibs.slice(0, 3).map((l) => `
        <div class="list-row" style="cursor: pointer; padding: 9px 12px; margin-top: 4px;" data-action="open-library" data-id="${l.id}">
          <span><i class="ri-building-2-line"></i> <strong>${cleanText(l.name)}</strong></span>
          <span class="badge">ملف المكتبة</span>
        </div>`).join("") + `</div>`;
  }
  if (mExhs.length) {
    html += `<div style="margin-bottom: 10px;"><strong style="font-size: 12px;">المعارض (${mExhs.length}):</strong>` +
      mExhs.slice(0, 3).map((x) => `
        <div class="list-row" style="cursor: pointer; padding: 9px 12px; margin-top: 4px;" data-action="open-exhibition" data-id="${x.id}">
          <span><i class="ri-compass-discover-line"></i> <strong>${cleanText(x.name)}</strong></span>
          <span class="badge">جناح المعرض</span>
        </div>`).join("") + `</div>`;
  }
  if (mBooks.length) {
    html += `<div><strong style="font-size: 12px; display: block; margin-bottom: 6px;">الكتب (${mBooks.length}):</strong>
      <div class="books-grid">${mBooks.slice(0, 4).map(buildBookCardHTML).join("")}</div></div>`;
  }
  quickSearchResults.innerHTML = html;
});

document.getElementById("btn-close-quick-search").addEventListener("click", () => {
  globalSearchInput.value = "";
  quickSearchPanel.style.display = "none";
});

function updateHouseWalletMetrics() {
  let totalRev = 0;
  let totalCopies = 0;
  let totalAuthorsEarned = 0;
  let totalWarehouseStock = 0;
  let lowStockBooks = 0;

  // حساب المبيعات من سجل المبيعات الفعلي لضمان الدقة التاريخية للأسعار، مع دعم المبيعات المبدئية بالكتب
  if (state.sales.length > 0) {
    state.sales.forEach((s) => {
      totalCopies += Number(s.qty || 0);
      totalRev += Number(s.totalAmount || 0);
      totalAuthorsEarned += Number(s.authorCut || 0);
    });
  } else {
    state.books.forEach((b) => {
      const c = Number(b.copiesSold || 0);
      const rev = c * Number(b.price || 0);
      totalCopies += c;
      totalRev += rev;
      totalAuthorsEarned += rev * (Number(b.royaltyRate || 0) / 100);
    });
  }

  state.books.forEach((b) => {
    const st = Number(b.stock || 0);
    totalWarehouseStock += st;
    if (b.stock !== "" && b.stock !== undefined && st <= 15) lowStockBooks++;
  });

  const totalPaid = state.payouts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const unpaidAuthors = Math.max(0, totalAuthorsEarned - totalPaid);
  const totalExp = state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netHouseWallet = totalRev - totalAuthorsEarned - totalExp;

  document.getElementById("stat-total-rev").textContent = formatEGP(totalRev);
  document.getElementById("stat-total-copies").textContent = `${totalCopies} نسخة مباعة`;

  const netEl = document.getElementById("stat-net-profit");
  netEl.textContent = formatEGP(netHouseWallet);
  netEl.className = `metric-val ${netHouseWallet >= 0 ? "money-pos" : "money-neg"}`;

  document.getElementById("stat-authors-unpaid").textContent = formatEGP(unpaidAuthors);
  document.getElementById("stat-authors-paid").textContent = `سُدد لهم: ${formatEGP(totalPaid)}`;
  document.getElementById("stat-total-exp").textContent = formatEGP(totalExp);
  document.getElementById("stat-warehouse-stock-sub").textContent = `المخزون المتاح: ${totalWarehouseStock} نسخة`;

  const lowAlert = document.getElementById("low-stock-alert-box");
  if (lowStockBooks > 0) {
    document.getElementById("low-stock-alert-text").textContent = `تنبيه مخزون: يوجد (${lowStockBooks}) كتاب في المستودع وصلت كميته إلى 15 نسخة أو أقل وتحتاج إعادة طباعة!`;
    lowAlert.style.display = "flex";
  } else {
    lowAlert.style.display = "none";
  }
}

function renderSalesChart() {
  const canvas = document.getElementById("salesChartCanvas");
  if (!canvas || typeof Chart === "undefined") return;

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor = isDark ? "#fafafa" : "#09090b";
  const barBg = isDark ? "#fafafa" : "#09090b";

  const top = [...state.books]
    .sort((a, b) => Number(b.copiesSold || 0) - Number(a.copiesSold || 0))
    .slice(0, 6);

  const labels = top.length ? top.map((b) => b.title) : ["لا توجد مبيعات بعد"];
  const copiesData = top.length ? top.map((b) => Number(b.copiesSold || 0)) : [0];

  if (state.chartInstance) state.chartInstance.destroy();

  state.chartInstance = new Chart(canvas, {
    type: state.currentChartType,
    data: {
      labels,
      datasets: [
        {
          label: "النسخ المباعة",
          data: copiesData,
          backgroundColor: barBg,
          borderColor: barBg,
          borderWidth: 2,
          borderRadius: 6,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor, font: { family: "Tajawal", weight: "bold" } } }
      },
      scales: {
        x: { ticks: { color: textColor, font: { family: "Tajawal" } } },
        y: { ticks: { color: textColor, font: { family: "Tajawal" } } }
      }
    }
  });
}

document.querySelectorAll(".js-chart-type").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".js-chart-type").forEach((b) => (b.className = "btn btn-outline js-chart-type"));
    btn.className = "btn btn-primary js-chart-type";
    state.currentChartType = btn.getAttribute("data-type");
    renderSalesChart();
  });
});

// ==========================================================================
// 10. الكتب والعقود، الصفحة التفصيلية للكتاب، والمستودعات والطبعات
// ==========================================================================
function buildBookCardHTML(b) {
  const sold = Number(b.copiesSold || 0);
  const price = Number(b.price || 0);
  const stock = b.stock !== "" && b.stock !== undefined ? Number(b.stock) : null;
  const contract = getContractInfo(b.contractDate, b.contractMonths, b.isTerminated);
  const p = state.permissions;

  const coverHtml = b.coverUrl
    ? `<img src="${b.coverUrl}" alt="${cleanText(b.title)}" loading="lazy" />`
    : `<div class="book-typo-cover">
         <i class="ri-book-2-line"></i>
         <h4>${cleanText(b.title)}</h4>
         <span>${cleanText(b.authorName || "")}</span>
       </div>`;

  return `
    <div class="book-card">
      <div class="book-cover-wrap" data-action="open-book" data-id="${b.id}" title="اضغط لفتح صفحة الكتاب الكاملة">
        <div class="cover-badges">
          <span class="badge ${contract.badgeClass}">${contract.label}</span>
          <button type="button" class="icon-btn" style="width: 30px; height: 30px; border-radius: 50%; font-size: 15px;" data-action="toggle-fav" data-id="${b.id}">
            <i class="${b.isFavorite ? "ri-star-fill" : "ri-star-line"}"></i>
          </button>
        </div>
        ${coverHtml}
      </div>

      <div class="book-body">
        <div>
          <div class="book-title-link" data-action="open-book" data-id="${b.id}">${cleanText(b.title)}</div>
          <div class="book-author-link" data-action="open-author" data-id="${b.authorId}">
            <i class="ri-quill-pen-line"></i> ${cleanText(b.authorName || "غير محدد")}
          </div>
        </div>

        <div class="book-mini-stats">
          <div><span>السعر</span><strong>${formatEGP(price)}</strong></div>
          <div><span>المباع</span><strong class="money-pos">${sold} نسخة</strong></div>
          <div><span>نسبة المؤلف</span><strong>${Number(b.royaltyRate || 0)}%</strong></div>
          <div><span>المستودع</span><strong class="${stock !== null && stock <= 15 ? "money-neg" : ""}">${stock !== null ? stock + " نسخة" : "مفتوح"}</strong></div>
        </div>

        <div style="display: flex; gap: 6px; margin-top: auto;">
          ${
            p.sell && !b.isTerminated
              ? `<button type="button" class="btn btn-primary" style="flex: 1; padding: 8px;" data-action="sell-book" data-id="${b.id}">
                   <i class="ri-shopping-bag-3-line"></i><span>بيع نسخة</span>
                 </button>`
              : ""
          }
          <button type="button" class="btn btn-outline" style="padding: 8px 10px;" data-action="open-book" data-id="${b.id}" title="تفاصيل الكتاب والعقد">
            <i class="ri-arrow-left-up-line"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function updateBookFilterPills() {
  document.getElementById("count-books-all").textContent = state.books.length;
  document.getElementById("count-books-fav").textContent = state.books.filter((b) => b.isFavorite).length;
  document.getElementById("count-books-active").textContent = state.books.filter(
    (b) => !getContractInfo(b.contractDate, b.contractMonths, b.isTerminated).isExpiring
  ).length;
  document.getElementById("count-books-expiring").textContent = state.books.filter(
    (b) => getContractInfo(b.contractDate, b.contractMonths, b.isTerminated).isExpiring
  ).length;
  document.getElementById("count-books-low").textContent = state.books.filter(
    (b) => b.stock !== "" && b.stock !== undefined && Number(b.stock) <= 15
  ).length;
}

document.querySelectorAll("[data-book-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-book-filter]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeBookFilter = btn.getAttribute("data-book-filter");
    renderContractsBooksGrid();
  });
});

function renderDashboardBooks() {
  const box = document.getElementById("dashboard-books-grid");
  if (!box) return;
  const favs = state.books.filter((b) => b.isFavorite);
  const list = favs.length ? favs.slice(0, 6) : state.books.slice(0, 6);
  box.innerHTML = list.length
    ? list.map(buildBookCardHTML).join("")
    : `<div class="surface-card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 26px;">لا توجد كتب مضافة بعد. اضغط زر (+) في الشريط السفلي لإضافة مؤلف وعقد كتاب.</div>`;
}

function renderContractsBooksGrid() {
  const box = document.getElementById("contracts-books-grid");
  if (!box) return;
  const q = (document.getElementById("books-search-input").value || "").trim().toLowerCase();
  let list = [...state.books].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));

  if (state.activeBookFilter === "fav") list = list.filter((b) => b.isFavorite);
  else if (state.activeBookFilter === "active")
    list = list.filter((b) => !getContractInfo(b.contractDate, b.contractMonths, b.isTerminated).isExpiring);
  else if (state.activeBookFilter === "expiring")
    list = list.filter((b) => getContractInfo(b.contractDate, b.contractMonths, b.isTerminated).isExpiring);
  else if (state.activeBookFilter === "lowstock")
    list = list.filter((b) => b.stock !== "" && b.stock !== undefined && Number(b.stock) <= 15);

  if (q) {
    list = list.filter(
      (b) =>
        (b.title || "").toLowerCase().includes(q) ||
        (b.authorName || "").toLowerCase().includes(q) ||
        (b.category || "").toLowerCase().includes(q) ||
        (b.isbn || "").toLowerCase().includes(q)
    );
  }

  box.innerHTML = list.length
    ? list.map(buildBookCardHTML).join("")
    : `<div class="surface-card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">لا توجد كتب مطابقة للبحث أو الفلتر المحدد.</div>`;
}

document.getElementById("books-search-input").addEventListener("input", renderContractsBooksGrid);

// --- الصفحة المستقلة والتفصيلية للكتاب (Single Book Dedicated Page) ---
function renderSingleBookDetail(bookId) {
  const b = state.books.find((x) => x.id === bookId);
  if (!b) return;

  const contract = getContractInfo(b.contractDate, b.contractMonths, b.isTerminated);
  const bookSales = state.sales.filter((s) => s.bookId === bookId);
  const soldCopies = Number(b.copiesSold || 0);
  const totalRev = bookSales.length
    ? bookSales.reduce((s, x) => s + Number(x.totalAmount || 0), 0)
    : soldCopies * Number(b.price || 0);
  const authorCut = bookSales.length
    ? bookSales.reduce((s, x) => s + Number(x.authorCut || 0), 0)
    : totalRev * (Number(b.royaltyRate || 0) / 100);

  // حساب المصاريف المرتبطة بهذا الكتاب (سواء فردية أو حصة الكتاب من حملة جماعية)
  let bookExpenses = 0;
  state.expenses.forEach((exp) => {
    if (Array.isArray(exp.bookIds) && exp.bookIds.includes(bookId)) {
      bookExpenses += Number(exp.amount || 0) / exp.bookIds.length;
    }
  });

  const bookEditions = state.editions.filter((e) => e.bookId === bookId && e.opType === "new_edition");
  const totalPrinted = bookEditions.reduce((s, e) => s + Number(e.qty || 0), 0) || Number(b.initialPrinted || b.stock || 0);

  document.getElementById("btn-book-det-pdf").style.display = b.drivePdfUrl ? "inline-flex" : "none";
  document.getElementById("btn-book-det-delete").style.display = state.permissions.deleteBook ? "inline-flex" : "none";
  document.getElementById("btn-book-det-terminate").style.display = state.permissions.deleteBook ? "inline-flex" : "none";

  document.getElementById("book-detail-header-card").innerHTML = `
    <div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
      ${b.coverUrl ? `<img src="${b.coverUrl}" style="width: 90px; height: 126px; object-fit: cover; border-radius: 10px; border: 1px solid var(--border);" />` : ""}
      <div style="flex: 1; min-width: 220px;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
          <span class="badge ${contract.badgeClass}">${contract.label}</span>
          ${b.category ? `<span class="badge">${cleanText(b.category)}</span>` : ""}
          ${b.edition ? `<span class="badge">${cleanText(b.edition)}</span>` : ""}
          ${b.isbn ? `<span class="badge" dir="ltr">ISBN: ${cleanText(b.isbn)}</span>` : ""}
        </div>
        <h2 style="font-size: 20px; font-weight: 900; margin-bottom: 4px;">${cleanText(b.title)}</h2>
        <p style="font-size: 13.5px; color: var(--text-secondary); cursor: pointer;" data-action="open-author" data-id="${b.authorId}">
          المؤلف: <strong style="text-decoration: underline;">${cleanText(b.authorName)}</strong> • سعر الغلاف: <strong>${formatEGP(b.price)}</strong>
        </p>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
          تاريخ العقد: ${b.contractDate || "-"} • المدة: ${b.contractMonths || 24} شهر • الانتهاء: ${contract.endDateStr}
        </p>
        ${b.notes ? `<div style="margin-top: 8px; padding: 8px 12px; background: var(--bg-subtle); border-radius: 8px; font-size: 12.5px;"><strong>بنود وملاحظات العقد:</strong> ${cleanText(b.notes)}</div>` : ""}
      </div>
    </div>
  `;

  document.getElementById("bdet-rev").textContent = formatEGP(totalRev);
  document.getElementById("bdet-sold-copies").textContent = `${soldCopies} نسخة مباعة`;
  document.getElementById("bdet-author-cut").textContent = formatEGP(authorCut);
  document.getElementById("bdet-royalty-rate").textContent = `نسبة المؤلف: ${Number(b.royaltyRate || 0)}%`;
  document.getElementById("bdet-expenses").textContent = formatEGP(bookExpenses);
  document.getElementById("bdet-stock").textContent = `${b.stock !== "" && b.stock !== undefined ? b.stock : 0} نسخة`;
  document.getElementById("bdet-printed-total").textContent = `إجمالي المطبوع: ${totalPrinted} نسخة`;

  // توزيع المستودعات وسجل الطبعات
  const whStocks = b.warehouseStocks || {};
  const whRows = Object.entries(whStocks)
    .map(([whId, qty]) => {
      const wh = state.warehouses.find((w) => w.id === whId);
      return `<div class="list-row" style="padding: 8px 12px;"><span><i class="ri-store-2-line"></i> ${cleanText(wh ? wh.name : "المستودع الرئيسي")}</span><strong>${qty} نسخة</strong></div>`;
    })
    .join("");

  const edRows = state.editions
    .filter((e) => e.bookId === bookId)
    .map(
      (e) =>
        `<div class="list-row" style="padding: 8px 12px; font-size: 12.5px;">
           <span>${e.opType === "transfer" ? "نقل مخزني" : "طبعة جديدة"}: <strong>${cleanText(e.title || "")}</strong> (${e.qty} نسخة)</span>
           <span class="badge">${e.dateString}</span>
         </div>`
    )
    .join("");

  document.getElementById("bdet-warehouses-editions").innerHTML =
    (whRows || `<p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 8px;">إجمالي الرصيد العام: ${b.stock || 0} نسخة</p>`) +
    `<h5 style="font-size: 13px; margin: 12px 0 6px;">سجل الطبعات والتحويلات:</h5>` +
    (edRows || `<p style="font-size: 12px; color: var(--text-muted);">لا توجد طبعات إضافية مسجلة بعد.</p>`);

  // المعارض والمكتبات المرتبطة بالكتاب
  const linkedExhs = state.exhibitions.filter((x) => Array.isArray(x.bookIds) && x.bookIds.includes(bookId));
  const libSupplied = state.libraryTransactions.filter((t) => t.bookId === bookId && t.txType === "supply");

  document.getElementById("bdet-exhibitions-libraries").innerHTML = `
    <h5 style="font-size: 13px; margin-bottom: 6px;">المعارض المشارك بها (${linkedExhs.length}):</h5>
    ${
      linkedExhs.length
        ? linkedExhs
            .map(
              (x) =>
                `<div class="list-row" style="padding: 8px 12px; cursor: pointer;" data-action="open-exhibition" data-id="${x.id}">
                   <span><i class="ri-compass-discover-line"></i> <strong>${cleanText(x.name)}</strong></span>
                   <span class="badge">${x.startDate}</span>
                 </div>`
            )
            .join("")
        : `<p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">غير مرتبط بمعارض حالياً.</p>`
    }
    <h5 style="font-size: 13px; margin: 12px 0 6px;">شحنات التوريد للمكتبات (${libSupplied.length}):</h5>
    ${
      libSupplied.length
        ? libSupplied
            .map(
              (t) =>
                `<div class="list-row" style="padding: 8px 12px; font-size: 12.5px;">
                   <span>مكتبة: <strong>${cleanText(t.libraryName)}</strong></span>
                   <span class="badge">${t.qty} نسخة</span>
                 </div>`
            )
            .join("")
        : `<p style="font-size: 12px; color: var(--text-muted);">لم يتم توريده لمكتبات بعد.</p>`
    }
  `;
}

document.getElementById("btn-back-from-book").addEventListener("click", () => navigateToView("view-contracts"));
document.getElementById("btn-book-det-sell").addEventListener("click", () => {
  if (state.selectedBookDetailId) openSellModal(state.selectedBookDetailId, "");
});
document.getElementById("btn-book-det-edition").addEventListener("click", () => {
  openEditionFormPage(state.selectedBookDetailId);
});
document.getElementById("btn-book-det-pdf").addEventListener("click", () => {
  if (state.selectedBookDetailId) openPdfViewerPage(state.selectedBookDetailId);
});
document.getElementById("btn-book-det-edit").addEventListener("click", () => {
  if (state.selectedBookDetailId) openBookFormPage(state.selectedBookDetailId, null);
});
document.getElementById("btn-book-det-terminate").addEventListener("click", async () => {
  const b = state.books.find((x) => x.id === state.selectedBookDetailId);
  if (!b) return;
  askConfirm(
    b.isTerminated ? "إعادة تفعيل العقد" : "فسخ / إلغاء عقد الكتاب",
    `هل أنت متأكد من ${b.isTerminated ? "إعادة تفعيل" : "فسخ وإيقاف"} عقد كتاب "${b.title}"؟`,
    async () => {
      await updateDoc(doc(db, "books", b.id), { isTerminated: !b.isTerminated });
      await logAudit("تحديث حالة عقد", `${!b.isTerminated ? "فسخ" : "تفعيل"} عقد كتاب: ${b.title}`);
      showToast("تم تحديث حالة العقد");
    }
  );
});
document.getElementById("btn-book-det-delete").addEventListener("click", () => {
  const b = state.books.find((x) => x.id === state.selectedBookDetailId);
  if (!b) return;
  askConfirm("حذف الكتاب نهائياً", `هل أنت متأكد من حذف كتاب "${b.title}"؟`, async () => {
    await deleteDoc(doc(db, "books", b.id));
    await logAudit("حذف كتاب", `حذف كتاب: ${b.title}`);
    showToast("تم حذف الكتاب");
    navigateToView("view-contracts");
  });
});

// --- إدارة المستودعات الفرعية والطبعات (Multi-Warehouse & Editions) ---
document.getElementById("btn-goto-add-warehouse").addEventListener("click", () => {
  document.getElementById("form-warehouse").reset();
  navigateToView("view-form-warehouse");
});

document.getElementById("form-warehouse").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("wh-name-field").value.trim();
  const location = document.getElementById("wh-location-field").value.trim();
  await addDoc(collection(db, "warehouses"), { name, location, createdAt: serverTimestamp() });
  await logAudit("إضافة مستودع", `إنشاء مستودع فرعي: ${name}`);
  clearDraftPrefix("wh_");
  showToast("تم إنشاء المستودع الفرعي بنجاح");
  navigateToView("view-warehouses");
});

document.getElementById("btn-goto-add-edition").addEventListener("click", () => openEditionFormPage(null));
document.getElementById("qadd-edition").addEventListener("click", () => {
  quickAddSheet.classList.remove("show");
  openEditionFormPage(null);
});

document.getElementById("ed-operation-type").addEventListener("change", (e) => {
  const isTransfer = e.target.value === "transfer";
  document.getElementById("ed-from-wh-wrap").style.display = isTransfer ? "block" : "none";
  document.getElementById("ed-to-wh-label").textContent = isTransfer
    ? "إلى مستودع (الوجهة) *"
    : "إيداع الطبعة في مستودع *";
});

function openEditionFormPage(preBookId = null) {
  if (!state.books.length) {
    showToast("أضف كتاباً أولاً قبل تسجيل طبعة أو نقل مخزون");
    return;
  }
  document.getElementById("form-edition").reset();
  document.getElementById("ed-from-wh-wrap").style.display = "none";
  populateAllSelects();
  if (preBookId) document.getElementById("ed-book-select").value = preBookId;
  navigateToView("view-form-edition");
}

document.getElementById("form-edition").addEventListener("submit", async (e) => {
  e.preventDefault();
  const opType = document.getElementById("ed-operation-type").value;
  const bookId = document.getElementById("ed-book-select").value;
  const qty = Math.max(1, Number(document.getElementById("ed-qty-field").value || 1));
  const fromWhId = document.getElementById("ed-from-wh-select").value;
  const toWhId = document.getElementById("ed-to-wh-select").value;
  const title = document.getElementById("ed-title-field").value.trim() || (opType === "transfer" ? "نقل مخزون" : "طبعة جديدة");

  const b = state.books.find((x) => x.id === bookId);
  if (!b) return;

  const whStocks = { ...(b.warehouseStocks || {}) };

  if (opType === "transfer") {
    if (fromWhId === toWhId) {
      showToast("يرجى اختيار مستودعين مختلفين للنقل بينهما");
      return;
    }
    whStocks[fromWhId] = Math.max(0, Number(whStocks[fromWhId] || b.stock || 0) - qty);
    whStocks[toWhId] = Number(whStocks[toWhId] || 0) + qty;
    await updateDoc(doc(db, "books", bookId), { warehouseStocks: whStocks });
    await logAudit("نقل مخزون", `نقل (${qty}) نسخة من كتاب "${b.title}" بين المستودعات`);
  } else {
    const newTotalStock = Number(b.stock || 0) + qty;
    whStocks[toWhId] = Number(whStocks[toWhId] || 0) + qty;
    await updateDoc(doc(db, "books", bookId), {
      stock: newTotalStock,
      warehouseStocks: whStocks,
      edition: title
    });
    await logAudit("إضافة طبعة جديدة", `إضافة طبعة (${title}) بعدد ${qty} نسخة لكتاب "${b.title}"`);
  }

  await addDoc(collection(db, "editions"), {
    opType,
    bookId,
    bookTitle: b.title,
    qty,
    fromWhId: opType === "transfer" ? fromWhId : "",
    toWhId,
    title,
    addedBy: state.userProfile.displayName,
    dateString: getTodayStr(),
    createdAt: serverTimestamp()
  });

  showToast("تم تحديث المستودع وسجل الطبعات بنجاح!");
  navigateToView("view-warehouses");
});

function renderWarehousesView() {
  const available = state.books.reduce((s, b) => s + Number(b.stock || 0), 0);
  const printedFromEditions = state.editions
    .filter((e) => e.opType === "new_edition")
    .reduce((s, e) => s + Number(e.qty || 0), 0);
  const initialPrinted = state.books.reduce((s, b) => s + Number(b.initialPrinted || 0), 0);
  const totalPrinted = Math.max(available, printedFromEditions + initialPrinted);

  const suppliedConsigned = state.libraryTransactions
    .filter((t) => t.txType === "supply")
    .reduce((s, t) => s + Number(t.qty || 0), 0);
  const soldConsigned = state.libraryTransactions
    .filter((t) => t.txType === "settle")
    .reduce((s, t) => s + Number(t.qty || 0), 0);
  const currentConsigned = Math.max(0, suppliedConsigned - soldConsigned);

  document.getElementById("wh-stat-printed").textContent = `${totalPrinted} نسخة`;
  document.getElementById("wh-stat-available").textContent = `${available} نسخة`;
  document.getElementById("wh-stat-consigned").textContent = `${currentConsigned} نسخة`;
  document.getElementById("wh-stat-count").textContent = `${Math.max(1, state.warehouses.length)} مستودع`;

  const grid = document.getElementById("warehouses-cards-grid");
  if (grid) {
    grid.innerHTML = state.warehouses
      .map((w) => {
        let whTotal = 0;
        const bookLines = [];
        state.books.forEach((b) => {
          const q = Number((b.warehouseStocks && b.warehouseStocks[w.id]) || (w.isDefault && !b.warehouseStocks ? b.stock : 0) || 0);
          if (q > 0) {
            whTotal += q;
            bookLines.push(`<span class="badge">${cleanText(b.title)}: ${q}</span>`);
          }
        });
        return `
          <div class="surface-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <h4 style="font-size: 15.5px; font-weight: 800;"><i class="ri-store-3-line"></i> ${cleanText(w.name)}</h4>
                <p style="font-size: 12px; color: var(--text-secondary);">${cleanText(w.location || "موقع معتمد")}</p>
              </div>
              <span class="badge invert">${whTotal} نسخة</span>
            </div>
            <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px;">
              ${bookLines.length ? bookLines.join("") : `<span style="font-size: 12px; color: var(--text-muted);">لا توجد نسخ مسجلة بهذا المستودع</span>`}
            </div>
          </div>
        `;
      })
      .join("");
  }

  const edList = document.getElementById("editions-history-list");
  if (edList) {
    edList.innerHTML = state.editions.length
      ? state.editions
          .slice(0, 40)
          .map((e) => {
            const toWh = state.warehouses.find((w) => w.id === e.toWhId);
            return `
              <div class="list-row">
                <div>
                  <h4 style="font-size: 14px; font-weight: 800;">
                    ${e.opType === "transfer" ? "نقل مخزني" : "توريد طبعة"}: ${cleanText(e.bookTitle)}
                    <span class="badge pos">+${e.qty} نسخة</span>
                  </h4>
                  <p style="font-size: 12px; color: var(--text-secondary);">
                    ${cleanText(e.title)} • الوجهة: ${cleanText(toWh ? toWh.name : "المستودع الرئيسي")} • بواسطة: ${cleanText(e.addedBy || "")}
                  </p>
                </div>
                <span class="badge">${e.dateString}</span>
              </div>
            `;
          })
          .join("")
      : `<div class="surface-card" style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد حركات طبعات مسجلة بعد.</div>`;
  }
}
// ==========================================================================
// Safaqat System ERP - Institutional Master Engine (app.js - Part 2 of 2)
// Authors + Libraries Consignment + Exhibitions + Finance + Smart Calculator
// ==========================================================================

// ==========================================================================
// 11. تعبئة كافة القوائم المنسدلة وقوائم الاختيار المتعدد (Dynamic Selects)
// ==========================================================================
function populateAllSelects(authorFilter = "") {
  // 1. قائمة المؤلفين في نموذج الكتاب
  const bookAuthSel = document.getElementById("book-author-select");
  if (bookAuthSel) {
    const cur = bookAuthSel.value;
    const q = authorFilter.trim().toLowerCase();
    const list = state.authors.filter(
      (a) => (a.name || "").toLowerCase().includes(q) || (a.email || "").toLowerCase().includes(q)
    );
    bookAuthSel.innerHTML =
      `<option value="">-- اختر المؤلف صاحب العقد --</option>` +
      list.map((a) => `<option value="${a.id}">${cleanText(a.name)} (${cleanText(a.email)})</option>`).join("");
    if (cur && list.some((a) => a.id === cur)) bookAuthSel.value = cur;
  }

  // 2. قوائم المستودعات الفرعية
  const whOptions = state.warehouses.length
    ? state.warehouses.map((w) => `<option value="${w.id}">${cleanText(w.name)}</option>`).join("")
    : `<option value="default">المستودع الرئيسي للدار</option>`;

  ["book-warehouse-select", "ed-from-wh-select", "ed-to-wh-select", "supply-wh-select", "sell-confirm-wh"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) {
        const cur = el.value;
        el.innerHTML = whOptions;
        if (cur) el.value = cur;
      }
    }
  );

  // 3. قوائم الكتب (في الطبعات، توريد المكتبات، التصفية، والحاسبة الذكية)
  const bookOptions =
    `<option value="">-- اختر الكتاب --</option>` +
    state.books
      .map(
        (b) =>
          `<option value="${b.id}">${cleanText(b.title)} (${formatEGP(b.price)} | متاح: ${b.stock !== "" && b.stock !== undefined ? b.stock : "مفتوح"})</option>`
      )
      .join("");

  ["ed-book-select", "supply-book-select", "settle-book-select", "calc-book-select"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      const cur = el.value;
      el.innerHTML = bookOptions;
      if (cur) el.value = cur;
    }
  });

  // 4. قائمة المؤلفين في نموذج الدفعات
  const payAuthSel = document.getElementById("payout-author-select");
  if (payAuthSel) {
    const cur = payAuthSel.value;
    payAuthSel.innerHTML =
      `<option value="">-- اختر المؤلف المستفيد --</option>` +
      state.authors.map((a) => `<option value="${a.id}">${cleanText(a.name)} (${cleanText(a.email)})</option>`).join("");
    if (cur) payAuthSel.value = cur;
  }

  // 5. قائمة المعارض في نموذج المصروفات
  const expExhSel = document.getElementById("expense-exhibition-select");
  if (expExhSel) {
    const cur = expExhSel.value;
    expExhSel.innerHTML =
      `<option value="">-- اختر المعرض --</option>` +
      state.exhibitions.map((x) => `<option value="${x.id}">${cleanText(x.name)}</option>`).join("");
    if (cur) expExhSel.value = cur;
  }

  // 6. قائمة المستهدفين في التنبيهات (موظفين + مؤلفين)
  const notifTargetSel = document.getElementById("notif-target-select");
  if (notifTargetSel) {
    const staffOpts = state.staff
      .filter((s) => !isSuperAdminEmail(s.email))
      .map((s) => `<option value="${s.email}">موظف: ${cleanText(s.name)} (${cleanText(s.email)})</option>`)
      .join("");
    const authorOpts = state.authors
      .map((a) => `<option value="${a.email}">مؤلف: ${cleanText(a.name)} (${cleanText(a.email)})</option>`)
      .join("");
    notifTargetSel.innerHTML =
      `<option value="all">جميع الموظفين وفريق العمل</option>` + staffOpts + authorOpts;
  }

  // 7. مربعات الاختيار المتعدد للكتب في الحملات الإعلانية والمعارض
  const booksCheckHTML = state.books
    .map(
      (b) => `
      <label class="check-tile">
        <input type="checkbox" value="${b.id}" class="js-multi-book-chk" />
        <span>${cleanText(b.title)}</span>
      </label>`
    )
    .join("");

  const exhCheckBox = document.getElementById("exh-books-checklist");
  if (exhCheckBox && !exhCheckBox.innerHTML.trim()) exhCheckBox.innerHTML = booksCheckHTML;

  const expCheckBox = document.getElementById("expense-books-checklist");
  if (expCheckBox) expCheckBox.innerHTML = booksCheckHTML;

  updateSmartCalculatorBreakdown();
}

document.getElementById("book-author-filter").addEventListener("input", (e) => {
  populateAllSelects(e.target.value);
});

// ==========================================================================
// 12. إدارة ملفات الكُتّاب، المحافظ، البيانات البنكية، والإجراءات الرقابية
// ==========================================================================
function renderAuthorsDirectory() {
  const box = document.getElementById("authors-directory-grid");
  if (!box) return;
  const q = (document.getElementById("authors-search-input").value || "").trim().toLowerCase();

  const list = state.authors.filter(
    (a) =>
      (a.name || "").toLowerCase().includes(q) ||
      (a.email || "").toLowerCase().includes(q) ||
      (a.phone || "").toLowerCase().includes(q)
  );

  if (!list.length) {
    box.innerHTML = `<div class="surface-card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">لا يوجد مؤلفون مسجلون حالياً. اضغط "إضافة مؤلف" للبدء.</div>`;
    return;
  }

  box.innerHTML = list
    .map((a) => {
      const aBooks = state.books.filter((b) => b.authorId === a.id);
      const aSales = state.sales.filter((s) => s.authorId === a.id);
      const copies = aBooks.reduce((s, b) => s + Number(b.copiesSold || 0), 0);
      const earned = aSales.length
        ? aSales.reduce((s, x) => s + Number(x.authorCut || 0), 0)
        : aBooks.reduce(
            (s, b) => s + Number(b.copiesSold || 0) * Number(b.price || 0) * (Number(b.royaltyRate || 0) / 100),
            0
          );
      const paid = state.payouts
        .filter((p) => p.authorId === a.id)
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const balance = Math.max(0, earned - paid);

      return `
        <div class="surface-card" style="display: flex; flex-direction: column; justify-content: space-between; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; cursor: pointer;" data-action="open-author" data-id="${a.id}">
            <div class="user-initials-circle">${cleanText((a.name || "م")[0])}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                <span class="badge invert">${aBooks.length} مؤلفات</span>
                ${a.restricted ? `<span class="badge neg">مقيّد</span>` : ""}
              </div>
              <h4 style="font-size: 15.5px; font-weight: 800; margin-top: 3px;">${cleanText(a.name)}</h4>
              <p style="font-size: 11.5px; color: var(--text-secondary);" dir="ltr">${cleanText(a.email)}</p>
            </div>
          </div>

          <div class="book-mini-stats">
            <div><span>المبيعات</span><strong>${copies} نسخة</strong></div>
            <div><span>رصيد المحفظة</span><strong class="${balance > 0 ? "money-pos" : ""}">${formatEGP(balance)}</strong></div>
          </div>

          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-primary" style="flex: 1; padding: 8px 10px;" data-action="open-author" data-id="${a.id}">
              <i class="ri-wallet-3-line"></i><span>محفظة وكتب المؤلف</span>
            </button>
            ${
              a.phone
                ? `<a href="${buildWhatsAppUrl(a.phone, `السلام عليكم أ. ${a.name}، نتواصل معك من إدارة نظام صفقات كتابية...`)}" target="_blank" class="icon-btn" style="width: 36px; height: 36px; color: var(--pos);" title="مراسلة عبر واتساب">
                     <i class="ri-whatsapp-line"></i>
                   </a>`
                : ""
            }
            <button type="button" class="icon-btn" style="width: 36px; height: 36px;" data-action="edit-author" data-id="${a.id}" title="تعديل البريد أو البيانات">
              <i class="ri-edit-box-line"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

document.getElementById("authors-search-input").addEventListener("input", renderAuthorsDirectory);

function renderAuthorDetailPage(authorId) {
  const a = state.authors.find((x) => x.id === authorId);
  if (!a) return;

  const aBooks = state.books.filter((b) => b.authorId === authorId);
  const aSales = state.sales.filter((s) => s.authorId === authorId);
  const aPayouts = state.payouts.filter((p) => p.authorId === authorId);

  const copies = aBooks.reduce((s, b) => s + Number(b.copiesSold || 0), 0);
  const earned = aSales.length
    ? aSales.reduce((s, x) => s + Number(x.authorCut || 0), 0)
    : aBooks.reduce(
        (s, b) => s + Number(b.copiesSold || 0) * Number(b.price || 0) * (Number(b.royaltyRate || 0) / 100),
        0
      );
  const paid = aPayouts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, earned - paid);

  document.getElementById("author-profile-banner").innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="user-initials-circle" style="width: 50px; height: 50px; font-size: 20px;">${cleanText((a.name || "م")[0])}</div>
        <div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <h3 style="font-size: 18px; font-weight: 900;">أ. ${cleanText(a.name)}</h3>
            <span class="badge ${a.restricted ? "neg" : "pos"}">${a.restricted ? "حساب مقيّد / مجمد" : "بوابة نشطة"}</span>
          </div>
          <p style="font-size: 12.5px; color: var(--text-secondary);" dir="ltr">${cleanText(a.email)} ${a.phone ? "• " + cleanText(a.phone) : ""}</p>
          ${a.bio ? `<p style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">${cleanText(a.bio)}</p>` : ""}
        </div>
      </div>

      <!-- إجراءات الإدارة الرقابية على ملف المؤلف -->
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        ${
          a.phone
            ? `<a href="${buildWhatsAppUrl(a.phone, `السلام عليكم أ. ${a.name}، بخصوص حسابكم في دار صفقات كتابية...`)}" target="_blank" class="btn btn-pos" style="padding: 7px 12px; font-size: 12px;">
                 <i class="ri-whatsapp-line"></i><span>واتساب</span>
               </a>`
            : ""
        }
        <button type="button" class="btn btn-outline" style="padding: 7px 12px; font-size: 12px;" data-action="edit-author" data-id="${a.id}">
          <i class="ri-mail-settings-line"></i><span>تعديل البريد والبيانات</span>
        </button>
        <button type="button" class="btn btn-outline" style="padding: 7px 12px; font-size: 12px; color: var(--neg);" data-action="toggle-restrict-author" data-id="${a.id}">
          <i class="ri-forbid-2-line"></i><span>${a.restricted ? "فك التقييد" : "تقييد المؤلف"}</span>
        </button>
        ${
          state.permissions.deleteBook
            ? `<button type="button" class="btn btn-neg" style="padding: 7px 12px; font-size: 12px;" data-action="delete-author-all" data-id="${a.id}">
                 <i class="ri-delete-bin-2-line"></i><span>حذف المؤلف وكتبه</span>
               </button>`
            : ""
        }
      </div>
    </div>
  `;

  document.getElementById("author-det-earned").textContent = formatEGP(earned);
  document.getElementById("author-det-copies").textContent = `${copies} نسخة مباعة`;
  document.getElementById("author-det-paid").textContent = formatEGP(paid);
  document.getElementById("author-det-balance").textContent = formatEGP(balance);

  // عرض البيانات البنكية للمؤلف
  const bankBox = document.getElementById("author-det-bank-box");
  if (a.bankAccount || a.bankName) {
    bankBox.innerHTML = `
      <div class="grid-2" style="font-size: 13px;">
        <div><strong>طريقة التحويل / البنك:</strong> ${cleanText(a.bankMethod || "")} - ${cleanText(a.bankName || "غير محدد")}</div>
        <div><strong>اسم المستفيد الرباعي:</strong> ${cleanText(a.bankHolder || a.name)}</div>
        <div><strong>رقم الحساب / IBAN / المحفظة:</strong> <span dir="ltr" style="font-family: monospace; font-weight: 800;">${cleanText(a.bankAccount || "-")}</span></div>
        <div><strong>الدولة والمدينة:</strong> ${cleanText(a.bankCountry || "-")} ${a.bankNotes ? `(${cleanText(a.bankNotes)})` : ""}</div>
      </div>
    `;
  } else {
    bankBox.innerHTML = `<p style="font-size: 12.5px; color: var(--neg); font-weight: 700;">لم يقم المؤلف بإدخال بياناته البنكية بعد. يمكنك إرسال تنبيه له لتحديث بياناته أو إضافتها يدوياً من زر تعديل البيانات.</p>`;
  }

  document.getElementById("author-det-books-grid").innerHTML = aBooks.length
    ? aBooks.map(buildBookCardHTML).join("")
    : `<div class="surface-card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 24px;">لا توجد عقود كتب مسجلة لهذا المؤلف بعد.</div>`;

  document.getElementById("author-det-payouts-list").innerHTML = aPayouts.length
    ? aPayouts
        .map(
          (p) => `
        <div class="list-row">
          <div>
            <h4 style="font-size: 14px; font-weight: 800;" class="money-pos">دفعة مسددة: ${formatEGP(p.amount)}</h4>
            <p style="font-size: 12px; color: var(--text-secondary);">الطريقة: ${cleanText(p.method)} • التاريخ: ${p.dateString} ${p.notes ? "• " + cleanText(p.notes) : ""}</p>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${
              p.receiptUrl
                ? `<a href="${p.receiptUrl}" target="_blank" class="btn btn-outline" style="padding: 5px 10px; font-size: 12px;"><i class="ri-image-line"></i><span>الإيصال</span></a>`
                : `<span class="badge">بدون إيصال</span>`
            }
            ${
              state.permissions.payouts
                ? `<button type="button" class="icon-btn danger" style="width: 32px; height: 32px;" data-action="delete-payout" data-id="${p.id}"><i class="ri-delete-bin-line"></i></button>`
                : ""
            }
          </div>
        </div>`
        )
        .join("")
    : `<div class="surface-card" style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد حوالات مسددة لهذا المؤلف حتى الآن.</div>`;
}

document.getElementById("btn-back-authors-list").addEventListener("click", () => {
  state.selectedAuthorDetailId = null;
  navigateToView("view-authors");
});

document.getElementById("btn-copy-author-bank").addEventListener("click", () => {
  const a = state.authors.find((x) => x.id === state.selectedAuthorDetailId);
  if (!a) return;
  const txt = `المستفيد: ${a.bankHolder || a.name}\nالبنك/الطريقة: ${a.bankMethod || ""} - ${a.bankName || ""}\nرقم الحساب/IBAN: ${a.bankAccount || ""}\nالدولة: ${a.bankCountry || ""}`;
  navigator.clipboard.writeText(txt);
  showToast("تم نسخ البيانات البنكية للمؤلف");
});

document.getElementById("btn-alert-author-bank").addEventListener("click", async () => {
  const a = state.authors.find((x) => x.id === state.selectedAuthorDetailId);
  if (!a) return;
  await addDoc(collection(db, "notifications"), {
    target: a.email,
    priority: "urgent",
    title: "يرجى تحديث أو تصحيح بياناتك البنكية للتحويل",
    body: `أهلاً بك أ. ${a.name}، يرجى مراجعة قسم (بياناتي البنكية) في بوابتك والتأكد من صحة الاسم الرباعي ورقم الحساب/IBAN لنتمكن من تحويل مستحقاتك المالية دون تأخير.`,
    senderName: "الإدارة المالية",
    dateString: getTodayStr(),
    createdAt: serverTimestamp()
  });
  showToast("تم إرسال تنبيه عاجل لبوابة المؤلف لتصحيح بياناته البنكية!");
});

// ==========================================================================
// 13. نظام المكتبات والموزعين - بضاعة الأمانة (Libraries Consignment Engine)
// ==========================================================================
document.getElementById("btn-goto-add-library").addEventListener("click", () => {
  document.getElementById("form-library").reset();
  restoreDraftPrefix("lib_");
  navigateToView("view-form-library");
});
document.getElementById("qadd-library").addEventListener("click", () => {
  quickAddSheet.classList.remove("show");
  document.getElementById("form-library").reset();
  navigateToView("view-form-library");
});

document.getElementById("form-library").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById("lib-name-field").value.trim(),
    city: document.getElementById("lib-city-field").value.trim(),
    phone: document.getElementById("lib-phone-field").value.trim(),
    discount: Number(document.getElementById("lib-discount-field").value || 0),
    notes: document.getElementById("lib-notes-field").value.trim(),
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "libraries"), payload);
  await logAudit("إضافة مكتبة", `إنشاء ملف مكتبة/موزع: ${payload.name}`);
  clearDraftPrefix("lib_");
  showToast("تم إنشاء ملف المكتبة بنجاح!");
  state.selectedLibraryDetailId = ref.id;
  renderLibraryDetailPage(ref.id);
  navigateToView("view-library-detail");
});

function renderLibrariesGrid() {
  const box = document.getElementById("libraries-cards-grid");
  if (!box) return;

  if (!state.libraries.length) {
    box.innerHTML = `<div class="surface-card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">لا توجد مكتبات أو جهات توزيع مضافة بعد. اضغط "إنشاء ملف مكتبة / موزع".</div>`;
    return;
  }

  box.innerHTML = state.libraries
    .map((lib) => {
      const txs = state.libraryTransactions.filter((t) => t.libraryId === lib.id);
      const supplied = txs.filter((t) => t.txType === "supply").reduce((s, t) => s + Number(t.qty || 0), 0);
      const sold = txs.filter((t) => t.txType === "settle").reduce((s, t) => s + Number(t.qty || 0), 0);
      const rem = Math.max(0, supplied - sold);
      const collected = txs.filter((t) => t.txType === "settle").reduce((s, t) => s + Number(t.amount || 0), 0);

      return `
        <div class="surface-card" style="display: flex; flex-direction: column; justify-content: space-between; gap: 12px;">
          <div style="cursor: pointer;" data-action="open-library" data-id="${lib.id}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span class="badge invert">خصم التوزيع: ${lib.discount || 0}%</span>
              <span class="badge ${rem > 0 ? "neg" : "pos"}">عهدة أمانة: ${rem} نسخة</span>
            </div>
            <h4 style="font-size: 16px; font-weight: 800;"><i class="ri-building-2-line"></i> ${cleanText(lib.name)}</h4>
            <p style="font-size: 12px; color: var(--text-secondary);">${cleanText(lib.city || "موزع معتمد")} ${lib.phone ? "• " + cleanText(lib.phone) : ""}</p>
          </div>

          <div class="book-mini-stats">
            <div><span>المورّد للمكتبة</span><strong>${supplied} نسخة</strong></div>
            <div><span>المباع والمحصل</span><strong class="money-pos">${sold} نسخة (${formatEGP(collected)})</strong></div>
          </div>

          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-primary" style="flex: 1; padding: 8px 10px;" data-action="open-library" data-id="${lib.id}">
              <i class="ri-folder-open-line"></i><span>إدارة التوريد والتصفية</span>
            </button>
            ${
              lib.phone
                ? `<a href="${buildWhatsAppUrl(lib.phone, `السلام عليكم، نتواصل معكم من إدارة دار صفقات كتابية بخصوص كشف مبيعات الكتب...`)}" target="_blank" class="icon-btn" style="width: 36px; height: 36px; color: var(--pos);"><i class="ri-whatsapp-line"></i></a>`
                : ""
            }
            <button type="button" class="icon-btn danger" style="width: 36px; height: 36px;" data-action="delete-library" data-id="${lib.id}">
              <i class="ri-delete-bin-line"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderLibraryDetailPage(libId) {
  const lib = state.libraries.find((x) => x.id === libId);
  if (!lib) return;

  const txs = state.libraryTransactions.filter((t) => t.libraryId === libId);
  const supplied = txs.filter((t) => t.txType === "supply").reduce((s, t) => s + Number(t.qty || 0), 0);
  const sold = txs.filter((t) => t.txType === "settle").reduce((s, t) => s + Number(t.qty || 0), 0);
  const rem = Math.max(0, supplied - sold);
  const collected = txs.filter((t) => t.txType === "settle").reduce((s, t) => s + Number(t.amount || 0), 0);

  document.getElementById("library-detail-banner").innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div>
        <h3 style="font-size: 18px; font-weight: 900;"><i class="ri-building-2-line"></i> ${cleanText(lib.name)}</h3>
        <p style="font-size: 12.5px; color: var(--text-secondary);">${cleanText(lib.city || "")} • خصم التوزيع المتفق عليه: ${lib.discount || 0}% ${lib.notes ? "• " + cleanText(lib.notes) : ""}</p>
      </div>
      ${
        lib.phone
          ? `<a href="${buildWhatsAppUrl(lib.phone, `السلام عليكم، بخصوص جرد ومبيعات كتب دار صفقات كتابية لدى مكتبتكم...`)}" target="_blank" class="btn btn-pos"><i class="ri-whatsapp-line"></i><span>مراسلة المكتبة واتساب</span></a>`
          : ""
      }
    </div>
  `;

  document.getElementById("lib-stat-supplied").textContent = `${supplied} نسخة`;
  document.getElementById("lib-stat-sold").textContent = `${sold} نسخة`;
  document.getElementById("lib-stat-rem").textContent = `${rem} نسخة`;
  document.getElementById("lib-stat-collected").textContent = formatEGP(collected);

  // تجميع رصيد كل كتاب داخل المكتبة
  const bookMap = {};
  txs.forEach((t) => {
    if (!bookMap[t.bookId]) {
      bookMap[t.bookId] = { title: t.bookTitle, supplied: 0, sold: 0, collected: 0 };
    }
    if (t.txType === "supply") bookMap[t.bookId].supplied += Number(t.qty || 0);
    if (t.txType === "settle") {
      bookMap[t.bookId].sold += Number(t.qty || 0);
      bookMap[t.bookId].collected += Number(t.amount || 0);
    }
  });

  const bookSummaryHTML = Object.values(bookMap)
    .map(
      (bm) => `
      <div class="list-row">
        <div>
          <h4 style="font-size: 14px; font-weight: 800;">كتاب: ${cleanText(bm.title)}</h4>
          <p style="font-size: 12px; color: var(--text-secondary);">المورّد: ${bm.supplied} نسخة • المباع والمحصل: <strong class="money-pos">${bm.sold} نسخة (${formatEGP(bm.collected)})</strong></p>
        </div>
        <span class="badge ${bm.supplied - bm.sold > 0 ? "neg" : "pos"}">متبقي بالمكتبة: ${Math.max(0, bm.supplied - bm.sold)} نسخة</span>
      </div>`
    )
    .join("");

  document.getElementById("library-inventory-list").innerHTML =
    bookSummaryHTML || `<div class="surface-card" style="text-align: center; color: var(--text-muted); padding: 22px;">لم يتم توريد أي كتب لهذه المكتبة بعد. اضغط "توريد شحنة كتب للمكتبة".</div>`;
}

document.getElementById("btn-back-libraries").addEventListener("click", () => navigateToView("view-libraries"));

// توريد شحنة للمكتبة
document.getElementById("btn-lib-supply-books").addEventListener("click", () => {
  if (!state.books.length) {
    showToast("أضف كتاباً أولاً لتتمكن من توريده للمكتبة");
    return;
  }
  document.getElementById("form-lib-supply").reset();
  document.getElementById("supply-lib-id").value = state.selectedLibraryDetailId;
  populateAllSelects();
  navigateToView("view-form-lib-supply");
});

document.getElementById("form-lib-supply").addEventListener("submit", async (e) => {
  e.preventDefault();
  const libId = document.getElementById("supply-lib-id").value;
  const lib = state.libraries.find((x) => x.id === libId);
  const bookId = document.getElementById("supply-book-select").value;
  const b = state.books.find((x) => x.id === bookId);
  const qty = Math.max(1, Number(document.getElementById("supply-qty-field").value || 1));
  const whId = document.getElementById("supply-wh-select").value;
  const notes = document.getElementById("supply-notes-field").value.trim();

  if (!lib || !b) return;

  // خصم الكمية الموردة من مستودع الدار وتحويلها لعهدة المكتبة
  const upd = {};
  if (b.stock !== "" && b.stock !== undefined) {
    upd.stock = Math.max(0, Number(b.stock) - qty);
  }
  if (b.warehouseStocks && b.warehouseStocks[whId] !== undefined) {
    upd.warehouseStocks = { ...b.warehouseStocks, [whId]: Math.max(0, Number(b.warehouseStocks[whId]) - qty) };
  }
  if (Object.keys(upd).length) await updateDoc(doc(db, "books", bookId), upd);

  await addDoc(collection(db, "library_transactions"), {
    txType: "supply",
    libraryId: lib.id,
    libraryName: lib.name,
    bookId: b.id,
    bookTitle: b.title,
    qty,
    whId,
    notes,
    dateString: getTodayStr(),
    createdAt: serverTimestamp()
  });

  await logAudit("توريد لمكتبة", `توريد (${qty}) نسخة من "${b.title}" إلى (${lib.name})`);
  showToast(`تم توريد (${qty}) نسخة إلى ${lib.name} وخصمها من المستودع`);
  navigateToView("view-library-detail");
});

// تصفية مبيعات المكتبة وتحصيل الأموال (يرتبط بالكتاب والمؤلف ومحفظة الدار تلقائياً)
document.getElementById("btn-lib-settle-sales").addEventListener("click", () => {
  const lib = state.libraries.find((x) => x.id === state.selectedLibraryDetailId);
  if (!lib) return;
  document.getElementById("form-lib-settle").reset();
  document.getElementById("settle-lib-id").value = lib.id;
  populateAllSelects();

  const bookSel = document.getElementById("settle-book-select");
  const qtyInp = document.getElementById("settle-qty-field");
  const amtInp = document.getElementById("settle-amount-field");

  const calcDefaultSettle = () => {
    const b = state.books.find((x) => x.id === bookSel.value);
    if (!b) return;
    const q = Math.max(1, Number(qtyInp.value || 1));
    const disc = Number(lib.discount || 0);
    amtInp.value = Number((q * Number(b.price || 0) * (1 - disc / 100)).toFixed(2));
  };
  bookSel.onchange = calcDefaultSettle;
  qtyInp.oninput = calcDefaultSettle;

  navigateToView("view-form-lib-settle");
});

document.getElementById("form-lib-settle").addEventListener("submit", async (e) => {
  e.preventDefault();
  const libId = document.getElementById("settle-lib-id").value;
  const lib = state.libraries.find((x) => x.id === libId);
  const bookId = document.getElementById("settle-book-select").value;
  const b = state.books.find((x) => x.id === bookId);
  const qty = Math.max(1, Number(document.getElementById("settle-qty-field").value || 1));
  const totalAmount = Number(document.getElementById("settle-amount-field").value || 0);
  const notes = document.getElementById("settle-notes-field").value.trim();

  if (!lib || !b) return;

  // حساب حق المؤلف وإضافته لمحفظته وتوثيق البيعة في السجل المالي العام
  const authorCut = Number((totalAmount * (Number(b.royaltyRate || 0) / 100)).toFixed(2));
  const houseCut = Number((totalAmount - authorCut).toFixed(2));

  await updateDoc(doc(db, "books", bookId), { copiesSold: increment(qty) });

  await addDoc(collection(db, "library_transactions"), {
    txType: "settle",
    libraryId: lib.id,
    libraryName: lib.name,
    bookId: b.id,
    bookTitle: b.title,
    qty,
    amount: totalAmount,
    notes,
    dateString: getTodayStr(),
    createdAt: serverTimestamp()
  });

  await addDoc(collection(db, "sales"), {
    bookId: b.id,
    bookTitle: b.title,
    authorId: b.authorId,
    authorName: b.authorName,
    qty,
    unitPrice: Number(b.price || 0),
    totalAmount,
    channel: `مكتبة: ${lib.name}`,
    authorCut,
    houseCut,
    soldBy: state.userEmail,
    soldByName: state.userProfile.displayName,
    dateString: getTodayStr(),
    createdAt: serverTimestamp()
  });

  await logAudit("تحصيل مبيعات مكتبة", `تصفية بيع (${qty}) نسخة من "${b.title}" لدى (${lib.name}) بمبلغ ${formatEGP(totalAmount)}`);
  showToast("تم اعتماد المبيعات وإيداع النسب في محفظة الدار ومحفظة المؤلف!");
  navigateToView("view-library-detail");
});

// ==========================================================================
// 14. وحدة المعارض والفعاليات (Exhibitions & Events Hub)
// ==========================================================================
document.getElementById("btn-goto-add-exhibition").addEventListener("click", () => openExhibitionForm(null));
document.getElementById("qadd-exhibition").addEventListener("click", () => {
  quickAddSheet.classList.remove("show");
  openExhibitionForm(null);
});

document.getElementById("btn-exh-select-all-books").addEventListener("click", () => {
  document.querySelectorAll("#exh-books-checklist input[type='checkbox']").forEach((c) => (c.checked = true));
});
document.getElementById("btn-exh-clear-all-books").addEventListener("click", () => {
  document.querySelectorAll("#exh-books-checklist input[type='checkbox']").forEach((c) => (c.checked = false));
});

function openExhibitionForm(editId = null) {
  const form = document.getElementById("form-exhibition");
  form.reset();
  populateAllSelects();

  const checks = document.querySelectorAll("#exh-books-checklist input[type='checkbox']");
  if (editId) {
    const x = state.exhibitions.find((e) => e.id === editId);
    if (!x) return;
    document.getElementById("exh-id-field").value = x.id;
    document.getElementById("exh-name-field").value = x.name || "";
    document.getElementById("exh-location-field").value = x.location || "";
    document.getElementById("exh-prep-date").value = x.prepDate || "";
    document.getElementById("exh-start-date").value = x.startDate || "";
    document.getElementById("exh-end-date").value = x.endDate || "";
    document.getElementById("exh-budget-field").value = x.budget || "";
    document.getElementById("exh-notes-field").value = x.notes || "";
    const selectedIds = x.bookIds || [];
    checks.forEach((c) => (c.checked = selectedIds.includes(c.value)));
    document.getElementById("form-exh-heading").textContent = `تعديل المعرض: ${x.name}`;
  } else {
    document.getElementById("exh-id-field").value = "";
    document.getElementById("exh-start-date").value = getTodayStr();
    checks.forEach((c) => (c.checked = true));
    document.getElementById("form-exh-heading").textContent = "إنشاء معرض أو فعالية جديدة";
  }
  navigateToView("view-form-exhibition");
}

document.getElementById("form-exhibition").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("exh-id-field").value;
  const bookIds = Array.from(document.querySelectorAll("#exh-books-checklist input[type='checkbox']:checked")).map(
    (c) => c.value
  );

  const payload = {
    name: document.getElementById("exh-name-field").value.trim(),
    location: document.getElementById("exh-location-field").value.trim(),
    prepDate: document.getElementById("exh-prep-date").value,
    startDate: document.getElementById("exh-start-date").value,
    endDate: document.getElementById("exh-end-date").value,
    budget: Number(document.getElementById("exh-budget-field").value || 0),
    notes: document.getElementById("exh-notes-field").value.trim(),
    bookIds
  };

  if (id) {
    await updateDoc(doc(db, "exhibitions", id), payload);
    await logAudit("تعديل معرض", `تحديث معرض: ${payload.name}`);
    showToast("تم تحديث بيانات المعرض والكتب المشاركة");
    state.selectedExhibitionDetailId = id;
    navigateToView("view-exhibition-detail");
  } else {
    payload.createdAt = serverTimestamp();
    const ref = await addDoc(collection(db, "exhibitions"), payload);
    await logAudit("إنشاء معرض", `إنشاء معرض: ${payload.name} (${bookIds.length} كتاب مشارك)`);
    clearDraftPrefix("exh_");
    showToast("تم إنشاء المعرض واعتماد الكتب المشاركة بنجاح!");
    state.selectedExhibitionDetailId = ref.id;
    navigateToView("view-exhibition-detail");
  }
});

function renderExhibitionsGrid() {
  const box = document.getElementById("exhibitions-cards-grid");
  if (!box) return;

  if (!state.exhibitions.length) {
    box.innerHTML = `<div class="surface-card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">لا توجد معارض مسجلة حالياً. اضغط "إنشاء معرض جديد".</div>`;
    return;
  }

  box.innerHTML = state.exhibitions
    .map((x) => {
      const exhSales = state.sales.filter((s) => s.exhibitionId === x.id);
      const rev = exhSales.reduce((s, item) => s + Number(item.totalAmount || 0), 0);
      const exhExp = state.expenses
        .filter((e) => e.exhibitionId === x.id)
        .reduce((s, item) => s + Number(item.amount || 0), 0);
      const booksCount = Array.isArray(x.bookIds) ? x.bookIds.length : 0;

      return `
        <div class="surface-card" style="display: flex; flex-direction: column; justify-content: space-between; gap: 12px;">
          <div style="cursor: pointer;" data-action="open-exhibition" data-id="${x.id}">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <span class="badge invert">${booksCount} كتاب مشارك</span>
              <span class="badge">${x.startDate || ""} إلى ${x.endDate || ""}</span>
            </div>
            <h4 style="font-size: 16px; font-weight: 800;"><i class="ri-compass-discover-line"></i> ${cleanText(x.name)}</h4>
            <p style="font-size: 12px; color: var(--text-secondary);">${cleanText(x.location || "جناح الدار")}</p>
          </div>

          <div class="book-mini-stats">
            <div><span>مبيعات الجناح</span><strong class="money-pos">${formatEGP(rev)}</strong></div>
            <div><span>تكاليف المعرض</span><strong class="money-neg">${formatEGP(exhExp)}</strong></div>
          </div>

          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-primary" style="flex: 1; padding: 8px 10px;" data-action="open-exhibition" data-id="${x.id}">
              <i class="ri-store-2-line"></i><span>فتح جناح وحسابات المعرض</span>
            </button>
            <button type="button" class="icon-btn danger" style="width: 36px; height: 36px;" data-action="delete-exhibition" data-id="${x.id}">
              <i class="ri-delete-bin-line"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderExhibitionDetailPage(exhId) {
  const x = state.exhibitions.find((e) => e.id === exhId);
  if (!x) return;

  const exhSales = state.sales.filter((s) => s.exhibitionId === exhId);
  const exhExpenses = state.expenses.filter((e) => e.exhibitionId === exhId);

  const copies = exhSales.reduce((s, i) => s + Number(i.qty || 0), 0);
  const rev = exhSales.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  const authorsShare = exhSales.reduce((s, i) => s + Number(i.authorCut || 0), 0);
  const expTotal = exhExpenses.reduce((s, i) => s + Number(i.amount || 0), 0);
  const net = rev - authorsShare - expTotal;
  const participatingBooks = state.books.filter((b) => Array.isArray(x.bookIds) && x.bookIds.includes(b.id));

  document.getElementById("exhibition-detail-banner").innerHTML = `
    <div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
        <span class="badge invert">بداية التجهيز: ${x.prepDate || "غير محدد"}</span>
        <span class="badge pos">انطلاق المعرض: ${x.startDate}</span>
        <span class="badge neg">الانتهاء: ${x.endDate}</span>
      </div>
      <h3 style="font-size: 19px; font-weight: 900;">${cleanText(x.name)}</h3>
      <p style="font-size: 12.5px; color: var(--text-secondary);">${cleanText(x.location || "")} ${x.notes ? "• " + cleanText(x.notes) : ""}</p>
    </div>
  `;

  document.getElementById("exh-stat-rev").textContent = formatEGP(rev);
  document.getElementById("exh-stat-copies").textContent = `${copies} نسخة مباعة بالمعرض`;
  document.getElementById("exh-stat-exp").textContent = formatEGP(expTotal);
  document.getElementById("exh-stat-budget").textContent = `الميزانية التقديرية: ${formatEGP(x.budget || 0)}`;

  const netEl = document.getElementById("exh-stat-net");
  netEl.textContent = formatEGP(net);
  netEl.className = `metric-val ${net >= 0 ? "money-pos" : "money-neg"}`;
  document.getElementById("exh-stat-books-count").textContent = `${participatingBooks.length} كتاب`;

  document.getElementById("exhibition-books-grid").innerHTML = participatingBooks.length
    ? participatingBooks
        .map(
          (b) => `
        <div class="book-card">
          <div class="book-body">
            <div class="book-title-link" data-action="open-book" data-id="${b.id}">${cleanText(b.title)}</div>
            <div class="book-author-link">${cleanText(b.authorName)}</div>
            <div class="book-mini-stats">
              <div><span>السعر</span><strong>${formatEGP(b.price)}</strong></div>
              <div><span>المستودع</span><strong>${b.stock ?? "مفتوح"}</strong></div>
            </div>
            <button type="button" class="btn btn-pos" style="width: 100%; padding: 8px;" data-action="sell-exh-book" data-id="${b.id}" data-exh="${x.id}">
              <i class="ri-shopping-bag-3-line"></i><span>بيع في الجناح</span>
            </button>
          </div>
        </div>`
        )
        .join("")
    : `<div class="surface-card" style="grid-column: 1/-1; text-align: center; padding: 20px;">لم يتم تحديد كتب لهذا المعرض. اضغط "تعديل المعرض والكتب".</div>`;

  document.getElementById("exhibition-expenses-list").innerHTML = exhExpenses.length
    ? exhExpenses
        .map(
          (e) => `
        <div class="list-row">
          <div>
            <h4 style="font-size: 14px; font-weight: 800;">${cleanText(e.title)} <span class="badge neg">-${formatEGP(e.amount)}</span></h4>
            <p style="font-size: 12px; color: var(--text-secondary);">${cleanText(e.category)} • ${e.dateString}</p>
          </div>
          <button type="button" class="icon-btn danger" style="width: 32px; height: 32px;" data-action="delete-expense" data-id="${e.id}"><i class="ri-delete-bin-line"></i></button>
        </div>`
        )
        .join("")
    : `<div class="surface-card" style="text-align: center; color: var(--text-muted); padding: 18px;">لا توجد مصروفات مسجلة لهذا المعرض حتى الآن.</div>`;
}

document.getElementById("btn-back-exhibitions").addEventListener("click", () => navigateToView("view-exhibitions"));
document.getElementById("btn-exh-edit").addEventListener("click", () => {
  if (state.selectedExhibitionDetailId) openExhibitionForm(state.selectedExhibitionDetailId);
});
document.getElementById("btn-exh-add-expense").addEventListener("click", () => {
  openExpenseForm("exhibition", state.selectedExhibitionDetailId);
});

// ==========================================================================
// 15. إدارة الأحداث العامة، البيع السريع، المصروفات المرنة، والدفعات
// ==========================================================================
document.addEventListener("click", async (e) => {
  const closeBtn = e.target.closest("[data-close-modal]");
  if (closeBtn) {
    document.getElementById(closeBtn.getAttribute("data-close-modal")).classList.remove("show");
    return;
  }

  const act = e.target.closest("[data-action]");
  if (!act) return;
  e.stopPropagation();

  const action = act.getAttribute("data-action");
  const id = act.getAttribute("data-id");

  if (action === "open-book") {
    quickSearchPanel.style.display = "none";
    state.selectedBookDetailId = id;
    renderSingleBookDetail(id);
    navigateToView("view-book-detail");
  } else if (action === "sell-book") {
    openSellModal(id, "");
  } else if (action === "sell-exh-book") {
    openSellModal(id, act.getAttribute("data-exh") || "");
  } else if (action === "toggle-fav") {
    const b = state.books.find((x) => x.id === id);
    if (b) {
      await updateDoc(doc(db, "books", id), { isFavorite: !b.isFavorite });
      showToast(!b.isFavorite ? "أُضيف للمفضلة" : "أُزيل من المفضلة");
    }
  } else if (action === "open-author") {
    if (!id) return;
    quickSearchPanel.style.display = "none";
    state.selectedAuthorDetailId = id;
    renderAuthorDetailPage(id);
    navigateToView("view-author-detail");
  } else if (action === "edit-author") {
    openAuthorFormPage(id);
  } else if (action === "toggle-restrict-author") {
    const a = state.authors.find((x) => x.id === id);
    if (!a) return;
    askConfirm(
      a.restricted ? "فك تقييد المؤلف" : "تقييد حساب المؤلف",
      `هل أنت متأكد من ${a.restricted ? "إعادة تفعيل" : "تجميد وتقييد"} حساب المؤلف "${a.name}"؟`,
      async () => {
        await updateDoc(doc(db, "authors", id), { restricted: !a.restricted });
        await logAudit("حالة مؤلف", `${!a.restricted ? "تقييد" : "تفعيل"} حساب المؤلف: ${a.name}`);
        showToast("تم تحديث حالة حساب المؤلف");
      }
    );
  } else if (action === "delete-author-all") {
    const a = state.authors.find((x) => x.id === id);
    if (!a) return;
    askConfirm(
      "حذف شامل للمؤلف وكتبه",
      `تحذير: سيتم حذف ملف المؤلف "${a.name}" وجميع الكتب المرتبطة به نهائياً. هل أنت متأكد؟`,
      async () => {
        const aBooks = state.books.filter((b) => b.authorId === id);
        for (const b of aBooks) {
          await deleteDoc(doc(db, "books", b.id));
        }
        await deleteDoc(doc(db, "authors", id));
        await logAudit("حذف شامل لمؤلف", `حذف المؤلف (${a.name}) مع (${aBooks.length}) كتب`);
        showToast("تم حذف المؤلف وكتبه بالكامل");
        navigateToView("view-authors");
      }
    );
  } else if (action === "open-library") {
    quickSearchPanel.style.display = "none";
    state.selectedLibraryDetailId = id;
    renderLibraryDetailPage(id);
    navigateToView("view-library-detail");
  } else if (action === "delete-library") {
    askConfirm("حذف ملف المكتبة", "هل أنت متأكد من حذف ملف هذه المكتبة؟", async () => {
      await deleteDoc(doc(db, "libraries", id));
      showToast("تم حذف المكتبة");
    });
  } else if (action === "open-exhibition") {
    quickSearchPanel.style.display = "none";
    state.selectedExhibitionDetailId = id;
    renderExhibitionDetailPage(id);
    navigateToView("view-exhibition-detail");
  } else if (action === "delete-exhibition") {
    askConfirm("حذف المعرض", "هل أنت متأكد من حذف هذا المعرض؟", async () => {
      await deleteDoc(doc(db, "exhibitions", id));
      showToast("تم حذف المعرض");
    });
  } else if (action === "delete-payout") {
    askConfirm("حذف الحوالة", "هل أنت متأكد من حذف سجل هذه الدفعة؟", async () => {
      await deleteDoc(doc(db, "payouts", id));
      showToast("تم حذف الدفعة");
    });
  } else if (action === "delete-expense") {
    askConfirm("حذف المصروف", "هل تريد حذف هذا المصروف التشغيلي؟", async () => {
      await deleteDoc(doc(db, "expenses", id));
      showToast("تم حذف المصروف");
    });
  } else if (action === "delete-sale") {
    const bookId = act.getAttribute("data-book-id");
    const qty = Number(act.getAttribute("data-qty") || 1);
    askConfirm("إلغاء عملية بيع", `سيتم إلغاء بيع (${qty}) نسخة وإرجاعها للمخزون. هل أنت متأكد؟`, async () => {
      await deleteDoc(doc(db, "sales", id));
      if (bookId) await updateDoc(doc(db, "books", bookId), { copiesSold: increment(-qty), stock: increment(qty) });
      await logAudit("إلغاء بيع", `إلغاء بيع (${qty}) نسخة`);
      showToast("تم إلغاء البيعة");
    });
  } else if (action === "edit-staff") {
    openStaffFormPage(id);
  } else if (action === "inspect-staff") {
    state.inspectingStaffEmail = act.getAttribute("data-email");
    document.getElementById("audit-log-title").innerHTML = `<i class="ri-eye-line"></i> <span>فحص سجل عمليات الموظف: ${cleanText(act.getAttribute("data-name"))}</span>`;
    document.getElementById("btn-back-my-logs").style.display = "inline-flex";
    renderAuditLogs();
    navigateToView("view-profile");
  } else if (action === "delete-staff") {
    askConfirm("حذف موظف", "هل أنت متأكد من سحب الصلاحيات وحذف هذا الموظف؟", async () => {
      await deleteDoc(doc(db, "staff", id));
      showToast("تم حذف الموظف");
    });
  } else if (action === "open-portal-pdf") {
    openPdfViewerPage(id);
  }
});

// --- نافذة البيع السريع ---
function openSellModal(bookId, exhId = "") {
  const b = state.books.find((x) => x.id === bookId);
  if (!b) return;
  populateAllSelects();

  document.getElementById("sell-confirm-book-id").value = b.id;
  document.getElementById("sell-confirm-exh-id").value = exhId;
  document.getElementById("sell-confirm-book-title").textContent = `${b.title} (${formatEGP(b.price)})`;

  const qtyInp = document.getElementById("sell-confirm-qty");
  const discInp = document.getElementById("sell-confirm-disc");
  const chanSel = document.getElementById("sell-confirm-channel");
  qtyInp.value = 1;
  discInp.value = 0;
  if (exhId) chanSel.value = "معرض كتاب";

  const recalc = () => {
    const q = Math.max(1, Number(qtyInp.value || 1));
    const d = Math.min(90, Math.max(0, Number(discInp.value || 0)));
    const net = q * Number(b.price || 0) * (1 - d / 100);
    document.getElementById("sell-confirm-total").textContent = formatEGP(net);
  };
  qtyInp.oninput = recalc;
  discInp.oninput = recalc;
  recalc();

  document.getElementById("modal-sell").classList.add("show");
}

document.getElementById("form-sell-confirm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bookId = document.getElementById("sell-confirm-book-id").value;
  const exhId = document.getElementById("sell-confirm-exh-id").value;
  const qty = Math.max(1, Number(document.getElementById("sell-confirm-qty").value || 1));
  const disc = Math.min(90, Math.max(0, Number(document.getElementById("sell-confirm-disc").value || 0)));
  const channel = document.getElementById("sell-confirm-channel").value;
  const whId = document.getElementById("sell-confirm-wh").value;

  const b = state.books.find((x) => x.id === bookId);
  if (!b) return;

  const totalAmount = Number((qty * Number(b.price || 0) * (1 - disc / 100)).toFixed(2));
  const authorCut = Number((totalAmount * (Number(b.royaltyRate || 0) / 100)).toFixed(2));
  const houseCut = Number((totalAmount - authorCut).toFixed(2));

  document.getElementById("modal-sell").classList.remove("show");

  const upd = { copiesSold: increment(qty) };
  if (b.stock !== "" && b.stock !== undefined) {
    upd.stock = Math.max(0, Number(b.stock) - qty);
  }
  if (b.warehouseStocks && b.warehouseStocks[whId] !== undefined) {
    upd.warehouseStocks = { ...b.warehouseStocks, [whId]: Math.max(0, Number(b.warehouseStocks[whId]) - qty) };
  }
  await updateDoc(doc(db, "books", bookId), upd);

  await addDoc(collection(db, "sales"), {
    bookId: b.id,
    bookTitle: b.title,
    authorId: b.authorId,
    authorName: b.authorName,
    exhibitionId: exhId || "",
    qty,
    discount: disc,
    unitPrice: Number(b.price || 0),
    totalAmount,
    channel,
    authorCut,
    houseCut,
    soldBy: state.userEmail,
    soldByName: state.userProfile.displayName,
    dateString: getTodayStr(),
    createdAt: serverTimestamp()
  });

  await logAudit("تسجيل بيع", `بيع (${qty}) نسخة من "${b.title}" بمبلغ ${formatEGP(totalAmount)}`);
  showToast(`تم توثيق بيع (${qty}) نسخة من "${b.title}"!`);
});

// --- نماذج الإدخال الكاملة: المؤلف والكتاب ---
document.getElementById("btn-top-add-author").addEventListener("click", () => openAuthorFormPage(null));
document.getElementById("qadd-author").addEventListener("click", () => {
  quickAddSheet.classList.remove("show");
  openAuthorFormPage(null);
});

function openAuthorFormPage(editId = null) {
  const form = document.getElementById("form-author");
  form.reset();
  if (editId) {
    const a = state.authors.find((x) => x.id === editId);
    if (!a) return;
    document.getElementById("author-id-field").value = a.id;
    document.getElementById("author-name-field").value = a.name || "";
    document.getElementById("author-email-field").value = a.email || "";
    document.getElementById("author-phone-field").value = a.phone || "";
    document.getElementById("author-bio-field").value = a.bio || "";
    document.getElementById("author-bank-name-field").value = a.bankName || "";
    document.getElementById("author-bank-acc-field").value = a.bankAccount || "";
    document.getElementById("author-bank-holder-field").value = a.bankHolder || "";
    document.getElementById("author-bank-country-field").value = a.bankCountry || "";
    document.getElementById("author-restricted-check").checked = !!a.restricted;
    document.getElementById("form-author-title").textContent = `تعديل بيانات المؤلف: ${a.name}`;
  } else {
    document.getElementById("author-id-field").value = "";
    document.getElementById("form-author-title").textContent = "إنشاء ملف مؤلف جديد";
    restoreDraftPrefix("author_");
  }
  navigateToView("view-form-author");
}

document.getElementById("form-author").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("author-id-field").value;
  const payload = {
    name: document.getElementById("author-name-field").value.trim(),
    email: document.getElementById("author-email-field").value.trim().toLowerCase(),
    phone: document.getElementById("author-phone-field").value.trim(),
    bio: document.getElementById("author-bio-field").value.trim(),
    bankName: document.getElementById("author-bank-name-field").value.trim(),
    bankAccount: document.getElementById("author-bank-acc-field").value.trim(),
    bankHolder: document.getElementById("author-bank-holder-field").value.trim(),
    bankCountry: document.getElementById("author-bank-country-field").value.trim(),
    restricted: document.getElementById("author-restricted-check").checked
  };

  if (id) {
    // إذا تم تعديل اسم المؤلف، نحدث الاسم في كتبه المرتبطة أيضاً
    await updateDoc(doc(db, "authors", id), payload);
    const aBooks = state.books.filter((b) => b.authorId === id);
    for (const b of aBooks) {
      if (b.authorName !== payload.name) {
        await updateDoc(doc(db, "books", b.id), { authorName: payload.name });
      }
    }
    await logAudit("تعديل مؤلف", `تحديث بيانات/بريد المؤلف: ${payload.name} (${payload.email})`);
    clearDraftPrefix("author_");
    showToast("تم حفظ تعديلات المؤلف بنجاح");
    state.selectedAuthorDetailId = id;
    navigateToView("view-author-detail");
  } else {
    payload.createdAt = serverTimestamp();
    const ref = await addDoc(collection(db, "authors"), payload);
    await logAudit("إضافة مؤلف", `إنشاء ملف المؤلف: ${payload.name}`);
    clearDraftPrefix("author_");
    showToast("تم إنشاء ملف المؤلف بنجاح!");
    state.selectedAuthorDetailId = ref.id;
    navigateToView("view-author-detail");
  }
});

document.getElementById("btn-top-add-contract").addEventListener("click", () => openBookFormPage(null, null));
document.getElementById("qadd-contract").addEventListener("click", () => {
  quickAddSheet.classList.remove("show");
  openBookFormPage(null, null);
});
document.getElementById("btn-author-new-contract").addEventListener("click", () => {
  openBookFormPage(null, state.selectedAuthorDetailId);
});

function openBookFormPage(editId = null, preAuthorId = null) {
  if (!state.authors.length) {
    showToast("أنشئ ملف مؤلف أولاً قبل إضافة عقد كتاب");
    openAuthorFormPage(null);
    return;
  }
  const form = document.getElementById("form-book");
  form.reset();
  populateAllSelects("");

  if (editId) {
    const b = state.books.find((x) => x.id === editId);
    if (!b) return;
    document.getElementById("book-id-field").value = b.id;
    document.getElementById("book-title-field").value = b.title || "";
    document.getElementById("book-author-select").value = b.authorId || "";
    document.getElementById("book-price-field").value = b.price || "";
    document.getElementById("book-royalty-field").value = b.royaltyRate ?? 20;
    document.getElementById("book-months-field").value = b.contractMonths || 24;
    document.getElementById("book-date-field").value = b.contractDate || getTodayStr();
    document.getElementById("book-fav-check").checked = !!b.isFavorite;
    document.getElementById("book-stock-field").value = b.stock ?? "";
    document.getElementById("book-edition-field").value = b.edition || "";
    document.getElementById("book-isbn-field").value = b.isbn || "";
    document.getElementById("book-cat-field").value = b.category || "";
    document.getElementById("book-drive-field").value = b.drivePdfUrl || "";
    document.getElementById("book-notes-field").value = b.notes || "";
    document.getElementById("form-book-title").textContent = `تعديل عقد وبيانات كتاب: ${b.title}`;
  } else {
    document.getElementById("book-id-field").value = "";
    document.getElementById("book-date-field").value = getTodayStr();
    restoreDraftPrefix("book_");
    if (preAuthorId) document.getElementById("book-author-select").value = preAuthorId;
    document.getElementById("form-book-title").textContent = "توثيق عقد كتاب جديد";
  }
  navigateToView("view-form-book");
}

document.getElementById("form-book").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-book");
  btn.disabled = true;

  const id = document.getElementById("book-id-field").value;
  const authorId = document.getElementById("book-author-select").value;
  const authorObj = state.authors.find((a) => a.id === authorId);
  const coverFile = document.getElementById("book-cover-file").files[0];
  const stockRaw = document.getElementById("book-stock-field").value;
  const whId = document.getElementById("book-warehouse-select").value;

  const payload = {
    title: document.getElementById("book-title-field").value.trim(),
    authorId,
    authorName: authorObj ? authorObj.name : "غير محدد",
    price: Number(document.getElementById("book-price-field").value),
    royaltyRate: Number(document.getElementById("book-royalty-field").value),
    contractMonths: Number(document.getElementById("book-months-field").value),
    contractDate: document.getElementById("book-date-field").value,
    isFavorite: document.getElementById("book-fav-check").checked,
    stock: stockRaw !== "" ? Number(stockRaw) : "",
    edition: document.getElementById("book-edition-field").value.trim(),
    isbn: document.getElementById("book-isbn-field").value.trim(),
    category: document.getElementById("book-cat-field").value.trim(),
    drivePdfUrl: document.getElementById("book-drive-field").value.trim(),
    notes: document.getElementById("book-notes-field").value.trim()
  };

  try {
    if (coverFile) {
      showToast("جاري ضغط ورفع غلاف الكتاب...");
      payload.coverUrl = await uploadCompressedImage(coverFile);
    }

    if (id) {
      await updateDoc(doc(db, "books", id), payload);
      await logAudit("تعديل عقد كتاب", `تحديث كتاب: ${payload.title}`);
      clearDraftPrefix("book_");
      showToast("تم تحديث الكتاب والعقد");
      state.selectedBookDetailId = id;
      navigateToView("view-book-detail");
    } else {
      payload.copiesSold = 0;
      payload.initialPrinted = stockRaw !== "" ? Number(stockRaw) : 0;
      if (stockRaw !== "" && whId) {
        payload.warehouseStocks = { [whId]: Number(stockRaw) };
      }
      payload.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "books"), payload);
      await logAudit("إضافة عقد كتاب", `توثيق عقد كتاب "${payload.title}" للمؤلف ${payload.authorName}`);
      clearDraftPrefix("book_");
      showToast("تم توثيق عقد الكتاب وإيداعه بالمستودع!");
      state.selectedBookDetailId = ref.id;
      navigateToView("view-book-detail");
    }
  } catch (err) {
    console.error(err);
    showToast("حدث خطأ أثناء حفظ الكتاب");
  } finally {
    btn.disabled = false;
  }
});

// --- المصروفات المرنة (عام / كتاب / حملة مجموعة كتب / معرض) ---
document.getElementById("btn-top-add-expense").addEventListener("click", () => openExpenseForm("general", ""));
document.getElementById("qadd-expense").addEventListener("click", () => {
  quickAddSheet.classList.remove("show");
  openExpenseForm("general", "");
});

document.getElementById("expense-scope-select").addEventListener("change", (e) => {
  const val = e.target.value;
  document.getElementById("expense-books-picker-wrap").style.display = val === "books" ? "block" : "none";
  document.getElementById("expense-exhibition-picker-wrap").style.display = val === "exhibition" ? "block" : "none";
});

document.getElementById("btn-exp-select-all-books").addEventListener("click", () => {
  document.querySelectorAll("#expense-books-checklist input[type='checkbox']").forEach((c) => (c.checked = true));
});

function openExpenseForm(defaultScope = "general", exhId = "") {
  document.getElementById("form-expense").reset();
  populateAllSelects();
  document.getElementById("expense-scope-select").value = defaultScope;
  document.getElementById("expense-books-picker-wrap").style.display = defaultScope === "books" ? "block" : "none";
  document.getElementById("expense-exhibition-picker-wrap").style.display =
    defaultScope === "exhibition" ? "block" : "none";
  if (exhId) document.getElementById("expense-exhibition-select").value = exhId;
  navigateToView("view-form-expense");
}

document.getElementById("form-expense").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("expense-title-field").value.trim();
  const amount = Number(document.getElementById("expense-amount-field").value || 0);
  const category = document.getElementById("expense-cat-field").value;
  const scope = document.getElementById("expense-scope-select").value;

  let bookIds = [];
  let exhibitionId = "";

  if (scope === "books") {
    bookIds = Array.from(
      document.querySelectorAll("#expense-books-checklist input[type='checkbox']:checked")
    ).map((c) => c.value);
    if (!bookIds.length) {
      showToast("يرجى اختيار كتاب واحد على الأقل لربط المصروف به");
      return;
    }
  } else if (scope === "exhibition") {
    exhibitionId = document.getElementById("expense-exhibition-select").value;
  }

  await addDoc(collection(db, "expenses"), {
    title,
    amount,
    category,
    scope,
    bookIds,
    exhibitionId,
    addedBy: state.userProfile.displayName,
    dateString: getTodayStr(),
    createdAt: serverTimestamp()
  });

  await logAudit("تسجيل مصروف", `مصروف (${title}) بقيمة ${formatEGP(amount)}`);
  clearDraftPrefix("exp_");
  showToast("تم توثيق المصروف وربطه بالحسابات بنجاح!");
  navigateToView(exhibitionId ? "view-exhibition-detail" : "view-finance");
});

// --- الدفعات والحوالات للمؤلفين ---
document.getElementById("btn-author-new-payout").addEventListener("click", () => {
  openPayoutForm(state.selectedAuthorDetailId);
});
document.getElementById("qadd-payout").addEventListener("click", () => {
  quickAddSheet.classList.remove("show");
  openPayoutForm(null);
});

document.getElementById("payout-author-select").addEventListener("change", (e) => {
  updatePayoutBankPreview(e.target.value);
});

function updatePayoutBankPreview(authorId) {
  const box = document.getElementById("payout-author-bank-preview");
  const a = state.authors.find((x) => x.id === authorId);
  if (!a) {
    box.innerHTML = "اختر المؤلف لعرض بياناته البنكية المعتمدة هنا.";
    return;
  }
  if (a.bankAccount || a.bankName) {
    box.innerHTML = `<strong>البيانات البنكية للمؤلف:</strong> ${cleanText(a.bankMethod || "")} - ${cleanText(a.bankName || "")} | المستفيد: ${cleanText(a.bankHolder || a.name)} | الحساب/IBAN: <span dir="ltr" style="font-family: monospace; font-weight: 800;">${cleanText(a.bankAccount || "")}</span>`;
    const methodField = document.getElementById("payout-method-field");
    if (!methodField.value && (a.bankMethod || a.bankName)) {
      methodField.value = `${a.bankMethod || ""} - ${a.bankName || ""}`.replace(/^ - | - $/g, "");
    }
  } else {
    box.innerHTML = `<span class="money-neg">لم يضف هذا المؤلف بياناته البنكية بعد.</span>`;
  }
}

function openPayoutForm(preAuthorId = null) {
  if (!state.authors.length) {
    showToast("أضف مؤلفاً أولاً");
    return;
  }
  document.getElementById("form-payout").reset();
  populateAllSelects();
  if (preAuthorId) {
    document.getElementById("payout-author-select").value = preAuthorId;
  }
  updatePayoutBankPreview(document.getElementById("payout-author-select").value);
  navigateToView("view-form-payout");
}

document.getElementById("form-payout").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-payout");
  btn.disabled = true;

  const authorId = document.getElementById("payout-author-select").value;
  const author = state.authors.find((a) => a.id === authorId);
  const amount = Number(document.getElementById("payout-amount-field").value || 0);
  const method = document.getElementById("payout-method-field").value.trim();
  const notes = document.getElementById("payout-notes-field").value.trim();
  const file = document.getElementById("payout-receipt-file").files[0];

  try {
    let receiptUrl = "";
    if (file) {
      showToast("جاري ضغط ورفع صورة الإيصال...");
      receiptUrl = await uploadCompressedImage(file, 1000, 0.8);
    }

    await addDoc(collection(db, "payouts"), {
      authorId,
      authorName: author ? author.name : "مؤلف",
      amount,
      method,
      notes,
      receiptUrl,
      paidBy: state.userEmail,
      dateString: getTodayStr(),
      createdAt: serverTimestamp()
    });

    await logAudit("تسديد دفعة لمؤلف", `تحويل ${formatEGP(amount)} للمؤلف (${author ? author.name : ""}) عبر ${method}`);
    clearDraftPrefix("payout_");
    showToast("تم توثيق الدفعة والإيصال بنجاح!");
    state.selectedAuthorDetailId = authorId;
    renderAuthorDetailPage(authorId);
    navigateToView("view-author-detail");
  } catch (err) {
    console.error(err);
    showToast("تعذر حفظ الدفعة");
  } finally {
    btn.disabled = false;
  }
});

// ==========================================================================
// 16. السجل المالي الشامل + محرك الفلترة الزمنية الذكي (Date-Range Filter)
// ==========================================================================
document.querySelectorAll("[data-fin-range]").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("[data-fin-range]").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    const range = pill.getAttribute("data-fin-range");
    const now = new Date();
    let from = "";
    const to = getTodayStr();

    if (range === "today") {
      from = to;
    } else if (range === "week") {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      from = d.toISOString().split("T")[0];
    } else if (range === "month") {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      from = d.toISOString().split("T")[0];
    }

    state.finDateFrom = from;
    state.finDateTo = range === "all" ? "" : to;
    document.getElementById("fin-date-from").value = state.finDateFrom;
    document.getElementById("fin-date-to").value = state.finDateTo;
    renderFinanceTimeline();
  });
});

document.getElementById("btn-apply-fin-dates").addEventListener("click", () => {
  document.querySelectorAll("[data-fin-range]").forEach((p) => p.classList.remove("active"));
  state.finDateFrom = document.getElementById("fin-date-from").value;
  state.finDateTo = document.getElementById("fin-date-to").value;
  renderFinanceTimeline();
});

function renderFinanceTimeline() {
  const box = document.getElementById("finance-timeline-list");
  if (!box) return;

  const allItems = sortDesc([
    ...state.sales.map((s) => ({ ...s, kind: "sale" })),
    ...state.expenses.map((x) => ({ ...x, kind: "expense" })),
    ...state.payouts.map((p) => ({ ...p, kind: "payout" }))
  ]).filter((item) => isDateWithinRange(item.dateString, state.finDateFrom, state.finDateTo));

  let periodIn = 0;
  let periodOut = 0;

  allItems.forEach((item) => {
    if (item.kind === "sale") periodIn += Number(item.totalAmount || 0);
    else periodOut += Number(item.amount || 0);
  });

  const periodNet = periodIn - periodOut;
  document.getElementById("fin-period-in").textContent = formatEGP(periodIn);
  document.getElementById("fin-period-out").textContent = formatEGP(periodOut);
  const netEl = document.getElementById("fin-period-net");
  netEl.textContent = formatEGP(periodNet);
  netEl.className = `metric-val ${periodNet >= 0 ? "money-pos" : "money-neg"}`;

  if (!allItems.length) {
    box.innerHTML = `<div class="surface-card" style="text-align: center; color: var(--text-muted); padding: 30px;">لا توجد حركات مالية ضمن الفترة المحددة.</div>`;
    return;
  }

  box.innerHTML = allItems
    .slice(0, 100)
    .map((item) => {
      if (item.kind === "sale") {
        const qty = Number(item.qty || 1);
        const tot = Number(item.totalAmount || 0);
        return `
          <div class="list-row">
            <div>
              <h4 style="font-size: 14px; font-weight: 800;">بيع (${qty} نسخة): ${cleanText(item.bookTitle)} <span class="badge pos">+${formatEGP(tot)}</span></h4>
              <p style="font-size: 12px; color: var(--text-secondary);">المؤلف: ${cleanText(item.authorName)} • القناة: ${cleanText(item.channel)} • بواسطة: ${cleanText(item.soldByName || item.soldBy)} • ${item.dateString}</p>
            </div>
            ${
              state.userRole === "super_admin"
                ? `<button type="button" class="icon-btn danger" style="width: 32px; height: 32px;" data-action="delete-sale" data-id="${item.id}" data-book-id="${item.bookId}" data-qty="${qty}"><i class="ri-delete-bin-line"></i></button>`
                : ""
            }
          </div>`;
      } else if (item.kind === "payout") {
        return `
          <div class="list-row">
            <div>
              <h4 style="font-size: 14px; font-weight: 800;">دفعة لمؤلف: ${cleanText(item.authorName)} <span class="badge neg">-${formatEGP(item.amount)}</span></h4>
              <p style="font-size: 12px; color: var(--text-secondary);">الطريقة: ${cleanText(item.method)} • ${item.dateString} ${item.receiptUrl ? `• <a href="${item.receiptUrl}" target="_blank" style="font-weight: 800; color: var(--text-main);">عرض الإيصال</a>` : ""}</p>
            </div>
          </div>`;
      } else {
        const linkedCount = Array.isArray(item.bookIds) ? item.bookIds.length : 0;
        return `
          <div class="list-row">
            <div>
              <h4 style="font-size: 14px; font-weight: 800;">مصروف: ${cleanText(item.title)} <span class="badge neg">-${formatEGP(item.amount)}</span></h4>
              <p style="font-size: 12px; color: var(--text-secondary);">${cleanText(item.category)} ${linkedCount ? `• موزعة على (${linkedCount}) كتب` : ""} • بواسطة: ${cleanText(item.addedBy)} • ${item.dateString}</p>
            </div>
            ${
              state.permissions.expenses
                ? `<button type="button" class="icon-btn danger" style="width: 32px; height: 32px;" data-action="delete-expense" data-id="${item.id}"><i class="ri-delete-bin-line"></i></button>`
                : ""
            }
          </div>`;
      }
    })
    .join("");
}

// ==========================================================================
// 17. الموظفون، التنبيهات، سجل التدقيق بالتواريخ، والآلة الحاسبة الذكية
// ==========================================================================
document.getElementById("btn-top-add-staff").addEventListener("click", () => openStaffFormPage(null));
document.getElementById("btn-staff-all-perms").addEventListener("click", () => {
  ["perm-sell", "perm-add-book", "perm-delete-book", "perm-authors", "perm-payouts", "perm-expenses", "perm-finance-view", "perm-reports"].forEach(
    (id) => (document.getElementById(id).checked = true)
  );
});
document.getElementById("btn-staff-sell-only").addEventListener("click", () => {
  ["perm-add-book", "perm-delete-book", "perm-authors", "perm-payouts", "perm-expenses", "perm-finance-view", "perm-reports"].forEach(
    (id) => (document.getElementById(id).checked = false)
  );
  document.getElementById("perm-sell").checked = true;
});

function openStaffFormPage(editId = null) {
  const form = document.getElementById("form-staff");
  form.reset();
  if (editId) {
    const s = state.staff.find((x) => x.id === editId);
    if (!s) return;
    document.getElementById("staff-id-field").value = s.id;
    document.getElementById("staff-name-field").value = s.name || "";
    document.getElementById("staff-email-field").value = s.email || "";
    document.getElementById("staff-job-field").value = s.jobTitle || "";
    const p = s.permissions || FULL_PERMS;
    document.getElementById("perm-sell").checked = !!p.sell;
    document.getElementById("perm-add-book").checked = p.addBook !== undefined ? !!p.addBook : true;
    document.getElementById("perm-delete-book").checked = !!p.deleteBook;
    document.getElementById("perm-authors").checked = p.authors !== undefined ? !!p.authors : true;
    document.getElementById("perm-payouts").checked = !!p.payouts;
    document.getElementById("perm-expenses").checked = !!p.expenses;
    document.getElementById("perm-finance-view").checked = !!p.financeView;
    document.getElementById("perm-reports").checked = p.reports !== undefined ? !!p.reports : true;
    document.getElementById("staff-restricted-check").checked = !!s.restricted;
    document.getElementById("form-staff-title").textContent = `تعديل صلاحيات الموظف: ${s.name}`;
  } else {
    document.getElementById("staff-id-field").value = "";
    document.getElementById("form-staff-title").textContent = "إضافة موظف وتخصيص صلاحياته";
  }
  navigateToView("view-form-staff");
}

document.getElementById("form-staff").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("staff-id-field").value;
  const email = document.getElementById("staff-email-field").value.trim().toLowerCase();
  if (isSuperAdminEmail(email)) {
    showToast("هذا البريد يتبع للإدارة العليا تلقائياً");
    return;
  }
  const permissions = {
    sell: document.getElementById("perm-sell").checked,
    addBook: document.getElementById("perm-add-book").checked,
    deleteBook: document.getElementById("perm-delete-book").checked,
    authors: document.getElementById("perm-authors").checked,
    payouts: document.getElementById("perm-payouts").checked,
    expenses: document.getElementById("perm-expenses").checked,
    financeView: document.getElementById("perm-finance-view").checked,
    reports: document.getElementById("perm-reports").checked
  };
  const payload = {
    name: document.getElementById("staff-name-field").value.trim(),
    email,
    jobTitle: document.getElementById("staff-job-field").value.trim(),
    permissions,
    restricted: document.getElementById("staff-restricted-check").checked
  };
  if (id) {
    await updateDoc(doc(db, "staff", id), payload);
    showToast("تم تحديث صلاحيات الموظف");
  } else {
    payload.createdAt = serverTimestamp();
    await addDoc(collection(db, "staff"), payload);
    showToast("تم اعتماد الموظف وصلاحياته!");
  }
  navigateToView("view-staff");
});

function renderStaffGrid() {
  const box = document.getElementById("staff-cards-grid");
  if (!box) return;
  const list = state.staff.filter((s) => !isSuperAdminEmail(s.email));
  if (!list.length) {
    box.innerHTML = `<div class="surface-card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">لا يوجد موظفون مضافون بعد.</div>`;
    return;
  }
  box.innerHTML = list
    .map((s) => {
      const logsCount = state.activityLogs.filter((l) => l.actorEmail === s.email).length;
      const activePerms = Object.values(s.permissions || {}).filter(Boolean).length;
      return `
        <div class="surface-card" style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span class="badge ${s.restricted ? "neg" : "pos"}">${s.restricted ? "مقيّد / موقوف" : `نشط (${activePerms}/8 صلاحيات)`}</span>
            <span class="badge">${logsCount} عملية موثقة</span>
          </div>
          <div>
            <h4 style="font-size: 16px; font-weight: 800;">${cleanText(s.name)}</h4>
            <p style="font-size: 12px; color: var(--text-secondary);" dir="ltr">${cleanText(s.email)}</p>
          </div>
          <div style="display: flex; gap: 6px; margin-top: auto;">
            <button type="button" class="btn btn-outline" style="flex: 1; padding: 7px 10px;" data-action="inspect-staff" data-email="${s.email}" data-name="${s.name}">
              <i class="ri-eye-line"></i><span>سجل عملياته</span>
            </button>
            <button type="button" class="icon-btn" style="width: 34px; height: 34px;" data-action="edit-staff" data-id="${s.id}"><i class="ri-equalizer-line"></i></button>
            <button type="button" class="icon-btn danger" style="width: 34px; height: 34px;" data-action="delete-staff" data-id="${s.id}"><i class="ri-delete-bin-line"></i></button>
          </div>
        </div>`;
    })
    .join("");
}

// التنبيهات
document.getElementById("btn-staff-send-notif").addEventListener("click", () => navigateToView("view-form-notif"));
document.getElementById("btn-notif-new").addEventListener("click", () => navigateToView("view-form-notif"));
document.getElementById("form-notif").addEventListener("submit", async (e) => {
  e.preventDefault();
  await addDoc(collection(db, "notifications"), {
    target: document.getElementById("notif-target-select").value,
    priority: document.getElementById("notif-priority-select").value,
    title: document.getElementById("notif-title-field").value.trim(),
    body: document.getElementById("notif-body-field").value.trim(),
    senderName: state.userProfile.displayName || "الإدارة",
    dateString: getTodayStr(),
    createdAt: serverTimestamp()
  });
  e.target.reset();
  showToast("تم إرسال التنبيه بنجاح");
  navigateToView("view-notifications");
});

function renderNotificationsView() {
  const box = document.getElementById("notifications-stack-list");
  if (!box) return;
  const mine = state.notifications.filter(
    (n) => state.userRole === "super_admin" || n.target === "all" || n.target === state.userEmail
  );
  const badge = document.getElementById("drawer-notif-badge");
  const dot = document.getElementById("header-notif-dot");
  if (mine.length) {
    badge.textContent = mine.length;
    badge.style.display = "inline-block";
    dot.style.display = "block";
  } else {
    badge.style.display = "none";
    dot.style.display = "none";
  }
  box.innerHTML = mine.length
    ? mine
        .map(
          (n) => `
        <div class="list-row" style="border-right: 4px solid ${n.priority === "urgent" ? "var(--neg)" : "var(--text-main)"};">
          <div>
            <div style="display: flex; gap: 6px; margin-bottom: 4px;">
              <span class="badge ${n.priority === "urgent" ? "neg" : "invert"}">${n.priority === "urgent" ? "عاجل" : "توجيه"}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${n.dateString} • إلى: ${cleanText(n.target)}</span>
            </div>
            <h4 style="font-size: 14.5px; font-weight: 800;">${cleanText(n.title)}</h4>
            <p style="font-size: 13px; color: var(--text-secondary);">${cleanText(n.body)}</p>
          </div>
        </div>`
        )
        .join("")
    : `<div class="surface-card" style="text-align: center; color: var(--text-muted); padding: 24px;">لا توجد تنبيهات حالياً.</div>`;
}

// الملف الشخصي وسجل التدقيق الرقابي مع فلترة التواريخ
document.getElementById("form-profile-update").addEventListener("submit", async (e) => {
  e.preventDefault();
  const newName = document.getElementById("profile-name-input").value.trim();
  await setDoc(doc(db, "user_profiles", state.userEmail), { displayName: newName, updatedAt: serverTimestamp() }, { merge: true });
  state.userProfile.displayName = newName;
  updateUserIdentityUI();
  showToast("تم حفظ الاسم بنجاح");
});

function resetAuditLogsToMe() {
  state.inspectingStaffEmail = null;
  document.getElementById("audit-log-title").innerHTML = `<i class="ri-history-line"></i><span>سجل التدقيق والعمليات الموثقة</span>`;
  document.getElementById("btn-back-my-logs").style.display = "none";
  renderAuditLogs();
}

document.getElementById("btn-back-my-logs").addEventListener("click", resetAuditLogsToMe);

document.getElementById("btn-apply-log-dates").addEventListener("click", () => {
  state.logDateFrom = document.getElementById("log-date-from").value;
  state.logDateTo = document.getElementById("log-date-to").value;
  renderAuditLogs();
});

document.getElementById("btn-reset-log-dates").addEventListener("click", () => {
  state.logDateFrom = "";
  state.logDateTo = "";
  document.getElementById("log-date-from").value = "";
  document.getElementById("log-date-to").value = "";
  renderAuditLogs();
});

function renderAuditLogs() {
  const box = document.getElementById("audit-logs-list");
  if (!box) return;
  const targetEmail = state.inspectingStaffEmail || state.userEmail;
  const list = state.activityLogs.filter(
    (l) =>
      (state.userRole === "super_admin" && !state.inspectingStaffEmail ? true : l.actorEmail === targetEmail) &&
      isDateWithinRange(l.dateString, state.logDateFrom, state.logDateTo)
  );

  box.innerHTML = list.length
    ? list
        .slice(0, 80)
        .map(
          (l) => `
        <div class="list-row">
          <div>
            <h4 style="font-size: 13.5px; font-weight: 800;">${cleanText(l.actionTitle)} <span style="font-size: 11px; color: var(--text-muted);">(${cleanText(l.actorName || l.actorEmail)})</span></h4>
            <p style="font-size: 12.5px; color: var(--text-secondary);">${cleanText(l.detailsText)}</p>
          </div>
          <span class="badge">${l.dateString}</span>
        </div>`
        )
        .join("")
    : `<div class="surface-card" style="text-align: center; color: var(--text-muted); padding: 24px;">لا توجد سجلات مطابقة للفترة المحددة.</div>`;
}

// ==========================================================================
// 18. الآلة الحاسبة الذكية المتصلة بكتب النظام (Smart Linked Calculator)
// ==========================================================================
function openSmartCalculator() {
  populateAllSelects();
  updateSmartCalculatorBreakdown();
  document.getElementById("modal-calculator").classList.add("show");
}

document.getElementById("btn-open-calculator").addEventListener("click", openSmartCalculator);
document.getElementById("btn-dash-open-calc").addEventListener("click", openSmartCalculator);

["calc-book-select", "calc-book-qty", "calc-book-disc"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateSmartCalculatorBreakdown);
});

function updateSmartCalculatorBreakdown() {
  const box = document.getElementById("calc-book-breakdown");
  if (!box) return;
  const bookId = document.getElementById("calc-book-select").value;
  const qty = Math.max(1, Number(document.getElementById("calc-book-qty").value || 1));
  const disc = Math.min(90, Math.max(0, Number(document.getElementById("calc-book-disc").value || 0)));

  const b = state.books.find((x) => x.id === bookId);
  if (!b) {
    box.innerHTML = `<span style="grid-column: 1/-1; color: var(--text-muted);">اختر كتاباً من القائمة أعلاه لحساب أرباحه ونسبته تلقائياً.</span>`;
    return;
  }

  const gross = qty * Number(b.price || 0);
  const netCollected = gross * (1 - disc / 100);
  const authorShare = netCollected * (Number(b.royaltyRate || 0) / 100);
  const houseShare = netCollected - authorShare;

  box.innerHTML = `
    <div><span>إجمالي قبل الخصم:</span> <strong>${formatEGP(gross)}</strong></div>
    <div><span>صافي التحصيل:</span> <strong class="money-pos">${formatEGP(netCollected)}</strong></div>
    <div><span>حق المؤلف (${b.royaltyRate}%):</span> <strong>${formatEGP(authorShare)}</strong></div>
    <div><span>صافي الدار:</span> <strong class="money-pos">${formatEGP(houseShare)}</strong></div>
  `;
}

let calcExpr = "";
document.querySelectorAll("[data-calc]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-calc");
    const screen = document.getElementById("calc-screen");
    if (key === "C") {
      calcExpr = "";
      screen.value = "0";
    } else if (key === "=") {
      try {
        const safe = calcExpr.replace(/[^0-9+\-*/.()]/g, "");
        const res = Function(`"use strict"; return (${safe || 0})`)();
        screen.value = Number(res.toFixed(2));
        calcExpr = String(screen.value);
      } catch {
        screen.value = "Error";
        calcExpr = "";
      }
    } else {
      calcExpr += key;
      screen.value = calcExpr;
    }
  });
});

// ==========================================================================
// 19. التقارير، عارض PDF، بوابة المؤلف المعزولة، والدليل المالي الشامل
// ==========================================================================
document.getElementById("btn-author-open-report").addEventListener("click", () => {
  if (!state.selectedAuthorDetailId) return;
  document.getElementById("report-author-id").value = state.selectedAuthorDetailId;
  buildAuthorReportText();
  navigateToView("view-form-report");
});

document.getElementById("report-type-select").addEventListener("change", buildAuthorReportText);

function buildAuthorReportText() {
  const authorId = document.getElementById("report-author-id").value;
  const type = document.getElementById("report-type-select").value;
  const a = state.authors.find((x) => x.id === authorId);
  if (!a) return;

  const url = getBaseUrl();
  const aBooks = state.books.filter((b) => b.authorId === authorId);
  const aPayouts = state.payouts.filter((p) => p.authorId === authorId);
  let copies = 0;
  let earned = 0;
  const lines = aBooks
    .map((b) => {
      const c = Number(b.copiesSold || 0);
      const roy = c * Number(b.price || 0) * (Number(b.royaltyRate || 0) / 100);
      copies += c;
      earned += roy;
      return `• كتاب (${b.title}): المباع ${c} نسخة | عائدكم (${b.royaltyRate}%): ${formatEGP(roy)}`;
    })
    .join("\n");
  const paid = aPayouts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, earned - paid);

  let text = "";
  if (type === "welcome") {
    text = `أهلاً بك أ. ${a.name} في نظام صفقات كتابية (Safaqat System)\n\nتم تفعيل بوابتكم الخاصة لمتابعة عقود مؤلفاتكم، المبيعات، المعارض المشارك بها، ومحفظتكم المالية.\n\nرابط البوابة:\n${url}\nالبريد المعتمد للدخول: ${a.email}\n\nيرجى الدخول وتعبئة قسم (بياناتي البنكية) لاعتمادها في تحويل المستحقات.`;
  } else if (type === "full_sales") {
    text = `كشف حساب محفظة المؤلف | أ. ${a.name}\nالتاريخ: ${getTodayStr()}\n\n${lines || "-"}\n\n- إجمالي النسخ المباعة: ${copies} نسخة\n- إجمالي عوائد المحفظة: ${formatEGP(earned)}\n- إجمالي المسحوبات المحولة: ${formatEGP(paid)}\n- الرصيد المتاح بالمحفظة: ${formatEGP(balance)}\n\nبوابتكم المباشرة:\n${url}`;
  } else {
    text = `تحية طيبة أ. ${a.name}،\nيرجى الدخول إلى بوابتكم في نظام صفقات كتابية وتحديث أو تصحيح (بياناتكم البنكية وطريقة التحويل والاسم الرباعي) لنتمكن من تحويل مستحقاتكم المالية.\n\nرابط البوابة:\n${url}`;
  }
  document.getElementById("report-text-area").value = text;
}

document.getElementById("btn-copy-report").addEventListener("click", () => {
  navigator.clipboard.writeText(document.getElementById("report-text-area").value);
  showToast("تم نسخ النص");
});
document.getElementById("btn-whatsapp-report").addEventListener("click", () => {
  const a = state.authors.find((x) => x.id === document.getElementById("report-author-id").value);
  if (!a || !a.phone) {
    showToast("أضف رقم هاتف للمؤلف أولاً أو انسخ النص");
    return;
  }
  window.open(buildWhatsAppUrl(a.phone, document.getElementById("report-text-area").value), "_blank");
});
document.getElementById("btn-mailto-report").addEventListener("click", () => {
  const a = state.authors.find((x) => x.id === document.getElementById("report-author-id").value);
  if (!a) return;
  window.location.href = `mailto:${encodeURIComponent(a.email)}?subject=${encodeURIComponent("نظام صفقات كتابية | بيان رسمي")}&body=${encodeURIComponent(document.getElementById("report-text-area").value)}`;
});

// عارض عقود الـ PDF
function openPdfViewerPage(bookId) {
  const b = state.books.find((x) => x.id === bookId);
  if (!b || !b.drivePdfUrl) return;
  const parsed = parseDriveUrl(b.drivePdfUrl);
  document.getElementById("pdf-viewer-heading").textContent = `وثيقة عقد كتاب: ${b.title}`;
  document.getElementById("pdf-iframe").src = parsed.previewUrl;
  document.getElementById("btn-pdf-download").href = parsed.downloadUrl;
  state.returnViewBeforePdf = state.userRole === "author" ? "view-author-portal" : "view-book-detail";
  navigateToView("view-pdf-viewer");
}
document.getElementById("btn-close-pdf-view").addEventListener("click", () => {
  document.getElementById("pdf-iframe").src = "";
  navigateToView(state.returnViewBeforePdf);
});

// --- بوابة المؤلف المعزولة 100% (يرى فقط مؤلفاته، محفظته، والمعارض المشارك بها) ---
function startAuthorIsolatedListeners(authorId) {
  const u1 = onSnapshot(doc(db, "authors", authorId), (s) => {
    if (s.exists()) {
      state.currentAuthorProfile = { id: s.id, ...s.data() };
      renderAuthorIsolatedPortal();
    }
  });
  const u2 = onSnapshot(query(collection(db, "books"), where("authorId", "==", authorId)), (s) => {
    state.books = sortDesc(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderAuthorIsolatedPortal();
  });
  const u3 = onSnapshot(query(collection(db, "payouts"), where("authorId", "==", authorId)), (s) => {
    state.payouts = sortDesc(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderAuthorIsolatedPortal();
  });
  const u4 = onSnapshot(collection(db, "exhibitions"), (s) => {
    state.exhibitions = sortDesc(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderAuthorIsolatedPortal();
  });
  const u5 = onSnapshot(query(collection(db, "notifications"), where("target", "==", state.userEmail)), (s) => {
    state.notifications = sortDesc(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderAuthorIsolatedPortal();
  });
  state.unsubscribers.push(u1, u2, u3, u4, u5);
}

function renderAuthorIsolatedPortal() {
  const prof = state.currentAuthorProfile;
  if (!prof) return;

  document.getElementById("portal-author-name").textContent = `أهلاً بك، أ. ${prof.name}`;

  // عرض التنبيهات الخاصة بالمؤلف
  const alertsBox = document.getElementById("portal-author-alerts");
  alertsBox.innerHTML = state.notifications
    .map(
      (n) => `
      <div class="list-row" style="border-color: var(--neg); background: var(--neg-bg); margin-bottom: 12px;">
        <div>
          <strong style="color: var(--neg); font-size: 13.5px;"><i class="ri-notification-badge-line"></i> ${cleanText(n.title)}</strong>
          <p style="font-size: 12.5px;">${cleanText(n.body)}</p>
        </div>
      </div>`
    )
    .join("");

  let copies = 0;
  let earned = 0;
  const myBookIds = state.books.map((b) => b.id);

  state.books.forEach((b) => {
    const c = Number(b.copiesSold || 0);
    copies += c;
    earned += c * Number(b.price || 0) * (Number(b.royaltyRate || 0) / 100);
  });

  const paid = state.payouts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, earned - paid);

  document.getElementById("portal-stat-copies").textContent = `${copies} نسخة`;
  document.getElementById("portal-stat-earned").textContent = formatEGP(earned);
  document.getElementById("portal-stat-paid").textContent = `تم تحويل: ${formatEGP(paid)}`;
  document.getElementById("portal-stat-balance").textContent = formatEGP(balance);

  // المعارض المشارك بها كتب هذا المؤلف (بدون أي أرقام مالية للدار)
  const myExhibitions = state.exhibitions.filter(
    (x) => Array.isArray(x.bookIds) && x.bookIds.some((id) => myBookIds.includes(id))
  );
  const exhBanner = document.getElementById("portal-exhibitions-banner");
  if (myExhibitions.length) {
    exhBanner.innerHTML = `
      <div class="surface-card">
        <h4 style="font-size: 14px; font-weight: 800; margin-bottom: 8px;"><i class="ri-compass-discover-line"></i> المعارض والفعاليات المشارك بها مؤلفاتك:</h4>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${myExhibitions
            .map(
              (x) =>
                `<span class="badge invert" style="padding: 6px 12px; font-size: 12px;">${cleanText(x.name)} (${x.startDate} إلى ${x.endDate})</span>`
            )
            .join("")}
        </div>
      </div>`;
  } else {
    exhBanner.innerHTML = "";
  }

  // عرض مؤلفات الكاتب فقط
  document.getElementById("portal-books-showcase").innerHTML = state.books.length
    ? state.books
        .map((b) => {
          const sold = Number(b.copiesSold || 0);
          const roy = sold * Number(b.price || 0) * (Number(b.royaltyRate || 0) / 100);
          const st = getContractInfo(b.contractDate, b.contractMonths, b.isTerminated);
          const bookExhs = state.exhibitions.filter((x) => Array.isArray(x.bookIds) && x.bookIds.includes(b.id));

          return `
            <div class="book-card">
              <div class="book-cover-wrap">
                <div class="cover-badges"><span class="badge ${st.badgeClass}">${st.label}</span></div>
                ${b.coverUrl ? `<img src="${b.coverUrl}" />` : `<div class="book-typo-cover"><i class="ri-book-2-line"></i><h4>${cleanText(b.title)}</h4></div>`}
              </div>
              <div class="book-body">
                <div class="book-title-link">${cleanText(b.title)}</div>
                <div class="book-mini-stats">
                  <div><span>سعر الغلاف</span><strong>${formatEGP(b.price)}</strong></div>
                  <div><span>نسبتك بالعقد</span><strong>${b.royaltyRate}%</strong></div>
                  <div><span>النسخ المباعة</span><strong>${sold} نسخة</strong></div>
                  <div><span>عوائدك</span><strong class="money-pos">${formatEGP(roy)}</strong></div>
                </div>
                ${
                  bookExhs.length
                    ? `<div style="font-size: 11px; color: var(--text-secondary);">مشارك في: ${bookExhs.map((x) => cleanText(x.name)).join("، ")}</div>`
                    : ""
                }
                ${
                  b.drivePdfUrl
                    ? `<button type="button" class="btn btn-primary" style="width: 100%; margin-top: auto;" data-action="open-portal-pdf" data-id="${b.id}">
                         <i class="ri-file-pdf-2-line"></i><span>استعراض وتحميل عقد الكتاب</span>
                       </button>`
                    : ""
                }
              </div>
            </div>`;
        })
        .join("")
    : `<div class="surface-card" style="grid-column: 1/-1; text-align: center; padding: 24px;">لا توجد عقود كتب مسجلة حالياً.</div>`;

  // تعبئة بيانات البنك المحفوظة للمؤلف
  document.getElementById("portal-bank-method").value = prof.bankMethod || "";
  document.getElementById("portal-bank-name").value = prof.bankName || "";
  document.getElementById("portal-bank-holder").value = prof.bankHolder || prof.name || "";
  document.getElementById("portal-bank-account").value = prof.bankAccount || "";
  document.getElementById("portal-bank-country").value = prof.bankCountry || "";
  document.getElementById("portal-bank-notes").value = prof.bankNotes || "";

  document.getElementById("portal-payouts-list").innerHTML = state.payouts.length
    ? state.payouts
        .map(
          (p) => `
        <div class="list-row">
          <div>
            <h4 style="font-size: 14px; font-weight: 800;" class="money-pos">دفعة محولة لك: ${formatEGP(p.amount)}</h4>
            <p style="font-size: 12px; color: var(--text-secondary);">الطريقة: ${cleanText(p.method)} • التاريخ: ${p.dateString}</p>
          </div>
          ${p.receiptUrl ? `<a href="${p.receiptUrl}" target="_blank" class="btn btn-outline" style="padding: 5px 10px; font-size: 12px;"><i class="ri-image-line"></i><span>عرض الإيصال</span></a>` : ""}
        </div>`
        )
        .join("")
    : `<div class="surface-card" style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد حوالات مسجلة حتى الآن.</div>`;
}

document.getElementById("form-portal-bank").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.currentAuthorProfile) return;
  const upd = {
    bankMethod: document.getElementById("portal-bank-method").value.trim(),
    bankName: document.getElementById("portal-bank-name").value.trim(),
    bankHolder: document.getElementById("portal-bank-holder").value.trim(),
    bankAccount: document.getElementById("portal-bank-account").value.trim(),
    bankCountry: document.getElementById("portal-bank-country").value.trim(),
    bankNotes: document.getElementById("portal-bank-notes").value.trim()
  };
  await updateDoc(doc(db, "authors", state.currentAuthorProfile.id), upd);
  showToast("تم حفظ واعتماد بياناتك البنكية بنجاح!");
});

// --- الدليل المالي والتشغيلي الشامل للإدارة والموظفين ---
function renderComprehensiveGuide() {
  const box = document.getElementById("comprehensive-guide-container");
  if (!box) return;
  const p = state.permissions;

  box.innerHTML = `
    <div class="page-panel">
      <div class="panel-head">
        <div>
          <h3 style="font-size: 16.5px; font-weight: 900;"><i class="ri-book-open-line"></i> الدليل المالي والتشغيلي الرسمي (Safaqat System ERP)</h3>
          <p style="font-size: 12px; color: var(--text-secondary);">مرجع الإدارة وفريق العمل لفهم المعادلات المالية، دورة المستودعات، وأمان البيانات</p>
        </div>
      </div>
      <div class="panel-body">
        <div class="form-box">
          <div class="form-box-title"><i class="ri-calculator-line"></i> 1. كيف يحسب النظام الأرباح والمحافظ بدقة 100% دون أي تداخل؟</div>
          <p style="font-size: 13px; line-height: 1.8;">
            • <strong>قاعدة التسعير التاريخي الثابت:</strong> كل عملية بيع تُوثق في سجل المبيعات بسعر الكتاب ونسبة المؤلف لحظة البيع؛ فلو تغير سعر الكتاب لاحقاً في الطبعات الجديدة، تبقى المبيعات السابقة محفوظة بحساباتها الأصلية دون أي لخبطة.<br/>
            • <strong>معادلة توزيع البيعة:</strong> عند بيع نسخة (أو تحصيل مبيعات من مكتبة):<br/>
            &nbsp;&nbsp;1. <strong>صافي المبلغ المحصل</strong> = (عدد النسخ × سعر الغلاف) ناقص أي نسبة خصم توزيع.<br/>
            &nbsp;&nbsp;2. <strong>عائد محفظة المؤلف</strong> = (صافي المبلغ المحصل × نسبة المؤلف المحددة في العقد %).<br/>
            &nbsp;&nbsp;3. <strong>عائد الدار من البيعة</strong> = (صافي المبلغ المحصل ➖ عائد محفظة المؤلف).<br/>
            • <strong>معادلة صافي محفظة الدار:</strong> (مجموع عوائد الدار من كافة المبيعات ➖ المصروفات التشغيلية والحملات 🟰 صافي صندوق الدار).<br/>
            • <strong>معادلة محفظة المؤلف:</strong> (إجمالي عوائده من مبيعات كتبه ➖ إجمالي الحوالات المسددة له بإيصالات 🟰 الرصيد المتبقي المستحق له).
          </p>
        </div>

        <div class="form-box">
          <div class="form-box-title"><i class="ri-building-2-line"></i> 2. كيف يعمل نظام المكتبات والموزعين (بضاعة الأمانة)؟</div>
          <p style="font-size: 13px; line-height: 1.8;">
            • <strong>الخطوة الأولى (التوريد):</strong> عند إرسال شحنة كتب لمكتبة، ندخل لملف المكتبة ونضغط <strong>"توريد شحنة كتب"</strong>. النظام يخصم النسخ من مستودع الدار ويضعها في "عهدة المكتبة" كبضاعة أمانة، <strong>ولا يسجلها كمبيعات مالية</strong> لأن المال لم يدخل خزينة الدار بعد.<br/>
            • <strong>الخطوة الثانية (التصفية والتحصيل):</strong> عندما تبيع المكتبة وتحول المال للدار، نضغط <strong>"تسجيل مبيعات محصلة"</strong>، فيقوم النظام فوراً بخصم العدد من عهدة المكتبة، وإيداع المبلغ في خزينة الدار، وإضافة نسبة المؤلف في محفظته تلقائياً.
          </p>
        </div>

        <div class="form-box">
          <div class="form-box-title"><i class="ri-store-3-line"></i> 3. كيف تعمل المستودعات الفرعية، المعارض، وتوزيع الحملات الإعلانية؟</div>
          <p style="font-size: 13px; line-height: 1.8;">
            • <strong>المستودعات والطبعات:</strong> يمكن للإدارة إنشاء أكثر من مستودع، وتوريد طبعات جديدة لأي كتاب، أو نقل كميات بين المستودعات، مع تنبيه آلي عندما يصل أي كتاب إلى 15 نسخة فأقل.<br/>
            • <strong>المعارض:</strong> لكل معرض صفحة مستقلة تحسب مبيعات جناح المعرض مقابل تكاليفه وميزانيته، وتظهر الكتب المشاركة في بوابة مؤلفيها دون كشف أي أرقام مالية خاصة بالدار.<br/>
            • <strong>الحملات الإعلانية المشتركة:</strong> عند تسجيل مصروف إعلاني لـ 5 أو 10 كتب معاً، يقسم النظام تكلفة الإعلان بالتساوي على هذه الكتب في تقاريرها التفصيلية.
          </p>
        </div>

        <div class="form-box" style="margin-bottom: 0;">
          <div class="form-box-title"><i class="ri-shield-check-line"></i> 4. صلاحيات حسابك الحالية في النظام</div>
          <div class="multi-select-list" style="max-height: none;">
            <div class="check-tile"><span>${p.sell ? "✅" : "❌"}</span><span>تسجيل المبيعات</span></div>
            <div class="check-tile"><span>${p.addBook ? "✅" : "❌"}</span><span>إدارة الكتب والمستودعات</span></div>
            <div class="check-tile"><span>${p.deleteBook ? "✅" : "❌"}</span><span>حذف الكتب وفسخ العقود</span></div>
            <div class="check-tile"><span>${p.authors ? "✅" : "❌"}</span><span>إدارة المؤلفين والمكتبات والمعارض</span></div>
            <div class="check-tile"><span>${p.payouts ? "✅" : "❌"}</span><span>تسديد دفعات المؤلفين</span></div>
            <div class="check-tile"><span>${p.expenses ? "✅" : "❌"}</span><span>تسجيل المصاريف والحملات</span></div>
            <div class="check-tile"><span>${p.financeView ? "✅" : "❌"}</span><span>رؤية محفظة الدار والسجل المالي</span></div>
            <div class="check-tile"><span>${p.reports ? "✅" : "❌"}</span><span>إرسال التقارير للمؤلفين</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// تثبيت التطبيق المباشر (PWA Install)
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  state.deferredPwaPrompt = e;
});

document.getElementById("btn-drawer-install-pwa").addEventListener("click", async () => {
  closeDrawer();
  if (state.deferredPwaPrompt) {
    state.deferredPwaPrompt.prompt();
    await state.deferredPwaPrompt.userChoice;
    state.deferredPwaPrompt = null;
  } else {
    showToast("التطبيق مثبت بالفعل أو يمكنك اختيار (الإضافة إلى الشاشة الرئيسية) من قائمة المتصفح");
  }
});
