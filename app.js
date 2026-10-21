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
