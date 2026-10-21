/* ==========================================================================
   Safaqat System ERP & POS - Institutional Master Engine v3.0 (Part 1 of 3)
   دار صفقات كتابية للنشر والتوزيع | SAFAQAT KITABIYA ERP & POS
   ========================================================================== */

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
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

  // الجداول السحابية المحدثة لحظياً
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

  // حالة التصفح والملفات المفتوحة
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

  // الفلاتر النشطة
  bookFilter: "all",
  archFilter: "all",
  finRange: "all",
  finFrom: "",
  finTo: "",
  logFrom: "",
  logTo: "",
  chartType: "bar",
  salesChartInstance: null,

  // سلة الكاشير ونقاط البيع (تدعم الكتب المباعة + الكتب المجانية/الهدايا)
  posCart: [],

  // الماسح الضوئي للكاميرا
  qrScannerInstance: null,
  scannerRunning: false,

  // مستمعات Firestore
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

// توثيق التاريخ والوقت بالساعة والدقيقة والثانية
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
  }, 3200);
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
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
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
    console.warn("ImgBB fallback to compressed DataURL:", e);
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
    console.warn("Audit Log Warning:", err);
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
    console.warn("Notification Error:", err);
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
  $$('select[data-smart-select="true"]').forEach((sel) => { if (sel.dataset.smartInitialized !== "true") { enhanceSmartSelect(sel); } else if (typeof sel._syncSmartPicker === "function") { sel._syncSmartPicker(); } }); }  // نظام حفظ المسودات التلقائي function initDraftSystem() { $$
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
// 8. نظام المصادقة، الصلاحيات الـ 9، ووضع "كاشير فقط" المعزول
// ==========================================================================
function hasPerm(permKey) {
  if (state.role === "super_admin") return true;
  if (state.role === "staff") return Boolean(state.permissions[permKey]);
  return false;
}

async function initAuthAndBoot() {
  // تفعيل الوضع الليلي/النهاري المحفوظ
  const savedTheme = localStorage.getItem("safaqat_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);

  // طباعة الترويسة الرسمية بالدومين والتاريخ
  if ($("print-header-date")) $("print-header-date").textContent = `DATE: ${todayISO()}`;
  if ($("print-header-domain")) $("print-header-domain").textContent = window.location.hostname || "safaqat-system.web.app";
  if ($("print-footer-url")) $("print-footer-url").textContent = window.location.origin;

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("Persistence warning:", e);
  }

  onAuthStateChanged(auth, async (user) => {
    const bootEl = $("boot-screen");
    const authEl = $("auth-screen");
    const appEl = $("app-screen");

    if (!user || !user.email) {
      stopRealtimeListeners();
      state.user = null;
      state.userEmail = "";
      state.role = null;
      if (appEl) appEl.style.display = "none";
      if (authEl) authEl.style.display = "flex";
      if (bootEl) bootEl.style.display = "none";
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
        if (bootEl) bootEl.style.display = "none";
        return;
      }

      if ($("auth-error-box")) $("auth-error-box").style.display = "none";
      if (authEl) authEl.style.display = "none";
      if (appEl) appEl.style.display = "block";

      applyRoleUiVisibility();
      startRealtimeSubscriptions();

      if (bootEl) {
        bootEl.style.opacity = "0";
        setTimeout(() => {
          bootEl.style.display = "none";
          bootEl.style.opacity = "1";
        }, 220);
      }
    } catch (err) {
      console.error("Auth Resolution Error:", err);
      if (bootEl) bootEl.style.display = "none";
      if (authEl) authEl.style.display = "flex";
    }
  });
}

