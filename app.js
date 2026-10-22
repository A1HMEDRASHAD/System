ع/* ==========================================================================
   Safaqat System ERP & POS - Institutional Master Engine v3.1 (Part 1 of 3)
   Fail-Safe Mobile Boot Edition | دار صفقات كتابية للنشر والتوزيع
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================================================
// 0. نظام الحماية القسري للجوال (Fail-Safe Boot Watchdog & Mobile Debugger)
// ==========================================================================
function forceHideBootScreen(fallbackToAuth = false) {
  const bootEl = document.getElementById("boot-screen");
  const authEl = document.getElementById("auth-screen");
  const appEl = document.getElementById("app-screen");

  if (bootEl && bootEl.style.display !== "none") {
    bootEl.style.opacity = "0";
    setTimeout(() => {
      bootEl.style.display = "none";
      bootEl.style.opacity = "1";
    }, 180);
  }

  if (fallbackToAuth && appEl && appEl.style.display === "none" && authEl) {
    authEl.style.display = "flex";
  }
}

// مؤقت طوارئ: يمنع بقاء الدائرة تدور لأكثر من 3.2 ثانية تحت أي ظرف
const bootWatchdogTimer = setTimeout(() => {
  const appEl = document.getElementById("app-screen");
  const isAppVisible = appEl && appEl.style.display === "block";
  forceHideBootScreen(!isAppVisible);
}, 3200);

// كاشف أخطاء مرئي على شاشة الجوال
window.addEventListener("error", (ev) => {
  console.error("Global Error:", ev.error || ev.message);
  forceHideBootScreen(true);
});

window.addEventListener("unhandledrejection", (ev) => {
  console.warn("Unhandled Promise Rejection:", ev.reason);
  forceHideBootScreen(false);
});

// ==========================================================================
// 1. إعدادات الاتصال السحابي والسيادة الإدارية (Firebase & ImgBB)
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDtdAxJqFhc1nsViYRkMVw9FXzCKeYhT5I",
  authDomain: "safaqat-system.firebaseapp.com",
  projectId: "safaqat-system",
  storageBucket: "safaqat-system.firebasestorage.app",
  messagingSenderId: "847357037344",
  appId: "1:847357037344:web:fe71887332dfe8f35b2545"
};

const IMGBB_API_KEY = "8daac9827176202a80700d2e41aaebd8";

const SUPER_ADMINS = [
  "rawialshamal@gmail.com",
  "a1hmedrashad@gmail.com",
  "safaqatkitabiya@gmail.com"
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ==========================================================================
// 2. الحالة المركزية للنظام (Central Application State)
// ==========================================================================
const state = {
  user: null,
  userEmail: "",
  role: null, // 'super_admin' | 'staff' | 'author'
  isPosOnlyStaff: false,
  displayName: "",
  avatarUrl: "",
  staffDoc: null,
  authorDoc: null,

  permissions: {
    pos: false,
    sell: false,
    addBook: false,
    deleteBook: false,
    authors: false,
    payouts: false,
    expenses: false,
    financeView: false,
    reports: false
  },

  books: [],
  authors: [],
  sales: [],
  payouts: [],
  expenses: [],
  warehouses: [],
  editions: [],
  libraries: [],
  libTx: [],
  exhibitions: [],
  notifications: [],
  staff: [],
  logs: [],
  userProfiles: {},

  currentView: "view-dashboard",
  prevView: "view-dashboard",
  selectedBookId: null,
  selectedAuthorId: null,
  selectedLibId: null,
  selectedExhId: null,
  portalSelectedBookId: null,
  viewingStaffLogsEmail: null,
  inspectedLog: null,
  currentInvoiceObj: null,

  bookFilter: "all",
  archFilter: "all",
  finRange: "all",
  finFrom: "",
  finTo: "",
  logFrom: "",
  logTo: "",
  chartType: "bar",
  salesChartInstance: null,

  posCart: [],
  qrScannerInstance: null,
  scannerRunning: false,

  unsubscribers: [],
  deferredPwaPrompt: null,
  confirmCallback: null
};

// ==========================================================================
// 3. الدوال المساعدة، التنسيق الزمني بالثانية، وقفل النقر المزدوج
// ==========================================================================
const $ = (id) => document.getElementById(id); const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtNum(n) {
  const val = Number(n) || 0;
  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtMoney(n) {
  const val = Number(n) || 0;
  return `${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function fmtFullDateTime(tsOrIso) {
  if (!tsOrIso) return "—";
  const d = typeof tsOrIso === "number" ? new Date(tsOrIso) : new Date(tsOrIso);
  if (isNaN(d.getTime())) return String(tsOrIso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} | ${hh}:${min}:${sec}`;
}

function toast(msg, icon = "ri-checkbox-circle-line") {
  const stack = $("toast-stack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = "toast-item";
  item.innerHTML = `<i class="${esc(icon)}" style="font-size:17px;"></i><span>${esc(msg)}</span>`;
  stack.appendChild(item);
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transition = "opacity 0.25s ease";
    setTimeout(() => item.remove(), 260);
  }, 3400);
}

async function withButtonLock(btnEl, asyncTask) {
  if (!btnEl) return await asyncTask();
  if (btnEl.classList.contains("is-busy") || btnEl.disabled) return;
  const origHtml = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.classList.add("is-busy");
  btnEl.innerHTML = `<i class="ri-loader-4-line"></i><span>جارٍ التنفيذ...</span>`;
  try {
    await asyncTask();
  } catch (err) {
    console.error("Operation Error:", err);
    toast(err?.message || "حدث خطأ غير متوقع أثناء العملية", "ri-error-warning-line");
  } finally {
    btnEl.disabled = false;
    btnEl.classList.remove("is-busy");
    btnEl.innerHTML = origHtml;
  }
}

function openModal(id) {
  const m = $(id);
  if (m) m.classList.add("show");
}

function closeModal(id) {
  const m = $(id);
  if (m) m.classList.remove("show");
}

function askConfirm(title, message, onConfirmFn) {
  if ($("confirm-title-text")) $("confirm-title-text").textContent = title;
  if ($("confirm-msg-text")) $("confirm-msg-text").textContent = message;
  state.confirmCallback = onConfirmFn;
  openModal("modal-confirm");
}

// ==========================================================================
// 4. ضغط الصور الذكي ورفعها السحابي (ImgBB + Fallback)
// ==========================================================================
async function compressImageToBlob(file, maxWidth = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImageSmart(file) {
  if (!file) return "";
  try {
    const compressedDataUrl = await compressImageToBlob(file, 950, 0.82);
    const base64Clean = compressedDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const formData = new FormData();
    formData.append("key", IMGBB_API_KEY);
    formData.append("image", base64Clean);

    const res = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData
    });
    const json = await res.json();
    if (json && json.success && json.data && json.data.url) {
      return json.data.url;
    }
    return compressedDataUrl;
  } catch (e) {
    console.warn("ImgBB fallback to DataURL:", e);
    return await compressImageToBlob(file, 600, 0.72);
  }
}

// ==========================================================================
// 5. معالجة روابط Google Drive وفتح العارض المدمج
// ==========================================================================
function extractDriveFileId(url) {
  if (!url) return null;
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

function getDrivePreviewUrl(url) {
  const id = extractDriveFileId(url);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  return url || "";
}

function getDriveDownloadUrl(url) {
  const id = extractDriveFileId(url);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return url || "#";
}

function openPdfViewer(title, rawUrl, allowDownload = true) {
  if (!rawUrl) {
    toast("لا يوجد رابط ملف PDF مرفق لهذا المستند", "ri-error-warning-line");
    return;
  }
  const previewUrl = getDrivePreviewUrl(rawUrl);
  const downloadUrl = getDriveDownloadUrl(rawUrl);
  if ($("pdf-viewer-heading")) $("pdf-viewer-heading").textContent = title || "معاينة المستند PDF";
  if ($("pdf-iframe")) $("pdf-iframe").src = previewUrl;

  const dlBtn = $("btn-pdf-download");
  const prBtn = $("btn-pdf-direct-print");
  const shBtn = $("btn-pdf-share-link");

  if (dlBtn) {
    dlBtn.href = downloadUrl;
    dlBtn.style.display = allowDownload ? "inline-flex" : "none";
  }
  if (prBtn) {
    prBtn.style.display = allowDownload ? "inline-flex" : "none";
    prBtn.onclick = () => window.open(previewUrl, "_blank");
  }
  if (shBtn) {
    shBtn.style.display = allowDownload ? "inline-flex" : "none";
    shBtn.onclick = () => {
      navigator.clipboard.writeText(rawUrl);
      toast("تم نسخ رابط المستند إلى الحافظة");
    };
  }

  navigateTo("view-pdf-viewer");
}

// ==========================================================================
// 6. السجل الرقابي التفصيلي بالثانية + نظام الإشعارات القابلة للنقر
// ==========================================================================
async function logActivity(actionTitle, detailsText, extra = {}) {
  if (!state.userEmail) return;
  try {
    const now = Date.now();
    await addDoc(collection(db, "activity_logs"), {
      actorEmail: state.userEmail.toLowerCase(),
      actorName: state.displayName || state.userEmail,
      actorRole: state.role === "super_admin" ? "الإدارة العليا" : state.role === "staff" ? "موظف" : "مؤلف",
      actionTitle: String(actionTitle),
      detailsText: String(detailsText),
      timestamp: now,
      dateISO: new Date(now).toISOString(),
      targetView: extra.targetView || "",
      targetEntityId: extra.targetEntityId || "",
      beforeSnapshot: extra.beforeSnapshot ? JSON.stringify(extra.beforeSnapshot) : "",
      afterSnapshot: extra.afterSnapshot ? JSON.stringify(extra.afterSnapshot) : "",
      operationCategory: extra.category || "عام"
    });
  } catch (err) {
    console.warn("Audit Log Notice:", err);
  }
}

async function sendSystemNotification({
  title,
  body,
  targetEmail = "all_admins",
  priority = "normal",
  linkView = "view-dashboard",
  linkEntityId = "",
  actionType = ""
}) {
  try {
    const now = Date.now();
    await addDoc(collection(db, "notifications"), {
      title: String(title),
      body: String(body),
      targetEmail: String(targetEmail).toLowerCase(),
      priority,
      linkView,
      linkEntityId,
      actionType,
      senderEmail: state.userEmail,
      senderName: state.displayName || state.userEmail,
      readBy: [],
      timestamp: now,
      dateISO: new Date(now).toISOString()
    });
  } catch (err) {
    console.warn("Notification Notice:", err);
  }
}

// ==========================================================================
// 7. محرك القوائم الذكية (Smart Auto-Complete Picker) والحفظ المؤقت للمسودات
// ==========================================================================
function enhanceSmartSelect(selectEl) {
  if (!selectEl || selectEl.dataset.smartInitialized === "true") return;
  selectEl.dataset.smartInitialized = "true";

  const wrap = document.createElement("div");
  wrap.className = "smart-picker-wrap";
  selectEl.parentNode.insertBefore(wrap, selectEl);
  selectEl.style.display = "none";
  wrap.appendChild(selectEl);

  const inputBox = document.createElement("div");
  inputBox.className = "smart-picker-input-box";
  inputBox.innerHTML = `
    <i class="ri-search-2-line search-ico"></i>
    <input type="text" class="input-ctrl smart-picker-text" placeholder="${esc(selectEl.dataset.placeholder || "ابحث واختر...")}" autocomplete="off" />
    <button type="button" class="smart-picker-clear" title="مسح الاختيار"><i class="ri-close-line"></i></button>
  `;

  const dropdown = document.createElement("div");
  dropdown.className = "smart-picker-dropdown";

  wrap.appendChild(inputBox);
  wrap.appendChild(dropdown);

  const textInput = inputBox.querySelector(".smart-picker-text");
  const clearBtn = inputBox.querySelector(".smart-picker-clear");

  function syncTextFromSelect() {
    const selOpt = selectEl.options[selectEl.selectedIndex];
    if (selOpt && selOpt.value) {
      textInput.value = selOpt.textContent;
      wrap.classList.add("has-val");
    } else {
      textInput.value = "";
      wrap.classList.remove("has-val");
    }
  }

  function renderDropdownList(queryText = "") {
    const q = queryText.trim().toLowerCase();
    const opts = Array.from(selectEl.options).filter((o) => o.value !== "");
    const filtered = opts.filter((o) => o.textContent.toLowerCase().includes(q));

    if (!filtered.length) {
      dropdown.innerHTML = `<div class="smart-picker-empty">لا توجد نتائج مطابقة لـ "${esc(queryText)}"</div>`;
      return;
    }

    dropdown.innerHTML = filtered
      .map(
        (o) => `
        <div class="smart-picker-item ${o.value === selectEl.value ? "selected" : ""}" data-val="${esc(o.value)}">
          <span>${esc(o.textContent)}</span>
          <i class="ri-check-line" style="opacity:${o.value === selectEl.value ? "1" : "0"};"></i>
        </div>
      `
      )
      .join("");

    dropdown.querySelectorAll(".smart-picker-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const val = item.getAttribute("data-val");
        selectEl.value = val;
        syncTextFromSelect();
        dropdown.classList.remove("open");
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  }

  textInput.addEventListener("focus", () => {
    renderDropdownList("");
    dropdown.classList.add("open");
  });

  textInput.addEventListener("input", () => {
    renderDropdownList(textInput.value);
    dropdown.classList.add("open");
  });

  textInput.addEventListener("blur", () => {
    setTimeout(() => {
      dropdown.classList.remove("open");
      syncTextFromSelect();
    }, 180);
  });

  clearBtn.addEventListener("click", () => {
    selectEl.value = "";
    syncTextFromSelect();
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    textInput.focus();
  });

  selectEl._syncSmartPicker = syncTextFromSelect;
  syncTextFromSelect();
}

function refreshAllSmartPickers() {
  $$('select[data-smart-select="true"]').forEach((sel) => { if (sel.dataset.smartInitialized !== "true") { enhanceSmartSelect(sel); } else if (typeof sel._syncSmartPicker === "function") { sel._syncSmartPicker(); } }); }  function initDraftSystem() { $$
("[data-draft]").forEach((inp) => {
    const key = `safaqat_draft_${inp.dataset.draft}`;
    const saved = localStorage.getItem(key);
    if (saved && !inp.value) {
      inp.value = saved;
    }
    inp.addEventListener("input", () => {
      localStorage.setItem(key, inp.value);
    });
  });

  $$(".js-clear-draft").forEach((btn) => { btn.addEventListener("click", () => { const prefix = btn.dataset.prefix \vert{}\vert{} ""; clearDraftByPrefix(prefix, true); toast("تم مسح المسودة وتفريغ الحقول"); }); }); }  function clearDraftByPrefix(prefix, clearInputs = false) { $$
(`[data-draft^="${prefix}"]`).forEach((inp) => {
    localStorage.removeItem(`safaqat_draft_${inp.dataset.draft}`);
    if (clearInputs) inp.value = "";
  });
}

// ==========================================================================
// 8. نظام المصادقة الآمن، فحص الصلاحيات المعزول، ومنع تعليق شاشة الإقلاع
// ==========================================================================
function hasPerm(permKey) {
  if (state.role === "super_admin") return true;
  if (state.role === "staff") return Boolean(state.permissions[permKey]);
  return false;
}

async function initAuthAndBoot() {
  const savedTheme = localStorage.getItem("safaqat_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);

  if ($("print-header-date")) $("print-header-date").textContent = `DATE: ${todayISO()}`;
  if ($("print-header-domain")) $("print-header-domain").textContent = window.location.hostname || "safaqat-system.web.app";
  if ($("print-footer-url")) $("print-footer-url").textContent = window.location.origin;

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("Persistence Notice:", e);
  }

  // معالجة العودة من تسجيل الدخول عبر Redirect على متصفحات الجوال
  try {
    await getRedirectResult(auth);
  } catch (e) {
    console.warn("Redirect Result Notice:", e);
  }

  onAuthStateChanged(auth, async (user) => {
    clearTimeout(bootWatchdogTimer);
    const authEl = $("auth-screen");
    const appEl = $("app-screen");

    if (!user || !user.email) {
      stopRealtimeListeners();
      state.user = null;
      state.userEmail = "";
      state.role = null;
      if (appEl) appEl.style.display = "none";
      if (authEl) authEl.style.display = "flex";
      forceHideBootScreen(true);
      return;
    }

    const email = user.email.toLowerCase().trim();
    state.user = user;
    state.userEmail = email;

    try {
      const roleResolved = await resolveUserRoleAndPermissions(user, email);
      if (!roleResolved) {
        await signOut(auth);
        if ($("auth-error-box")) $("auth-error-box").style.display = "block";
        if ($("auth-error-text")) {
          $("auth-error-text").textContent =
            "عذراً، هذا البريد غير مسجل ضمن الإدارة أو الموظفين أو الكُتّاب المعتمدين في نظام صفقات.";
        }
        if (appEl) appEl.style.display = "none";
        if (authEl) authEl.style.display = "flex";
        forceHideBootScreen(true);
        return;
      }

      if ($("auth-error-box")) $("auth-error-box").style.display = "none";
      if (authEl) authEl.style.display = "none";
      if (appEl) appEl.style.display = "block";

      applyRoleUiVisibility();
      startRealtimeSubscriptions();
      forceHideBootScreen(false);
    } catch (err) {
      console.error("Auth Resolution Error:", err);
      toast("تنبيه اتصال: تم تفعيل الوضع الآمن", "ri-information-line");
      forceHideBootScreen(true);
    }
  });
}

async function resolveUserRoleAndPermissions(user, email) {
  let profileData = null;
  try {
    const profSnap = await getDoc(doc(db, "user_profiles", email));
    if (profSnap.exists()) profileData = profSnap.data();
  } catch (e) {
    console.warn("User profile read skipped:", e.message);
  }

  // 1) فحص الإدارة العليا فوري بدون انتظار الشبكة (Super Admin Instant Pass)
  if (SUPER_ADMINS.includes(email)) {
    state.role = "super_admin";
    state.isPosOnlyStaff = false;
    state.displayName = profileData?.displayName || user.displayName || "الإدارة العليا";
    state.avatarUrl = profileData?.avatarUrl || user.photoURL || "";
    Object.keys(state.permissions).forEach((k) => (state.permissions[k] = true));
    return true;
  }

  // 2) فحص جدول الموظفين بمعزل محمي
  let matchedStaff = null;
  try {
    const staffSnap = await getDocs(collection(db, "staff"));
    staffSnap.forEach((d) => {
      const data = d.data();
      if (data.email && data.email.toLowerCase().trim() === email) {
        matchedStaff = { id: d.id, ...data };
      }
    });
  } catch (e) {
    console.warn("Staff collection check notice:", e.message);
  }

  if (matchedStaff) {
    if (matchedStaff.restricted) {
      if ($("auth-error-text")) $("auth-error-text").textContent = "تم تجميد حساب الموظف مؤقتاً من قِبل الإدارة.";
      return false;
    }
    state.role = "staff";
    state.staffDoc = matchedStaff;
    state.displayName = profileData?.displayName || matchedStaff.name || user.displayName || "موظف الدار";
    state.avatarUrl = profileData?.avatarUrl || matchedStaff.avatarUrl || user.photoURL || "";

    const p = matchedStaff.permissions || {};
    state.permissions = {
      pos: p.pos !== undefined ? Boolean(p.pos) : true,
      sell: Boolean(p.sell),
      addBook: Boolean(p.addBook),
      deleteBook: Boolean(p.deleteBook),
      authors: Boolean(p.authors),
      payouts: Boolean(p.payouts),
      expenses: Boolean(p.expenses),
      financeView: Boolean(p.financeView),
      reports: Boolean(p.reports)
    };

    const otherPerms =
      state.permissions.addBook ||
      state.permissions.deleteBook ||
      state.permissions.authors ||
      state.permissions.payouts ||
      state.permissions.expenses ||
      state.permissions.financeView;

    state.isPosOnlyStaff = state.permissions.pos && !otherPerms;
    return true;
  }

  // 3) فحص جدول المؤلفين بمعزل محمي
  let matchedAuthor = null;
  try {
    const authorsSnap = await getDocs(collection(db, "authors"));
    authorsSnap.forEach((d) => {
      const data = d.data();
      if (data.email && data.email.toLowerCase().trim() === email) {
        matchedAuthor = { id: d.id, ...data };
      }
    });
  } catch (e) {
    console.warn("Authors collection check notice:", e.message);
  }

  if (matchedAuthor) {
    if (matchedAuthor.restricted) {
      if ($("auth-error-text")) $("auth-error-text").textContent = "حساب المؤلف مقيد مؤقتاً، يرجى مراجعة إدارة الدار.";
      return false;
    }
    state.role = "author";
    state.isPosOnlyStaff = false;
    state.authorDoc = matchedAuthor;
    state.displayName = matchedAuthor.name || profileData?.displayName || user.displayName || "مؤلف الدار";
    state.avatarUrl = matchedAuthor.avatarUrl || profileData?.avatarUrl || user.photoURL || "";
    Object.keys(state.permissions).forEach((k) => (state.permissions[k] = false));
    return true;
  }

  return false;
}

// ==========================================================================
// 9. ضبط ظهور القوائم والواجهات حسب الدور والصلاحيات
// ==========================================================================
function applyRoleUiVisibility() {
  const isSuper = state.role === "super_admin";
  const isAuthor = state.role === "author";
  const isPosOnly = state.isPosOnlyStaff;

  if (isAuthor) {
    if ($("btn-open-drawer")) $("btn-open-drawer").style.display = "none";
    if ($("btn-header-pos")) $("btn-header-pos").style.display = "none";
    if ($("btn-header-notif")) $("btn-header-notif").style.display = "none";
    if ($("floating-dock-container")) $("floating-dock-container").style.display = "none";
    navigateTo("view-author-portal");
    renderHeaderIdentity();
    return;
  }

  if ($("btn-open-drawer")) $("btn-open-drawer").style.display = "inline-flex";
  if ($("btn-header-notif")) $("btn-header-notif").style.display = "inline-flex";
  if ($("btn-header-pos")) $("btn-header-pos").style.display = hasPerm("pos") ? "inline-flex" : "none";
  if ($("floating-dock-container")) $("floating-dock-container").style.display = "flex";

  if ($("dlink-staff")) $("dlink-staff").style.display = isSuper ? "flex" : "none";
  if ($("btn-notif-new")) $("btn-notif-new").style.display = isSuper ? "inline-flex" : "none";

  if (isPosOnly) {
    [
      "dlink-dashboard",
      "dlink-contracts",
      "dlink-authors",
      "dlink-archive",
      "dlink-warehouses",
      "dlink-libraries",
      "dlink-exhibitions",
      "dlink-contests",
      "dlink-finance",
      "dlink-staff",
      "drawer-sec-logistics",
      "drawer-sec-admin"
    ].forEach((id) => {
      if ($(id))$(id).style.display = "none";
    });
    if ($("dock-btn-dashboard")) $("dock-btn-dashboard").style.display = "none";
    if ($("dock-btn-contracts")) $("dock-btn-contracts").style.display = "none";
    if ($("btn-dock-quick-add")) $("btn-dock-quick-add").style.display = "none";
    navigateTo("view-pos");
  } else {
    [
      "dlink-dashboard",
      "dlink-contracts",
      "dlink-authors",
      "dlink-archive",
      "dlink-warehouses",
      "dlink-libraries",
      "dlink-exhibitions",
      "dlink-contests",
      "drawer-sec-logistics",
      "drawer-sec-admin"
    ].forEach((id) => {
      if ($(id))$(id).style.display = "";
    });
    if ($("dlink-finance")) {
      $("dlink-finance").style.display = hasPerm("financeView") || hasPerm("expenses") ? "flex" : "none";
    }
    if ($("dashboard-wallet-metrics")) {
      $("dashboard-wallet-metrics").style.display = isSuper || hasPerm("financeView") ? "grid" : "none";
    }
    if (state.currentView === "view-author-portal") {
      navigateTo("view-dashboard");
    } else {
      navigateTo(state.currentView || "view-dashboard");
    }
  }

  renderHeaderIdentity();
}

function renderAvatarHtml(name, avatarUrl) {
  const initial = (name || "ص").trim().charAt(0);
  if (avatarUrl) {
    return `<img src="${esc(avatarUrl)}" alt="${esc(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
  }
  return `<span>${esc(initial)}</span>`;
}

function renderHeaderIdentity() {
  const roleLabel =
    state.role === "super_admin"
      ? "الإدارة العليا"
      : state.isPosOnlyStaff
      ? "مسؤول الكاشير (POS)"
      : state.role === "staff"
      ? state.staffDoc?.jobTitle || "فريق الدار"
      : "بوابة المؤلف";

  if ($("header-sub-role")) $("header-sub-role").textContent = `${state.displayName} • ${roleLabel}`;
  if ($("btn-header-profile-avatar")) {
    $("btn-header-profile-avatar").innerHTML = renderAvatarHtml(state.displayName, state.avatarUrl);
  }
  if ($("drawer-user-name")) $("drawer-user-name").textContent = state.displayName;
  if ($("drawer-user-role")) $("drawer-user-role").textContent = roleLabel;
  if ($("drawer-user-initials")) $("drawer-user-initials").innerHTML = renderAvatarHtml(state.displayName, state.avatarUrl);
  if ($("greeting-avatar-box")) $("greeting-avatar-box").innerHTML = renderAvatarHtml(state.displayName, state.avatarUrl);

  const hour = new Date().getHours();
  const greetWord = hour < 12 ? "صباح الخير" : "مساء الخير";
  if ($("greeting-headline")) $("greeting-headline").textContent = `${greetWord}، ${state.displayName}`;

  if ($("profile-card-name")) $("profile-card-name").textContent = state.displayName;
  if ($("profile-card-email")) $("profile-card-email").textContent = state.userEmail;
  if ($("profile-card-role")) $("profile-card-role").textContent = roleLabel;
  if ($("profile-card-initials")) $("profile-card-initials").innerHTML = renderAvatarHtml(state.displayName, state.avatarUrl);
  if ($("profile-name-input") && !$("profile-name-input").matches(":focus")) {
    $("profile-name-input").value = state.displayName;
  }
}

// ==========================================================================
// 10. المزامنة السحابية اللحظية (Realtime Firestore Listeners)
// ==========================================================================
function stopRealtimeListeners() {
  state.unsubscribers.forEach((unsub) => {
    try {
      unsub();
    } catch (e) {}
  });
  state.unsubscribers = [];
}

function startRealtimeSubscriptions() {
  stopRealtimeListeners();

  const listenCol = (colName, stateKey, onUpdate) => {
    const unsub = onSnapshot(
      collection(db, colName),
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        state[stateKey] = arr;
        if (onUpdate) onUpdate();
        refreshAllViews();
      },
      (err) => console.warn(`Listener [${colName}] notice:`, err.message)
    );
    state.unsubscribers.push(unsub);
  };

  listenCol("books", "books");
  listenCol("authors", "authors", () => {
    if (state.role === "author") {
      const updatedMe = state.authors.find((a) => a.email?.toLowerCase() === state.userEmail);
      if (updatedMe) {
        state.authorDoc = updatedMe;
        state.displayName = updatedMe.name || state.displayName;
        state.avatarUrl = updatedMe.avatarUrl || state.avatarUrl;
        renderHeaderIdentity();
      }
    }
  });
  listenCol("sales", "sales");
  listenCol("payouts", "payouts");
  listenCol("expenses", "expenses");
  listenCol("warehouses", "warehouses", () => ensureDefaultWarehouse());
  listenCol("editions", "editions");
  listenCol("libraries", "libraries");
  listenCol("library_transactions", "libTx");
  listenCol("exhibitions", "exhibitions");
  listenCol("notifications", "notifications", () => updateNotificationBadges());
  listenCol("activity_logs", "logs");

  if (state.role === "super_admin") {
    listenCol("staff", "staff");
  }
}

let defaultWhCreating = false;
async function ensureDefaultWarehouse() {
  if (state.role === "author") return;
  if (state.warehouses.length === 0 && !defaultWhCreating) {
    defaultWhCreating = true;
    try {
      await setDoc(doc(db, "warehouses", "main_warehouse"), {
        name: "المستودع الرئيسي للدار",
        location: "المقر الرئيسي",
        isDefault: true,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn("Default warehouse setup:", e);
    } finally {
      defaultWhCreating = false;
    }
  }
}

// ==========================================================================
// 11. التنقل السلس بين الصفحات، البحث الذكي العام، والتوجيه المباشر للإشعارات
// ==========================================================================
function navigateTo(viewId) {
  if (state.role === "author" && viewId !== "view-author-portal" && viewId !== "view-author-book-detail" && viewId !== "view-pdf-viewer") {
    viewId = "view-author-portal";
  }
  if (state.isPosOnlyStaff && !["view-pos", "view-notifications", "view-profile"].includes(viewId)) {
    viewId = "view-pos";
  }

  if (state.currentView && state.currentView !== viewId && viewId !== "view-pdf-viewer") {
    state.prevView = state.currentView;
  }
  state.currentView = viewId;

  $$(".app-view").forEach((sec) => {
    sec.style.display = sec.id === viewId ? "block" : "none";
  });

  $$(".drawer-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === viewId);
  });

  $$(".dock-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.dock === viewId);
  });

  closeSideDrawer();
  window.scrollTo({ top: 0, behavior: "smooth" });
  refreshAllViews();
}

function openSideDrawer() {
  if ($("side-drawer")) $("side-drawer").classList.add("open");
  if ($("drawer-backdrop")) $("drawer-backdrop").classList.add("open");
}

function closeSideDrawer() {
  if ($("side-drawer")) $("side-drawer").classList.remove("open");
  if ($("drawer-backdrop")) $("drawer-backdrop").classList.remove("open");
}

function handleGlobalSmartSearch(queryStr) {
  const panel = $("quick-search-panel");
  const box = $("quick-search-results");
  if (!panel || !box) return;

  const q = (queryStr || "").trim().toLowerCase();
  if (!q) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";
  const resultsHtml = [];

  state.books
    .filter((b) => (b.title || "").toLowerCase().includes(q) || (b.authorName || "").toLowerCase().includes(q) || (b.isbn || "").toLowerCase().includes(q))
    .slice(0, 5)
    .forEach((b) => {
      resultsHtml.push(`
        <div class="list-row clickable js-gsearch-item" data-type="book" data-id="${esc(b.id)}">
          <div>
            <span class="badge invert">كتاب</span>
            <strong style="margin-right:6px;">${esc(b.title)}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">المؤلف: ${esc(b.authorName || "—")} • السعر: ${fmtMoney(b.price)} • المخزون: ${fmtNum(b.stock || 0)}</div>
          </div>
          <i class="ri-arrow-left-s-line"></i>
        </div>
      `);
    });

  state.authors
    .filter((a) => (a.name || "").toLowerCase().includes(q) || (a.email || "").toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((a) => {
      resultsHtml.push(`
        <div class="list-row clickable js-gsearch-item" data-type="author" data-id="${esc(a.id)}">
          <div>
            <span class="badge pos">مؤلف</span>
            <strong style="margin-right:6px;">${esc(a.name)}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">${esc(a.email)}</div>
          </div>
          <i class="ri-arrow-left-s-line"></i>
        </div>
      `);
    });

  state.sales
    .filter((s) => (s.invoiceCode || "").toLowerCase().includes(q) || (s.customerName || "").toLowerCase().includes(q) || (s.customerPhone || "").toLowerCase().includes(q))
    .slice(0, 4)
    .forEach((s) => {
      resultsHtml.push(`
        <div class="list-row clickable js-gsearch-item" data-type="invoice" data-id="${esc(s.id)}">
          <div>
            <span class="badge pos">فاتورة مبيعات</span>
            <strong style="margin-right:6px;" dir="ltr">${esc(s.invoiceCode || `#INV-${s.id.slice(0, 6).toUpperCase()}`)}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">العميل: ${esc(s.customerName || "عميل الدار")} • الكتاب: ${esc(s.bookTitle)} • ${fmtMoney(s.totalAmount)}</div>
          </div>
          <i class="ri-receipt-line"></i>
        </div>
      `);
    });

  state.exhibitions
    .filter((ex) => (ex.name || "").toLowerCase().includes(q))
    .slice(0, 3)
    .forEach((ex) => {
      resultsHtml.push(`
        <div class="list-row clickable js-gsearch-item" data-type="exhibition" data-id="${esc(ex.id)}">
          <div>
            <span class="badge">معرض</span>
            <strong style="margin-right:6px;">${esc(ex.name)}</strong>
          </div>
          <i class="ri-arrow-left-s-line"></i>
        </div>
      `);
    });

  state.libraries
    .filter((l) => (l.name || "").toLowerCase().includes(q))
    .slice(0, 3)
    .forEach((l) => {
      resultsHtml.push(`
        <div class="list-row clickable js-gsearch-item" data-type="library" data-id="${esc(l.id)}">
          <div>
            <span class="badge">مكتبة</span>
            <strong style="margin-right:6px;">${esc(l.name)}</strong>
          </div>
          <i class="ri-arrow-left-s-line"></i>
        </div>
      `);
    });

  if (!resultsHtml.length) {
    box.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:12px;">لا توجد نتائج مطابقة لـ "${esc(queryStr)}"</p>`;
    return;
  }

  box.innerHTML = resultsHtml.join("");
  box.querySelectorAll(".js-gsearch-item").forEach((row) => {
    row.addEventListener("click", () => {
      const t = row.dataset.type;
      const id = row.dataset.id;
      panel.style.display = "none";
      if (t === "book") openBookDetail(id);
      else if (t === "author") openAuthorDetail(id);
      else if (t === "exhibition") openExhibitionDetail(id);
      else if (t === "library") openLibraryDetail(id);
      else if (t === "invoice") {
        const saleObj = state.sales.find((s) => s.id === id);
        if (saleObj) openCommercialInvoiceModalFromSale(saleObj);
      }
    });
  });
}

// ==========================================================================
// 12. مركز التنبيهات التفاعلي القابل للنقر (Deep-Linking Notification Router)
// ==========================================================================
function getRelevantNotifications() {
  const email = state.userEmail;
  const isAdmin = state.role === "super_admin" || state.role === "staff";
  return state.notifications.filter((n) => {
    const t = (n.targetEmail || "").toLowerCase();
    if (t === email) return true;
    if (isAdmin && (t === "all_admins" || t === "all_staff" || t === "all")) return true;
    if (state.role === "author" && t === "all_authors") return true;
    return false;
  });
}

function updateNotificationBadges() {
  const list = getRelevantNotifications();
  const unread = list.filter((n) => !(Array.isArray(n.readBy) && n.readBy.includes(state.userEmail)));

  const pendingNameRequests =
    state.role === "super_admin" || hasPerm("authors")
      ? state.authors.filter((a) => a.pendingNameRequest && a.pendingNameRequest.trim() !== "")
      : [];

  const totalCount = unread.length + pendingNameRequests.length;

  if ($("header-notif-dot")) {
    $("header-notif-dot").style.display = totalCount > 0 ? "block" : "none";
  }
  if ($("drawer-notif-badge")) {
    $("drawer-notif-badge").style.display = totalCount > 0 ? "inline-block" : "none";
    $("drawer-notif-badge").textContent = String(totalCount);
  }
}

function renderNotificationsView() {
  const container = $("notifications-stack-list");
  if (!container) return;

  const htmlParts = [];

  if (state.role === "super_admin" || hasPerm("authors")) {
    const reqAuthors = state.authors.filter((a) => a.pendingNameRequest && a.pendingNameRequest.trim() !== "");
    reqAuthors.forEach((au) => {
      htmlParts.push(`
        <div class="list-row clickable js-notif-deep-link" data-link-view="view-author-detail" data-entity-id="${esc(au.id)}" style="border-color:var(--neg-border);background:var(--neg-bg);">
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span class="badge neg"><i class="ri-user-received-2-line"></i> طلب مراجعة وتغيير اسم مؤلف</span>
              <span style="font-size:11.5px;color:var(--text-muted);">اضغط للانتقال الفوري لملف المؤلف</span>
            </div>
            <h4 style="font-size:14.5px;font-weight:800;">المؤلف الحالي: «${esc(au.name)}» يطلب تغيير اسمه إلى: «${esc(au.pendingNameRequest)}»</h4>
            <p style="font-size:12.5px;color:var(--text-secondary);">اضغط هنا لفتح ملف المؤلف والموافقة أو الرفض بضغطة زر.</p>
          </div>
          <span class="btn btn-primary" style="padding:6px 12px;font-size:12px;">اتخاذ الإجراء <i class="ri-arrow-left-line"></i></span>
        </div>
      `);
    });
  }

  const list = getRelevantNotifications();
  list.forEach((n) => {
    const isUnread = !(Array.isArray(n.readBy) && n.readBy.includes(state.userEmail));
    const isUrgent = n.priority === "urgent";
    htmlParts.push(`
      <div class="list-row clickable js-notif-deep-link" data-notif-id="${esc(n.id)}" data-link-view="${esc(n.linkView || "view-dashboard")}" data-entity-id="${esc(n.linkEntityId || "")}" style="${isUnread ? "border-color:var(--text-main);" : ""}">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
            <span class="badge ${isUrgent ? "neg" : "invert"}">${isUrgent ? "عاجل / إجراء مطلوب" : "توجيه إداري"}</span>
            ${isUnread ? `<span class="badge pos">جديد</span>` : ""}
            <span style="font-size:11.5px;color:var(--text-muted);" dir="ltr">${esc(fmtFullDateTime(n.timestamp))}</span>
          </div>
          <h4 style="font-size:14.5px;font-weight:800;margin-bottom:2px;">${esc(n.title)}</h4>
          <p style="font-size:13px;color:var(--text-secondary);">${esc(n.body)}</p>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="btn btn-outline" style="padding:6px 10px;font-size:11.5px;">فتح المكان المرتبط <i class="ri-external-link-line"></i></span>
        </div>
      </div>
    `);
  });

  if (!htmlParts.length) {
    container.innerHTML = `<div class="surface-card" style="text-align:center;padding:30px;color:var(--text-muted);">لا توجد تنبيهات أو طلبات مراجعة حالياً.</div>`;
    return;
  }

  container.innerHTML = htmlParts.join("");

  container.querySelectorAll(".js-notif-deep-link").forEach((row) => {
    row.addEventListener("click", async () => {
      const notifId = row.dataset.notifId;
      const targetView = row.dataset.linkView || "view-dashboard";
      const entityId = row.dataset.entityId || "";

      if (notifId) {
        const nObj = state.notifications.find((x) => x.id === notifId);
        if (nObj && state.role === "super_admin") {
          const readArr = Array.isArray(nObj.readBy) ? [...nObj.readBy] : [];
          if (!readArr.includes(state.userEmail)) {
            readArr.push(state.userEmail);
            try {
              await updateDoc(doc(db, "notifications", notifId), { readBy: readArr });
            } catch (e) {}
          }
        }
      }

      if (targetView === "view-author-detail" && entityId) {
        openAuthorDetail(entityId);
      } else if (targetView === "view-book-detail" && entityId) {
        openBookDetail(entityId);
      } else if (targetView === "view-exhibition-detail" && entityId) {
        openExhibitionDetail(entityId);
      } else if (targetView === "view-library-detail" && entityId) {
        openLibraryDetail(entityId);
      } else {
        navigateTo(targetView);
      }
    });
  });
}
// ==========================================================================
// 13. محرك الحسابات المالية، حالة العقود، وربط الكتب بالمعارض
// ==========================================================================
function getContractStatusInfo(book) {
  if (!book) return { status: "active", label: "ساري", badgeClass: "pos", daysLeft: 999 };
  if (book.contractStatus === "terminated") {
    return { status: "terminated", label: "مفسوخ / مجمد", badgeClass: "neg", daysLeft: -999 };
  }
  const startStr = book.contractDate || todayISO();
  const months = Number(book.contractMonths) || 24;
  const startDate = new Date(startStr);
  if (isNaN(startDate.getTime())) {
    return { status: "active", label: "عقد ساري", badgeClass: "pos", daysLeft: 365 };
  }
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);
  const diffMs = endDate.getTime() - Date.now();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const endISO = endDate.toISOString().split("T")[0];

  if (daysLeft < 0) {
    return { status: "expired", label: `منتهي (${endISO})`, badgeClass: "neg", daysLeft, endISO };
  }
  if (daysLeft <= 60) {
    return { status: "expiring", label: `ينتهي خلال ${daysLeft} يوم`, badgeClass: "neg", daysLeft, endISO };
  }
  return { status: "active", label: `ساري حتى ${endISO}`, badgeClass: "pos", daysLeft, endISO };
}

function getBookExhibitions(bookId) {
  if (!bookId) return [];
  return state.exhibitions.filter((ex) => Array.isArray(ex.bookIds) && ex.bookIds.includes(bookId));
}

function computeBookFinancials(bookId) {
  const book = state.books.find((b) => b.id === bookId);
  const bookSales = state.sales.filter((s) => s.bookId === bookId);

  let paperSold = 0;
  let digitalSold = 0;
  let freebiesCount = 0;
  let totalRev = 0;
  let authorCutTotal = 0;
  let houseCutTotal = 0;
  let paperRev = 0;
  let digitalRev = 0;
  let authorPaperCut = 0;
  let authorDigitalCut = 0;

  bookSales.forEach((s) => {
    const q = Number(s.qty) || 0;
    const amt = Number(s.totalAmount) || 0;
    const aCut = Number(s.authorCut) || 0;
    const hCut = Number(s.houseCut) || 0;
    const fmt = s.copyFormat || "paper";

    if (fmt === "freebie" || s.isFreebie === true) {
      freebiesCount += q;
    } else if (fmt === "digital") {
      digitalSold += q;
      totalRev += amt;
      digitalRev += amt;
      authorCutTotal += aCut;
      authorDigitalCut += aCut;
      houseCutTotal += hCut;
    } else {
      paperSold += q;
      totalRev += amt;
      paperRev += amt;
      authorCutTotal += aCut;
      authorPaperCut += aCut;
      houseCutTotal += hCut;
    }
  });

  let bookExpenses = 0;
  state.expenses.forEach((ex) => {
    if (ex.bookId === bookId) {
      bookExpenses += Number(ex.amount) || 0;
    } else if (Array.isArray(ex.bookIds) && ex.bookIds.includes(bookId) && ex.bookIds.length > 0) {
      bookExpenses += (Number(ex.amount) || 0) / ex.bookIds.length;
    }
  });

  state.editions
    .filter((ed) => ed.bookId === bookId && ed.operationType === "free_contest")
    .forEach((ed) => {
      freebiesCount += Number(ed.qty) || 0;
    });

  return {
    book,
    paperSold,
    digitalSold,
    freebiesCount,
    totalRev,
    paperRev,
    digitalRev,
    authorCutTotal,
    authorPaperCut,
    authorDigitalCut,
    houseCutTotal,
    bookExpenses,
    stock: Number(book?.stock) || 0,
    printedTotal: Number(book?.printedTotal || book?.stock) || 0
  };
}

function computeAuthorFinancials(authorId) {
  const authorBooks = state.books.filter((b) => b.authorId === authorId);
  const bookIds = new Set(authorBooks.map((b) => b.id));

  let paperCopies = 0;
  let digitalCopies = 0;
  let freeCopies = 0;
  let totalEarned = 0;
  let digitalEarned = 0;
  let paperEarned = 0;

  state.sales.forEach((s) => {
    if (s.authorId === authorId || bookIds.has(s.bookId)) {
      const q = Number(s.qty) || 0;
      const aCut = Number(s.authorCut) || 0;
      const fmt = s.copyFormat || "paper";
      if (fmt === "freebie" || s.isFreebie === true) {
        freeCopies += q;
      } else if (fmt === "digital") {
        digitalCopies += q;
        digitalEarned += aCut;
        totalEarned += aCut;
      } else {
        paperCopies += q;
        paperEarned += aCut;
        totalEarned += aCut;
      }
    }
  });

  const authorPayouts = state.payouts.filter((p) => p.authorId === authorId);
  const totalPaid = authorPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const balance = Math.max(0, totalEarned - totalPaid);

  return {
    booksCount: authorBooks.length,
    activeContractsCount: authorBooks.filter((b) => getContractStatusInfo(b).status === "active").length,
    paperCopies,
    digitalCopies,
    freeCopies,
    totalEarned,
    paperEarned,
    digitalEarned,
    totalPaid,
    balance,
    payouts: authorPayouts
  };
}

// ==========================================================================
// 14. المنسق المركزي المحمي لتحديث كافة القوائم والشاشات اللحظية
// ==========================================================================
function refreshAllViews() {
  if (!state.user) return;
  try {
    updateNotificationBadges();
    populateAllDynamicSelects();

    if (state.role === "author") {
      if (state.currentView === "view-author-book-detail" && state.portalSelectedBookId) {
        renderAuthorPortalBookDetailView(state.portalSelectedBookId);
      } else {
        renderAuthorPortalView();
      }
      return;
    }

    renderDashboardView();
    renderPosView();
    renderBooksView();
    if (state.selectedBookId && state.currentView === "view-book-detail") {
      renderBookDetailView(state.selectedBookId);
    }
    renderAuthorsView();
    if (state.selectedAuthorId && state.currentView === "view-author-detail") {
      renderAuthorDetailView(state.selectedAuthorId);
    }
    renderArchiveView();
    renderWarehousesView();
    renderLibrariesView();
    if (state.selectedLibId && state.currentView === "view-library-detail") {
      renderLibraryDetailView(state.selectedLibId);
    }
    renderExhibitionsView();
    if (state.selectedExhId && state.currentView === "view-exhibition-detail") {
      renderExhibitionDetailView(state.selectedExhId);
    }
    renderContestsView();
    renderFinanceView();
    renderStaffView();
    renderNotificationsView();
    renderGuideView();
    renderProfileAndLogsView();
    refreshAllSmartPickers();
  } catch (err) {
    console.warn("View Refresh Safe Catch:", err);
  }
}

function populateAllDynamicSelects() {
  const authorOpts =
    `<option value="">اختر المؤلف...</option>` +
    state.authors.map((a) => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.email)})</option>`).join("");

  ["book-author-select", "payout-author-select", "stmt-author-select"].forEach((id) => {
    const el = $(id);
    if (el) {
      const prev = el.value;
      el.innerHTML = authorOpts;
      if (prev) el.value = prev;
    }
  });

  const bookOpts =
    `<option value="">اختر الكتاب...</option>` +
    state.books
      .map((b) => `<option value="${esc(b.id)}">${esc(b.title)} — ${esc(b.authorName || "بدون مؤلف")} (مخزون: ${fmtNum(b.stock || 0)})</option>`)
      .join("");

  ["ed-book-select", "supply-book-select", "settle-book-select", "contest-book-select", "calc-book-select", "sell-gift-book-select", "stmt-book-select"].forEach((id) => {
    const el = $(id);
    if (el) {
      const prev = el.value;
      el.innerHTML = bookOpts;
      if (prev) el.value = prev;
    }
  });

  const whOpts = state.warehouses
    .map((w) => `<option value="${esc(w.id)}">${esc(w.name)} (${esc(w.location || "رئيسي")})</option>`)
    .join("");

  ["book-warehouse-select", "ed-from-wh-select", "ed-to-wh-select", "supply-wh-select", "contest-wh-select", "sell-confirm-wh", "pos-warehouse-select"].forEach((id) => {
    const el = $(id);
    if (el) {
      const prev = el.value;
      el.innerHTML = whOpts || `<option value="main_warehouse">المستودع الرئيسي للدار</option>`;
      if (prev && Array.from(el.options).some((o) => o.value === prev)) el.value = prev;
    }
  });

  const exhOpts =
    `<option value="">اختر المعرض...</option>` +
    state.exhibitions.map((ex) => `<option value="${esc(ex.id)}">${esc(ex.name)}</option>`).join("");

  if ($("expense-exhibition-select")) {
    const prev = $("expense-exhibition-select").value;
    $("expense-exhibition-select").innerHTML = exhOpts;
    if (prev) $("expense-exhibition-select").value = prev;
  }
  if ($("stmt-exh-select")) {
    const prev = $("stmt-exh-select").value;
    $("stmt-exh-select").innerHTML = exhOpts;
    if (prev) $("stmt-exh-select").value = prev;
  }
  if ($("pos-exhibition-select")) {
    const prev = $("pos-exhibition-select").value;
    $("pos-exhibition-select").innerHTML =
      `<option value="">بيع مباشر (مقر الدار / عام)</option>` +
      state.exhibitions.map((ex) => `<option value="${esc(ex.id)}">جناح: ${esc(ex.name)}</option>`).join("");
    if (prev) $("pos-exhibition-select").value = prev;
  }

  const notifTargetEl = $("notif-target-select");
  if (notifTargetEl) {
    const prev = notifTargetEl.value;
    const recipOpts = [
      `<option value="all_admins">جميع المديرين والمشرفين</option>`,
      `<option value="all_staff">جميع موظفي الدار</option>`,
      `<option value="all_authors">جميع مؤلفي الدار</option>`,
      ...state.staff.map((s) => `<option value="${esc((s.email || "").toLowerCase())}">موظف: ${esc(s.name)} (${esc(s.email)})</option>`),
      ...state.authors.map((a) => `<option value="${esc((a.email || "").toLowerCase())}">مؤلف: ${esc(a.name)} (${esc(a.email)})</option>`)
    ];
    notifTargetEl.innerHTML = recipOpts.join("");
    if (prev) notifTargetEl.value = prev;
  }
}

// ==========================================================================
// 15. عرض الصفحة الرئيسية ومحفظة الدار والرادار الذكي (Dashboard)
// ==========================================================================
function renderDashboardView() {
  let totalRev = 0;
  let paperCopies = 0;
  let digitalCopies = 0;
  let freeCopies = 0;
  let totalAuthorShare = 0;

  state.sales.forEach((s) => {
    const q = Number(s.qty) || 0;
    const amt = Number(s.totalAmount) || 0;
    const aCut = Number(s.authorCut) || 0;
    const fmt = s.copyFormat || "paper";
    if (fmt === "freebie" || s.isFreebie === true) {
      freeCopies += q;
    } else if (fmt === "digital") {
      digitalCopies += q;
      totalRev += amt;
      totalAuthorShare += aCut;
    } else {
      paperCopies += q;
      totalRev += amt;
      totalAuthorShare += aCut;
    }
  });

  state.editions
    .filter((ed) => ed.operationType === "free_contest")
    .forEach((ed) => {
      freeCopies += Number(ed.qty) || 0;
    });

  const totalPaidToAuthors = state.payouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const authorsUnpaid = Math.max(0, totalAuthorShare - totalPaidToAuthors);
  const totalExpenses = state.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netHouseProfit = totalRev - totalAuthorShare - totalExpenses;
  const totalStock = state.books.reduce((sum, b) => sum + (Number(b.stock) || 0), 0);

  if ($("stat-total-rev")) $("stat-total-rev").textContent = fmtMoney(totalRev);
  if ($("stat-total-copies")) $("stat-total-copies").textContent = `${fmtNum(paperCopies)} ورقية • ${fmtNum(digitalCopies)} إلكترونية`;
  if ($("stat-net-profit")) {
    $("stat-net-profit").textContent = fmtMoney(netHouseProfit);
    $("stat-net-profit").className = `metric-val ${netHouseProfit >= 0 ? "money-pos" : "money-neg"}`;
  }
  if ($("stat-authors-unpaid")) $("stat-authors-unpaid").textContent = fmtMoney(authorsUnpaid);
  if ($("stat-authors-paid")) $("stat-authors-paid").textContent = `سُدد لهم: ${fmtMoney(totalPaidToAuthors)}`;
  if ($("stat-total-exp")) $("stat-total-exp").textContent = fmtMoney(totalExpenses);
  if ($("stat-warehouse-stock-sub")) {
    $("stat-warehouse-stock-sub").textContent = `المخزون: ${fmtNum(totalStock)} | الإهداءات: ${fmtNum(freeCopies)}`;
  }

  const lowBooks = state.books.filter((b) => (Number(b.stock) || 0) <= 10 && b.contractStatus !== "terminated");
  const lowAlertBox = $("low-stock-alert-box");
  if (lowAlertBox) {
    if (lowBooks.length > 0) {
      lowAlertBox.style.display = "flex";
      $("low-stock-alert-text").textContent = `تنبيه مخزون: يوجد (${lowBooks.length}) كتاب ورقي رصيده 10 نسخ فأقل في المستودع!`;
    } else {
      lowAlertBox.style.display = "none";
    }
  }

  const expiringBooks = state.books.filter((b) => {
    const st = getContractStatusInfo(b).status;
    return st === "expiring" || st === "expired";
  });
  const radarBox = $("contract-expiry-radar-box");
  if (radarBox) {
    if (expiringBooks.length > 0) {
      radarBox.style.display = "flex";
      $("contract-expiry-radar-text").textContent = `رادار العقود: يوجد (${expiringBooks.length}) عقد كتاب منتهي أو قارب على الانتهاء خلال 60 يوماً.`;
    } else {
      radarBox.style.display = "none";
    }
  }

  renderSalesChart();

  const topBooks = [...state.books]
    .sort((a, b) => (Number(b.copiesSold || 0) + Number(b.digitalCopiesSold || 0)) - (Number(a.copiesSold || 0) + Number(a.digitalCopiesSold || 0)))
    .slice(0, 8);

  const dashGrid = $("dashboard-books-grid");
  if (dashGrid) {
    dashGrid.innerHTML = topBooks.length
      ? topBooks.map((b) => createBookCardHtml(b)).join("")
      : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد كتب مسجلة بعد. اضغط على (+) لإضافة أول عقد كتاب.</div>`;
    bindBookCardsEvents(dashGrid);
  }
}

function renderSalesChart() {
  try {
    const canvas = $("salesChartCanvas");
    if (!canvas || typeof Chart === "undefined") return;

    const top = [...state.books]
      .sort((a, b) => (Number(b.copiesSold || 0) + Number(b.digitalCopiesSold || 0)) - (Number(a.copiesSold || 0) + Number(a.digitalCopiesSold || 0)))
      .slice(0, 6);

    const labels = top.map((b) => (b.title || "").slice(0, 18));
    const paperData = top.map((b) => computeBookFinancials(b.id).paperSold);
    const digitalData = top.map((b) => computeBookFinancials(b.id).digitalSold);

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "#fafafa" : "#09090b";
    const gridColor = isDark ? "#27272a" : "#e4e4e7";

    if (state.salesChartInstance) {
      state.salesChartInstance.destroy();
    }

    state.salesChartInstance = new Chart(canvas, {
      type: state.chartType || "bar",
      data: {
        labels: labels.length ? labels : ["لا توجد بيانات"],
        datasets: [
          {
            label: "مبيعات ورقية",
            data: paperData.length ? paperData : [0],
            backgroundColor: isDark ? "#fafafa" : "#09090b",
            borderColor: isDark ? "#fafafa" : "#09090b",
            borderWidth: 2,
            borderRadius: 6
          },
          {
            label: "مبيعات إلكترونية",
            data: digitalData.length ? digitalData : [0],
            backgroundColor: "#059669",
            borderColor: "#059669",
            borderWidth: 2,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: textColor, font: { family: "Tajawal", weight: "bold" } }
          }
        },
        scales: {
          x: { ticks: { color: textColor, font: { family: "Tajawal" } }, grid: { color: gridColor } },
          y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    });
  } catch (e) {
    console.warn("Chart render skipped:", e);
  }
}

// ==========================================================================
// 16. الكتب والعقود + بطاقة الكتاب مع شارة المعرض + الصفحة التفصيلية للكتاب
// ==========================================================================
function createBookCardHtml(book, options = {}) {
  const fin = computeBookFinancials(book.id);
  const cStatus = getContractStatusInfo(book);
  const participatingExhs = getBookExhibitions(book.id);
  const stockNum = Number(book.stock) || 0;

  const coverContent = book.coverUrl
    ? `<img src="${esc(book.coverUrl)}" alt="${esc(book.title)}" loading="lazy" />`
    : `<div class="book-typo-cover">
         <i class="ri-book-2-line"></i>
         <h4>${esc(book.title)}</h4>
         <span>${esc(book.authorName || "دار صفقات كتابية")}</span>
       </div>`;

  const exhTagsHtml = participatingExhs.length
    ? participatingExhs
        .map((ex) => `<div class="book-exh-tag"><i class="ri-compass-discover-line"></i><span>مشارك: ${esc(ex.name)}</span></div>`)
        .join("")
    : "";

  return `
    <div class="book-card" data-book-id="${esc(book.id)}">
      <div class="book-cover-wrap js-open-book" data-id="${esc(book.id)}">
        <div class="cover-badges">
          <span class="badge ${cStatus.badgeClass}">${esc(cStatus.label)}</span>
          ${book.favorite ? `<span class="badge invert"><i class="ri-star-fill"></i></span>` : ""}
        </div>
        ${coverContent}
      </div>
      <div class="book-body">
        <div>
          <div class="book-title-link js-open-book" data-id="${esc(book.id)}">${esc(book.title)}</div>
          <div class="book-author-link js-open-author" data-author-id="${esc(book.authorId || "")}">${esc(book.authorName || "مؤلف الدار")}</div>
        </div>

        ${exhTagsHtml}

        <div class="book-mini-stats">
          <div>
            <span>السعر / النسبة</span>
            <strong>${fmtMoney(book.price)} (${fmtNum(book.royaltyRate)}%)</strong>
          </div>
          <div>
            <span>المخزون الورقي</span>
            <strong class="${stockNum <= 5 ? "money-neg" : "money-pos"}">${fmtNum(stockNum)} نسخة</strong>
          </div>
          <div>
            <span>مبيعات الورقي</span>
            <strong>${fmtNum(fin.paperSold)} نسخة</strong>
          </div>
          <div>
            <span>إلكتروني / إهداء</span>
            <strong>${fmtNum(fin.digitalSold)} إلـك • ${fmtNum(fin.freebiesCount)} هدية</strong>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-top:auto;">
          ${
            hasPerm("sell") || hasPerm("pos")
              ? `<button type="button" class="btn btn-pos js-quick-sell-book" data-id="${esc(book.id)}" data-exh="${esc(options.exhId || "")}" style="flex:1;padding:7px 10px;font-size:12px;">
                   <i class="ri-shopping-bag-3-line"></i><span>بيع / هدية</span>
                 </button>`
              : ""
          }
          <button type="button" class="btn btn-outline js-open-book" data-id="${esc(book.id)}" style="padding:7px 10px;font-size:12px;">
            <i class="ri-eye-line"></i><span>التفاصيل</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindBookCardsEvents(container) {
  if (!container) return;
  container.querySelectorAll(".js-open-book").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openBookDetail(el.dataset.id);
    });
  });
  container.querySelectorAll(".js-open-author").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el.dataset.authorId) openAuthorDetail(el.dataset.authorId);
    });
  });
  container.querySelectorAll(".js-quick-sell-book").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openQuickSellModal(btn.dataset.id, btn.dataset.exh || "");
    });
  });
}

function renderBooksView() {
  let totalPaperSold = 0;
  let totalDigSold = 0;
  let totalFreebies = 0;
  let totalStock = 0;
  let activeCount = 0;
  let favCount = 0;
  let expiringCount = 0;
  let lowCount = 0;

  state.books.forEach((b) => {
    const fin = computeBookFinancials(b.id);
    totalPaperSold += fin.paperSold;
    totalDigSold += fin.digitalSold;
    totalFreebies += fin.freebiesCount;
    totalStock += Number(b.stock) || 0;

    const st = getContractStatusInfo(b).status;
    if (st === "active") activeCount++;
    if (st === "expiring" || st === "expired") expiringCount++;
    if (b.favorite) favCount++;
    if ((Number(b.stock) || 0) <= 10) lowCount++;
  });

  if ($("books-kpi-total")) $("books-kpi-total").textContent = `${fmtNum(state.books.length)} كتاب`;
  if ($("books-kpi-active-sub")) $("books-kpi-active-sub").textContent = `عقود سارية: ${fmtNum(activeCount)}`;
  if ($("books-kpi-paper-sold")) $("books-kpi-paper-sold").textContent = `${fmtNum(totalPaperSold)} نسخة`;
  if ($("books-kpi-stock-sub")) $("books-kpi-stock-sub").textContent = `متبقي بالمخازن: ${fmtNum(totalStock)}`;
  if ($("books-kpi-dig-sold")) $("books-kpi-dig-sold").textContent = `${fmtNum(totalDigSold)} نسخة`;
  if ($("books-kpi-freebies")) $("books-kpi-freebies").textContent = `${fmtNum(totalFreebies)} نسخة`;

  if ($("count-books-all")) $("count-books-all").textContent = String(state.books.length);
  if ($("count-books-fav")) $("count-books-fav").textContent = String(favCount);
  if ($("count-books-active")) $("count-books-active").textContent = String(activeCount);
  if ($("count-books-expiring")) $("count-books-expiring").textContent = String(expiringCount);
  if ($("count-books-low")) $("count-books-low").textContent = String(lowCount);

  const q = ($("books-search-input")?.value || "").trim().toLowerCase();
  const filtered = state.books.filter((b) => {
    if (q) {
      const match =
        (b.title || "").toLowerCase().includes(q) ||
        (b.authorName || "").toLowerCase().includes(q) ||
        (b.category || "").toLowerCase().includes(q) ||
        (b.isbn || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    const st = getContractStatusInfo(b).status;
    if (state.bookFilter === "fav") return Boolean(b.favorite);
    if (state.bookFilter === "active") return st === "active";
    if (state.bookFilter === "expiring") return st === "expiring" || st === "expired";
    if (state.bookFilter === "lowstock") return (Number(b.stock) || 0) <= 10;
    return true;
  });

  const grid = $("contracts-books-grid");
  if (!grid) return;
  grid.innerHTML = filtered.length
    ? filtered.map((b) => createBookCardHtml(b)).join("")
    : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد كتب مطابقة للبحث أو الفلتر المحدد.</div>`;
  bindBookCardsEvents(grid);
}

function openBookDetail(bookId) {
  state.selectedBookId = bookId;
  navigateTo("view-book-detail");
}

function renderBookDetailView(bookId) {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;

  const fin = computeBookFinancials(book.id);
  const cStatus = getContractStatusInfo(book);
  const participatingExhs = getBookExhibitions(book.id);

  if ($("btn-book-det-pdf")) {
    $("btn-book-det-pdf").style.display = book.driveUrl ? "inline-flex" : "none";
    $("btn-book-det-pdf").onclick = () => openPdfViewer(`وثيقة عقد: ${book.title}`, book.driveUrl, true);
  }
  if ($("btn-book-det-print-file")) {
    $("btn-book-det-print-file").style.display = book.printDriveUrl ? "inline-flex" : "none";
    $("btn-book-det-print-file").onclick = () => openPdfViewer(`ملف الطباعة: ${book.title}`, book.printDriveUrl, true);
  }
  if ($("btn-book-det-delete")) {
    $("btn-book-det-delete").style.display = hasPerm("deleteBook") ? "inline-flex" : "none";
  }
  if ($("btn-book-det-terminate")) {
    $("btn-book-det-terminate").style.display = hasPerm("deleteBook") ? "inline-flex" : "none";
  }
  if ($("bdet-quick-access-select")) {
    $("bdet-quick-access-select").value = book.authorAccessLevel || "full_download";
  }

  if ($("book-detail-header-card")) {
    const exhBadges = participatingExhs.length
      ? participatingExhs.map((ex) => `<span class="badge invert"><i class="ri-compass-discover-line"></i> مشارك في: ${esc(ex.name)}</span>`).join(" ")
      : `<span class="badge">غير مدرج بمعرض حالياً</span>`;

    $("book-detail-header-card").innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;">
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
          ${
            book.coverUrl
              ? `<img src="${esc(book.coverUrl)}" style="width:76px;height:105px;object-fit:cover;border-radius:10px;border:1px solid var(--border-strong);" />`
              : `<div style="width:76px;height:105px;border-radius:10px;background:var(--bg-subtle);display:flex;align-items:center;justify-content:center;font-size:28px;"><i class="ri-book-2-line"></i></div>`
          }
          <div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
              <span class="badge ${cStatus.badgeClass}">${esc(cStatus.label)}</span>
              <span class="badge">${esc(book.category || "تصنيف عام")}</span>
              ${exhBadges}
            </div>
            <h2 style="font-size:20px;font-weight:900;margin-bottom:4px;">${esc(book.title)}</h2>
            <p style="font-size:13px;color:var(--text-secondary);">
              المؤلف: <strong style="cursor:pointer;text-decoration:underline;" id="bdet-goto-author">${esc(book.authorName || "—")}</strong>
              • السعر الورقي: <strong>${fmtMoney(book.price)}</strong>
              • السعر الإلكتروني: <strong>${fmtMoney(book.digitalPrice || book.price)}</strong>
              • ISBN: <span dir="ltr">${esc(book.isbn || "—")}</span>
            </p>
          </div>
        </div>
      </div>
    `;
    const authLink = $("bdet-goto-author");
    if (authLink && book.authorId) {
      authLink.onclick = () => openAuthorDetail(book.authorId);
    }
  }

  if ($("bdet-rev")) $("bdet-rev").textContent = fmtMoney(fin.totalRev);
  if ($("bdet-sold-copies")) $("bdet-sold-copies").textContent = `${fmtNum(fin.paperSold)} ورقية • ${fmtNum(fin.digitalSold)} إلكترونية`;
  if ($("bdet-author-cut")) $("bdet-author-cut").textContent = fmtMoney(fin.authorCutTotal);
  if ($("bdet-royalty-rate")) $("bdet-royalty-rate").textContent = `النسبة: ${fmtNum(book.royaltyRate)}%`;
  if ($("bdet-free-copies")) $("bdet-free-copies").textContent = `${fmtNum(fin.freebiesCount)} نسخة`;
  if ($("bdet-expenses")) $("bdet-expenses").textContent = `مصاريف الكتاب: ${fmtMoney(fin.bookExpenses)}`;
  if ($("bdet-stock")) $("bdet-stock").textContent = `${fmtNum(fin.stock)} نسخة`;
  if ($("bdet-printed-total")) $("bdet-printed-total").textContent = `إجمالي المطبوع: ${fmtNum(fin.printedTotal)}`;

  const assetsBox = $("bdet-archive-assets");
  if (assetsBox) {
    const covers = [
      { title: "الغلاف الأمامي (الواجهة)", url: book.coverUrl },
      { title: "الغلاف الخلفي", url: book.backCoverUrl },
      { title: "الغلاف المزدوج الكامل (للطباعة)", url: book.spreadCoverUrl }
    ];
    assetsBox.innerHTML = `
      <div class="covers-showcase-grid">
        ${covers
          .map(
            (c) => `
          <div class="cover-slot-card">
            <strong style="font-size:12px;">${esc(c.title)}</strong>${
              c.url
                ? `<img src="${esc(c.url)}" alt="${esc(c.title)}" />
                   <a href="${esc(c.url)}" target="_blank" download class="btn btn-outline" style="padding:5px 10px;font-size:11.5px;"><i class="ri-download-2-line"></i> فتح / تحميل الصورة</a>`
                : `<div style="height:170px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px;border:1px dashed var(--border-strong);border-radius:8px;">غير مرفق</div>`
            }
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  const whEdBox = $("bdet-warehouses-editions");
  if (whEdBox) {
    const bookEds = state.editions.filter((ed) => ed.bookId === book.id);
    const freeSales = state.sales.filter((s) => s.bookId === book.id && (s.copyFormat === "freebie" || s.isFreebie));
    const rows = [];

    bookEds.forEach((ed) => {
      const isFree = ed.operationType === "free_contest";
      rows.push(`
        <div class="list-row">
          <div>
            <span class="badge ${isFree ? "neg" : "pos"}">${isFree ? "صرف مسابقة / إهداء مجاني" : ed.operationType === "transfer" ? "نقل مخزون" : "طبعة جديدة"}</span>
            <strong style="margin-right:6px;">${esc(ed.title || "حركة مخزنية")}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">الكمية: ${fmtNum(ed.qty)} نسخة • ${esc(fmtFullDateTime(ed.timestamp))}</div>
          </div>
        </div>
      `);
    });

    freeSales.forEach((fs) => {
      rows.push(`
        <div class="list-row">
          <div>
            <span class="badge neg">هدية مجانية مرافقة</span>
            <strong style="margin-right:6px;">${esc(fs.channel || "إهداء")}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">الكمية: ${fmtNum(fs.qty)} نسخة (بدون ربح مؤلف) • ${esc(fmtFullDateTime(fs.timestamp))}</div>
          </div>
        </div>
      `);
    });

    whEdBox.innerHTML = rows.length ? rows.join("") : `<p style="color:var(--text-muted);font-size:13px;">لا توجد حركات طبعات أو إهداءات مسجلة بعد.</p>`;
  }

  const exhLibBox = $("bdet-exhibitions-libraries");
  if (exhLibBox) {
    const libTxs = state.libTx.filter((t) => t.bookId === book.id);
    const parts = [];
    participatingExhs.forEach((ex) => {
      parts.push(`
        <div class="list-row clickable" onclick="document.dispatchEvent(new CustomEvent('open-exh', {detail:'${esc(ex.id)}'}))">
          <div>
            <span class="badge invert">معرض</span>
            <strong style="margin-right:6px;">${esc(ex.name)}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">${esc(ex.location || "")} (${esc(ex.startDate || "")} إلى ${esc(ex.endDate || "")})</div>
          </div>
          <i class="ri-arrow-left-s-line"></i>
        </div>
      `);
    });
    libTxs.forEach((tx) => {
      parts.push(`
        <div class="list-row">
          <div>
            <span class="badge ${tx.txType === "settle" ? "pos" : ""}">${tx.txType === "settle" ? "تصفية مكتبة" : "توريد أمانة"}</span>
            <strong style="margin-right:6px;">${esc(tx.libName || "مكتبة")}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">الكمية: ${fmtNum(tx.qty)} نسخة • ${esc(fmtFullDateTime(tx.timestamp))}</div>
          </div>
        </div>
      `);
    });
    exhLibBox.innerHTML = parts.length ? parts.join("") : `<p style="color:var(--text-muted);font-size:13px;">لم يُدرج في معارض أو شحنات مكتبات بعد.</p>`;
  }
}

// ==========================================================================
// 17. دليل الكُتّاب، المؤشرات الشاملة للكُتّاب، والملف التفصيلي للمؤلف
// ==========================================================================
function renderAuthorsView() {
  let activeAuthors = 0;
  let multiBookAuthors = 0;
  let authorsWithBalance = 0;
  let totalUnpaidSum = 0;
  let totalPaidSum = 0;

  state.authors.forEach((a) => {
    const fin = computeAuthorFinancials(a.id);
    if (fin.activeContractsCount > 0 && !a.restricted) activeAuthors++;
    if (fin.booksCount > 1) multiBookAuthors++;
    if (fin.balance > 0) {
      authorsWithBalance++;
      totalUnpaidSum += fin.balance;
    }
    totalPaidSum += fin.totalPaid;
  });

  if ($("authors-kpi-total")) $("authors-kpi-total").textContent = `${fmtNum(state.authors.length)} مؤلف`;
  if ($("authors-kpi-active")) $("authors-kpi-active").textContent = `نشطون بعقود سارية: ${fmtNum(activeAuthors)}`;
  if ($("authors-kpi-contracts")) $("authors-kpi-contracts").textContent = `${fmtNum(state.books.length)} عقد`;
  if ($("authors-kpi-multi")) $("authors-kpi-multi").textContent = `مؤلفون بأكثر من كتاب: ${fmtNum(multiBookAuthors)}`;
  if ($("authors-kpi-with-balance")) $("authors-kpi-with-balance").textContent = `${fmtNum(authorsWithBalance)} مؤلف`;
  if ($("authors-kpi-unpaid-sum")) $("authors-kpi-unpaid-sum").textContent = `إجمالي المستحق: ${fmtMoney(totalUnpaidSum)}`;
  if ($("authors-kpi-paid-sum")) $("authors-kpi-paid-sum").textContent = fmtMoney(totalPaidSum);
  if ($("authors-kpi-payouts-count")) $("authors-kpi-payouts-count").textContent = `عدد الإيصالات: ${fmtNum(state.payouts.length)}`;

  const q = ($("authors-search-input")?.value || "").trim().toLowerCase();
  const filtered = state.authors.filter(
    (a) => !q || (a.name || "").toLowerCase().includes(q) || (a.email || "").toLowerCase().includes(q) || (a.phone || "").toLowerCase().includes(q)
  );

  const grid = $("authors-directory-grid");
  if (!grid) return;

  grid.innerHTML = filtered.length
    ? filtered
        .map((a) => {
          const fin = computeAuthorFinancials(a.id);
          return `
            <div class="surface-card clickable js-author-card" data-id="${esc(a.id)}" style="cursor:pointer;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div class="user-initials-circle">${renderAvatarHtml(a.name, a.avatarUrl)}</div>
                  <div>
                    <h4 style="font-size:15px;font-weight:800;">${esc(a.name)}</h4>
                    <span style="font-size:11.5px;color:var(--text-secondary);" dir="ltr">${esc(a.email)}</span>
                  </div>
                </div>
                ${
                  a.pendingNameRequest
                    ? `<span class="badge neg">طلب اسم جديد</span>`
                    : a.restricted
                    ? `<span class="badge neg">مقيد</span>`
                    : `<span class="badge pos">${fmtNum(fin.booksCount)} كتاب</span>`
                }
              </div>
              <div class="book-mini-stats">
                <div>
                  <span>إجمالي الأرباح</span>
                  <strong class="money-pos">${fmtMoney(fin.totalEarned)}</strong>
                </div>
                <div>
                  <span>المتبقي بالمحفظة</span>
                  <strong class="${fin.balance > 0 ? "money-neg" : ""}">${fmtMoney(fin.balance)}</strong>
                </div>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا يوجد مؤلفون مطابقون للبحث.</div>`;

  grid.querySelectorAll(".js-author-card").forEach((card) => {
    card.addEventListener("click", () => openAuthorDetail(card.dataset.id));
  });
}

function openAuthorDetail(authorId) {
  state.selectedAuthorId = authorId;
  navigateTo("view-author-detail");
}

function renderAuthorDetailView(authorId) {
  const author = state.authors.find((a) => a.id === authorId);
  if (!author) return;

  const fin = computeAuthorFinancials(author.id);

  const reqBanner = $("author-name-req-banner");
  if (reqBanner) {
    if (author.pendingNameRequest && author.pendingNameRequest.trim() !== "") {
      reqBanner.style.display = "block";
      reqBanner.innerHTML = `
        <div class="list-row" style="border-color:var(--neg-border);background:var(--neg-bg);">
          <div>
            <span class="badge neg">طلب مراجعة اسم المؤلف</span>
            <strong style="margin-right:6px;">يرغب المؤلف بتغيير اسمه من «${esc(author.name)}» إلى «${esc(author.pendingNameRequest)}»</strong>
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" id="btn-approve-author-name" class="btn btn-pos" style="padding:6px 12px;font-size:12px;">موافقة وتحديث الاسم</button>
            <button type="button" id="btn-reject-author-name" class="btn btn-neg" style="padding:6px 12px;font-size:12px;">رفض الطلب</button>
          </div>
        </div>
      `;
      $("btn-approve-author-name").onclick = async () => {
        const newName = author.pendingNameRequest.trim();
        await updateDoc(doc(db, "authors", author.id), { name: newName, pendingNameRequest: "" });
        const authorBooks = state.books.filter((b) => b.authorId === author.id);
        for (const b of authorBooks) {
          await updateDoc(doc(db, "books", b.id), { authorName: newName });
        }
        await logActivity("الموافقة على تعديل اسم مؤلف", `تم تغيير الاسم من ${author.name} إلى ${newName}`, {
          targetView: "view-author-detail",
          targetEntityId: author.id
        });
        toast("تمت الموافقة وتحديث اسم المؤلف في كافة العقود");
      };
      $("btn-reject-author-name").onclick = async () => {
        await updateDoc(doc(db, "authors", author.id), { pendingNameRequest: "" });
        toast("تم رفض طلب تغيير الاسم");
      };
    } else {
      reqBanner.style.display = "none";
    }
  }

  if ($("author-profile-banner")) {
    $("author-profile-banner").innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div class="user-initials-circle" style="width:58px;height:58px;font-size:22px;">${renderAvatarHtml(author.name, author.avatarUrl)}</div>
          <div>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
              <span class="badge ${author.restricted ? "neg" : "pos"}">${author.restricted ? "حساب مقيد" : "مؤلف نشط"}</span>
              <span class="badge invert">${fmtNum(fin.booksCount)} كتاب</span>
            </div>
            <h2 style="font-size:19px;font-weight:900;">${esc(author.name)}</h2>
            <p style="font-size:12.5px;color:var(--text-secondary);" dir="ltr">${esc(author.email)} • ${esc(author.phone || "بدون هاتف")}</p>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" id="btn-edit-this-author" class="btn btn-outline"><i class="ri-edit-box-line"></i><span>تعديل البيانات</span></button>
          ${
            state.role === "super_admin"
              ? `<button type="button" id="btn-delete-this-author" class="btn btn-neg"><i class="ri-delete-bin-6-line"></i></button>`
              : ""
          }
        </div>
      </div>
    `;
    if ($("btn-edit-this-author")) {
      $("btn-edit-this-author").onclick = () => openAuthorFormForEdit(author);
    }
    if ($("btn-delete-this-author")) {
      $("btn-delete-this-author").onclick = () => {
        askConfirm("حذف ملف المؤلف", `هل أنت متأكد من حذف ملف المؤلف (${author.name}) نهائياً؟`, async () => {
          await deleteDoc(doc(db, "authors", author.id));
          await logActivity("حذف ملف مؤلف", `تم حذف المؤلف: ${author.name}`);
          toast("تم حذف ملف المؤلف");
          navigateTo("view-authors");
        });
      };
    }
  }

  if ($("author-det-earned")) $("author-det-earned").textContent = fmtMoney(fin.totalEarned);
  if ($("author-det-copies")) $("author-det-copies").textContent = `${fmtNum(fin.paperCopies)} ورقية • ${fmtNum(fin.digitalCopies)} إلكترونية`;
  if ($("author-det-digital-copies")) $("author-det-digital-copies").textContent = `${fmtNum(fin.digitalCopies)} نسخة`;
  if ($("author-det-digital-rev")) $("author-det-digital-rev").textContent = `عائد المؤلف: ${fmtMoney(fin.digitalEarned)}`;
  if ($("author-det-paid")) $("author-det-paid").textContent = fmtMoney(fin.totalPaid);
  if ($("author-det-balance")) $("author-det-balance").textContent = fmtMoney(fin.balance);

  if ($("author-det-bank-box")) {
    $("author-det-bank-box").innerHTML = `
      <div class="grid-3" style="font-size:13px;">
        <div><span style="color:var(--text-muted);">طريقة التحويل / البنك:</span><br/><strong>${esc(author.bankMethod || author.bankName || "غير محدد")} — ${esc(author.bankName || "")}</strong></div>
        <div><span style="color:var(--text-muted);">اسم المستفيد الرباعي:</span><br/><strong>${esc(author.bankHolder || author.name)}</strong></div>
        <div><span style="color:var(--text-muted);">رقم الحساب / IBAN / المحفظة:</span><br/><strong dir="ltr">${esc(author.bankAccount || "غير مضاف")}</strong></div>
        <div><span style="color:var(--text-muted);">الدولة والمدينة:</span><br/><strong>${esc(author.bankCountry || "—")}</strong></div>
        <div style="grid-column:span 2;"><span style="color:var(--text-muted);">ملاحظات التحويل:</span><br/><strong>${esc(author.bankNotes || "—")}</strong></div>
      </div>
    `;
  }

  const authorBooks = state.books.filter((b) => b.authorId === author.id);
  const bGrid = $("author-det-books-grid");
  if (bGrid) {
    bGrid.innerHTML = authorBooks.length
      ? authorBooks.map((b) => createBookCardHtml(b)).join("")
      : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد كتب مرتبطة بهذا المؤلف بعد.</div>`;
    bindBookCardsEvents(bGrid);
  }

  const pList = $("author-det-payouts-list");
  if (pList) {
    pList.innerHTML = fin.payouts.length
      ? fin.payouts
          .map(
            (p) => `
          <div class="list-row">
            <div>
              <span class="badge pos">حوالة مسددة</span>
              <strong style="margin-right:6px;">${fmtMoney(p.amount)} عبر ${esc(p.method)}</strong>
              <div style="font-size:12px;color:var(--text-secondary);">${esc(p.notes || "")} • ${esc(fmtFullDateTime(p.timestamp))}</div>
            </div>
            ${
              p.receiptUrl
                ? `<a href="${esc(p.receiptUrl)}" target="_blank" class="btn btn-outline" style="padding:5px 10px;font-size:12px;"><i class="ri-image-line"></i> معاينة الإيصال</a>`
                : ""
            }
          </div>
        `
          )
          .join("")
      : `<div class="surface-card" style="text-align:center;color:var(--text-muted);">لم يتم تسجيل أي حوالات لهذا المؤلف بعد.</div>`;
  }
}

// ==========================================================================
// 18. الأرشيف الرقمي المركزي، المستودعات، المكتبات، المعارض، والمسابقات
// ==========================================================================
function renderArchiveView() {
  const printCount = state.books.filter((b) => b.printDriveUrl).length;
  const contractCount = state.books.filter((b) => b.driveUrl).length;
  const fullCoversCount = state.books.filter((b) => b.coverUrl || b.backCoverUrl || b.spreadCoverUrl).length;

  if ($("arch-kpi-total")) $("arch-kpi-total").textContent = `${fmtNum(state.books.length)} كتاب`;
  if ($("arch-kpi-print")) $("arch-kpi-print").textContent = `${fmtNum(printCount)} ملف`;
  if ($("arch-kpi-contracts")) $("arch-kpi-contracts").textContent = `${fmtNum(contractCount)} عقد`;
  if ($("arch-kpi-covers")) $("arch-kpi-covers").textContent = `${fmtNum(fullCoversCount)} كتاب`;

  const q = ($("archive-search-input")?.value || "").trim().toLowerCase();
  const filtered = state.books.filter((b) => {
    if (q && !(b.title || "").toLowerCase().includes(q) && !(b.authorName || "").toLowerCase().includes(q)) return false;
    if (state.archFilter === "print") return Boolean(b.printDriveUrl);
    if (state.archFilter === "contracts") return Boolean(b.driveUrl);
    if (state.archFilter === "covers") return Boolean(b.coverUrl || b.backCoverUrl || b.spreadCoverUrl);
    return true;
  });

  const grid = $("archive-items-grid");
  if (!grid) return;

  grid.innerHTML = filtered.length
    ? filtered
        .map((b) => {
          const exhs = getBookExhibitions(b.id);
          return `
            <div class="surface-card">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
                <div>
                  <h4 style="font-size:15px;font-weight:800;cursor:pointer;" class="js-arch-open-book" data-id="${esc(b.id)}">${esc(b.title)}</h4>
                  <span style="font-size:12px;color:var(--text-secondary);">المؤلف: ${esc(b.authorName || "—")}</span>
                </div>
                <span class="badge invert">مخزون: ${fmtNum(b.stock || 0)}</span>
              </div>
              ${
                exhs.length
                  ? `<div style="margin-bottom:8px;">${exhs.map((x) => `<span class="badge pos" style="margin-left:4px;"><i class="ri-compass-discover-line"></i> ${esc(x.name)}</span>`).join("")}</div>`
                  : ""
              }
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
                ${
                  b.printDriveUrl
                    ? `<button type="button" class="btn btn-primary js-arch-pdf" data-title="ملف طباعة: ${esc(b.title)}" data-url="${esc(b.printDriveUrl)}" style="padding:6px 10px;font-size:11.5px;"><i class="ri-printer-cloud-line"></i> ملف الطباعة PDF</button>`
                    : `<span class="badge">بدون ملف طباعة</span>`
                }
                ${
                  b.driveUrl
                    ? `<button type="button" class="btn btn-outline js-arch-pdf" data-title="وثيقة عقد: ${esc(b.title)}" data-url="${esc(b.driveUrl)}" style="padding:6px 10px;font-size:11.5px;"><i class="ri-file-pdf-2-line"></i> العقد PDF</button>`
                    : ""
                }
                ${
                  b.spreadCoverUrl
                    ? `<a href="${esc(b.spreadCoverUrl)}" target="_blank" class="btn btn-outline" style="padding:6px 10px;font-size:11.5px;"><i class="ri-image-2-line"></i> الغلاف المزدوج</a>`
                    : ""
                }
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد ملفات مطابقة في الأرشيف.</div>`;

  grid.querySelectorAll(".js-arch-open-book").forEach((el) => {
    el.addEventListener("click", () => openBookDetail(el.dataset.id));
  });
  grid.querySelectorAll(".js-arch-pdf").forEach((btn) => {
    btn.addEventListener("click", () => openPdfViewer(btn.dataset.title, btn.dataset.url, true));
  });
}

function renderWarehousesView() {
  const totalPrinted = state.books.reduce((s, b) => s + (Number(b.printedTotal || b.stock) || 0), 0);
  const totalAvailable = state.books.reduce((s, b) => s + (Number(b.stock) || 0), 0);
  const suppliedConsigned = state.libTx.filter((t) => t.txType === "supply").reduce((s, t) => s + (Number(t.qty) || 0), 0);
  const settledConsigned = state.libTx.filter((t) => t.txType === "settle").reduce((s, t) => s + (Number(t.qty) || 0), 0);
  const netConsigned = Math.max(0, suppliedConsigned - settledConsigned);

  if ($("wh-stat-printed")) $("wh-stat-printed").textContent = `${fmtNum(totalPrinted)} نسخة`;
  if ($("wh-stat-available")) $("wh-stat-available").textContent = `${fmtNum(totalAvailable)} نسخة`;
  if ($("wh-stat-consigned")) $("wh-stat-consigned").textContent = `${fmtNum(netConsigned)} نسخة`;
  if ($("wh-stat-count")) $("wh-stat-count").textContent = `${fmtNum(state.warehouses.length || 1)} مستودع`;

  const wGrid = $("warehouses-cards-grid");
  if (wGrid) {
    wGrid.innerHTML = state.warehouses
      .map(
        (w) => `
        <div class="surface-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <h4 style="font-size:15px;font-weight:800;"><i class="ri-store-3-line"></i> ${esc(w.name)}</h4>
            <span class="badge pos">نشط</span>
          </div>
          <p style="font-size:12.5px;color:var(--text-secondary);">الموقع / المسؤول: ${esc(w.location || "المقر الرئيسي")}</p>
        </div>
      `
      )
      .join("");
  }

  const edList = $("editions-history-list");
  if (edList) {
    edList.innerHTML = state.editions.length
      ? state.editions
          .slice(0, 35)
          .map(
            (ed) => `
          <div class="list-row">
            <div>
              <span class="badge ${ed.operationType === "free_contest" ? "neg" : ed.operationType === "transfer" ? "invert" : "pos"}">
                ${ed.operationType === "free_contest" ? "صرف مجاني / مسابقة" : ed.operationType === "transfer" ? "نقل مخزون" : "طبعة جديدة"}
              </span>
              <strong style="margin-right:6px;">${esc(ed.bookTitle || "كتاب")} (${fmtNum(ed.qty)} نسخة)</strong>
              <div style="font-size:12px;color:var(--text-secondary);">${esc(ed.title || "")} • ${esc(fmtFullDateTime(ed.timestamp))}</div>
            </div>
          </div>
        `
          )
          .join("")
      : `<div class="surface-card" style="text-align:center;color:var(--text-muted);">لا توجد حركات طبعات مسجلة بعد.</div>`;
  }
}

function renderLibrariesView() {
  let totalSupplied = 0;
  let totalSold = 0;
  let totalCollected = 0;

  state.libTx.forEach((tx) => {
    if (tx.txType === "supply") totalSupplied += Number(tx.qty) || 0;
    if (tx.txType === "settle") {
      totalSold += Number(tx.qty) || 0;
      totalCollected += Number(tx.amount) || 0;
    }
  });

  const rem = Math.max(0, totalSupplied - totalSold);
  if ($("libs-kpi-count")) $("libs-kpi-count").textContent = `${fmtNum(state.libraries.length)} مكتبة`;
  if ($("libs-kpi-supplied")) $("libs-kpi-supplied").textContent = `${fmtNum(totalSupplied)} نسخة`;
  if ($("libs-kpi-rem")) $("libs-kpi-rem").textContent = `${fmtNum(rem)} نسخة`;
  if ($("libs-kpi-collected")) $("libs-kpi-collected").textContent = fmtMoney(totalCollected);
  if ($("libs-kpi-sold-sub")) $("libs-kpi-sold-sub").textContent = `${fmtNum(totalSold)} نسخة مصفاة`;

  const grid = $("libraries-cards-grid");
  if (!grid) return;

  grid.innerHTML = state.libraries.length
    ? state.libraries
        .map((lib) => {
          const txs = state.libTx.filter((t) => t.libId === lib.id);
          const sup = txs.filter((t) => t.txType === "supply").reduce((s, t) => s + (Number(t.qty) || 0), 0);
          const sld = txs.filter((t) => t.txType === "settle").reduce((s, t) => s + (Number(t.qty) || 0), 0);
          const col = txs.filter((t) => t.txType === "settle").reduce((s, t) => s + (Number(t.amount) || 0), 0);
          return `
            <div class="surface-card clickable js-lib-card" data-id="${esc(lib.id)}" style="cursor:pointer;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h4 style="font-size:15px;font-weight:800;">${esc(lib.name)}</h4>
                <span class="badge invert">خصم ${fmtNum(lib.discount || 30)}%</span>
              </div>
              <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">${esc(lib.city || "—")} • ${esc(lib.phone || "")}</p>
              <div class="book-mini-stats">
                <div><span>الرصيد المعلّق</span><strong class="money-neg">${fmtNum(Math.max(0, sup - sld))} نسخة</strong></div>
                <div><span>المحصّل الفعلي</span><strong class="money-pos">${fmtMoney(col)}</strong></div>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد مكتبات مسجلة بعد.</div>`;

  grid.querySelectorAll(".js-lib-card").forEach((c) => {
    c.addEventListener("click", () => openLibraryDetail(c.dataset.id));
  });
}

function openLibraryDetail(libId) {
  state.selectedLibId = libId;
  navigateTo("view-library-detail");
}

function renderLibraryDetailView(libId) {
  const lib = state.libraries.find((l) => l.id === libId);
  if (!lib) return;

  const txs = state.libTx.filter((t) => t.libId === lib.id);
  const sup = txs.filter((t) => t.txType === "supply").reduce((s, t) => s + (Number(t.qty) || 0), 0);
  const sld = txs.filter((t) => t.txType === "settle").reduce((s, t) => s + (Number(t.qty) || 0), 0);
  const col = txs.filter((t) => t.txType === "settle").reduce((s, t) => s + (Number(t.amount) || 0), 0);

  if ($("library-detail-banner")) {
    $("library-detail-banner").innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <span class="badge invert">منفذ توزيع معتمد • خصم ${fmtNum(lib.discount || 30)}%</span>
          <h2 style="font-size:19px;font-weight:900;margin-top:4px;">${esc(lib.name)}</h2>
          <p style="font-size:12.5px;color:var(--text-secondary);">${esc(lib.city || "")} • ${esc(lib.phone || "")} • ${esc(lib.notes || "")}</p>
        </div>
      </div>
    `;
  }

  if ($("lib-stat-supplied")) $("lib-stat-supplied").textContent = `${fmtNum(sup)} نسخة`;
  if ($("lib-stat-sold")) $("lib-stat-sold").textContent = `${fmtNum(sld)} نسخة`;
  if ($("lib-stat-rem")) $("lib-stat-rem").textContent = `${fmtNum(Math.max(0, sup - sld))} نسخة`;
  if ($("lib-stat-collected")) $("lib-stat-collected").textContent = fmtMoney(col);

  const invList = $("library-inventory-list");
  if (invList) {
    invList.innerHTML = txs.length
      ? txs
          .map(
            (t) => `
          <div class="list-row">
            <div>
              <span class="badge ${t.txType === "settle" ? "pos" : "invert"}">${t.txType === "settle" ? "تصفية ومبيعات محصلة" : "توريد شحنة أمانة"}</span>
              <strong style="margin-right:6px;">${esc(t.bookTitle)} (${fmtNum(t.qty)} نسخة)</strong>
              <div style="font-size:12px;color:var(--text-secondary);">
                ${t.txType === "settle" ? `المبلغ المحصل: ${fmtMoney(t.amount)} • ` : ""}${esc(t.notes || "")} • ${esc(fmtFullDateTime(t.timestamp))}
              </div>
            </div>
          </div>
        `
          )
          .join("")
      : `<div class="surface-card" style="text-align:center;color:var(--text-muted);">لا توجد شحنات موردة لهذه المكتبة بعد.</div>`;
  }
}

function renderExhibitionsView() {
  const exhSales = state.sales.filter((s) => s.exhibitionId);
  const totalRev = exhSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
  const totalCopies = exhSales.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
  const totalAuthorCuts = exhSales.reduce((sum, s) => sum + (Number(s.authorCut) || 0), 0);
  const totalExhExp = state.expenses.filter((e) => e.exhibitionId).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const net = totalRev - totalAuthorCuts - totalExhExp;

  if ($("exhs-kpi-total")) $("exhs-kpi-total").textContent = `${fmtNum(state.exhibitions.length)} معرض`;
  if ($("exhs-kpi-rev")) $("exhs-kpi-rev").textContent = fmtMoney(totalRev);
  if ($("exhs-kpi-copies")) $("exhs-kpi-copies").textContent = `${fmtNum(totalCopies)} نسخة مباعة بالأجنحة`;
  if ($("exhs-kpi-exp")) $("exhs-kpi-exp").textContent = fmtMoney(totalExhExp);
  if ($("exhs-kpi-net")) {
    $("exhs-kpi-net").textContent = fmtMoney(net);
    $("exhs-kpi-net").className = `metric-val ${net >= 0 ? "money-pos" : "money-neg"}`;
  }

  const grid = $("exhibitions-cards-grid");
  if (!grid) return;

  grid.innerHTML = state.exhibitions.length
    ? state.exhibitions
        .map((ex) => {
          const mySales = state.sales.filter((s) => s.exhibitionId === ex.id);
          const rev = mySales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
          const bCount = Array.isArray(ex.bookIds) ? ex.bookIds.length : 0;
          const coverImg = Array.isArray(ex.photoUrls) && ex.photoUrls.length > 0 ? ex.photoUrls[0] : "";
          return `
            <div class="surface-card clickable js-exh-card" data-id="${esc(ex.id)}" style="cursor:pointer;">
              ${
                coverImg
                  ? `<img src="${esc(coverImg)}" style="width:100%;height:130px;object-fit:cover;border-radius:10px;margin-bottom:10px;border:1px solid var(--border);" />`
                  : ""
              }
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <h4 style="font-size:15.5px;font-weight:800;">${esc(ex.name)}</h4>
                <span class="badge invert">${fmtNum(bCount)} كتاب</span>
              </div>
              <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
                <i class="ri-map-pin-line"></i> ${esc(ex.location || "—")} • (${esc(ex.startDate || "")} - ${esc(ex.endDate || "")})
              </p>
              <div class="book-mini-stats">
                <div><span>مبيعات الجناح</span><strong class="money-pos">${fmtMoney(rev)}</strong></div>
                <div><span>الميزانية</span><strong>${fmtMoney(ex.budget || 0)}</strong></div>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد معارض مسجلة بعد.</div>`;

  grid.querySelectorAll(".js-exh-card").forEach((c) => {
    c.addEventListener("click", () => openExhibitionDetail(c.dataset.id));
  });
}

function openExhibitionDetail(exhId) {
  state.selectedExhId = exhId;
  navigateTo("view-exhibition-detail");
}

function renderExhibitionDetailView(exhId) {
  const ex = state.exhibitions.find((x) => x.id === exhId);
  if (!ex) return;

  const mySales = state.sales.filter((s) => s.exhibitionId === ex.id);
  const rev = mySales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
  const copies = mySales.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
  const authorCuts = mySales.reduce((sum, s) => sum + (Number(s.authorCut) || 0), 0);
  const myExpenses = state.expenses.filter((e) => e.exhibitionId === ex.id);
  const expTotal = myExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const net = rev - authorCuts - expTotal;
  const participatingBooks = state.books.filter((b) => Array.isArray(ex.bookIds) && ex.bookIds.includes(b.id));

  if ($("exhibition-detail-banner")) {
    $("exhibition-detail-banner").innerHTML = `
      <div>
        <span class="badge invert"><i class="ri-compass-discover-line"></i> جناح الدار الرسمي في المعرض</span>
        <h2 style="font-size:20px;font-weight:900;margin:4px 0;">${esc(ex.name)}</h2>
        <p style="font-size:13px;color:var(--text-secondary);">
          الموقع / الجناح: <strong>${esc(ex.location || "—")}</strong>
          • الفترة: من <strong>${esc(ex.startDate || "—")}</strong> إلى <strong>${esc(ex.endDate || "—")}</strong>
        </p>
      </div>
    `;
  }

  if ($("exh-stat-rev")) $("exh-stat-rev").textContent = fmtMoney(rev);
  if ($("exh-stat-copies")) $("exh-stat-copies").textContent = `${fmtNum(copies)} نسخة مباعة بالمعرض`;
  if ($("exh-stat-exp")) $("exh-stat-exp").textContent = fmtMoney(expTotal);
  if ($("exh-stat-budget")) $("exh-stat-budget").textContent = `الميزانية التقديرية: ${fmtMoney(ex.budget || 0)}`;
  if ($("exh-stat-net")) {
    $("exh-stat-net").textContent = fmtMoney(net);
    $("exh-stat-net").className = `metric-val ${net >= 0 ? "money-pos" : "money-neg"}`;
  }
  if ($("exh-stat-books-count")) $("exh-stat-books-count").textContent = `${fmtNum(participatingBooks.length)} كتاب`;

  const photosPanel = $("exhibition-photos-panel");
  const photosGal = $("exhibition-photos-gallery");
  if (photosPanel && photosGal) {
    if (Array.isArray(ex.photoUrls) && ex.photoUrls.length > 0) {
      photosPanel.style.display = "block";
      photosGal.innerHTML = `
        <div class="exhibition-gallery-grid">
          ${ex.photoUrls
            .map(
              (url, idx) => `
            <div class="cover-slot-card">
              <img src="${esc(url)}" alt="صورة المعرض ${idx + 1}" />
              <a href="${esc(url)}" target="_blank" class="btn btn-outline" style="padding:4px 8px;font-size:11px;">تكبير الصورة</a>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    } else {
      photosPanel.style.display = "none";
    }
  }

  const bGrid = $("exhibition-books-grid");
  if (bGrid) {
    bGrid.innerHTML = participatingBooks.length
      ? participatingBooks.map((b) => createBookCardHtml(b, { exhId: ex.id })).join("")
      : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لم يتم تحديد كتب مشاركة في هذا المعرض بعد. اضغط على (تعديل المعرض) لتحديد الكتب.</div>`;
    bindBookCardsEvents(bGrid);
  }

  const expList = $("exhibition-expenses-list");
  if (expList) {
    expList.innerHTML = myExpenses.length
      ? myExpenses
          .map(
            (e) => `
          <div class="list-row">
            <div>
              <span class="badge neg">مصروف معرض</span>
              <strong style="margin-right:6px;">${esc(e.title)}</strong>
              <div style="font-size:12px;color:var(--text-secondary);">${esc(fmtFullDateTime(e.timestamp))}</div>
            </div>
            <strong class="money-neg">${fmtMoney(e.amount)}</strong>
          </div>
        `
          )
          .join("")
      : `<div class="surface-card" style="text-align:center;color:var(--text-muted);">لا توجد مصروفات مسجلة على هذا المعرض.</div>`;
  }
}

function renderContestsView() {
  const contestEds = state.editions.filter((ed) => ed.operationType === "free_contest");
  const freeSales = state.sales.filter((s) => s.copyFormat === "freebie" || s.isFreebie === true);

  const prizesCopies = contestEds
    .filter((c) => c.contestType === "contest_prize")
    .reduce((sum, c) => sum + (Number(c.qty) || 0), 0);

  const otherEdFreeCopies = contestEds
    .filter((c) => c.contestType !== "contest_prize")
    .reduce((sum, c) => sum + (Number(c.qty) || 0), 0);

  const posGiftsCopies = freeSales.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
  const totalFreeCopies = prizesCopies + otherEdFreeCopies + posGiftsCopies;
  const totalOps = contestEds.length + freeSales.length;

  if ($("contests-kpi-total")) $("contests-kpi-total").textContent = `${fmtNum(totalOps)} عملية`;
  if ($("contests-kpi-copies")) $("contests-kpi-copies").textContent = `${fmtNum(totalFreeCopies)} نسخة`;
  if ($("contests-kpi-prizes")) $("contests-kpi-prizes").textContent = `${fmtNum(prizesCopies)} نسخة`;
  if ($("contests-kpi-gifts")) $("contests-kpi-gifts").textContent = `${fmtNum(otherEdFreeCopies + posGiftsCopies)} نسخة`;

  const listEl = $("contests-history-list");
  if (!listEl) return;

  const combined = [
    ...contestEds.map((c) => ({
      id: c.id,
      badge: c.contestType === "contest_prize" ? "جائزة مسابقة ثقافية" : c.contestType === "author_copies" ? "نسخ مؤلف مجانية" : "إهداء مجاني عام",
      title: c.title || "صرف مجاني",
      bookTitle: c.bookTitle || "كتاب",
      qty: c.qty || 1,
      winner: c.winnerName || "—",
      notes: c.notes || "",
      timestamp: c.timestamp || 0
    })),
    ...freeSales.map((s) => ({
      id: s.id,
      badge: "هدية مرافقة (الكاشير / البيع)",
      title: s.channel || "هدية مع فاتورة بيع",
      bookTitle: s.bookTitle || "كتاب",
      qty: s.qty || 1,
      winner: s.customerName || "عميل مشتري",
      notes: s.invoiceCode ? `فاتورة رقم ${s.invoiceCode}` : "",
      timestamp: s.timestamp || 0
    }))
  ].sort((a, b) => b.timestamp - a.timestamp);

  listEl.innerHTML = combined.length
    ? combined
        .map(
          (item) => `
        <div class="list-row">
          <div>
            <span class="badge pos"><i class="ri-gift-2-line"></i> ${esc(item.badge)}</span>
            <strong style="margin-right:6px;">${esc(item.title)} — الكتاب: «${esc(item.bookTitle)}» (${fmtNum(item.qty)} نسخة)</strong>
            <div style="font-size:12px;color:var(--text-secondary);">
              المستلم / الفائز: <strong>${esc(item.winner)}</strong>
              ${item.notes ? ` • ${esc(item.notes)}` : ""}
              • <span dir="ltr">${esc(fmtFullDateTime(item.timestamp))}</span>
            </div>
          </div>
          <span class="badge invert">0 ج.م (معفى من نسبة المؤلف)</span>
        </div>
      `
        )
        .join("")
    : `<div class="surface-card" style="text-align:center;color:var(--text-muted);">لم يتم تسجيل أي مسابقات أو إهداءات مجانية بعد.</div>`;
}

// ==========================================================================
// 19. السجل المالي الشامل، الموظفون، والسجل الرقابي التفاعلي (Audit Inspection)
// ==========================================================================
function isWithinDateRange(ts, rangeType, fromStr, toStr) {
  if (!ts) return true;
  const d = new Date(ts);
  const now = new Date();

  if (fromStr || toStr) {
    if (fromStr) {
      const f = new Date(fromStr + "T00:00:00");
      if (d < f) return false;
    }
    if (toStr) {
      const t = new Date(toStr + "T23:59:59");
      if (d > t) return false;
    }
    return true;
  }

  if (rangeType === "today") {
    return d.toISOString().split("T")[0] === now.toISOString().split("T")[0];
  }
  if (rangeType === "week") {
    return now.getTime() - d.getTime() <= 7 * 24 * 60 * 60 * 1000;
  }
  if (rangeType === "month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  return true;
}

function renderFinanceView() {
  const fSales = state.sales.filter((s) => isWithinDateRange(s.timestamp, state.finRange, state.finFrom, state.finTo));
  const fPayouts = state.payouts.filter((p) => isWithinDateRange(p.timestamp, state.finRange, state.finFrom, state.finTo));
  const fExpenses = state.expenses.filter((e) => isWithinDateRange(e.timestamp, state.finRange, state.finFrom, state.finTo));

  const sumIn = fSales.reduce((s, x) => s + (Number(x.totalAmount) || 0), 0);
  const sumPay = fPayouts.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const sumExp = fExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const net = sumIn - sumPay - sumExp;

  if ($("fin-period-in")) $("fin-period-in").textContent = fmtMoney(sumIn);
  if ($("fin-period-sales-count")) $("fin-period-sales-count").textContent = `${fmtNum(fSales.length)} عملية بيع`;
  if ($("fin-period-payouts")) $("fin-period-payouts").textContent = fmtMoney(sumPay);
  if ($("fin-period-out")) $("fin-period-out").textContent = fmtMoney(sumExp);
  if ($("fin-period-net")) {
    $("fin-period-net").textContent = fmtMoney(net);
    $("fin-period-net").className = `metric-val ${net >= 0 ? "money-pos" : "money-neg"}`;
  }

  const timeline = [
    ...fSales.map((s) => ({
      ts: s.timestamp || 0,
      kind: "sale",
      saleObj: s,
      badge: s.copyFormat === "freebie" ? "هدية مجانية" : s.copyFormat === "digital" ? "بيع إلكتروني" : "بيع ورقي",
      badgeClass: "pos",
      title: `${s.bookTitle || "كتاب"} (${fmtNum(s.qty)} نسخة) ${s.invoiceCode ? `• ${s.invoiceCode}` : ""}`,
      sub: `العميل: ${s.customerName || "عام"} • المنفذ: ${s.soldBy || "—"} • ${fmtFullDateTime(s.timestamp)}`,
      amountText: `+ ${fmtMoney(s.totalAmount)}`,
      amountClass: "money-pos"
    })),
    ...fPayouts.map((p) => ({
      ts: p.timestamp || 0,
      kind: "payout",
      badge: "حوالة مؤلف",
      badgeClass: "neg",
      title: `دفعة للمؤلف: ${p.authorName || "—"} عبر ${p.method}`,
      sub: `المنفذ: ${p.paidBy || "—"} • ${fmtFullDateTime(p.timestamp)}`,
      amountText: `- ${fmtMoney(p.amount)}`,
      amountClass: "money-neg"
    })),
    ...fExpenses.map((e) => ({
      ts: e.timestamp || 0,
      kind: "expense",
      badge: "مصروف تشغيلي",
      badgeClass: "neg",
      title: `${e.title} (${e.category || "عام"})`,
      sub: `${fmtFullDateTime(e.timestamp)}`,
      amountText: `- ${fmtMoney(e.amount)}`,
      amountClass: "money-neg"
    }))
  ].sort((a, b) => b.ts - a.ts);

  const listEl = $("finance-timeline-list");
  if (!listEl) return;

  listEl.innerHTML = timeline.length
    ? timeline
        .slice(0, 80)
        .map(
          (item, idx) => `
        <div class="list-row ${item.kind === "sale" ? "clickable js-fin-sale-row" : ""}" data-idx="${idx}">
          <div>
            <span class="badge ${item.badgeClass}">${esc(item.badge)}</span>
            <strong style="margin-right:6px;">${esc(item.title)}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">${esc(item.sub)}</div>
          </div>
          <strong class="${item.amountClass}">${esc(item.amountText)}</strong>
        </div>
      `
        )
        .join("")
    : `<div class="surface-card" style="text-align:center;color:var(--text-muted);">لا توجد حركات مالية في الفترة المحددة.</div>`;

  listEl.querySelectorAll(".js-fin-sale-row").forEach((row) => {
    row.addEventListener("click", () => {
      const item = timeline[Number(row.dataset.idx)];
      if (item && item.saleObj) openCommercialInvoiceModalFromSale(item.saleObj);
    });
  });
}

function renderStaffView() {
  if (state.role !== "super_admin") return;

  const activeStaff = state.staff.filter((s) => !s.restricted).length;
  const posStaff = state.staff.filter((s) => s.permissions?.pos !== false).length;

  if ($("staff-kpi-total")) $("staff-kpi-total").textContent = `${fmtNum(state.staff.length)} موظف`;
  if ($("staff-kpi-active")) $("staff-kpi-active").textContent = `${fmtNum(activeStaff)} موظف`;
  if ($("staff-kpi-pos")) $("staff-kpi-pos").textContent = `${fmtNum(posStaff)} موظف`;
  if ($("staff-kpi-logs")) $("staff-kpi-logs").textContent = `${fmtNum(state.logs.length)} عملية`;

  const grid = $("staff-cards-grid");
  if (!grid) return;

  grid.innerHTML = state.staff.length
    ? state.staff
        .map((st) => {
          const p = st.permissions || {};
          const otherPerms = p.addBook || p.deleteBook || p.authors || p.payouts || p.expenses || p.financeView;
          const isPosOnly = p.pos && !otherPerms;
          return `
            <div class="surface-card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div>
                  <h4 style="font-size:15px;font-weight:800;">${esc(st.name)}</h4>
                  <span style="font-size:12px;color:var(--text-secondary);" dir="ltr">${esc(st.email)}</span>
                </div>
                <span class="badge ${st.restricted ? "neg" : isPosOnly ? "invert" : "pos"}">
                  ${st.restricted ? "مجمد" : isPosOnly ? "كاشير فقط (POS)" : st.jobTitle || "موظف"}
                </span>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
                <button type="button" class="btn btn-outline js-edit-staff" data-id="${esc(st.id)}" style="padding:5px 10px;font-size:12px;"><i class="ri-edit-box-line"></i> تعديل الصلاحيات</button>
                <button type="button" class="btn btn-outline js-view-staff-logs" data-email="${esc(st.email)}" data-name="${esc(st.name)}" style="padding:5px 10px;font-size:12px;"><i class="ri-history-line"></i> سجل عملياته</button>
                <button type="button" class="btn btn-neg js-del-staff" data-id="${esc(st.id)}" style="padding:5px 10px;font-size:12px;"><i class="ri-delete-bin-line"></i></button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لم تقم بإضافة موظفين بعد.</div>`;

  grid.querySelectorAll(".js-edit-staff").forEach((btn) => {
    btn.addEventListener("click", () => openStaffFormForEdit(btn.dataset.id));
  });
  grid.querySelectorAll(".js-view-staff-logs").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.viewingStaffLogsEmail = (btn.dataset.email || "").toLowerCase();
      if ($("audit-log-title")) $("audit-log-title").innerHTML = `<i class="ri-history-line"></i><span>سجل عمليات الموظف: ${esc(btn.dataset.name)}</span>`;
      if ($("btn-back-my-logs")) $("btn-back-my-logs").style.display = "inline-flex";
      navigateTo("view-profile");
    });
  });
  grid.querySelectorAll(".js-del-staff").forEach((btn) => {
    btn.addEventListener("click", () => {
      askConfirm("حذف حساب موظف", "هل أنت متأكد من حذف هذا الموظف وسحب صلاحياته؟", async () => {
        await deleteDoc(doc(db, "staff", btn.dataset.id));
        toast("تم حذف الموظف");
      });
    });
  });
}

function renderProfileAndLogsView() {
  const listEl = $("audit-logs-list");
  if (!listEl) return;

  const targetEmail = state.viewingStaffLogsEmail || (state.role === "super_admin" ? null : state.userEmail);

  const filtered = state.logs.filter((lg) => {
    if (targetEmail && (lg.actorEmail || "").toLowerCase() !== targetEmail) return false;
    return isWithinDateRange(lg.timestamp, "all", state.logFrom, state.logTo);
  });

  listEl.innerHTML = filtered.length
    ? filtered
        .slice(0, 100)
        .map(
          (lg, idx) => `
        <div class="list-row clickable audit-log-row js-audit-row" data-idx="${idx}">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
              <span class="badge invert">${esc(lg.actorRole || "النظام")}</span>
              <strong style="font-size:14px;">${esc(lg.actionTitle)}</strong>
              <span style="font-size:11.5px;color:var(--text-muted);font-family:monospace;" dir="ltr">
                <i class="ri-time-line"></i> ${esc(fmtFullDateTime(lg.timestamp))}
              </span>
            </div>
            <p style="font-size:12.5px;color:var(--text-secondary);">
              المنفذ: <strong>${esc(lg.actorName)}</strong> (<span dir="ltr">${esc(lg.actorEmail)}</span>) — ${esc(lg.detailsText)}
            </p>
          </div>
          <span class="btn btn-outline" style="padding:5px 10px;font-size:11.5px;">تفاصيل العملية <i class="ri-search-eye-line"></i></span>
        </div>
      `
        )
        .join("")
    : `<div class="surface-card" style="text-align:center;color:var(--text-muted);">لا توجد عمليات مسجلة في هذا النطاق الزمني.</div>`;

  listEl.querySelectorAll(".js-audit-row").forEach((row) => {
    row.addEventListener("click", () => {
      const logObj = filtered[Number(row.dataset.idx)];
      if (logObj) openAuditDetailModal(logObj);
    });
  });
}

function openAuditDetailModal(logObj) {
  const body = $("audit-detail-modal-body");
  const gotoBtn = $("btn-audit-goto-entity");
  if (!body) return;

  body.innerHTML = `
    <div style="display:grid;gap:8px;">
      <div><strong>عنوان الإجراء:</strong> ${esc(logObj.actionTitle)}</div>
      <div><strong>التاريخ والوقت الدقيق (بالثانية):</strong> <span dir="ltr" style="font-family:monospace;font-weight:900;">${esc(fmtFullDateTime(logObj.timestamp))}</span></div>
      <div><strong>اسم المنفذ:</strong> ${esc(logObj.actorName)} (${esc(logObj.actorRole || "—")})</div>
      <div><strong>البريد الإلكتروني للمنفذ:</strong> <span dir="ltr">${esc(logObj.actorEmail)}</span></div>
      <div style="padding-top:8px;border-top:1px solid var(--border);"><strong>التفاصيل الكاملة للعملية:</strong><br/>${esc(logObj.detailsText)}</div>
      ${
        logObj.beforeSnapshot
          ? `<div style="padding-top:8px;border-top:1px dashed var(--border);"><strong>البيانات قبل التعديل:</strong><br/><code style="font-size:11.5px;word-break:break-all;">${esc(logObj.beforeSnapshot)}</code></div>`
          : ""
      }
      ${
        logObj.afterSnapshot
          ? `<div style="padding-top:8px;border-top:1px dashed var(--border);"><strong>البيانات المعتمدة:</strong><br/><code style="font-size:11.5px;word-break:break-all;">${esc(logObj.afterSnapshot)}</code></div>`
          : ""
      }
    </div>
  `;

  if (gotoBtn) {
    if (logObj.targetView) {
      gotoBtn.style.display = "inline-flex";
      gotoBtn.onclick = () => {
        closeModal("modal-audit-detail");
        if (logObj.targetView === "view-book-detail" && logObj.targetEntityId) openBookDetail(logObj.targetEntityId);
        else if (logObj.targetView === "view-author-detail" && logObj.targetEntityId) openAuthorDetail(logObj.targetEntityId);
        else if (logObj.targetView === "view-exhibition-detail" && logObj.targetEntityId) openExhibitionDetail(logObj.targetEntityId);
        else if (logObj.targetView === "view-library-detail" && logObj.targetEntityId) openLibraryDetail(logObj.targetEntityId);
        else navigateTo(logObj.targetView);
      };
    } else {
      gotoBtn.style.display = "none";
    }
  }

  openModal("modal-audit-detail");
}

function renderGuideView() {
  const box = $("comprehensive-guide-container");
  if (!box || box.dataset.rendered === "true") return;
  box.dataset.rendered = "true";
  box.innerHTML = `
    <div class="page-panel">
      <div class="panel-head">
        <h3 style="font-size:16.5px;font-weight:800;"><i class="ri-book-open-line"></i> الدليل المالي والتشغيلي الشامل لنظام صفقات كتابية (ERP & POS v3.1)</h3>
      </div>
      <div class="panel-body" style="display:grid;gap:14px;font-size:13.5px;line-height:1.75;">
        <div class="form-box">
          <div class="form-box-title"><i class="ri-shopping-basket-2-line"></i> 1. شاشة الكاشير (POS) والفواتير المصورة والباركود</div>
          <p>تتيح شاشة الكاشير المعزولة بيع الكتب بسرعة فائقة دون إظهار أرباح الدار أمام العميل. يمكنك إضافة كتب مباعة وإدراج كتب هدايا مجانية في نفس الفاتورة، ثم إصدار فاتورة رسمية باسم <strong>دار صفقات كتابية للنشر والتوزيع</strong> ومشاركتها كصورة ونص إلى واتساب العميل مباشرة مع باركود تحقق فوري بالكاميرا.</p>
        </div>
        <div class="form-box">
          <div class="form-box-title"><i class="ri-gift-2-line"></i> 2. قاعدة النسخ الورقية والإلكترونية والإهداءات المجانية</div>
          <p>• <strong>النسخة الورقية:</strong> تُخصم من المستودع وتُحسب نسبتها للمؤلف والدار.<br/>
             • <strong>النسخة الإلكترونية:</strong> لا تُخصم من المخزون الورقي وتُحسب نسبتها للمؤلف والدار.<br/>
             • <strong>الإهداءات والمسابقات والهدايا المجانية:</strong> تُخصم من المخزون الورقي للتوثيق الجردي، ولكن قيمتها المالية (صفر) فلا تحمّل الدار أي مبالغ أو نسب للمؤلف.</p>
        </div>
      </div>
    </div>
  `;
}
// ==========================================================================
// 20. شاشة الكاشير المعزولة ونقاط البيع (POS Cashier & Free Gift Cart)
// ==========================================================================
function renderPosView() {
  const catalogEl = $("pos-books-catalog-list");
  const countEl = $("pos-catalog-count");
  if (!catalogEl) return;

  const q = ($("pos-book-search-input")?.value || "").trim().toLowerCase();
  const activeBooks = state.books.filter((b) => b.contractStatus !== "terminated");
  if (countEl) countEl.textContent = `${fmtNum(activeBooks.length)} كتاب متاح`;

  const filtered = activeBooks.filter(
    (b) =>
      !q ||
      (b.title || "").toLowerCase().includes(q) ||
      (b.authorName || "").toLowerCase().includes(q) ||
      (b.isbn || "").toLowerCase().includes(q)
  );

  catalogEl.innerHTML = filtered.length
    ? filtered
        .slice(0, 40)
        .map((b) => {
          const st = Number(b.stock) || 0;
          return `
            <div class="pos-book-row">
              <div>
                <strong style="font-size:14px;">${esc(b.title)}</strong>
                <div style="font-size:12px;color:var(--text-secondary);">
                  المؤلف: ${esc(b.authorName \vert{}\vert{} "—")} • السعر: <strong>${fmtMoney(b.price)}</strong> • المخزون: <span class="${st <= 5 ? "money-neg" : "money-pos"}">${fmtNum(st)}</span>
                </div>
              </div>
              <div style="display:flex;gap:6px;">
                <button type="button" class="btn btn-primary js-pos-add-sale" data-id="${esc(b.id)}" style="padding:6px 12px;font-size:12px;">
                  <i class="ri-add-line"></i><span>بيع</span>
                </button>
                <button type="button" class="btn btn-outline js-pos-add-gift" data-id="${esc(b.id)}" style="padding:6px 10px;font-size:12px;color:var(--pos);border-color:var(--pos-border);" title="إضافة كنسخة هدية مجانية">
                  <i class="ri-gift-2-line"></i><span>هدية مجانية</span>
                </button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">لا توجد كتب مطابقة للبحث.</div>`;

  catalogEl.querySelectorAll(".js-pos-add-sale").forEach((btn) => {
    btn.addEventListener("click", () => addBookToPosCart(btn.dataset.id, false));
  });
  catalogEl.querySelectorAll(".js-pos-add-gift").forEach((btn) => {
    btn.addEventListener("click", () => addBookToPosCart(btn.dataset.id, true));
  });

  renderPosCart();
  renderPosRecentInvoices();
}

function addBookToPosCart(bookId, isFreeGift = false) {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;

  const existing = state.posCart.find((item) => item.bookId === bookId && item.isFreebie === isFreeGift);
  if (existing) {
    existing.qty += 1;
  } else {
    state.posCart.push({
      cartItemId: `${bookId}_${isFreeGift ? "gift" : "sale"}_${Date.now()}`,
      bookId: book.id,
      title: book.title,
      authorId: book.authorId || "",
      authorName: book.authorName || "",
      unitPrice: isFreeGift ? 0 : Number(book.price) || 0,
      digitalUnitPrice: isFreeGift ? 0 : Number(book.digitalPrice || book.price) || 0,
      royaltyRate: isFreeGift ? 0 : Number(book.royaltyRate) || 0,
      qty: 1,
      isFreebie: isFreeGift
    });
  }
  renderPosCart();
}

function renderPosCart() {
  const listEl = $("pos-cart-items-list");
  const countsEl = $("pos-sum-counts");
  const totalEl = $("pos-sum-total");
  if (!listEl) return;

  const format = $("pos-copy-format")?.value || "paper";
  const discPct = Math.min(90, Math.max(0, Number($("pos-discount-input")?.value) || 0));

  if (!state.posCart.length) {
    listEl.innerHTML = `<div style="text-align:center;padding:26px 10px;color:var(--text-muted);font-size:13px;border:1px dashed var(--border-strong);border-radius:10px;">السلة فارغة حالياً. اضغط (بيع) أو (هدية مجانية) من قائمة الكتب.</div>`;
    if (countsEl) countsEl.textContent = "0 مباعة • 0 هدية مجانية";
    if (totalEl) totalEl.textContent = "0 ج.م";
    return;
  }

  let soldCount = 0;
  let giftCount = 0;
  let grossTotal = 0;

  listEl.innerHTML = state.posCart
    .map((item, idx) => {
      const priceToUse = item.isFreebie ? 0 : format === "digital" ? item.digitalUnitPrice : item.unitPrice;
      const subTotal = priceToUse * item.qty;
      if (item.isFreebie) giftCount += item.qty;
      else {
        soldCount += item.qty;
        grossTotal += subTotal;
      }

      return `
        <div class="pos-cart-item ${item.isFreebie ? "is-free-gift" : ""}">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="badge ${item.isFreebie ? "pos" : "invert"}">${item.isFreebie ? "هدية مجانية (0 ج.م)" : "مبيعات"}</span>
              <strong style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.title)}</strong>
            </div>
            <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">
              ${item.isFreebie ? "تُخصم من المخزون بدون ربح مؤلف" : `سعر الوحدة: ${fmtMoney(priceToUse)} • الإجمالي: ${fmtMoney(subTotal)}`}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <button type="button" class="btn btn-outline js-cart-dec" data-idx="${idx}" style="padding:3px 8px;font-size:13px;">-</button>
            <strong style="min-width:22px;text-align:center;font-size:13.5px;">${fmtNum(item.qty)}</strong>
            <button type="button" class="btn btn-outline js-cart-inc" data-idx="${idx}" style="padding:3px 8px;font-size:13px;">+</button>
            <button type="button" class="btn btn-neg js-cart-del" data-idx="${idx}" style="padding:4px 8px;font-size:12px;"><i class="ri-delete-bin-line"></i></button>
          </div>
        </div>
      `;
    })
    .join("");

  const netTotal = Math.round(grossTotal * (1 - discPct / 100) * 100) / 100;
  if (countsEl) countsEl.textContent = `${fmtNum(soldCount)} مباعة • ${fmtNum(giftCount)} هدية مجانية`;
  if (totalEl) totalEl.textContent = fmtMoney(netTotal);

  listEl.querySelectorAll(".js-cart-dec").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.dataset.idx);
      if (state.posCart[i].qty > 1) state.posCart[i].qty--;
      else state.posCart.splice(i, 1);
      renderPosCart();
    });
  });
  listEl.querySelectorAll(".js-cart-inc").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.dataset.idx);
      state.posCart[i].qty++;
      renderPosCart();
    });
  });
  listEl.querySelectorAll(".js-cart-del").forEach((b) => {
    b.addEventListener("click", () => {
      state.posCart.splice(Number(b.dataset.idx), 1);
      renderPosCart();
    });
  });
}

async function handlePosCheckout() {
  if (!state.posCart.length) {
    toast("السلة فارغة! أضف كتاباً واحداً على الأقل", "ri-error-warning-line");
    return;
  }

  const copyFormat = $("pos-copy-format")?.value || "paper";
  const whId = $("pos-warehouse-select")?.value || "main_warehouse";
  const exhId = $("pos-exhibition-select")?.value || "";
  const exhObj = state.exhibitions.find((x) => x.id === exhId);
  const custName = ($("pos-cust-name")?.value || "").trim() || "عميلنا العزيز";
  const custPhone = ($("pos-cust-phone")?.value || "").trim();
  const payMethod = $("pos-payment-method")?.value || "نقدي (كاش)";
  const discPct = Math.min(90, Math.max(0, Number($("pos-discount-input")?.value) || 0));

  if (copyFormat === "paper") {
    const reqByBook = {};
    state.posCart.forEach((item) => {
      reqByBook[item.bookId] = (reqByBook[item.bookId] || 0) + item.qty;
    });
    for (const [bId, totalNeeded] of Object.entries(reqByBook)) {
      const book = state.books.find((b) => b.id === bId);
      const currentStock = Number(book?.stock) || 0;
      if (currentStock < totalNeeded) {
        toast(`الرصيد الورقي غير كافٍ لكتاب «${book?.title || ""}» (المتوفر: ${currentStock} والمطلوب: ${totalNeeded})`, "ri-error-warning-line");
        return;
      }
    }
  }

  const now = Date.now();
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const invoiceCode = `#INV-${new Date(now).getFullYear()}-${randSuffix}`;
  const channelLabel = exhObj ? `معرض: ${exhObj.name}` : "الكاشير / نقطة البيع المباشر";

  const invoiceItemsForView = [];
  let invoiceNetSum = 0;

  for (const item of state.posCart) {
    const book = state.books.find((b) => b.id === item.bookId);
    if (!book) continue;

    const baseUnit = item.isFreebie ? 0 : copyFormat === "digital" ? item.digitalUnitPrice : item.unitPrice;
    const grossLine = baseUnit * item.qty;
    const netLine = item.isFreebie ? 0 : Math.round(grossLine * (1 - discPct / 100) * 100) / 100;
    const royaltyRate = item.isFreebie ? 0 : Number(book.royaltyRate) || 0;
    const authorCut = item.isFreebie ? 0 : Math.round(netLine * (royaltyRate / 100) * 100) / 100;
    const houseCut = item.isFreebie ? 0 : Math.round((netLine - authorCut) * 100) / 100;

    invoiceNetSum += netLine;

    await addDoc(collection(db, "sales"), {
      invoiceCode,
      bookId: book.id,
      bookTitle: book.title,
      authorId: book.authorId || "",
      authorName: book.authorName || "",
      qty: Number(item.qty),
      unitPrice: baseUnit,
      discountPct: item.isFreebie ? 100 : discPct,
      totalAmount: netLine,
      authorCut,
      houseCut,
      copyFormat: item.isFreebie ? "freebie" : copyFormat,
      isFreebie: Boolean(item.isFreebie),
      warehouseId: copyFormat === "paper" ? whId : "",
      exhibitionId: exhId,
      channel: item.isFreebie ? `${channelLabel} (هدية مجانية)` : channelLabel,
      customerName: custName,
      customerPhone: custPhone,
      paymentMethod: payMethod,
      soldBy: state.userEmail.toLowerCase(),
      soldByName: state.displayName,
      timestamp: now,
      dateISO: new Date(now).toISOString()
    });

    const newStock = copyFormat === "paper" ? Math.max(0, (Number(book.stock) || 0) - item.qty) : Number(book.stock) || 0;
    const newPaperSold = !item.isFreebie && copyFormat === "paper" ? (Number(book.copiesSold) || 0) + item.qty : Number(book.copiesSold) || 0;
    const newDigSold = !item.isFreebie && copyFormat === "digital" ? (Number(book.digitalCopiesSold) || 0) + item.qty : Number(book.digitalCopiesSold) || 0;

    await updateDoc(doc(db, "books", book.id), {
      stock: newStock,
      copiesSold: newPaperSold,
      digitalCopiesSold: newDigSold
    });

    invoiceItemsForView.push({
      title: item.isFreebie ? `${book.title} (هدية مجانية)` : book.title,
      qty: item.qty,
      unitPrice: baseUnit,
      lineTotal: netLine,
      isFreebie: item.isFreebie
    });
  }

  await logActivity(
    `إصدار فاتورة كاشير ${invoiceCode}`,
    `العميل: ${custName} | الإجمالي: ${fmtMoney(invoiceNetSum)} \vert{} عدد العناصر: ${invoiceItemsForView.length}`,
    { targetView: "view-pos", category: "كاشير ومبيعات" }
  );

  const invoicePayload = {
    invoiceCode,
    datetimeStr: fmtFullDateTime(now),
    customerName: custName,
    customerPhone: custPhone,
    paymentMethod: payMethod,
    channel: channelLabel,
    discountPct: discPct,
    netTotal: invoiceNetSum,
    items: invoiceItemsForView
  };

  state.posCart = [];
  if ($("pos-cust-name")) $("pos-cust-name").value = "";
  if ($("pos-cust-phone")) $("pos-cust-phone").value = "";
  if ($("pos-discount-input")) $("pos-discount-input").value = "0";
  renderPosCart();

  toast(`تم اعتماد البيع وإصدار الفاتورة ${invoiceCode} بنجاح`);
  openCommercialInvoiceModal(invoicePayload);
}

function renderPosRecentInvoices() {
  const box = $("pos-recent-invoices-list");
  if (!box) return;

  const groupedMap = new Map();
  state.sales.slice(0, 60).forEach((s) => {
    const code = s.invoiceCode || `#INV-${s.id.slice(0, 6).toUpperCase()}`;
    if (!groupedMap.has(code)) {
      groupedMap.set(code, {
        invoiceCode: code,
        datetimeStr: fmtFullDateTime(s.timestamp),
        customerName: s.customerName || "عميلنا العزيز",
        customerPhone: s.customerPhone || "",
        paymentMethod: s.paymentMethod || "نقدي",
        channel: s.channel || "المقر الرئيسي",
        discountPct: s.discountPct || 0,
        netTotal: 0,
        items: []
      });
    }
    const g = groupedMap.get(code);
    g.netTotal += Number(s.totalAmount) || 0;
    g.items.push({
      title: s.isFreebie || s.copyFormat === "freebie" ? `${s.bookTitle} (هدية مجانية)` : s.bookTitle,
      qty: s.qty,
      unitPrice: s.unitPrice || 0,
      lineTotal: s.totalAmount || 0,
      isFreebie: Boolean(s.isFreebie || s.copyFormat === "freebie")
    });
  });

  const recentArr = Array.from(groupedMap.values()).slice(0, 12);
  box.innerHTML = recentArr.length
    ? recentArr
        .map(
          (inv, idx) => `
        <div class="list-row clickable js-pos-recent-inv" data-idx="${idx}">
          <div>
            <span class="badge pos" dir="ltr">${esc(inv.invoiceCode)}</span>
            <strong style="margin-right:6px;">${esc(inv.customerName)}${inv.customerPhone ? `(<span dir="ltr">${esc(inv.customerPhone)}</span>)` : ""}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">
              ${inv.items.map((i) => `${esc(i.title)} ×${i.qty}`).join(" ، ")} • <span dir="ltr">${esc(inv.datetimeStr)}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <strong class="money-pos">${fmtMoney(inv.netTotal)}</strong>
            <span class="btn btn-outline" style="padding:5px 10px;font-size:11.5px;"><i class="ri-whatsapp-line"></i> الفاتورة</span>
          </div>
        </div>
      `
        )
        .join("")
    : `<p style="text-align:center;color:var(--text-muted);font-size:13px;">لا توجد فواتير مصدرة بعد.</p>`;

  box.querySelectorAll(".js-pos-recent-inv").forEach((row) => {
    row.addEventListener("click", () => {
      const inv = recentArr[Number(row.dataset.idx)];
      if (inv) openCommercialInvoiceModal(inv);
    });
  });
}

// ==========================================================================
// 21. الفاتورة التجارية الرسمية (دار صفقات كتابية) + الباركود + مشاركة واتساب
// ==========================================================================
function openCommercialInvoiceModalFromSale(saleObj) {
  const code = saleObj.invoiceCode || `#INV-${saleObj.id.slice(0, 6).toUpperCase()}`;
  const matchingSales = saleObj.invoiceCode
    ? state.sales.filter((s) => s.invoiceCode === saleObj.invoiceCode)
    : [saleObj];

  const payload = {
    invoiceCode: code,
    datetimeStr: fmtFullDateTime(saleObj.timestamp),
    customerName: saleObj.customerName || "عميلنا العزيز",
    customerPhone: saleObj.customerPhone || "",
    paymentMethod: saleObj.paymentMethod || "نقدي",
    channel: saleObj.channel || "دار صفقات كتابية",
    discountPct: saleObj.discountPct || 0,
    netTotal: matchingSales.reduce((sum, x) => sum + (Number(x.totalAmount) || 0), 0),
    items: matchingSales.map((x) => ({
      title: x.isFreebie || x.copyFormat === "freebie" ? `${x.bookTitle} (هدية مجانية)` : x.bookTitle,
      qty: x.qty,
      unitPrice: x.unitPrice || 0,
      lineTotal: x.totalAmount || 0,
      isFreebie: Boolean(x.isFreebie || x.copyFormat === "freebie")
    }))
  };
  openCommercialInvoiceModal(payload);
}

function openCommercialInvoiceModal(invData) {
  state.currentInvoiceObj = invData;

  if ($("inv-view-code")) $("inv-view-code").textContent = invData.invoiceCode;
  if ($("inv-view-datetime")) $("inv-view-datetime").textContent = invData.datetimeStr;
  if ($("inv-view-cust-name")) $("inv-view-cust-name").textContent = invData.customerName || "عميلنا العزيز";
  if ($("inv-view-cust-phone")) $("inv-view-cust-phone").textContent = invData.customerPhone || "—";
  if ($("inv-view-pay-method")) $("inv-view-pay-method").textContent = invData.paymentMethod || "نقدي";
  if ($("inv-view-channel")) $("inv-view-channel").textContent = invData.channel || "دار صفقات كتابية";
  if ($("inv-view-discount")) $("inv-view-discount").textContent = `${fmtNum(invData.discountPct || 0)}%`;
  if ($("inv-view-net-total")) $("inv-view-net-total").textContent = fmtMoney(invData.netTotal);

  const tbody = $("inv-view-items-tbody");
  if (tbody) {
    tbody.innerHTML = (invData.items || [])
      .map(
        (it) => `
        <tr>
          <td><strong>${esc(it.title)}</strong></td>
          <td>${fmtNum(it.qty)}</td>
          <td>${it.isFreebie ? "مجاني" : fmtMoney(it.unitPrice)}</td>
          <td><strong>${it.isFreebie ? "0 ج.م" : fmtMoney(it.lineTotal)}</strong></td>
        </tr>
      `
      )
      .join("");
  }

  const qrBox = $("inv-view-qrcode-box");
  if (qrBox) {
    qrBox.innerHTML = "";
    try {
      if (typeof QRCode !== "undefined") {
        new QRCode(qrBox, {
          text: invData.invoiceCode,
          width: 68,
          height: 68,
          colorDark: "#09090b",
          colorLight: "#ffffff"
        });
      } else {
        qrBox.innerHTML = `<span style="font-size:10px;font-family:monospace;font-weight:900;">${esc(invData.invoiceCode)}</span>`;
      }
    } catch (e) {
      qrBox.innerHTML = `<span style="font-size:10px;font-family:monospace;font-weight:900;">${esc(invData.invoiceCode)}</span>`;
    }
  }

  openModal("modal-invoice-preview");
}

function buildInvoiceWhatsappText(inv) {
  const itemsLines = (inv.items || [])
    .map((it) => `• ${it.title} (الكمية: ${it.qty}) —${it.isFreebie ? "هدية مجانية" : fmtMoney(it.lineTotal)}`)
    .join("\n");

  return [
    `مرحباً بك أ. ${inv.customerName || "عميلنا العزيز"} 🌟`,
    `نشكرك على اقتنائك من *دار صفقات كتابية للنشر والتوزيع* 📚`,
    `────────────────────`,
    `🧾 *فاتورة مبيعات معتمدة رقم:* ${inv.invoiceCode}`,
    `📅 *التاريخ والوقت:* ${inv.datetimeStr}`,
    `💳 *طريقة الدفع:* ${inv.paymentMethod}`,
    `────────────────────`,
    `*تفاصيل الإصدارات:*`,
    itemsLines,
    `────────────────────`,
    `💰 *صافي الإجمالي المدفوع:* ${fmtMoney(inv.netTotal)}`,
    `✅ *رمز التحقق الإلكتروني:* ${inv.invoiceCode}`,
    `قراءة ممتعة ونعتز بثقتكم بنا 🤍`
  ].join("\n");
}

function sanitizePhoneForWa(rawPhone) {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("01") && digits.length === 11) {
    digits = "2" + digits;
  } else if (digits.startsWith("05") && digits.length === 10) {
    digits = "966" + digits.slice(1);
  } else if (digits.startsWith("7") && digits.length === 9) {
    digits = "967" + digits;
  }
  return digits;
}

async function captureInvoiceAsBlob() {
  const area = $("commercial-invoice-capture-area");
  if (!area || typeof html2canvas === "undefined") return null;
  const canvas = await html2canvas(area, {
    scale: 2.2,
    backgroundColor: "#ffffff",
    useCORS: true
  });
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}

async function shareCommercialInvoiceWhatsapp(btnEl) {
  const inv = state.currentInvoiceObj;
  if (!inv) return;

  await withButtonLock(btnEl, async () => {
    const waText = buildInvoiceWhatsappText(inv);
    const cleanPhone = sanitizePhoneForWa(inv.customerPhone);
    const blob = await captureInvoiceAsBlob();

    if (blob && navigator.canShare) {
      const file = new File([blob], `Safaqat_Invoice_${inv.invoiceCode.replace("#", "")}.png`, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: `فاتورة دار صفقات كتابية ${inv.invoiceCode}`,
            text: waText,
            files: [file]
          });
          return;
        } catch (err) {
          console.warn("Web Share fallback to direct WhatsApp link:", err);
        }
      }
    }

    if (blob) {
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          toast("تم نسخ صورة الفاتورة تلقائياً! الصقها داخل محادثة واتساب", "ri-clipboard-line");
        }
      } catch (e) {}

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Safaqat_${inv.invoiceCode.replace("#", "")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;
    window.open(waUrl, "_blank");
  });
}

async function downloadCommercialInvoiceImage(btnEl) {
  const inv = state.currentInvoiceObj;
  if (!inv) return;
  await withButtonLock(btnEl, async () => {
    const blob = await captureInvoiceAsBlob();
    if (!blob) {
      toast("تعذر توليد صورة الفاتورة", "ri-error-warning-line");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Safaqat_Invoice_${inv.invoiceCode.replace("#", "")}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast("تم حفظ صورة الفاتورة الرسمية على جهازك");
  });
}

// ==========================================================================
// 22. الماسح الليزري بالكاميرا للتحقق الفوري من أصالة الفواتير (Laser QR Scanner)
// ==========================================================================
async function openLaserScannerModal() {
  openModal("modal-scanner");
  if ($("scanner-verification-result")) $("scanner-verification-result").style.display = "none";

  let readerEl = document.getElementById("qr-reader-region") || document.getElementById("qr-reader- region");
  if (readerEl) {
    readerEl.id = "qr-reader-region";
  }

  if (typeof Html5Qrcode === "undefined" || !readerEl) return;

  try {
    if (state.qrScannerInstance && state.scannerRunning) {
      await state.qrScannerInstance.stop();
      state.scannerRunning = false;
    }
    state.qrScannerInstance = new Html5Qrcode("qr-reader-region");
    state.scannerRunning = true;
    await state.qrScannerInstance.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        verifyInvoiceByCode(decodedText);
      },
      () => {}
    );
  } catch (err) {
    console.warn("Camera access note:", err);
  }
}

async function closeLaserScannerModal() {
  if (state.qrScannerInstance && state.scannerRunning) {
    try {
      await state.qrScannerInstance.stop();
    } catch (e) {}
    state.scannerRunning = false;
  }
  closeModal("modal-scanner");
}

function verifyInvoiceByCode(rawCode) {
  const clean = (rawCode || "").trim().toUpperCase();
  if (!clean) {
    toast("أدخل رقم الفاتورة أو امسح الباركود أولاً", "ri-error-warning-line");
    return;
  }

  const normalized = clean.startsWith("#") ? clean : `#${clean}`;
  const matchedSales = state.sales.filter(
    (s) =>
      (s.invoiceCode || "").toUpperCase() === normalized ||
      (s.invoiceCode || "").toUpperCase() === clean ||
      `#INV-${s.id.slice(0, 6).toUpperCase()}` === normalized
  );

  const resBox = $("scanner-verification-result");
  if (!resBox) return;
  resBox.style.display = "block";

  if (matchedSales.length > 0) {
    const first = matchedSales[0];
    const totalSum = matchedSales.reduce((s, x) => s + (Number(x.totalAmount) || 0), 0);
    resBox.style.background = "var(--pos-bg)";
    resBox.style.border = "1.5px solid var(--pos-border)";
    resBox.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span class="badge pos" style="font-size:13px;"><i class="ri-verified-badge-fill"></i> فاتورة أصلية ومعتمدة في النظام ✅</span>
        <strong dir="ltr" style="font-family:monospace;">${esc(first.invoiceCode || normalized)}</strong>
      </div>
      <div style="font-size:12.5px;line-height:1.7;">
        <div><strong>العميل / المشتري:</strong> ${esc(first.customerName \vert{}\vert{} "عميل الدار")} (${esc(first.customerPhone || "—")})</div>
        <div><strong>التاريخ والوقت الدقيق:</strong> <span dir="ltr">${esc(fmtFullDateTime(first.timestamp))}</span></div>
        <div><strong>الكتب المصدرة:</strong> ${matchedSales.map((m) => `${esc(m.bookTitle)} (×${m.qty})`).join(" + ")}</div>
        <div><strong>إجمالي المدفوع:</strong> <strong class="money-pos">${fmtMoney(totalSum)}</strong></div>
        <div><strong>صدرت بواسطة:</strong> ${esc(first.soldByName || first.soldBy)}</div>
      </div>
    `;
  } else {
    resBox.style.background = "var(--neg-bg)";
    resBox.style.border = "1.5px solid var(--neg-border)";
    resBox.innerHTML = `
      <div style="color:var(--neg);font-weight:900;font-size:14px;margin-bottom:4px;">
        <i class="ri-close-circle-fill"></i> تنبيه: هذه الفاتورة (${esc(rawCode)}) غير مسجلة في قاعدة بيانات دار صفقات كتابية!
      </div>
      <p style="font-size:12px;color:var(--text-secondary);">يرجى التأكد من صحة الرمز أو رقم الفاتورة.</p>
    `;
  }
}

// ==========================================================================
// 23. نافذة البيع السريع المرن (ورقي / إلكتروني / إهداء + هدية مرافقة + فاتورة)
// ==========================================================================
function openQuickSellModal(bookId, exhId = "", presetFormat = "paper") {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;

  if ($("sell-confirm-book-id")) $("sell-confirm-book-id").value = book.id;
  if ($("sell-confirm-exh-id")) $("sell-confirm-exh-id").value = exhId || "";
  if ($("sell-confirm-book-title")) $("sell-confirm-book-title").textContent = `${book.title} —${book.authorName || ""}`;
  if ($("sell-confirm-format")) $("sell-confirm-format").value = presetFormat;
  if ($("sell-confirm-qty")) $("sell-confirm-qty").value = "1";
  if ($("sell-confirm-disc")) $("sell-confirm-disc").value = "0";
  if ($("sell-add-gift-check")) $("sell-add-gift-check").checked = false;
  if ($("sell-gift-details-wrap")) $("sell-gift-details-wrap").style.display = "none";
  if ($("sell-issue-invoice-check")) $("sell-issue-invoice-check").checked = false;
  if ($("sell-customer-fields-wrap")) $("sell-customer-fields-wrap").style.display = "none";

  updateQuickSellPreview();
  openModal("modal-sell");
}

function updateQuickSellPreview() {
  const bookId = $("sell-confirm-book-id")?.value;
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;

  const format = $("sell-confirm-format")?.value || "paper";
  const qty = Math.max(1, Number($("sell-confirm-qty")?.value) || 1);
  const disc = Math.min(90, Math.max(0, Number($("sell-confirm-disc")?.value) || 0));
  const stock = Number(book.stock) || 0;

  const banner = $("sell-stock-status-banner");
  const whWrap = $("sell-wh-field-wrap");
  const discWrap = $("sell-disc-wrap");

  if (format === "digital") {
    if (whWrap) whWrap.style.display = "none";
    if (discWrap) discWrap.style.display = "block";
    if (banner) {
      banner.style.background = "var(--pos-bg)";
      banner.style.color = "var(--pos)";
      banner.textContent = `نسخة إلكترونية رقمية: لا تُخصم من المخزون الورقي وتُحسب نسبتها للمؤلف (${book.royaltyRate}%).`;
    }
  } else if (format === "freebie") {
    if (whWrap) whWrap.style.display = "block";
    if (discWrap) discWrap.style.display = "none";
    if (banner) {
      banner.style.background = "var(--bg-subtle)";
      banner.style.color = "var(--text-main)";
      banner.textContent = `صرف إهداء مجاني: يُخصم (${qty}) من المستودع (المتوفر: ${stock}) ولا يُحسب عليه أي مبالغ للمؤلف.`;
    }
  } else {
    if (whWrap) whWrap.style.display = "block";
    if (discWrap) discWrap.style.display = "block";
    if (banner) {
      banner.style.background = stock >= qty ? "var(--pos-bg)" : "var(--neg-bg)";
      banner.style.color = stock >= qty ? "var(--pos)" : "var(--neg)";
      banner.textContent = `الرصيد الورقي المتاح بالمستودع: ${fmtNum(stock)} نسخة`;
    }
  }

  const unitPrice = format === "freebie" ? 0 : format === "digital" ? Number(book.digitalPrice || book.price) || 0 : Number(book.price) || 0;
  const net = format === "freebie" ? 0 : Math.round(unitPrice * qty * (1 - disc / 100) * 100) / 100;
  if ($("sell-confirm-total")) $("sell-confirm-total").textContent = fmtMoney(net);
}

// ==========================================================================
// 24. بوابة المؤلف المعزولة 100% + صفحة الكتاب المستقلة داخل بوابة المؤلف
// ==========================================================================
function renderAuthorPortalView() {
  const author = state.authorDoc || state.authors.find((a) => a.email?.toLowerCase() === state.userEmail);
  if (!author) return;

  const fin = computeAuthorFinancials(author.id);

  if ($("portal-author-name")) $("portal-author-name").textContent = `مرحباً بك، أ. ${author.name}`;
  if ($("portal-author-avatar-box")) {
    $("portal-author-avatar-box").innerHTML = `<div class="user-initials-circle" style="width:52px;height:52px;font-size:20px;">${renderAvatarHtml(author.name, author.avatarUrl)}</div>`;
  }

  if ($("portal-stat-copies")) $("portal-stat-copies").textContent = `${fmtNum(fin.paperCopies)} نسخة`;
  if ($("portal-stat-digital")) $("portal-stat-digital").textContent = `${fmtNum(fin.digitalCopies)} نسخة`;
  if ($("portal-stat-digital-rev")) $("portal-stat-digital-rev").textContent = `عائدك الرقمي: ${fmtMoney(fin.digitalEarned)}`;
  if ($("portal-stat-earned")) $("portal-stat-earned").textContent = fmtMoney(fin.totalEarned);
  if ($("portal-stat-paid")) $("portal-stat-paid").textContent = `تم تحويل: ${fmtMoney(fin.totalPaid)}`;
  if ($("portal-stat-balance")) $("portal-stat-balance").textContent = fmtMoney(fin.balance);

  if ($("portal-bank-method") && !$("portal-bank-method").matches(":focus")) $("portal-bank-method").value = author.bankMethod || "";
  if ($("portal-bank-name") && !$("portal-bank-name").matches(":focus")) $("portal-bank-name").value = author.bankName || "";
  if ($("portal-bank-holder") && !$("portal-bank-holder").matches(":focus")) $("portal-bank-holder").value = author.bankHolder || author.name || "";
  if ($("portal-bank-account") && !$("portal-bank-account").matches(":focus")) $("portal-bank-account").value = author.bankAccount || "";
  if ($("portal-bank-country") && !$("portal-bank-country").matches(":focus")) $("portal-bank-country").value = author.bankCountry || "";
  if ($("portal-bank-notes") && !$("portal-bank-notes").matches(":focus")) $("portal-bank-notes").value = author.bankNotes || "";

  const myBooks = state.books.filter((b) => b.authorId === author.id && b.authorAccessLevel !== "hidden");

  const myExhSet = new Map();
  myBooks.forEach((b) => {
    getBookExhibitions(b.id).forEach((ex) => {
      if (!myExhSet.has(ex.id)) myExhSet.set(ex.id, { ex, titles: [] });
      myExhSet.get(ex.id).titles.push(b.title);
    });
  });

  const exhBanner = $("portal-exhibitions-banner");
  if (exhBanner) {
    if (myExhSet.size > 0) {
      exhBanner.innerHTML = Array.from(myExhSet.values())
        .map(
          ({ ex, titles }) => `
          <div class="list-row" style="background:var(--bg-invert);color:var(--text-invert);border:none;">
            <div>
              <span class="badge pos"><i class="ri-compass-discover-line"></i> مشاركة نشطة في معرض</span>
              <h4 style="font-size:15px;font-weight:800;margin-top:4px;">مؤلفاتك تشارك حالياً في: «${esc(ex.name)}» (${esc(ex.location || "")})</h4>
              <p style="font-size:12.5px;opacity:0.85;">العناوين المشاركة: ${titles.map((t) => `«${esc(t)}»`).join(" ، ")}</p>
            </div>
          </div>
        `
        )
        .join("");
    } else {
      exhBanner.innerHTML = "";
    }
  }

  const showcase = $("portal-books-showcase");
  if (showcase) {
    showcase.innerHTML = myBooks.length
      ? myBooks
          .map((b) => {
            const bFin = computeBookFinancials(b.id);
            const cSt = getContractStatusInfo(b);
            const exhs = getBookExhibitions(b.id);
            const access = b.authorAccessLevel || "full_download";
            return `
              <div class="book-card clickable js-portal-open-book" data-id="${esc(b.id)}" style="cursor:pointer;">
                <div class="book-cover-wrap">
                  <div class="cover-badges">
                    <span class="badge ${cSt.badgeClass}">${esc(cSt.label)}</span>
                  </div>
                  ${
                    b.coverUrl
                      ? `<img src="${esc(b.coverUrl)}" alt="${esc(b.title)}" />`
                      : `<div class="book-typo-cover"><i class="ri-book-2-line"></i><h4>${esc(b.title)}</h4></div>`
                  }
                </div>
                <div class="book-body">
                  <div class="book-title-link">${esc(b.title)}</div>${exhs.map((x) => `<div class="book-exh-tag"><i class="ri-compass-discover-line"></i><span>مشارك في: ${esc(x.name)}</span></div>`).join("")}
                  <div class="book-mini-stats">
                    <div><span>مبيعات ورقية</span><strong>${fmtNum(bFin.paperSold)} نسخة</strong></div>
                    <div><span>مبيعات إلكترونية</span><strong>${fmtNum(bFin.digitalSold)} نسخة</strong></div>
                    <div><span>نسبتك بالعقد</span><strong>${fmtNum(b.royaltyRate)}%</strong></div>
                    <div><span>صافي عائدك</span><strong class="money-pos">${fmtMoney(bFin.authorCutTotal)}</strong></div>
                  </div>
                  <div style="display:flex;gap:6px;margin-top:8px;">
                    <button type="button" class="btn btn-primary" style="flex:1;padding:6px 10px;font-size:11.5px;">
                      <i class="ri-file-list-3-line"></i><span>صفحة وكشف الكتاب</span>
                    </button>
                    ${
                      access !== "stats_only" && b.driveUrl
                        ? `<button type="button" class="btn btn-outline js-portal-book-pdf" data-title="عقد: ${esc(b.title)}" data-url="${esc(b.driveUrl)}" data-dl="${access === "full_download" ? "1" : "0"}" style="padding:6px 10px;font-size:11.5px;"><i class="ri-file-pdf-2-line"></i></button>`
                        : ""
                    }
                  </div>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد مؤلفات مضافة في بوابتك حالياً.</div>`;

    showcase.querySelectorAll(".js-portal-open-book").forEach((card) => {
      card.addEventListener("click", () => {
        state.portalSelectedBookId = card.dataset.id;
        navigateTo("view-author-book-detail");
      });
    });
    showcase.querySelectorAll(".js-portal-book-pdf").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openPdfViewer(btn.dataset.title, btn.dataset.url, btn.dataset.dl === "1");
      });
    });
  }

  const pList = $("portal-payouts-list");
  if (pList) {
    pList.innerHTML = fin.payouts.length
      ? fin.payouts
          .map(
            (p) => `
          <div class="list-row">
            <div>
              <span class="badge pos">تم التحويل</span>
              <strong style="margin-right:6px;">${fmtMoney(p.amount)} عبر ${esc(p.method)}</strong>
              <div style="font-size:12px;color:var(--text-secondary);">${esc(p.notes \vert{}\vert{} "")} • ${esc(fmtFullDateTime(p.timestamp))}</div>
            </div>
            ${
              p.receiptUrl
                ? `<a href="${esc(p.receiptUrl)}" target="_blank" class="btn btn-outline" style="padding:5px 10px;font-size:12px;"><i class="ri-image-line"></i> إيصال التحويل</a>`
                : ""
            }
          </div>
        `
          )
          .join("")
      : `<div class="surface-card" style="text-align:center;color:var(--text-muted);">لا توجد حوالات سابقة مسجلة بعد.</div>`;
  }
}

function renderAuthorPortalBookDetailView(bookId) {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;

  const fin = computeBookFinancials(book.id);
  const cSt = getContractStatusInfo(book);
  const exhs = getBookExhibitions(book.id);
  const access = book.authorAccessLevel || "full_download";

  if ($("portal-book-detail-header")) {
    $("portal-book-detail-header").innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
        <div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
            <span class="badge ${cSt.badgeClass}">${esc(cSt.label)}</span>${exhs.map((x) => `<span class="badge invert"><i class="ri-compass-discover-line"></i> مشارك في: ${esc(x.name)}</span>`).join("")}
          </div>
          <h2 style="font-size:20px;font-weight:900;">${esc(book.title)}</h2>
          <p style="font-size:13px;color:var(--text-secondary);">كشف حساب وتقرير مبيعات خاص بهذا الكتاب</p>
        </div>
        <div style="display:flex;gap:6px;">
          ${
            access !== "stats_only" && book.driveUrl
              ? `<button type="button" id="btn-pbook-view-contract" class="btn btn-outline"><i class="ri-file-pdf-2-line"></i> وثيقة العقد</button>`
              : ""
          }
        </div>
      </div>
    `;
    if ($("btn-pbook-view-contract")) {
      $("btn-pbook-view-contract").onclick = () => openPdfViewer(`وثيقة عقد: ${book.title}`, book.driveUrl, access === "full_download");
    }
  }

  if ($("pbook-paper-sold")) $("pbook-paper-sold").textContent = `${fmtNum(fin.paperSold)} نسخة`;
  if ($("pbook-paper-price")) $("pbook-paper-price").textContent = `سعر النسخة: ${fmtMoney(book.price)}`;
  if ($("pbook-dig-sold")) $("pbook-dig-sold").textContent = `${fmtNum(fin.digitalSold)} نسخة`;
  if ($("pbook-dig-price")) $("pbook-dig-price").textContent = `سعر الإلكتروني: ${fmtMoney(book.digitalPrice || book.price)}`;
  if ($("pbook-royalty")) $("pbook-royalty").textContent = `${fmtNum(book.royaltyRate)}%`;
  if ($("pbook-contract-status")) $("pbook-contract-status").textContent = cSt.label;
  if ($("pbook-total-earned")) $("pbook-total-earned").textContent = fmtMoney(fin.authorCutTotal);

  const salesBox = $("portal-book-sales-breakdown");
  if (salesBox) {
    const mySales = state.sales.filter((s) => s.bookId === book.id && !s.isFreebie && s.copyFormat !== "freebie");
    salesBox.innerHTML = mySales.length
      ? mySales
          .map(
            (s) => `
          <div class="list-row">
            <div>
              <span class="badge ${s.copyFormat === "digital" ? "pos" : "invert"}">${s.copyFormat === "digital" ? "مبيعات إلكترونية" : "مبيعات ورقية"}</span>
              <strong style="margin-right:6px;">الكمية المباعة: ${fmtNum(s.qty)} نسخة (${esc(s.channel || "مبيعات الدار")})</strong>
              <div style="font-size:12px;color:var(--text-secondary);" dir="ltr">${esc(fmtFullDateTime(s.timestamp))}</div>
            </div>
            <strong class="money-pos">عائدك: + ${fmtMoney(s.authorCut)}</strong>
          </div>
        `
          )
          .join("")
      : `<p style="color:var(--text-muted);font-size:13px;">لا توجد عمليات بيع مسجلة لهذا الكتاب بعد.</p>`;
  }
}

// ==========================================================================
// 25. دوال فتح وتعبئة النماذج، الحاسبة الذكية، الكشوفات المرنة، والنسخ الاحتياطي
// ==========================================================================
function openAuthorFormForNew() {
  if ($("form-author-title")) $("form-author-title").textContent = "إنشاء ملف مؤلف جديد";
  if ($("author-id-field")) $("author-id-field").value = "";
  $("form-author")?.reset();
  navigateTo("view-form-author");
}

function openAuthorFormForEdit(author) {
  if ($("form-author-title")) $("form-author-title").textContent = `تعديل ملف المؤلف: ${author.name}`;
  if ($("author-id-field")) $("author-id-field").value = author.id;
  if ($("author-name-field")) $("author-name-field").value = author.name || "";
  if ($("author-email-field")) $("author-email-field").value = author.email || "";
  if ($("author-phone-field")) $("author-phone-field").value = author.phone || "";
  if ($("author-bio-field")) $("author-bio-field").value = author.bio || "";
  if ($("author-bank-name-field")) $("author-bank-name-field").value = author.bankName || "";
  if ($("author-bank-acc-field")) $("author-bank-acc-field").value = author.bankAccount || "";
  if ($("author-bank-holder-field")) $("author-bank-holder-field").value = author.bankHolder || "";
  if ($("author-bank-country-field")) $("author-bank-country-field").value = author.bankCountry || "";
  if ($("author-restricted-check")) $("author-restricted-check").checked = Boolean(author.restricted);
  navigateTo("view-form-author");
}

function openBookFormForNew(preselectedAuthorId = "") {
  if ($("form-book-title")) $("form-book-title").textContent = "توثيق عقد كتاب جديد";
  if ($("book-id-field")) $("book-id-field").value = "";
  $("form-book")?.reset();
  if ($("book-date-field")) $("book-date-field").value = todayISO();
  if (preselectedAuthorId && $("book-author-select")) {
    $("book-author-select").value = preselectedAuthorId;
  }
  if ($("book-dup-warning")) $("book-dup-warning").classList.remove("show");
  navigateTo("view-form-book");
}

function openBookFormForEdit(book) {
  if ($("form-book-title")) $("form-book-title").textContent = `تعديل عقد وبيانات كتاب: ${book.title}`;
  if ($("book-id-field")) $("book-id-field").value = book.id;
  if ($("book-title-field")) $("book-title-field").value = book.title || "";
  if ($("book-author-select")) $("book-author-select").value = book.authorId || "";
  if ($("book-price-field")) $("book-price-field").value = book.price || 0;
  if ($("book-digital-price-field")) $("book-digital-price-field").value = book.digitalPrice || "";
  if ($("book-royalty-field")) $("book-royalty-field").value = book.royaltyRate ?? 20;
  if ($("book-months-field")) $("book-months-field").value = book.contractMonths || 24;
  if ($("book-date-field")) $("book-date-field").value = book.contractDate || todayISO();
  if ($("book-fav-check")) $("book-fav-check").checked = Boolean(book.favorite);
  if ($("book-stock-field")) $("book-stock-field").value = book.stock ?? 0;
  if ($("book-edition-field")) $("book-edition-field").value = book.editionLabel || "";
  if ($("book-isbn-field")) $("book-isbn-field").value = book.isbn || "";
  if ($("book-cat-field")) $("book-cat-field").value = book.category || "";
  if ($("book-drive-field")) $("book-drive-field").value = book.driveUrl || "";
  if ($("book-print-drive-field")) $("book-print-drive-field").value = book.printDriveUrl || "";
  if ($("book-author-access-select")) $("book-author-access-select").value = book.authorAccessLevel || "full_download";
  if ($("book-notes-field")) $("book-notes-field").value = book.notes || "";
  navigateTo("view-form-book");
}

function renderBooksMultiChecklist(containerId, filterQuery = "", selectedIds = []) {
  const box = $(containerId);
  if (!box) return;
  const q = filterQuery.trim().toLowerCase();
  const selSet = new Set(selectedIds);

  const list = state.books.filter((b) => !q || (b.title || "").toLowerCase().includes(q) || (b.authorName || "").toLowerCase().includes(q));
  box.innerHTML = list
    .map(
      (b) => `
      <label class="check-tile">
        <input type="checkbox" value="${esc(b.id)}" ${selSet.has(b.id) ? "checked" : ""} />
        <span>${esc(b.title)} <small style="color:var(--text-muted);">(${esc(b.authorName || "")})</small></span>
      </label>
    `
    )
    .join("");
}

function openExhibitionFormForNew() {
  if ($("form-exh-heading")) $("form-exh-heading").textContent = "إنشاء معرض أو فعالية جديدة";
  if ($("exh-id-field")) $("exh-id-field").value = "";
  $("form-exhibition")?.reset();
  if ($("exh-start-date")) $("exh-start-date").value = todayISO();
  if ($("exh-end-date")) $("exh-end-date").value = todayISO();
  renderBooksMultiChecklist("exh-books-checklist", "", []);
  navigateTo("view-form-exhibition");
}

function openExhibitionFormForEdit(exh) {
  if ($("form-exh-heading")) $("form-exh-heading").textContent = `تعديل المعرض: ${exh.name}`;
  if ($("exh-id-field")) $("exh-id-field").value = exh.id;
  if ($("exh-name-field")) $("exh-name-field").value = exh.name || "";
  if ($("exh-location-field")) $("exh-location-field").value = exh.location || "";
  if ($("exh-prep-date")) $("exh-prep-date").value = exh.prepDate || "";
  if ($("exh-start-date")) $("exh-start-date").value = exh.startDate || "";
  if ($("exh-end-date")) $("exh-end-date").value = exh.endDate || "";
  if ($("exh-budget-field")) $("exh-budget-field").value = exh.budget || 0;
  if ($("exh-notes-field")) $("exh-notes-field").value = exh.notes || "";
  renderBooksMultiChecklist("exh-books-checklist", "", exh.bookIds || []);
  navigateTo("view-form-exhibition");
}

function openStaffFormForEdit(staffId) {
  const st = state.staff.find((s) => s.id === staffId);
  if (!st) return;
  if ($("form-staff-title")) $("form-staff-title").textContent = `تعديل صلاحيات الموظف: ${st.name}`;
  if ($("staff-id-field")) $("staff-id-field").value = st.id;
  if ($("staff-name-field")) $("staff-name-field").value = st.name || "";
  if ($("staff-email-field")) $("staff-email-field").value = st.email || "";
  if ($("staff-job-field")) $("staff-job-field").value = st.jobTitle || "";
  if ($("staff-restricted-check")) $("staff-restricted-check").checked = Boolean(st.restricted);

  const p = st.permissions || {};
  if ($("perm-pos")) $("perm-pos").checked = p.pos !== false;
  if ($("perm-sell")) $("perm-sell").checked = Boolean(p.sell);
  if ($("perm-add-book")) $("perm-add-book").checked = Boolean(p.addBook);
  if ($("perm-delete-book")) $("perm-delete-book").checked = Boolean(p.deleteBook);
  if ($("perm-authors")) $("perm-authors").checked = Boolean(p.authors);
  if ($("perm-payouts")) $("perm-payouts").checked = Boolean(p.payouts);
  if ($("perm-expenses")) $("perm-expenses").checked = Boolean(p.expenses);
  if ($("perm-finance-view")) $("perm-finance-view").checked = Boolean(p.financeView);
  if ($("perm-reports")) $("perm-reports").checked = Boolean(p.reports);

  navigateTo("view-form-staff");
}

function updateCalculatorBreakdown() {
  const box = $("calc-book-breakdown");
  if (!box) return;
  const bookId = $("calc-book-select")?.value;
  const book = state.books.find((b) => b.id === bookId);
  if (!book) {
    box.innerHTML = `<div style="grid-column:1/-1;font-size:12px;color:var(--text-muted);text-align:center;">اختر كتاباً من الأعلى لحساب الأرباح والنسب تلقائياً</div>`;
    return;
  }
  const cType = $("calc-copy-type")?.value || "paper";
  const qty = Math.max(1, Number($("calc-book-qty")?.value) || 1);
  const disc = Math.min(90, Math.max(0, Number($("calc-book-disc")?.value) || 0));
  const unitPrice = cType === "digital" ? Number(book.digitalPrice || book.price) || 0 : Number(book.price) || 0;
  const gross = unitPrice * qty;
  const net = Math.round(gross * (1 - disc / 100) * 100) / 100;
  const authorCut = Math.round(net * ((Number(book.royaltyRate) || 0) / 100) * 100) / 100;
  const houseCut = Math.round((net - authorCut) * 100) / 100;

  box.innerHTML = `
    <div class="calc-res-box"><span>الإجمالي قبل الخصم</span><strong>${fmtMoney(gross)}</strong></div>
    <div class="calc-res-box"><span>صافي التحصيل (${100 - disc}%)</span><strong class="money-pos">${fmtMoney(net)}</strong></div>
    <div class="calc-res-box"><span>ربح المؤلف (${book.royaltyRate}\%)</span><strong>${fmtMoney(authorCut)}</strong></div>
    <div class="calc-res-box"><span>صافي ربح الدار</span><strong class="money-pos">${fmtMoney(houseCut)}</strong></div>
  `;
}

function updateAuthorReportTemplate() {
  const authorId = $("report-author-id")?.value || state.selectedAuthorId;
  const author = state.authors.find((a) => a.id === authorId);
  if (!author) return;
  const fin = computeAuthorFinancials(author.id);
  const rType = $("report-type-select")?.value || "welcome";
  const area = $("report-text-area");
  if (!area) return;

  if (rType === "welcome") {
    area.value = [
      `أهلاً ومرحباً بك أ. ${author.name} في عائلة «دار صفقات كتابية للنشر والتوزيع» 📚`,
      ``,
      `يسعدنا إبلاغك بتفعيل حسابك الرسمي على بوابة المؤلف الإلكترونية الخاصة بنا.`,
      `يمكنك الدخول في أي وقت لمتابعة مبيعات مؤلفاتك (الورقية والإلكترونية) لحظة بلحظة، واستعراض عقودك ومحفظتك المالية عبر الرابط التالي:`,
      `${window.location.origin}`,
      ``,
      `طريقة الدخول: اضغط على (الدخول عبر Google) باستخدام بريدك المعتمد: ${author.email}`,
      `نتمنى لك رحلة نشر مثمرة وناجحة معنا!`
    ].join("\n");
  } else if (rType === "bank_fix") {
    area.value = [
      `تحية طيبة أ. ${author.name}،`,
      `نرجو منك التكرم بالدخول إلى بوابتك الخاصة في نظام دار صفقات كتابية ومراجعة أو استكمال (بيانات الحساب البنكي وطريقة التحويل)، وذلك ليتسنى للإدارة المالية تحويل مستحقاتك بكل سلاسة.`,
      `رابط البوابة: ${window.location.origin}`
    ].join("\n");
  } else {
    area.value = [
      `التقرير المالي الرسمي للمؤلف: أ. ${author.name}`,
      `صادر عن: دار صفقات كتابية للنشر والتوزيع (${todayISO()})`,
      `────────────────────────`,
      `• عدد المؤلفات المسجلة: ${fin.booksCount} كتاب`,
      `• إجمالي النسخ الورقية المباعة: ${fin.paperCopies} نسخة`,
      `• إجمالي النسخ الإلكترونية المباعة: ${fin.digitalCopies} نسخة`,
      `• إجمالي الأرباح المحققة لك: ${fmtMoney(fin.totalEarned)}`,
      `• إجمالي الحوالات المسددة لك: ${fmtMoney(fin.totalPaid)}`,
      `• صافي الرصيد المتاح في محفظتك حالياً: ${fmtMoney(fin.balance)}`,
      `────────────────────────`,
      `للاطلاع على التفاصيل الكاملة لكل كتاب: ${window.location.origin}`
    ].join("\n");
  }
}

function exportFullSystemBackup() {
  const backupData = {
    exportedAt: new Date().toISOString(),
    system: "Safaqat System ERP & POS v3.1",
    books: state.books,
    authors: state.authors,
    sales: state.sales,
    payouts: state.payouts,
    expenses: state.expenses,
    warehouses: state.warehouses,
    editions: state.editions,
    libraries: state.libraries,
    libraryTransactions: state.libTx,
    exhibitions: state.exhibitions
  };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Safaqat_Full_Backup_${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast("تم تحميل النسخة الاحتياطية الكاملة للنظام بنجاح");
}

// ==========================================================================
// 26. ربط كافة الأحداث والأزرار والنماذج (Master DOM Wiring)
// ==========================================================================
function bindAllEvents() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredPwaPrompt = e;
  });

  const triggerPwaInstall = async () => {
    if (state.deferredPwaPrompt) {
      state.deferredPwaPrompt.prompt();
      await state.deferredPwaPrompt.userChoice;
      state.deferredPwaPrompt = null;
    } else {
      toast("لتثبيت النظام على هاتفك: افتح خيارات المتصفح واختر (إضافة إلى الشاشة الرئيسية / Install App)");
    }
  };
  $("btn-drawer-install-pwa")?.addEventListener("click", triggerPwaInstall);
  $("btn-portal-install-pwa")?.addEventListener("click", triggerPwaInstall);

  // تسجيل الدخول الذكي للجوال والكمبيوتر (Popup مع انتقال تلقائي لـ Redirect إذا حظر متصفح الجوال النافذة المنبثقة)
  $("btn-google-login")?.addEventListener("click", (e) =>
    withButtonLock(e.currentTarget, async () => {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        if (
          err?.code === "auth/popup-blocked" ||
          err?.code === "auth/operation-not-supported-in-this-environment" ||
          err?.code === "auth/cancelled-popup-request"
        ) {
          await signInWithRedirect(auth, googleProvider);
        } else {
          throw err;
        }
      }
    })
  );

  $("btn-profile-logout")?.addEventListener("click", () => openModal("modal-logout"));
  $("btn-portal-logout")?.addEventListener("click", () => openModal("modal-logout"));
  $("btn-confirm-logout-now")?.addEventListener("click", async () => {
    closeModal("modal-logout");
    await signOut(auth);
  });

  $("btn-confirm-exec")?.addEventListener("click", async (e) => {
    if (typeof state.confirmCallback === "function") {
      await withButtonLock(e.currentTarget, async () => {
        await state.confirmCallback();
      });
    }
    state.confirmCallback = null;
    closeModal("modal-confirm");
  });

  $$("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  $("btn-open-drawer")?.addEventListener("click", openSideDrawer);
  $("btn-close-drawer")?.addEventListener("click", closeSideDrawer);
  $("drawer-backdrop")?.addEventListener("click", closeSideDrawer);
  $("brand-home-trigger")?.addEventListener("click", () => navigateTo(state.isPosOnlyStaff ? "view-pos" : "view-dashboard"));
  $("btn-header-pos")?.addEventListener("click", () => navigateTo("view-pos"));
  $("btn-header-notif")?.addEventListener("click", () => navigateTo("view-notifications"));
  $("btn-header-profile-avatar")?.addEventListener("click", () => navigateTo("view-profile"));

  $$(".drawer-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (link.dataset.nav) navigateTo(link.dataset.nav);
    });
  });

  $$(".dock-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.dock) navigateTo(btn.dataset.dock);
    });
  });

  $$(".js-back-view").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.target || "view-dashboard"));
  });

  $("btn-hero-pos")?.addEventListener("click", () => navigateTo("view-pos"));
  $("btn-hero-books")?.addEventListener("click", () => navigateTo("view-contracts"));
  $("qtool-pos")?.addEventListener("click", () => navigateTo("view-pos"));
  $("qtool-scanner")?.addEventListener("click", openLaserScannerModal);
  $("qtool-calculator")?.addEventListener("click", () => {
    updateCalculatorBreakdown();
    openModal("modal-calculator");
  });
  $("qtool-archive")?.addEventListener("click", () => navigateTo("view-archive"));
  $("qtool-contests")?.addEventListener("click", () => navigateTo("view-contests"));
  $("qtool-statement")?.addEventListener("click", () => openModal("modal-statement-builder"));
  $("qtool-guide")?.addEventListener("click", () => navigateTo("view-guide"));
  $("qtool-backup")?.addEventListener("click", exportFullSystemBackup);
  $("qtool-theme")?.addEventListener("click", () => {
    const curr = document.documentElement.getAttribute("data-theme") || "light";
    const next = curr === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("safaqat_theme", next);
    renderSalesChart();
  });

  $("btn-dock-quick-add")?.addEventListener("click", () => $("quick-add-sheet")?.classList.add("show"));
  $("btn-close-quick-add")?.addEventListener("click", () => $("quick-add-sheet")?.classList.remove("show"));
  const bindQuickTile = (id, fn) => {
    $(id)?.addEventListener("click", () => {
      $("quick-add-sheet")?.classList.remove("show");
      fn();
    });
  };
  bindQuickTile("qadd-pos", () => navigateTo("view-pos"));
  bindQuickTile("qadd-contract", () => openBookFormForNew());
  bindQuickTile("qadd-author", () => openAuthorFormForNew());
  bindQuickTile("qadd-contest", () => navigateTo("view-form-contest"));
  bindQuickTile("qadd-edition", () => navigateTo("view-form-edition"));
  bindQuickTile("qadd-library", () => navigateTo("view-form-library"));
  bindQuickTile("qadd-exhibition", () => openExhibitionFormForNew());
  bindQuickTile("qadd-payout", () => navigateTo("view-form-payout"));
  bindQuickTile("qadd-expense", () => {
    renderBooksMultiChecklist("expense-books-checklist", "", []);
    navigateTo("view-form-expense");
  });

  $("global-smart-search")?.addEventListener("input", (e) => handleGlobalSmartSearch(e.target.value));
  $("btn-close-quick-search")?.addEventListener("click", () => {
    if ($("quick-search-panel")) $("quick-search-panel").style.display = "none";
  });

  $("btn-low-stock-goto")?.addEventListener("click", () => navigateTo("view-warehouses"));
  $("btn-expiry-radar-goto")?.addEventListener("click", () => {
    state.bookFilter = "expiring";
    navigateTo("view-contracts");
  });
  $("btn-dash-all-books")?.addEventListener("click", () => navigateTo("view-contracts"));

  $$(".js-chart-type").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.chartType = btn.dataset.type || "bar";
      $$(".js-chart-type").forEach((b) => {
        b.className = b === btn ? "btn btn-primary js-chart-type" : "btn btn-outline js-chart-type";
      });
      renderSalesChart();
    });
  });

  $("pos-book-search-input")?.addEventListener("input", renderPosView);
  $("pos-copy-format")?.addEventListener("change", renderPosCart);
  $("pos-discount-input")?.addEventListener("input", renderPosCart);
  $("btn-pos-clear-cart")?.addEventListener("click", () => {
    state.posCart = [];
    renderPosCart();
  });
  $("btn-pos-checkout-issue")?.addEventListener("click", (e) => withButtonLock(e.currentTarget, handlePosCheckout));
  $("btn-pos-open-scanner")?.addEventListener("click", openLaserScannerModal);
  $("btn-close-scanner-modal")?.addEventListener("click", closeLaserScannerModal);
  $("btn-pos-verify-code")?.addEventListener("click", () => {
    const code = $("pos-verify-code-input")?.value || "";
    openModal("modal-scanner");
    verifyInvoiceByCode(code);
  });
  $("btn-scanner-manual-check")?.addEventListener("click", () => {
    verifyInvoiceByCode($("scanner-manual-input")?.value || "");
  });

  $("btn-inv-share-whatsapp")?.addEventListener("click", (e) => shareCommercialInvoiceWhatsapp(e.currentTarget));
  $("btn-inv-download-img")?.addEventListener("click", (e) => downloadCommercialInvoiceImage(e.currentTarget));
  $("btn-inv-print-direct")?.addEventListener("click", () => {
    $("modal-invoice-preview")?.classList.add("print-active-modal");
    window.print();
    setTimeout(() => $("modal-invoice-preview")?.classList.remove("print-active-modal"), 500);
  });

  $("books-search-input")?.addEventListener("input", renderBooksView);
  $("btn-top-add-contract")?.addEventListener("click", () => openBookFormForNew());
  $$("[data-book-filter]").forEach((pill) => {
    pill.addEventListener("click", () => {
      state.bookFilter = pill.dataset.bookFilter || "all";
      $$("[data-book-filter]").forEach((p) => p.classList.toggle("active", p === pill));
      renderBooksView();
    });
  });

  $("btn-back-from-book")?.addEventListener("click", () => navigateTo("view-contracts"));
  $("btn-book-det-sell")?.addEventListener("click", () => {
    if (state.selectedBookId) openQuickSellModal(state.selectedBookId, "", "paper");
  });
  $("btn-book-det-freebie")?.addEventListener("click", () => {
    if (state.selectedBookId) openQuickSellModal(state.selectedBookId, "", "freebie");
  });
  $("btn-book-det-edition")?.addEventListener("click", () => {
    if ($("ed-book-select") && state.selectedBookId) $("ed-book-select").value = state.selectedBookId;
    navigateTo("view-form-edition");
  });
  $("btn-book-det-statement")?.addEventListener("click", () => {
    const b = state.books.find((x) => x.id === state.selectedBookId);
    if ($("print-custom-main-title")) $("print-custom-main-title").textContent = `دار صفقات كتابية للنشر والتوزيع | كشف حساب كتاب: ${b?.title || ""}`;
    window.print();
  });
  $("btn-book-det-edit")?.addEventListener("click", () => {
    const b = state.books.find((x) => x.id === state.selectedBookId);
    if (b) openBookFormForEdit(b);
  });
  $("btn-book-det-terminate")?.addEventListener("click", () => {
    const b = state.books.find((x) => x.id === state.selectedBookId);
    if (!b) return;
    const isTerm = b.contractStatus === "terminated";
    askConfirm(
      isTerm ? "إعادة تفعيل العقد" : "فسخ / تجميد العقد",
      `هل أنت متأكد من ${isTerm ? "إعادة تفعيل" : "فسخ وتجميد"} عقد كتاب «${b.title}»؟`,
      async () => {
        await updateDoc(doc(db, "books", b.id), { contractStatus: isTerm ? "active" : "terminated" });
        await logActivity(isTerm ? "إعادة تفعيل عقد كتاب" : "فسخ عقد كتاب", `الكتاب: ${b.title}`, {
          targetView: "view-book-detail",
          targetEntityId: b.id
        });
        toast("تم تحديث حالة العقد");
      }
    );
  });
  $("btn-book-det-delete")?.addEventListener("click", () => {
    const b = state.books.find((x) => x.id === state.selectedBookId);
    if (!b) return;
    askConfirm("حذف الكتاب نهائياً", `هل أنت متأكد من حذف كتاب «${b.title}» من النظام؟`, async () => {
      await deleteDoc(doc(db, "books", b.id));
      await logActivity("حذف كتاب", `تم حذف كتاب: ${b.title}`);
      toast("تم حذف الكتاب");
      navigateTo("view-contracts");
    });
  });

  $("btn-bdet-save-access")?.addEventListener("click", (e) =>
    withButtonLock(e.currentTarget, async () => {
      if (!state.selectedBookId) return;
      const newLevel = $("bdet-quick-access-select")?.value || "full_download";
      await updateDoc(doc(db, "books", state.selectedBookId), { authorAccessLevel: newLevel });
      await logActivity("تحديث صلاحية المؤلف على كتاب", `المستوى الجديد: ${newLevel}`, {
        targetView: "view-book-detail",
        targetEntityId: state.selectedBookId
      });
      toast("تم تحديث صلاحية المؤلف على الكتاب فوراً");
    })
  );

  ["sell-confirm-format", "sell-confirm-qty", "sell-confirm-disc"].forEach((id) => {
    $(id)?.addEventListener("input", updateQuickSellPreview);
    $(id)?.addEventListener("change", updateQuickSellPreview);
  });
  $("sell-add-gift-check")?.addEventListener("change", (e) => {
    if ($("sell-gift-details-wrap")) $("sell-gift-details-wrap").style.display = e.target.checked ? "block" : "none";
  });
  $("sell-issue-invoice-check")?.addEventListener("change", (e) => {
    if ($("sell-customer-fields-wrap")) $("sell-customer-fields-wrap").style.display = e.target.checked ? "block" : "none";
  });

  $("form-sell-confirm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-sell-confirm"), async () => {
      const bookId = $("sell-confirm-book-id")?.value;
      const book = state.books.find((b) => b.id === bookId);
      if (!book) return;

      const format = $("sell-confirm-format")?.value || "paper";
      const whId = $("sell-confirm-wh")?.value || "main_warehouse";
      const exhId = $("sell-confirm-exh-id")?.value || "";
      const qty = Math.max(1, Number($("sell-confirm-qty")?.value) || 1);
      const disc = format === "freebie" ? 100 : Math.min(90, Math.max(0, Number($("sell-confirm-disc")?.value) || 0));
      const channel = $("sell-confirm-channel")?.value || "بيع مباشر / الدار";

      if ((format === "paper" || format === "freebie") && (Number(book.stock) || 0) < qty) {
        toast(`المخزون الورقي غير كافٍ! المتوفر: ${book.stock || 0}`, "ri-error-warning-line");
        return;
      }

      const now = Date.now();
      const invoiceCode = `#INV-${new Date(now).getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const custName = ($("sell-cust-name")?.value || "").trim() || "عميلنا العزيز";
      const custPhone = ($("sell-cust-phone")?.value || "").trim();

      const unitPrice = format === "freebie" ? 0 : format === "digital" ? Number(book.digitalPrice || book.price) || 0 : Number(book.price) || 0;
      const totalAmount = format === "freebie" ? 0 : Math.round(unitPrice * qty * (1 - disc / 100) * 100) / 100;
      const authorCut = format === "freebie" ? 0 : Math.round(totalAmount * ((Number(book.royaltyRate) || 0) / 100) * 100) / 100;
      const houseCut = format === "freebie" ? 0 : Math.round((totalAmount - authorCut) * 100) / 100;

      await addDoc(collection(db, "sales"), {
        invoiceCode,
        bookId: book.id,
        bookTitle: book.title,
        authorId: book.authorId || "",
        authorName: book.authorName || "",
        qty,
        unitPrice,
        discountPct: disc,
        totalAmount,
        authorCut,
        houseCut,
        copyFormat: format,
        isFreebie: format === "freebie",
        warehouseId: format === "digital" ? "" : whId,
        exhibitionId: exhId,
        channel,
        customerName: custName,
        customerPhone: custPhone,
        paymentMethod: "نقدي",
        soldBy: state.userEmail.toLowerCase(),
        soldByName: state.displayName,
        timestamp: now,
        dateISO: new Date(now).toISOString()
      });

      const newStock = format === "digital" ? Number(book.stock) || 0 : Math.max(0, (Number(book.stock) || 0) - qty);
      const newPaperSold = format === "paper" ? (Number(book.copiesSold) || 0) + qty : Number(book.copiesSold) || 0;
      const newDigSold = format === "digital" ? (Number(book.digitalCopiesSold) || 0) + qty : Number(book.digitalCopiesSold) || 0;

      await updateDoc(doc(db, "books", book.id), {
        stock: newStock,
        copiesSold: newPaperSold,
        digitalCopiesSold: newDigSold
      });

      const invItems = [
        {
          title: format === "freebie" ? `${book.title} (إهداء مجاني)` : book.title,
          qty,
          unitPrice,
          lineTotal: totalAmount,
          isFreebie: format === "freebie"
        }
      ];

      if ($("sell-add-gift-check")?.checked) {
        const giftBookId = $("sell-gift-book-select")?.value;
        const giftQty = Math.max(1, Number($("sell-gift-qty")?.value) || 1);
        const giftBook = state.books.find((x) => x.id === giftBookId);
        if (giftBook) {
          await addDoc(collection(db, "sales"), {
            invoiceCode,
            bookId: giftBook.id,
            bookTitle: giftBook.title,
            authorId: giftBook.authorId || "",
            authorName: giftBook.authorName || "",
            qty: giftQty,
            unitPrice: 0,
            discountPct: 100,
            totalAmount: 0,
            authorCut: 0,
            houseCut: 0,
            copyFormat: "freebie",
            isFreebie: true,
            warehouseId: whId,
            exhibitionId: exhId,
            channel: "هدية مرافقة لعملية بيع",
            customerName: custName,
            customerPhone: custPhone,
            paymentMethod: "مجاني",
            soldBy: state.userEmail.toLowerCase(),
            soldByName: state.displayName,
            timestamp: now + 1,
            dateISO: new Date(now).toISOString()
          });
          await updateDoc(doc(db, "books", giftBook.id), {
            stock: Math.max(0, (Number(giftBook.stock) || 0) - giftQty)
          });
          invItems.push({
            title: `${giftBook.title} (هدية مجانية)`,
            qty: giftQty,
            unitPrice: 0,
            lineTotal: 0,
            isFreebie: true
          });
        }
      }

      await logActivity("توثيق عملية بيع / إهداء", `الكتاب: ${book.title} | الكمية: ${qty} | الفاتورة: ${invoiceCode}`, {
        targetView: "view-book-detail",
        targetEntityId: book.id
      });

      closeModal("modal-sell");
      toast("تم توثيق العملية وتحديث المخزون والمحفظة");

      if ($("sell-issue-invoice-check")?.checked) {
        openCommercialInvoiceModal({
          invoiceCode,
          datetimeStr: fmtFullDateTime(now),
          customerName: custName,
          customerPhone: custPhone,
          paymentMethod: "نقدي",
          channel,
          discountPct: disc,
          netTotal: totalAmount,
          items: invItems
        });
      }
    });
  });

  $("authors-search-input")?.addEventListener("input", renderAuthorsView);
  $("btn-top-add-author")?.addEventListener("click", openAuthorFormForNew);
  $("btn-back-authors-list")?.addEventListener("click", () => navigateTo("view-authors"));
  $("btn-author-new-contract")?.addEventListener("click", () => openBookFormForNew(state.selectedAuthorId || ""));
  $("btn-author-new-payout")?.addEventListener("click", () => {
    if ($("payout-author-select") && state.selectedAuthorId) {
      $("payout-author-select").value = state.selectedAuthorId;
      $("payout-author-select").dispatchEvent(new Event("change"));
    }
    navigateTo("view-form-payout");
  });
  $("btn-author-open-report")?.addEventListener("click", () => {
    if ($("report-author-id")) $("report-author-id").value = state.selectedAuthorId || "";
    updateAuthorReportTemplate();
    navigateTo("view-form-report");
  });
  $("btn-author-print-statement")?.addEventListener("click", () => {
    const a = state.authors.find((x) => x.id === state.selectedAuthorId);
    if ($("print-custom-main-title")) $("print-custom-main-title").textContent = `دار صفقات كتابية للنشر والتوزيع | كشف حساب المؤلف: أ. ${a?.name || ""}`;
    window.print();
  });

  $("btn-copy-author-bank")?.addEventListener("click", () => {
    const a = state.authors.find((x) => x.id === state.selectedAuthorId);
    if (!a) return;
    const txt = `المؤلف: ${a.name}\nالبنك/الطريقة: ${a.bankMethod || ""} - ${a.bankName || ""}\nالمستفيد: ${a.bankHolder || ""}\nالحساب/IBAN: ${a.bankAccount || ""}\nالدولة: ${a.bankCountry || ""}`;
    navigator.clipboard.writeText(txt);
    toast("تم نسخ البيانات البنكية للمؤلف");
  });

  $("btn-alert-author-bank")?.addEventListener("click", async () => {
    const a = state.authors.find((x) => x.id === state.selectedAuthorId);
    if (!a) return;
    await sendSystemNotification({
      title: "يرجى مراجعة وتحديث بياناتك البنكية",
      body: "نرجو منك تحديث بيانات الحساب البنكي في بوابتك لتسهيل تحويل مستحقاتك المالية.",
      targetEmail: a.email,
      priority: "urgent",
      linkView: "view-author-portal"
    });
    toast("تم إرسال تنبيه للمؤلف لتحديث بياناته البنكية");
  });

  $("archive-search-input")?.addEventListener("input", renderArchiveView);
  $$("[data-arch-filter]").forEach((p) => {
    p.addEventListener("click", () => {
      state.archFilter = p.dataset.archFilter || "all";
      $$("[data-arch-filter]").forEach((x) => x.classList.toggle("active", x === p));
      renderArchiveView();
    });
  });

  $("btn-goto-add-warehouse")?.addEventListener("click", () => navigateTo("view-form-warehouse"));
  $("btn-goto-add-edition")?.addEventListener("click", () => navigateTo("view-form-edition"));
  $("ed-operation-type")?.addEventListener("change", (e) => {
    if ($("ed-from-wh-wrap")) $("ed-from-wh-wrap").style.display = e.target.value === "transfer" ? "block" : "none";
  });

  $("btn-goto-add-library")?.addEventListener("click", () => navigateTo("view-form-library"));
  $("btn-back-libraries")?.addEventListener("click", () => navigateTo("view-libraries"));
  $("btn-lib-supply-books")?.addEventListener("click", () => {
    if ($("supply-lib-id")) $("supply-lib-id").value = state.selectedLibId || "";
    navigateTo("view-form-lib-supply");
  });
  $("btn-lib-settle-sales")?.addEventListener("click", () => {
    if ($("settle-lib-id")) $("settle-lib-id").value = state.selectedLibId || "";
    navigateTo("view-form-lib-settle");
  });
  $("btn-lib-print-statement")?.addEventListener("click", () => window.print());

  $("btn-goto-add-exhibition")?.addEventListener("click", openExhibitionFormForNew);
  $("btn-back-exhibitions")?.addEventListener("click", () => navigateTo("view-exhibitions"));
  $("btn-exh-open-pos")?.addEventListener("click", () => {
    if ($("pos-exhibition-select") && state.selectedExhId) {
      $("pos-exhibition-select").value = state.selectedExhId;
    }
    navigateTo("view-pos");
  });
  $("btn-exh-add-expense")?.addEventListener("click", () => {
    if ($("expense-scope-select")) $("expense-scope-select").value = "exhibition";
    if ($("expense-exhibition-picker-wrap")) $("expense-exhibition-picker-wrap").style.display = "block";
    if ($("expense-exhibition-select") && state.selectedExhId) $("expense-exhibition-select").value = state.selectedExhId;
    navigateTo("view-form-expense");
  });
  $("btn-exh-edit")?.addEventListener("click", () => {
    const ex = state.exhibitions.find((x) => x.id === state.selectedExhId);
    if (ex) openExhibitionFormForEdit(ex);
  });
  $("btn-exh-print-statement")?.addEventListener("click", () => window.print());

  $("btn-goto-add-contest")?.addEventListener("click", () => navigateTo("view-form-contest"));

  $("btn-top-add-expense")?.addEventListener("click", () => {
    renderBooksMultiChecklist("expense-books-checklist", "", []);
    navigateTo("view-form-expense");
  });
  $("btn-fin-open-statement-modal")?.addEventListener("click", () => openModal("modal-statement-builder"));

  $$("[data-fin-range]").forEach((p) => {
    p.addEventListener("click", () => {
      state.finRange = p.dataset.finRange || "all";
      state.finFrom = "";
      state.finTo = "";
      $$("[data-fin-range]").forEach((x) => x.classList.toggle("active", x === p));
      renderFinanceView();
    });
  });
  $("btn-apply-fin-dates")?.addEventListener("click", () => {
    state.finFrom = $("fin-date-from")?.value || "";
    state.finTo = $("fin-date-to")?.value || "";
    renderFinanceView();
  });

  $("btn-apply-log-dates")?.addEventListener("click", () => {
    state.logFrom = $("log-date-from")?.value || "";
    state.logTo = $("log-date-to")?.value || "";
    renderProfileAndLogsView();
  });
  $("btn-reset-log-dates")?.addEventListener("click", () => {
    state.logFrom = "";
    state.logTo = "";
    if ($("log-date-from")) $("log-date-from").value = "";
    if ($("log-date-to")) $("log-date-to").value = "";
    renderProfileAndLogsView();
  });
  $("btn-back-my-logs")?.addEventListener("click", () => {
    state.viewingStaffLogsEmail = null;
    if ($("audit-log-title")) $("audit-log-title").innerHTML = `<i class="ri-history-line"></i><span>سجل التدقيق والعمليات الموثقة (بالتاريخ والساعة والدقيقة)</span>`;
    $("btn-back-my-logs").style.display = "none";
    renderProfileAndLogsView();
  });

  $("form-author")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-author"), async () => {
      const id = $("author-id-field")?.value;
      const name = ($("author-name-field")?.value || "").trim();
      const email = ($("author-email-field")?.value || "").trim().toLowerCase();
      const avatarFile = $("author-avatar-file")?.files?.[0];
      let avatarUrl = id ? state.authors.find((a) => a.id === id)?.avatarUrl || "" : "";
      if (avatarFile) avatarUrl = await uploadImageSmart(avatarFile);

      const payload = {
        name,
        email,
        phone: ($("author-phone-field")?.value || "").trim(),
        bio: ($("author-bio-field")?.value || "").trim(),
        bankName: ($("author-bank-name-field")?.value || "").trim(),
        bankAccount: ($("author-bank-acc-field")?.value || "").trim(),
        bankHolder: ($("author-bank-holder-field")?.value || "").trim(),
        bankCountry: ($("author-bank-country-field")?.value || "").trim(),
        restricted: Boolean($("author-restricted-check")?.checked),
        avatarUrl,
        timestamp: Date.now()
      };

      if (id) {
        await updateDoc(doc(db, "authors", id), payload);
        await logActivity("تعديل ملف مؤلف", `المؤلف: ${name}`, { targetView: "view-author-detail", targetEntityId: id });
      } else {
        const ref = await addDoc(collection(db, "authors"), payload);
        await logActivity("إضافة مؤلف جديد", `المؤلف: ${name} (${email})`, { targetView: "view-author-detail", targetEntityId: ref.id });
      }
      clearDraftByPrefix("author_", true);
      toast("تم حفظ ملف المؤلف بنجاح");
      navigateTo("view-authors");
    });
  });

  $("book-title-field")?.addEventListener("input", (e) => {
    const val = (e.target.value || "").trim().toLowerCase();
    const editId = $("book-id-field")?.value;
    const dup = state.books.find((b) => b.id !== editId && (b.title || "").trim().toLowerCase() === val);
    const warn = $("book-dup-warning");
    if (warn) {
      warn.classList.toggle("show", Boolean(dup && val.length > 2));
    }
  });

  $("form-book")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-book"), async () => {
      const id = $("book-id-field")?.value;
      const existing = id ? state.books.find((b) => b.id === id) : null;
      const authorId = $("book-author-select")?.value || "";
      const authorObj = state.authors.find((a) => a.id === authorId);

      let coverUrl = existing?.coverUrl || "";
      let backCoverUrl = existing?.backCoverUrl || "";
      let spreadCoverUrl = existing?.spreadCoverUrl || "";

      const f1 = $("book-cover-file")?.files?.[0];
      const f2 = $("book-back-cover-file")?.files?.[0];
      const f3 = $("book-spread-cover-file")?.files?.[0];

      if (f1) coverUrl = await uploadImageSmart(f1);
      if (f2) backCoverUrl = await uploadImageSmart(f2);
      if (f3) spreadCoverUrl = await uploadImageSmart(f3);

      const stockVal = Number($("book-stock-field")?.value) || 0;
      const payload = {
        title: ($("book-title-field")?.value || "").trim(),
        authorId,
        authorName: authorObj?.name || existing?.authorName || "",
        price: Number($("book-price-field")?.value) || 0,
        digitalPrice: Number($("book-digital-price-field")?.value) || Number($("book-price-field")?.value) || 0,
        royaltyRate: Number($("book-royalty-field")?.value) || 0,
        contractMonths: Number($("book-months-field")?.value) || 24,
        contractDate: $("book-date-field")?.value || todayISO(),
        favorite: Boolean($("book-fav-check")?.checked),
        stock: stockVal,
        printedTotal: existing ? Math.max(Number(existing.printedTotal) || 0, stockVal) : stockVal,
        warehouseId: $("book-warehouse-select")?.value || "main_warehouse",
        editionLabel: ($("book-edition-field")?.value || "").trim(),
        isbn: ($("book-isbn-field")?.value || "").trim(),
        category: ($("book-cat-field")?.value || "").trim(),
        coverUrl,
        backCoverUrl,
        spreadCoverUrl,
        driveUrl: ($("book-drive-field")?.value || "").trim(),
        printDriveUrl: ($("book-print-drive-field")?.value || "").trim(),
        authorAccessLevel: $("book-author-access-select")?.value || "full_download",
        notes: ($("book-notes-field")?.value || "").trim(),
        timestamp: existing?.timestamp || Date.now()
      };

      if (id) {
        await updateDoc(doc(db, "books", id), payload);
        await logActivity("تعديل عقد وبيانات كتاب", `الكتاب: ${payload.title}`, { targetView: "view-book-detail", targetEntityId: id });
      } else {
        const ref = await addDoc(collection(db, "books"), { ...payload, copiesSold: 0, digitalCopiesSold: 0, contractStatus: "active" });
        await logActivity("توثيق عقد كتاب جديد", `الكتاب: ${payload.title} | المؤلف: ${payload.authorName}`, { targetView: "view-book-detail", targetEntityId: ref.id });
      }
      clearDraftByPrefix("book_", true);
      toast("تم حفظ الكتاب والعقد والأرشيف بنجاح");
      navigateTo("view-contracts");
    });
  });

  $("form-warehouse")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-warehouse"), async () => {
      const name = ($("wh-name-field")?.value || "").trim();
      const location = ($("wh-location-field")?.value || "").trim();
      await addDoc(collection(db, "warehouses"), { name, location, timestamp: Date.now() });
      await logActivity("إضافة مستودع فرعي", `المستودع: ${name}`, { targetView: "view-warehouses" });
      clearDraftByPrefix("wh_", true);
      toast("تم إضافة المستودع بنجاح");
      navigateTo("view-warehouses");
    });
  });

  $("form-edition")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-edition"), async () => {
      const opType = $("ed-operation-type")?.value || "new_edition";
      const bookId = $("ed-book-select")?.value;
      const book = state.books.find((b) => b.id === bookId);
      if (!book) return;
      const qty = Math.max(1, Number($("ed-qty-field")?.value) || 1);
      const title = ($("ed-title-field")?.value || "").trim() || (opType === "transfer" ? "نقل مخزون بين المستودعات" : "طبعة جديدة");

      await addDoc(collection(db, "editions"), {
        operationType: opType,
        bookId: book.id,
        bookTitle: book.title,
        qty,
        fromWarehouseId: $("ed-from-wh-select")?.value || "",
        toWarehouseId: $("ed-to-wh-select")?.value || "main_warehouse",
        title,
        timestamp: Date.now()
      });

      if (opType === "new_edition") {
        await updateDoc(doc(db, "books", book.id), {
          stock: (Number(book.stock) || 0) + qty,
          printedTotal: (Number(book.printedTotal || book.stock) || 0) + qty
        });
      }

      await logActivity("حركة طبعات / مخزون", `الكتاب: ${book.title} | الكمية: ${qty} | ${title}`, { targetView: "view-warehouses" });
      toast("تم تحديث المخزون وتوثيق العملية");
      navigateTo("view-warehouses");
    });
  });

  $("form-contest")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-contest"), async () => {
      const contestType = $("contest-type-select")?.value || "contest_prize";
      const title = ($("contest-title-field")?.value || "").trim();
      const bookId = $("contest-book-select")?.value;
      const book = state.books.find((b) => b.id === bookId);
      if (!book) return;

      const qty = Math.max(1, Number($("contest-qty-field")?.value) || 1);
      if ((Number(book.stock) || 0) < qty) {
        toast(`المخزون الورقي للكتاب غير كافٍ! المتوفر: ${book.stock || 0}`, "ri-error-warning-line");
        return;
      }

      const winnerName = ($("contest-winner-field")?.value || "").trim() || "فائز / إهداء";
      const notes = ($("contest-notes-field")?.value || "").trim();

      await addDoc(collection(db, "editions"), {
        operationType: "free_contest",
        contestType,
        title,
        bookId: book.id,
        bookTitle: book.title,
        qty,
        toWarehouseId: $("contest-wh-select")?.value || "main_warehouse",
        winnerName,
        notes,
        timestamp: Date.now()
      });

      await updateDoc(doc(db, "books", book.id), {
        stock: Math.max(0, (Number(book.stock) || 0) - qty)
      });

      await logActivity("صرف مسابقة / إهداء مجاني", `${title} | الكتاب: ${book.title} (${qty} نسخة) | الفائز/الجهة: ${winnerName}`, {
        targetView: "view-contests"
      });
      $("form-contest")?.reset();
      toast("تم اعتماد الصرف المجاني وخصمه من المخزون دون احتساب مالي على الدار");
      navigateTo("view-contests");
    });
  });

  $("form-library")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-library"), async () => {
      const name = ($("lib-name-field")?.value || "").trim();
      await addDoc(collection(db, "libraries"), {
        name,
        city: ($("lib-city-field")?.value || "").trim(),
        phone: ($("lib-phone-field")?.value || "").trim(),
        discount: Number($("lib-discount-field")?.value) || 30,
        notes: ($("lib-notes-field")?.value || "").trim(),
        timestamp: Date.now()
      });
      await logActivity("إضافة مكتبة / موزع", `المكتبة: ${name}`, { targetView: "view-libraries" });
      clearDraftByPrefix("lib_", true);
      toast("تم حفظ ملف المكتبة");
      navigateTo("view-libraries");
    });
  });

  $("form-lib-supply")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-supply"), async () => {
      const libId = $("supply-lib-id")?.value || state.selectedLibId;
      const lib = state.libraries.find((l) => l.id === libId);
      const bookId = $("supply-book-select")?.value;
      const book = state.books.find((b) => b.id === bookId);
      if (!lib || !book) return;
      const qty = Math.max(1, Number($("supply-qty-field")?.value) || 1);
      if ((Number(book.stock) || 0) < qty) {
        toast("الرصيد في المستودع غير كافٍ للتوريد!", "ri-error-warning-line");
        return;
      }

      await addDoc(collection(db, "library_transactions"), {
        txType: "supply",
        libId: lib.id,
        libName: lib.name,
        bookId: book.id,
        bookTitle: book.title,
        qty,
        amount: 0,
        notes: ($("supply-notes-field")?.value || "").trim(),
        timestamp: Date.now()
      });

      await updateDoc(doc(db, "books", book.id), {
        stock: Math.max(0, (Number(book.stock) || 0) - qty)
      });

      await logActivity("توريد شحنة لمكتبة", `المكتبة: ${lib.name} | الكتاب: ${book.title} (${qty} نسخة)`, {
        targetView: "view-library-detail",
        targetEntityId: lib.id
      });
      toast("تم توثيق التوريد وخصم الكمية من المستودع");
      openLibraryDetail(lib.id);
    });
  });

  $("form-lib-settle")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-settle"), async () => {
      const libId = $("settle-lib-id")?.value || state.selectedLibId;
      const lib = state.libraries.find((l) => l.id === libId);
      const bookId = $("settle-book-select")?.value;
      const book = state.books.find((b) => b.id === bookId);
      if (!lib || !book) return;

      const qty = Math.max(1, Number($("settle-qty-field")?.value) || 1);
      const amount = Number($("settle-amount-field")?.value) || 0;
      const authorCut = Math.round(amount * ((Number(book.royaltyRate) || 0) / 100) * 100) / 100;
      const houseCut = Math.round((amount - authorCut) * 100) / 100;
      const now = Date.now();

      await addDoc(collection(db, "library_transactions"), {
        txType: "settle",
        libId: lib.id,
        libName: lib.name,
        bookId: book.id,
        bookTitle: book.title,
        qty,
        amount,
        notes: ($("settle-notes-field")?.value || "").trim(),
        timestamp: now
      });

      await addDoc(collection(db, "sales"), {
        invoiceCode: `#LIB-${Math.floor(1000 + Math.random() * 9000)}`,
        bookId: book.id,
        bookTitle: book.title,
        authorId: book.authorId || "",
        authorName: book.authorName || "",
        qty,
        unitPrice: qty > 0 ? Math.round((amount / qty) * 100) / 100 : 0,
        discountPct: lib.discount || 0,
        totalAmount: amount,
        authorCut,
        houseCut,
        copyFormat: "paper",
        isFreebie: false,
        channel: `تصفية مكتبة: ${lib.name}`,
        customerName: lib.name,
        soldBy: state.userEmail.toLowerCase(),
        soldByName: state.displayName,
        timestamp: now,
        dateISO: new Date(now).toISOString()
      });

      await updateDoc(doc(db, "books", book.id), {
        copiesSold: (Number(book.copiesSold) || 0) + qty
      });

      await logActivity("تصفية وتحصيل مبيعات مكتبة", `المكتبة: ${lib.name} | الكتاب: ${book.title} (${qty} نسخة) | المحصل: ${fmtMoney(amount)}`, {
        targetView: "view-library-detail",
        targetEntityId: lib.id
      });
      toast("تم اعتماد التحصيل وإيداع الأرباح في المحفظة");
      openLibraryDetail(lib.id);
    });
  });

  $("btn-exh-select-all-books")?.addEventListener("click", () => {
    $$("#exh-books-checklist input[type='checkbox']").forEach((c) => (c.checked = true));
  });
  $("btn-exh-clear-all-books")?.addEventListener("click", () => {
    $$("#exh-books-checklist input[type='checkbox']").forEach((c) => (c.checked = false));
  });
  $("exh-books-filter-input")?.addEventListener("input", (e) => {
    const currentlyChecked = $$("#exh-books-checklist input[type='checkbox']:checked").map((c) => c.value);
    renderBooksMultiChecklist("exh-books-checklist", e.target.value, currentlyChecked);
  });

  $("form-exhibition")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-exhibition"), async () => {
      const id = $("exh-id-field")?.value;
      const existing = id ? state.exhibitions.find((x) => x.id === id) : null;
      const checkedBooks = $$("#exh-books-checklist input[type='checkbox']:checked").map((c) => c.value);

      const photoFiles = Array.from($("exh-photos-files")?.files || []);
      const uploadedPhotos = existing?.photoUrls ? [...existing.photoUrls] : [];
      for (const file of photoFiles.slice(0, 5)) {
        const url = await uploadImageSmart(file);
        if (url) uploadedPhotos.push(url);
      }

      const payload = {
        name: ($("exh-name-field")?.value || "").trim(),
        location: ($("exh-location-field")?.value || "").trim(),
        prepDate: $("exh-prep-date")?.value || "",
        startDate: $("exh-start-date")?.value || "",
        endDate: $("exh-end-date")?.value || "",
        budget: Number($("exh-budget-field")?.value) || 0,
        notes: ($("exh-notes-field")?.value || "").trim(),
        bookIds: checkedBooks,
        photoUrls: uploadedPhotos,
        timestamp: existing?.timestamp || Date.now()
      };

      if (id) {
        await updateDoc(doc(db, "exhibitions", id), payload);
        await logActivity("تعديل معرض وكتبه المشاركة", `المعرض: ${payload.name}`, { targetView: "view-exhibition-detail", targetEntityId: id });
      } else {
        const ref = await addDoc(collection(db, "exhibitions"), payload);
        await logActivity("إنشاء معرض جديد", `المعرض: ${payload.name} (${checkedBooks.length} كتاب مشارك)`, {
          targetView: "view-exhibition-detail",
          targetEntityId: ref.id
        });
      }
      clearDraftByPrefix("exh_", true);
      toast("تم حفظ المعرض والكتب المشاركة والصور");
      navigateTo("view-exhibitions");
    });
  });

  $("expense-scope-select")?.addEventListener("change", (e) => {
    const val = e.target.value;
    if ($("expense-books-picker-wrap")) $("expense-books-picker-wrap").style.display = val === "books" ? "block" : "none";
    if ($("expense-exhibition-picker-wrap")) $("expense-exhibition-picker-wrap").style.display = val === "exhibition" ? "block" : "none";
  });

  $("form-expense")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-expense"), async () => {
      const scope = $("expense-scope-select")?.value || "general";
      const selectedBooks = scope === "books" ? $$("#expense-books-checklist input[type='checkbox']:checked").map((c) => c.value) : [];
      const exhId = scope === "exhibition" ? $("expense-exhibition-select")?.value || "" : "";
      const title = ($("expense-title-field")?.value || "").trim();
      const amount = Number($("expense-amount-field")?.value) || 0;

      await addDoc(collection(db, "expenses"), {
        title,
        amount,
        category: $("expense-cat-field")?.value || "عام",
        scope,
        bookIds: selectedBooks,
        bookId: selectedBooks.length === 1 ? selectedBooks[0] : "",
        exhibitionId: exhId,
        timestamp: Date.now()
      });

      await logActivity("تسجيل مصروف تشغيلي", `${title} — المبلغ: ${fmtMoney(amount)}`, { targetView: "view-finance" });
      clearDraftByPrefix("exp_", true);
      toast("تم توثيق المصروف وخصمه من المحفظة");
      navigateTo("view-finance");
    });
  });

  $("payout-author-select")?.addEventListener("change", (e) => {
    const a = state.authors.find((x) => x.id === e.target.value);
    const box = $("payout-author-bank-preview");
    if (!box) return;
    if (!a) {
      box.innerHTML = "اختر المؤلف لعرض بيانات حسابه البنكي ورصيده المتاح...";
      return;
    }
    const fin = computeAuthorFinancials(a.id);
    box.innerHTML = `
      <div><strong>الرصيد المستحق للمؤلف حالياً:</strong> <span class="money-pos">${fmtMoney(fin.balance)}</span></div>
      <div><strong>البنك / الطريقة المفضلة:</strong> ${esc(a.bankMethod || "")} — ${esc(a.bankName || "غير محدد")} | <strong>الحساب:</strong> <span dir="ltr">${esc(a.bankAccount || "—")}</span></div>
    `;
  });

  $("form-payout")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-payout"), async () => {
      const authorId = $("payout-author-select")?.value;
      const author = state.authors.find((a) => a.id === authorId);
      if (!author) return;
      const amount = Number($("payout-amount-field")?.value) || 0;
      const method = ($("payout-method-field")?.value || "").trim();
      const file = $("payout-receipt-file")?.files?.[0];
      const receiptUrl = file ? await uploadImageSmart(file) : "";

      await addDoc(collection(db, "payouts"), {
        authorId: author.id,
        authorName: author.name,
        amount,
        method,
        receiptUrl,
        notes: ($("payout-notes-field")?.value || "").trim(),
        paidBy: state.userEmail.toLowerCase(),
        timestamp: Date.now()
      });

      await sendSystemNotification({
        title: `تم تحويل دفعة مالية لحسابك (${fmtMoney(amount)})`,
        body: `تم إيداع حوالتك عبر (${method}). يمكنك استعراض الإيصال من بوابتك.`,
        targetEmail: author.email,
        priority: "normal",
        linkView: "view-author-portal"
      });

      await logActivity("تسديد حوالة لمؤلف", `المؤلف: ${author.name} | المبلغ: ${fmtMoney(amount)} عبر ${method}`, {
        targetView: "view-author-detail",
        targetEntityId: author.id
      });
      clearDraftByPrefix("payout_", true);
      toast("تم اعتماد الدفعة وإشعار المؤلف");
      openAuthorDetail(author.id);
    });
  });

  $("btn-top-add-staff")?.addEventListener("click", () => {
    if ($("form-staff-title")) $("form-staff-title").textContent = "إضافة موظف وتخصيص صلاحياته";
    if ($("staff-id-field")) $("staff-id-field").value = "";
    $("form-staff")?.reset();
    navigateTo("view-form-staff");
  });
  $("btn-staff-all-perms")?.addEventListener("click", () => {
    ["perm-pos", "perm-sell", "perm-add-book", "perm-delete-book", "perm-authors", "perm-payouts", "perm-expenses", "perm-finance-view", "perm-reports"].forEach((id) => {
      if ($(id)) $(id).checked = true;
    });
  });
  $("btn-staff-pos-only")?.addEventListener("click", () => {
    ["perm-sell", "perm-add-book", "perm-delete-book", "perm-authors", "perm-payouts", "perm-expenses", "perm-finance-view", "perm-reports"].forEach((id) => {
      if ($(id)) $(id).checked = false;
    });
    if ($("perm-pos")) $("perm-pos").checked = true;
    if ($("staff-job-field")) $("staff-job-field").value = "موظف كاشير ونقطة بيع (POS)";
  });
  $("btn-staff-sell-only")?.addEventListener("click", () => {
    ["perm-add-book", "perm-delete-book", "perm-authors", "perm-payouts", "perm-expenses", "perm-finance-view"].forEach((id) => {
      if ($(id)) $(id).checked = false;
    });
    if ($("perm-pos")) $("perm-pos").checked = true;
    if ($("perm-sell")) $("perm-sell").checked = true;
    if ($("perm-reports")) $("perm-reports").checked = true;
  });

  $("form-staff")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-staff"), async () => {
      const id = $("staff-id-field")?.value;
      const payload = {
        name: ($("staff-name-field")?.value || "").trim(),
        email: ($("staff-email-field")?.value || "").trim().toLowerCase(),
        jobTitle: ($("staff-job-field")?.value || "").trim(),
        restricted: Boolean($("staff-restricted-check")?.checked),
        permissions: {
          pos: Boolean($("perm-pos")?.checked),
          sell: Boolean($("perm-sell")?.checked),
          addBook: Boolean($("perm-add-book")?.checked),
          deleteBook: Boolean($("perm-delete-book")?.checked),
          authors: Boolean($("perm-authors")?.checked),
          payouts: Boolean($("perm-payouts")?.checked),
          expenses: Boolean($("perm-expenses")?.checked),
          financeView: Boolean($("perm-finance-view")?.checked),
          reports: Boolean($("perm-reports")?.checked)
        },
        timestamp: Date.now()
      };
      if (id) await updateDoc(doc(db, "staff", id), payload);
      else await addDoc(collection(db, "staff"), payload);
      await logActivity("حفظ صلاحيات موظف", `الموظف: ${payload.name} (${payload.email})`, { targetView: "view-staff" });
      toast("تم حفظ حساب وصلاحيات الموظف");
      navigateTo("view-staff");
    });
  });

  $("btn-staff-send-notif")?.addEventListener("click", () => navigateTo("view-form-notif"));
  $("btn-notif-new")?.addEventListener("click", () => navigateTo("view-form-notif"));
  $("form-notif")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-submit-notif"), async () => {
      await sendSystemNotification({
        title: ($("notif-title-field")?.value || "").trim(),
        body: ($("notif-body-field")?.value || "").trim(),
        targetEmail: $("notif-target-select")?.value || "all_admins",
        priority: $("notif-priority-select")?.value || "normal",
        linkView: $("notif-link-view-select")?.value || "view-dashboard"
      });
      $("form-notif")?.reset();
      toast("تم إرسال التنبيه التفاعلي بنجاح");
      navigateTo("view-notifications");
    });
  });

  $("report-type-select")?.addEventListener("change", updateAuthorReportTemplate);
  $("btn-copy-report")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("report-text-area")?.value || "");
    toast("تم نسخ نص الرسالة");
  });
  $("btn-whatsapp-report")?.addEventListener("click", () => {
    const a = state.authors.find((x) => x.id === ($("report-author-id")?.value || state.selectedAuthorId));
    const phone = sanitizePhoneForWa(a?.phone || "");
    const txt = $("report-text-area")?.value || "";
    window.open(phone ? `https://wa.me/${phone}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
  });
  $("btn-mailto-report")?.addEventListener("click", () => {
    const a = state.authors.find((x) => x.id === ($("report-author-id")?.value || state.selectedAuthorId));
    const txt = $("report-text-area")?.value || "";
    window.location.href = `mailto:${a?.email || ""}?subject=${encodeURIComponent("دار صفقات كتابية للنشر والتوزيع")}&body=${encodeURIComponent(txt)}`;
  });

  $("form-profile-update")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-save-profile"), async () => {
      const newName = ($("profile-name-input")?.value || "").trim();
      const file = $("profile-avatar-file")?.files?.[0];
      let avatarUrl = state.avatarUrl || "";
      if (file) avatarUrl = await uploadImageSmart(file);

      await setDoc(
        doc(db, "user_profiles", state.userEmail),
        {
          displayName: newName,
          avatarUrl,
          updatedAt: Date.now()
        },
        { merge: true }
      );

      state.displayName = newName;
      state.avatarUrl = avatarUrl;
      renderHeaderIdentity();
      await logActivity("تحديث الملف الشخصي والصورة", `الاسم: ${newName}`, { targetView: "view-profile" });
      toast("تم حفظ الاسم والصورة الشخصية بنجاح");
    });
  });

  $("btn-portal-request-name")?.addEventListener("click", (e) =>
    withButtonLock(e.currentTarget, async () => {
      const reqName = ($("portal-req-name-input")?.value || "").trim();
      if (!reqName || !state.authorDoc) {
        toast("يرجى كتابة الاسم الجديد المطلوب أولاً", "ri-error-warning-line");
        return;
      }
      await updateDoc(doc(db, "authors", state.authorDoc.id), { pendingNameRequest: reqName });
      await sendSystemNotification({
        title: `طلب تعديل اسم مؤلف: ${state.authorDoc.name}`,
        body: `يرغب المؤلف بتعديل اسمه إلى «${reqName}». اضغط على هذا الإشعار للانتقال لملف المؤلف والموافقة أو الرفض.`,
        targetEmail: "all_admins",
        priority: "urgent",
        linkView: "view-author-detail",
        linkEntityId: state.authorDoc.id
      });
      if ($("portal-req-name-input")) $("portal-req-name-input").value = "";
      toast("تم إرسال طلب تعديل الاسم إلى الإدارة للمراجعة والموافقة");
    })
  );

  $("form-portal-bank")?.addEventListener("submit", (e) => {
    e.preventDefault();
    withButtonLock($("btn-save-portal-bank"), async () => {
      if (!state.authorDoc) return;
      const file = $("portal-avatar-file")?.files?.[0];
      let avatarUrl = state.authorDoc.avatarUrl || "";
      if (file) avatarUrl = await uploadImageSmart(file);

      await updateDoc(doc(db, "authors", state.authorDoc.id), {
        bankMethod: ($("portal-bank-method")?.value || "").trim(),
        bankName: ($("portal-bank-name")?.value || "").trim(),
        bankHolder: ($("portal-bank-holder")?.value || "").trim(),
        bankAccount: ($("portal-bank-account")?.value || "").trim(),
        bankCountry: ($("portal-bank-country")?.value || "").trim(),
        bankNotes: ($("portal-bank-notes")?.value || "").trim(),
        avatarUrl
      });
      state.avatarUrl = avatarUrl;
      toast("تم حفظ صورتك الشخصية وبياناتك البنكية بنجاح");
    });
  });

  $("btn-portal-print-all")?.addEventListener("click", () => {
    if ($("print-custom-main-title")) $("print-custom-main-title").textContent = `دار صفقات كتابية للنشر والتوزيع | كشف حساب المؤلف: ${state.displayName}`;
    window.print();
  });
  $("btn-back-to-author-portal")?.addEventListener("click", () => navigateTo("view-author-portal"));
  $("btn-portal-book-print-statement")?.addEventListener("click", () => {
    const b = state.books.find((x) => x.id === state.portalSelectedBookId);
    if ($("print-custom-main-title")) $("print-custom-main-title").textContent = `دار صفقات كتابية للنشر والتوزيع | كشف حساب كتاب: ${b?.title || ""}`;
    window.print();
  });

  $("btn-close-pdf-view")?.addEventListener("click", () => {
    if ($("pdf-iframe")) $("pdf-iframe").src = "";
    navigateTo(state.prevView || "view-dashboard");
  });

  ["calc-book-select", "calc-copy-type", "calc-book-qty", "calc-book-disc"].forEach((id) => {
    $(id)?.addEventListener("input", updateCalculatorBreakdown);
    $(id)?.addEventListener("change", updateCalculatorBreakdown);
  });
  $$(".calc-key").forEach((key) => {
    key.addEventListener("click", () => {
      const screen = $("calc-screen");
      if (!screen) return;
      const k = key.dataset.calc;
      if (k === "C") screen.value = "0";
      else if (k === "=") {
        try {
          screen.value = String(Function(`"use strict"; return (${screen.value})`)());
        } catch (e) {
          screen.value = "Error";
        }
      } else {
        screen.value = screen.value === "0" || screen.value === "Error" ? k : screen.value + k;
      }
    });
  });

  $("stmt-type-select")?.addEventListener("change", (e) => {
    const v = e.target.value;
    if ($("stmt-author-pick-wrap")) $("stmt-author-pick-wrap").style.display = v === "author_statement" ? "block" : "none";
    if ($("stmt-book-pick-wrap")) $("stmt-book-pick-wrap").style.display = v === "book_statement" ? "block" : "none";
    if ($("stmt-exh-pick-wrap")) $("stmt-exh-pick-wrap").style.display = v === "exhibition_statement" ? "block" : "none";
  });

  $("btn-stmt-execute-print")?.addEventListener("click", () => {
    const type = $("stmt-type-select")?.value || "current_view";
    const customTitle = ($("stmt-custom-title")?.value || "").trim();
    closeModal("modal-statement-builder");

    if (type === "author_statement") {
      const aId = $("stmt-author-select")?.value;
      if (aId) openAuthorDetail(aId);
    } else if (type === "book_statement") {
      const bId = $("stmt-book-select")?.value;
      if (bId) openBookDetail(bId);
    } else if (type === "exhibition_statement") {
      const xId = $("stmt-exh-select")?.value;
      if (xId) openExhibitionDetail(xId);
    } else if (type === "house_full") {
      navigateTo("view-finance");
    }

    if ($("print-custom-main-title")) {
      $("print-custom-main-title").textContent = customTitle || "دار صفقات كتابية للنشر والتوزيع | كشف حساب وتقرير رسمي معتمد";
    }
    setTimeout(() => window.print(), 350);
  });

  document.addEventListener("open-exh", (ev) => {
    if (ev.detail) openExhibitionDetail(ev.detail);
  });
}

// ==========================================================================
// 27. نقطة الإقلاع الذكي الفوري (تحل مشكلة تأخر DOMContentLoaded في الجوال نهائياً)
// ==========================================================================
function bootstrapSafaqatApp() {
  if (window.__safaqatBootstrapped) return;
  window.__safaqatBootstrapped = true;
  try {
    initDraftSystem();
    bindAllEvents();
    initAuthAndBoot();
  } catch (err) {
    console.error("Bootstrap Error:", err);
    forceHideBootScreen(true);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapSafaqatApp);
} else {
  bootstrapSafaqatApp();
}