async function resolveUserRoleAndPermissions(user, email) {
  // جلب الملف الشخصي (الاسم والصورة الشخصية إن وجدت)
  let profileData = null;
  try {
    const profSnap = await getDoc(doc(db, "user_profiles", email));
    if (profSnap.exists()) profileData = profSnap.data();
  } catch (e) {
    console.warn("User profile fetch:", e);
  }

  // 1) فحص الإدارة العليا (Super Admin)
  if (SUPER_ADMINS.includes(email)) {
    state.role = "super_admin";
    state.isPosOnlyStaff = false;
    state.displayName = profileData?.displayName || user.displayName || "الإدارة العليا";
    state.avatarUrl = profileData?.avatarUrl || user.photoURL || "";
    Object.keys(state.permissions).forEach((k) => (state.permissions[k] = true));
    return true;
  }

  // 2) فحص جدول الموظفين (Staff)
  const staffSnap = await getDocs(collection(db, "staff"));
  let matchedStaff = null;
  staffSnap.forEach((d) => {
    const data = d.data();
    if (data.email && data.email.toLowerCase().trim() === email) {
      matchedStaff = { id: d.id, ...data };
    }
  });

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

    // فحص ما إذا كان الموظف مخصصاً لـ "الكاشير فقط (POS Only)"
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

  // 3) فحص جدول المؤلفين (Authors)
  const authorsSnap = await getDocs(collection(db, "authors"));
  let matchedAuthor = null;
  authorsSnap.forEach((d) => {
    const data = d.data();
    if (data.email && data.email.toLowerCase().trim() === email) {
      matchedAuthor = { id: d.id, ...data };
    }
  });

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
// 9. ضبط ظهور القوائم والواجهات حسب الدور والصلاحيات (الإدارة / كاشير فقط / مؤلف)
// ==========================================================================
function applyRoleUiVisibility() {
  const isSuper = state.role === "super_admin";
  const isAuthor = state.role === "author";
  const isPosOnly = state.isPosOnlyStaff;

  // إظهار/إخفاء عناصر الهيدر والشريط السفلي للمؤلف
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

  // صلاحيات القائمة الجانبية
  if ($("dlink-staff")) $("dlink-staff").style.display = isSuper ? "flex" : "none";
  if ($("btn-notif-new")) $("btn-notif-new").style.display = isSuper ? "inline-flex" : "none";

  // وضع "موظف كاشير فقط (POS Only)" المعزول عن لوحة الإدارة
  if (isPosOnly) {
    ["dlink-dashboard", "dlink-contracts", "dlink-authors", "dlink-archive", "dlink-warehouses", "dlink-libraries", "dlink-exhibitions", "dlink-contests", "dlink-finance", "dlink-staff", "drawer-sec-logistics", "drawer-sec-admin"].forEach((id) => {
      if ($(id))$(id).style.display = "none";
    });
    if ($("dock-btn-dashboard")) $("dock-btn-dashboard").style.display = "none";
    if ($("dock-btn-contracts")) $("dock-btn-contracts").style.display = "none";
    if ($("btn-dock-quick-add")) $("btn-dock-quick-add").style.display = "none";
    navigateTo("view-pos");
  } else {
    ["dlink-dashboard", "dlink-contracts", "dlink-authors", "dlink-archive", "dlink-warehouses", "dlink-libraries", "dlink-exhibitions", "dlink-contests", "drawer-sec-logistics", "drawer-sec-admin"].forEach((id) => {
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

function renderAvatarHtml(name, avatarUrl, sizePx = 40) {
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
  if ($("header-avatar-content")) {
    $("header-avatar-content").parentElement.innerHTML = renderAvatarHtml(state.displayName, state.avatarUrl);
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

// البحث الفوري الشامل في الرئيسية (كتب، مؤلفين، فواتير #INV، مكتبات، معارض)
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

  // 1) البحث في الكتب
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

  // 2) البحث في المؤلفين
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

  // 3) البحث في الفواتير والمبيعات (#INV-...)
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

  // 4) البحث في المعارض والمكتبات
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

  // فحص طلبات تغيير الاسم المعلقة من المؤلفين للإدارة
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

  // 1) طلبات تغيير اسم المؤلف المعلقة (بالضغط تفتح ملف المؤلف مباشرة لاتخاذ الإجراء)
  if (state.role === "super_admin" || hasPerm("authors")) {
    const reqAuthors = state.authors.filter((a) => a.pendingNameRequest && a.pendingNameRequest.trim() !== "");
    reqAuthors.forEach((au) => {
      htmlParts.push(`
        <div class="list-row clickable js-notif-deep-link" data-link-view="view-author-detail" data-entity-id="${esc(au.id)}" style="border-color:var(--neg-border);background:var(--neg-bg);">
          <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span class="badge neg"><i class="ri-user-Received-2-line"></i> طلب مراجعة وتغيير اسم مؤلف</span>
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

  // 2) الإشعارات والتوجيهات العامة (كل إشعار قابل للنقر وينقل للمكان المطلوب)
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

// جلب كافة المعارض المشارك بها كتاب معين
function getBookExhibitions(bookId) {
  if (!bookId) return [];
  return state.exhibitions.filter((ex) => Array.isArray(ex.bookIds) && ex.bookIds.includes(bookId));
}

// حساب الموقف المالي والمخزني لكتاب محدد بدقة (ورقي + إلكتروني + إهداءات مجانية)
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

  // حساب المصاريف المرتبطة بهذا الكتاب (مباشرة أو موزعة من حملة)
  let bookExpenses = 0;
  state.expenses.forEach((ex) => {
    if (ex.bookId === bookId) {
      bookExpenses += Number(ex.amount) || 0;
    } else if (Array.isArray(ex.bookIds) && ex.bookIds.includes(bookId) && ex.bookIds.length > 0) {
      bookExpenses += (Number(ex.amount) || 0) / ex.bookIds.length;
    }
  });

  // حساب النسخ المهداة من سجل المسابقات والإهداءات
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

// حساب محفظة المؤلف (الأرباح الورقية + الإلكترونية - الحوالات المسددة)
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
// 14. المنسق المركزي لتحديث كافة القوائم والشاشات اللحظية
// ==========================================================================
function refreshAllViews() {
  if (!state.user) return;
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

  // قائمة المستلمين في شاشة إرسال التنبيهات
  const notifTargetEl = $("notif-target-select");
  if (notifTargetEl) {
    const prev = notifTargetEl.value;
    const recipOpts = [
      `<option value="all_admins">جميع المديرين والمشرفين</option>`,
      `<option value="all_staff">جميع موظفي الدار</option>`,
      `<option value="all_authors">جميع مؤلفي الدار</option>`,
      ...state.staff.map((s) => `<option value="${esc(s.email.toLowerCase())}">موظف: ${esc(s.name)} (${esc(s.email)})</option>`),
      ...state.authors.map((a) => `<option value="${esc(a.email.toLowerCase())}">مؤلف: ${esc(a.name)} (${esc(a.email)})</option>`)
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

  // تنبيه الكتب التي أوشكت على النفاد
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

  // رادار العقود التي قاربت على الانتهاء
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

  // شبكة الكتب المميزة والأعلى مبيعاً في الرئيسية
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
  // تحديث المؤشرات الإحصائية الشاملة للكتب والعقود
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

  // ضبط أزرار الصلاحيات والملفات
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

  // الهيدر التعريفي للكتاب
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

  // المؤشرات الأربعة
  if ($("bdet-rev")) $("bdet-rev").textContent = fmtMoney(fin.totalRev);
  if ($("bdet-sold-copies")) $("bdet-sold-copies").textContent = `${fmtNum(fin.paperSold)} ورقية • ${fmtNum(fin.digitalSold)} إلكترونية`;
  if ($("bdet-author-cut")) $("bdet-author-cut").textContent = fmtMoney(fin.authorCutTotal);
  if ($("bdet-royalty-rate")) $("bdet-royalty-rate").textContent = `النسبة: ${fmtNum(book.royaltyRate)}%`;
  if ($("bdet-free-copies")) $("bdet-free-copies").textContent = `${fmtNum(fin.freebiesCount)} نسخة`;
  if ($("bdet-expenses")) $("bdet-expenses").textContent = `مصاريف الكتاب: ${fmtMoney(fin.bookExpenses)}`;
  if ($("bdet-stock")) $("bdet-stock").textContent = `${fmtNum(fin.stock)} نسخة`;
  if ($("bdet-printed-total")) $("bdet-printed-total").textContent = `إجمالي المطبوع: ${fmtNum(fin.printedTotal)}`;

  // أرشيف الأغلفة الثلاثة وملفات الطباعة
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

  // سجل الطبعات والإهداءات الخاصة بالكتاب
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

  // المعارض والمكتبات المرتبطة بالكتاب
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

  // شريط الموافقة/الرفض على طلب تغيير اسم المؤلف
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
        // تحديث اسم المؤلف على كتبه المرتبطة
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

  // بطاقة المؤلف التعريفية
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

  // البيانات البنكية للمؤلف
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

  // كتب المؤلف
  const authorBooks = state.books.filter((b) => b.authorId === author.id);
  const bGrid = $("author-det-books-grid");
  if (bGrid) {
    bGrid.innerHTML = authorBooks.length
      ? authorBooks.map((b) => createBookCardHtml(b)).join("")
      : `<div class="surface-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);">لا توجد كتب مرتبطة بهذا المؤلف بعد.</div>`;
    bindBookCardsEvents(bGrid);
  }

  // سجل الحوالات والإيصالات
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

// المعارض والفعاليات (مع معرض صور الجناح والكتب المشاركة)
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

  // ألبوم صور الجناح والمعرض
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

// وحدة المسابقات والإهداءات المجانية (Contests & Freebies Hub)
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
      state.viewingStaffLogsEmail = btn.dataset.email.toLowerCase();
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

// السجل الرقابي التفاعلي بالتاريخ والساعة والدقيقة والثانية + نافذة تفاصيل العملية
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
        <h3 style="font-size:16.5px;font-weight:800;"><i class="ri-book-open-line"></i> الدليل المالي والتشغيلي الشامل لنظام صفقات كتابية (ERP & POS v3.0)</h3>
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
