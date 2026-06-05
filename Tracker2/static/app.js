// Configuration
let TOTAL_ROOMS = 755;
let PREFIX = "42/";
const POLLING_INTERVAL = 3000; // 3 seconds

// App State
let checkedUnits = new Set();
let markedUnits = new Set();
let sessions = [];
let activeSession = null;
let allUnitsList = []; // Cache of all rooms f.e. 42/001 - 42/755
let searchQuery = "";
let currentFilter = "all"; // "all" | "checked" | "unchecked"
let currentView = "grid"; // "grid" | "list"
let pollingTimer = null;
let selectedUnit = null;
let latestHighlightedUnit = null;

// DOM Elements
const roomGrid = document.getElementById("room-grid");
const roomList = document.getElementById("room-list");
const statsPercentage = document.getElementById("stats-percentage");
const statsCount = document.getElementById("stats-count");
const progressFill = document.getElementById("progress-fill");
const syncDot = document.getElementById("sync-dot");
const syncText = document.getElementById("sync-text");
const unitInput = document.getElementById("unit-input");
const addForm = document.getElementById("add-form");
const feedbackMsg = document.getElementById("feedback-msg");
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search");
const filterBtns = document.querySelectorAll(".filter-btn");
const viewGridBtn = document.getElementById("view-grid-btn");
const viewListBtn = document.getElementById("view-list-btn");
const domainDisplay = document.getElementById("domain-display");
const sessionBar = document.getElementById("session-bar");
const sessionSelect = document.getElementById("session-select");
const sessionNewBtn = document.getElementById("session-new-btn");
const sessionAddLink = document.getElementById("session-add-link");
const sessionModal = document.getElementById("session-modal");
const sessionForm = document.getElementById("session-form");
const sessionNameInput = document.getElementById("session-name-input");
const sessionPrefixInput = document.getElementById("session-prefix-input");
const sessionTotalInput = document.getElementById("session-total-input");
const sessionFeedbackMsg = document.getElementById("session-feedback-msg");
const sessionModalClose = document.getElementById("session-modal-close");
const sessionCancelBtn = document.getElementById("session-cancel-btn");
const dashboardTitle = document.getElementById("dashboard-title");
const inputTip = document.getElementById("input-tip");

// Modal Elements
const actionModal = document.getElementById("action-modal");
const modalTitle = document.getElementById("modal-title");
const modalStatusText = document.getElementById("modal-status-text");
const modalToggleBtn = document.getElementById("modal-toggle-btn");
const modalEditBtn = document.getElementById("modal-edit-btn");
const modalDeleteBtn = document.getElementById("modal-delete-btn");
const modalSaveEditBtn = document.getElementById("modal-save-edit-btn");
const modalCancelEditBtn = document.getElementById("modal-cancel-edit-btn");
const modalMarkBtn = document.getElementById("modal-mark-btn");
const editSection = document.getElementById("edit-section");
const editUnitInput = document.getElementById("edit-unit-input");
const modalFeedbackMsg = document.getElementById("modal-feedback-msg");
const closeModalBtn = document.querySelector(".close-modal");

// Initialize application
function init() {
    // Set Domain Name Info Display
    domainDisplay.textContent = window.location.hostname;

    // Register Event Listeners
    setupEventListeners();

    // Load initial data
    loadData();

    // Start Real-time Polling
    startPolling();
}

function getNumberWidth() {
    return String(TOTAL_ROOMS).length;
}

function formatUnitLabel(unitNumber) {
    return `${PREFIX}${String(unitNumber).padStart(getNumberWidth(), '0')}`;
}

function unitDomSafeId(unitName) {
    return unitName.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function rebuildAllUnitsList() {
    allUnitsList = [];
    for (let i = 1; i <= TOTAL_ROOMS; i++) {
        allUnitsList.push(formatUnitLabel(i));
    }
}

function applySessionConfig(session) {
    if (!session) return;
    activeSession = session;
    PREFIX = session.prefix;
    TOTAL_ROOMS = Number(session.total_rooms);
    rebuildAllUnitsList();
    updateSessionUi();
}

function updateSessionUi() {
    const example = formatUnitLabel(Math.min(5, TOTAL_ROOMS));
    document.querySelectorAll(".prefix").forEach(el => {
        el.textContent = PREFIX;
    });
    unitInput.placeholder = `เลขห้อง (เช่น ${String(Math.min(1, TOTAL_ROOMS)).padStart(getNumberWidth(), '0')}, ${String(Math.min(150, TOTAL_ROOMS)).padStart(getNumberWidth(), '0')})`;
    editUnitInput.placeholder = String(Math.min(1, TOTAL_ROOMS)).padStart(getNumberWidth(), '0');
    inputTip.textContent = `พิมพ์เลขห้องแล้วกด Enter ได้เลย! (เช่น 5 -> ${example})`;
    dashboardTitle.textContent = `แดชบอร์ดแสดงผลห้องทั้งหมด (${formatUnitLabel(1)} - ${formatUnitLabel(TOTAL_ROOMS)})`;
}

function renderSessionOptions() {
    if (!sessionSelect) return;
    sessionSelect.innerHTML = "";
    sessions.forEach(session => {
        const option = document.createElement("option");
        option.value = session.id;
        option.textContent = session.name;
        option.selected = activeSession && session.id === activeSession.id;
        sessionSelect.appendChild(option);
    });
    updateSessionBarVisibility();
}

function updateSessionBarVisibility() {
    const multi = sessions.length > 1;
    if (sessionBar) sessionBar.classList.toggle("hidden", !multi);
    if (sessionAddLink) sessionAddLink.classList.toggle("hidden", multi);
}

// Fetch units from backend server
async function loadData() {
    try {
        const response = await fetch("/api/state");
        if (!response.ok) throw new Error("Server error");

        const stateData = await response.json();
        const unitsData = stateData.units || [];
        const markedData = stateData.marked || [];
        sessions = stateData.sessions || [];
        applySessionConfig(stateData.active_session);

        const newUnitsSet = new Set(unitsData);
        const newMarkedSet = new Set(markedData);

        let changed = true;
        if (!areSetsEqual(checkedUnits, newUnitsSet)) {
            checkedUnits = newUnitsSet;
            changed = true;
        }
        if (!areSetsEqual(markedUnits, newMarkedSet)) {
            markedUnits = newMarkedSet;
            changed = true;
        }

        if (changed) {
            renderSessionOptions();
            render();
        }

        setOnlineStatus(true);
    } catch (err) {
        console.error("Error loading units:", err);
        setOnlineStatus(false);
    }
}

// Sync Status helper
function setOnlineStatus(online) {
    if (online) {
        syncDot.className = "status-dot online";
        syncText.textContent = "เชื่อมต่อเซิร์ฟเวอร์แล้ว";
    } else {
        syncDot.className = "status-dot offline";
        syncText.textContent = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้";
    }
}

// Start polling API
function startPolling() {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(loadData, POLLING_INTERVAL);
}

// Event Listeners setup
function setupEventListeners() {
    sessionSelect.addEventListener("change", async () => {
        const sessionId = sessionSelect.value;
        if (!sessionId) return;
        await activateSession(sessionId);
    });

    sessionForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await createSessionFromForm();
    });

    sessionNewBtn.addEventListener("click", openSessionModal);
    sessionAddLink.addEventListener("click", openSessionModal);
    sessionModalClose.addEventListener("click", closeSessionModal);
    sessionCancelBtn.addEventListener("click", closeSessionModal);
    sessionModal.addEventListener("click", (e) => {
        if (e.target === sessionModal) closeSessionModal();
    });

    // Form submission
    addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await handleAddUnit();
    });

    // Live validation for input as user types
    unitInput.addEventListener("input", (e) => {
        const rawVal = e.target.value.trim();
        if (!rawVal) {
            feedbackMsg.style.display = "none";
            feedbackMsg.className = "feedback-message";
            unitInput.parentElement.style.borderColor = "";
            return;
        }

        let parsedVal = rawVal;
        if (parsedVal.startsWith(PREFIX)) {
            parsedVal = parsedVal.slice(PREFIX.length);
        }
        if (/^\d+$/.test(parsedVal)) {
            parsedVal = String(Number(parsedVal)).padStart(getNumberWidth(), '0');
        }
        const fullUnitName = `${PREFIX}${parsedVal}`;

        if (markedUnits.has(fullUnitName)) {
            showFeedback(`⚠️ ห้อง '${fullUnitName}' มาร์คไว้ว่ายังไม่มีข้อมูล/กรอกไม่ได้`, "error", false);
            unitInput.parentElement.style.borderColor = "var(--pink-color)";
        } else if (checkedUnits.has(fullUnitName)) {
            showFeedback(`⚠️ ซ้ำ! ห้อง '${fullUnitName}' ถูกคีย์ไปแล้ว`, "error", false);
            unitInput.parentElement.style.borderColor = "var(--danger-color)";
        } else {
            showFeedback(`🟢 ห้อง '${fullUnitName}' ยังไม่ถูกบันทึก (กด Enter เพื่อบันทึก)`, "success", false);
            unitInput.parentElement.style.borderColor = "var(--success-color)";
        }
    });

    // Search input
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        clearSearchBtn.style.display = searchQuery ? "block" : "none";
        render();
    });

    // Clear search
    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        searchQuery = "";
        clearSearchBtn.style.display = "none";
        render();
        searchInput.focus();
    });

    // Filters
    filterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            filterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
            render();
        });
    });

    // View toggles
    viewGridBtn.addEventListener("click", () => {
        viewGridBtn.classList.add("active");
        viewListBtn.classList.remove("active");
        roomGrid.classList.add("active-view");
        roomList.classList.remove("active-view");
        currentView = "grid";
    });

    viewListBtn.addEventListener("click", () => {
        viewListBtn.classList.add("active");
        viewGridBtn.classList.remove("active");
        roomList.classList.add("active-view");
        roomGrid.classList.remove("active-view");
        currentView = "list";
    });

    // Modal Actions
    closeModalBtn.addEventListener("click", closeModal);
    window.addEventListener("click", (e) => {
        if (e.target === actionModal) closeModal();
    });

    // Check-in from Modal
    modalToggleBtn.addEventListener("click", async () => {
        if (!selectedUnit) return;
        await sendAddRequest(selectedUnit);
    });

    // Delete from Modal
    modalDeleteBtn.addEventListener("click", async () => {
        if (!selectedUnit) return;
        if (confirm(`คุณต้องการยกเลิกการบันทึกคีย์ห้อง ${selectedUnit} ใช่หรือไม่?`)) {
            await sendDeleteRequest(selectedUnit);
        }
    });

    // Toggle Mark from Modal
    modalMarkBtn.addEventListener("click", async () => {
        if (!selectedUnit) return;
        await sendMarkToggleRequest(selectedUnit);
    });

    // Show Edit Section inside Modal
    modalEditBtn.addEventListener("click", () => {
        editSection.classList.add("active");

        // Put standard starting value (number part only)
        let numOnly = selectedUnit;
        if (numOnly.startsWith(PREFIX)) {
            numOnly = numOnly.slice(PREFIX.length);
        }
        editUnitInput.value = numOnly;
        editUnitInput.focus();
        editUnitInput.select();

        // Switch footer buttons
        modalEditBtn.classList.add("hidden");
        modalDeleteBtn.classList.add("hidden");
        modalToggleBtn.classList.add("hidden");
        modalMarkBtn.classList.add("hidden");
        modalSaveEditBtn.classList.remove("hidden");
        modalCancelEditBtn.classList.remove("hidden");
    });

    // Cancel Edit
    modalCancelEditBtn.addEventListener("click", () => {
        resetModalEditState();
    });

    // Save Edit
    modalSaveEditBtn.addEventListener("click", async () => {
        if (!selectedUnit) return;
        const newRaw = editUnitInput.value.trim();
        if (!newRaw) {
            showModalFeedback("กรุณากรอกหมายเลขห้องใหม่", "error");
            return;
        }
        await sendEditRequest(selectedUnit, newRaw);
    });

    // Support submitting edit form with Enter key
    editUnitInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            modalSaveEditBtn.click();
        }
    });
}

// Reset modal buttons
function resetModalEditState() {
    editSection.classList.remove("active");
    modalFeedbackMsg.className = "feedback-message";
    modalFeedbackMsg.style.display = "none";

    modalEditBtn.classList.remove("hidden");
    modalDeleteBtn.classList.remove("hidden");
    modalToggleBtn.classList.remove("hidden");
    modalMarkBtn.classList.remove("hidden");
    modalSaveEditBtn.classList.add("hidden");
    modalCancelEditBtn.classList.add("hidden");
}

function openSessionModal() {
    sessionFeedbackMsg.className = "feedback-message";
    sessionFeedbackMsg.style.display = "none";
    sessionModal.classList.add("active");
    sessionNameInput.focus();
}

function closeSessionModal() {
    sessionModal.classList.remove("active");
}

function showSessionFeedback(text, type) {
    sessionFeedbackMsg.textContent = text;
    sessionFeedbackMsg.className = `feedback-message ${type}`;
    sessionFeedbackMsg.style.display = "block";
}

async function createSessionFromForm() {
    const name = sessionNameInput.value.trim();
    const prefix = sessionPrefixInput.value.trim();
    const totalRooms = Number(sessionTotalInput.value);
    if (!name || !prefix || !totalRooms) {
        showSessionFeedback("กรุณากรอกชื่อ, prefix และจำนวนห้อง", "error");
        return;
    }

    try {
        const response = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, prefix, total_rooms: totalRooms })
        });
        const stateData = await response.json();
        if (!response.ok || !stateData.success) {
            showSessionFeedback(stateData.message || "สร้างไม่สำเร็จ", "error");
            return;
        }
        sessionNameInput.value = "";
        sessionPrefixInput.value = "";
        sessionTotalInput.value = "";
        closeSessionModal();
        applyState(stateData);
        showFeedback(`✅ สร้าง '${stateData.active_session.name}' แล้ว`, "success", true);
    } catch (err) {
        console.error("Create session error:", err);
        showSessionFeedback("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "error");
    }
}

async function activateSession(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/activate`, {
            method: "PUT"
        });
        const stateData = await response.json();
        if (!response.ok || !stateData.success) {
            showFeedback(`⚠️ ${stateData.message || "เปลี่ยน session ไม่สำเร็จ"}`, "error", true);
            return;
        }
        latestHighlightedUnit = null;
        searchQuery = "";
        searchInput.value = "";
        clearSearchBtn.style.display = "none";
        applyState(stateData);
    } catch (err) {
        console.error("Activate session error:", err);
        showFeedback("⚠️ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง", "error", true);
    }
}

function applyState(stateData) {
    sessions = stateData.sessions || [];
    applySessionConfig(stateData.active_session);
    checkedUnits = new Set(stateData.units || []);
    markedUnits = new Set(stateData.marked || []);
    renderSessionOptions();
    render();
}

// Handle Add Unit form action
async function handleAddUnit() {
    const rawVal = unitInput.value.trim();
    if (!rawVal) return;

    // Formatting frontend-side
    let parsedVal = rawVal;
    if (parsedVal.startsWith(PREFIX)) {
        parsedVal = parsedVal.slice(PREFIX.length);
    }
    if (/^\d+$/.test(parsedVal)) {
        parsedVal = String(Number(parsedVal)).padStart(getNumberWidth(), '0');
    }
    const fullUnitName = `${PREFIX}${parsedVal}`;

    // Frontend quick marked check
    if (markedUnits.has(fullUnitName)) {
        showFeedback(`⚠️ ห้อง '${fullUnitName}' มาร์คไว้ว่ายังไม่มีข้อมูล/กรอกไม่ได้ (กรุณาปลดมาร์คก่อน)`, "error", true);
        unitInput.select();
        unitInput.parentElement.style.borderColor = "var(--pink-color)";
        return;
    }

    // Frontend quick duplicate check
    if (checkedUnits.has(fullUnitName)) {
        showFeedback(`⚠️ ซ้ำ! ห้อง '${fullUnitName}' ถูกคีย์ไปแล้ว`, "error", true);
        unitInput.select();
        return;
    }

    await sendAddRequest(fullUnitName, true);
}

// API Post call for Checked-in Unit
async function sendAddRequest(unitName, fromSidebar = false) {
    try {
        const response = await fetch("/api/units", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unit: unitName })
        });

        const resData = await response.json();

        if (response.ok && resData.success) {
            latestHighlightedUnit = resData.unit;
            applyState(resData);

            if (fromSidebar) {
                showFeedback(`✅ บันทึก '${resData.unit}' สำเร็จ!`, "success", true);
                unitInput.value = "";
                unitInput.focus();
                unitInput.parentElement.style.borderColor = "";

                // Focus and scroll view to cell
                highlightAndScrollToCell(resData.unit);
            } else {
                closeModal();
            }
        } else {
            const errorMsg = resData.message || "เกิดข้อผิดพลาดในการบันทึก";
            if (fromSidebar) {
                showFeedback(`⚠️ ${errorMsg}`, "error", true);
                unitInput.select();
            } else {
                showModalFeedback(errorMsg, "error");
            }
        }
    } catch (err) {
        console.error("Add Request error:", err);
        const errMsg = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง";
        if (fromSidebar) showFeedback(`⚠️ ${errMsg}`, "error");
        else showModalFeedback(errMsg, "error");
    }
}

// API Delete call for Check-out
async function sendDeleteRequest(unitName) {
    try {
        const response = await fetch(`/api/units/${encodeURIComponent(unitName)}`, {
            method: "DELETE"
        });

        const resData = await response.json();

        if (response.ok && resData.success) {
            applyState(resData);
            closeModal();
            showFeedback(`🗑️ ยกเลิกการคีย์ห้อง '${unitName}' แล้ว`, "success");
        } else {
            showModalFeedback(resData.message || "เกิดข้อผิดพลาดในการลบ", "error");
        }
    } catch (err) {
        console.error("Delete request error:", err);
        showModalFeedback("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง", "error");
    }
}

// Toggle marked status (unavailable/no data)
async function sendMarkToggleRequest(unitName) {
    const isMarked = markedUnits.has(unitName);
    const method = isMarked ? "DELETE" : "POST";
    const url = isMarked ? `/api/marked/${encodeURIComponent(unitName)}` : "/api/marked";
    const options = { method };

    if (!isMarked) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({ unit: unitName });
    }

    try {
        const response = await fetch(url, options);
        const resData = await response.json();

        if (response.ok && resData.success) {
            applyState(resData);
            closeModal();
            const actionText = isMarked ? `ปลดมาร์คห้อง '${unitName}' แล้ว` : `มาร์คห้อง '${unitName}' ว่าไม่มีข้อมูลแล้ว`;
            showFeedback(`🌸 ${actionText}`, "success");
        } else {
            showModalFeedback(resData.message || "เกิดข้อผิดพลาดในการทำเครื่องหมาย", "error");
        }
    } catch (err) {
        console.error("Mark toggle error:", err);
        showModalFeedback("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง", "error");
    }
}

// API Put call for Edit Unit
async function sendEditRequest(oldUnit, newRaw) {
    try {
        const response = await fetch("/api/units", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ old_unit: oldUnit, new_unit: newRaw })
        });

        const resData = await response.json();

        if (response.ok && resData.success) {
            latestHighlightedUnit = resData.unit;
            applyState(resData);
            closeModal();
            showFeedback(`✏️ แก้ไขห้องจาก '${oldUnit}' เป็น '${resData.unit}' เรียบร้อย`, "success");

            // Highlight edited cell
            highlightAndScrollToCell(resData.unit);
        } else {
            showModalFeedback(resData.message || "เกิดข้อผิดพลาดในการแก้ไข", "error");
        }
    } catch (err) {
        console.error("Edit request error:", err);
        showModalFeedback("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง", "error");
    }
}

// Highlight cell helper
function highlightAndScrollToCell(unitName) {
    setTimeout(() => {
        const safeId = unitDomSafeId(unitName);
        const cellId = `cell-${safeId}`;
        const listItemId = `list-item-${safeId}`;
        const targetElement = currentView === "grid" ? document.getElementById(cellId) : document.getElementById(listItemId);

        if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
            targetElement.classList.add("latest-pulse");

            setTimeout(() => {
                targetElement.classList.remove("latest-pulse");
            }, 900);
        }
    }, 100);
}

// Render data onto Grid and List views
function render() {
    // Collect all units (Master list + checked + marked)
    const combinedUnitsSet = new Set([...allUnitsList, ...checkedUnits, ...markedUnits]);
    let unitsArray = Array.from(combinedUnitsSet);

    // Sort function: 42/001 -> 1
    const getSortValue = (str) => {
        try {
            const parts = str.split('/');
            const lastPart = parts[parts.length - 1];
            const num = parseInt(lastPart, 10);
            return isNaN(num) ? str : num;
        } catch (e) {
            return str;
        }
    };
    unitsArray.sort((a, b) => {
        const valA = getSortValue(a);
        const valB = getSortValue(b);
        if (typeof valA === "number" && typeof valB === "number") {
            return valA - valB;
        }
        return String(valA).localeCompare(String(valB));
    });

    // Apply Filter and Search query
    const filteredUnits = unitsArray.filter(unit => {
        // Search Filter
        const matchesSearch = unit.toLowerCase().includes(searchQuery);
        if (!matchesSearch) return false;

        // Status Filter
        const isChecked = checkedUnits.has(unit);
        const isMarked = markedUnits.has(unit);
        if (currentFilter === "checked") return isChecked;
        if (currentFilter === "unchecked") return !isChecked && !isMarked;
        if (currentFilter === "marked") return isMarked;

        return true;
    });

    // Render Grid View
    roomGrid.innerHTML = "";
    filteredUnits.forEach(unit => {
        const isChecked = checkedUnits.has(unit);
        const isMarked = markedUnits.has(unit);

        let cellClass = "unchecked";
        let statusIcon = "❌";
        if (isMarked) {
            cellClass = "marked";
            statusIcon = "🌸";
        } else if (isChecked) {
            cellClass = "checked";
            statusIcon = "✅";
        }

        const cell = document.createElement("div");
        cell.id = `cell-${unitDomSafeId(unit)}`;
        const latestClass = unit === latestHighlightedUnit ? " latest-unit" : "";
        cell.className = `room-cell ${cellClass}${latestClass}`;

        let displayNum = unit;
        if (unit.startsWith(PREFIX)) {
            displayNum = unit.slice(PREFIX.length);
        }

        cell.innerHTML = `
            <span class="cell-prefix">${PREFIX}</span>
            <span class="cell-number">${displayNum}</span>
            <span class="status-icon">${statusIcon}</span>
        `;

        cell.addEventListener("click", () => openModal(unit));
        roomGrid.appendChild(cell);
    });

    // Render List View
    roomList.innerHTML = "";
    filteredUnits.forEach(unit => {
        const isChecked = checkedUnits.has(unit);
        const isMarked = markedUnits.has(unit);

        let itemClass = "unchecked";
        let itemStatusText = "❌ ยังไม่บันทึก";
        if (isMarked) {
            itemClass = "marked";
            itemStatusText = "🌸 ไม่มีข้อมูล";
        } else if (isChecked) {
            itemClass = "checked";
            itemStatusText = "✅ บันทึกแล้ว";
        }

        const listItem = document.createElement("div");
        listItem.id = `list-item-${unitDomSafeId(unit)}`;
        const latestClass = unit === latestHighlightedUnit ? " latest-unit" : "";
        listItem.className = `room-list-item ${itemClass}${latestClass}`;

        listItem.innerHTML = `
            <span class="item-title">${unit}</span>
            <span class="item-status">${itemStatusText}</span>
        `;

        listItem.addEventListener("click", () => openModal(unit));
        roomList.appendChild(listItem);
    });

    // Update Stats Display
    const count = checkedUnits.size;
    const markedCount = markedUnits.size;
    const percentage = ((count / TOTAL_ROOMS) * 100).toFixed(1);

    statsCount.textContent = `${count} / ${TOTAL_ROOMS} ห้อง`;
    statsPercentage.textContent = `${percentage}%`;
    progressFill.style.width = `${Math.min(percentage, 100)}%`;

    // Marked count display
    const markedCountEl = document.getElementById("marked-count");
    if (markedCountEl) {
        markedCountEl.textContent = markedCount > 0 ? `🌸 ${markedCount} ห้อง` : "";
    }
}

// Modal open controller
function openModal(unit) {
    selectedUnit = unit;
    const isChecked = checkedUnits.has(unit);
    const isMarked = markedUnits.has(unit);

    modalTitle.textContent = `ห้อง ${unit}`;
    resetModalEditState();

    if (isMarked) {
        modalStatusText.textContent = "🌸 ยังไม่มีข้อมูล / ยังกรอกไม่ได้";
        modalStatusText.style.color = "var(--pink-color)";

        modalMarkBtn.textContent = "🔓 ปลดมาร์คสีชมพู";

        // Hide edit, delete, toggle
        modalToggleBtn.classList.add("hidden");
        modalEditBtn.classList.add("hidden");
        modalDeleteBtn.classList.add("hidden");
        modalMarkBtn.classList.remove("hidden");
    } else if (isChecked) {
        modalStatusText.textContent = "✅ บันทึกคีย์เรียบร้อยแล้ว";
        modalStatusText.style.color = "var(--success-color)";

        modalMarkBtn.textContent = "🌸 มาร์คไม่มีข้อมูล";

        // Show edit & delete, hide check-in
        modalToggleBtn.classList.add("hidden");
        modalEditBtn.classList.remove("hidden");
        modalDeleteBtn.classList.remove("hidden");
        modalMarkBtn.classList.remove("hidden");
    } else {
        modalStatusText.textContent = "❌ ยังไม่ได้คีย์บันทึกคีย์";
        modalStatusText.style.color = "var(--danger-color)";

        modalMarkBtn.textContent = "🌸 มาร์คไม่มีข้อมูล";

        // Show check-in, hide edit & delete
        modalToggleBtn.classList.remove("hidden");
        modalEditBtn.classList.add("hidden");
        modalDeleteBtn.classList.add("hidden");
        modalMarkBtn.classList.remove("hidden");
    }

    actionModal.classList.add("active");
}

// Modal close
function closeModal() {
    actionModal.classList.remove("active");
    selectedUnit = null;
    resetModalEditState();
}

// Toast Feedbacks for user
function showFeedback(text, type, autoHide = true) {
    feedbackMsg.textContent = text;
    feedbackMsg.className = `feedback-message ${type}`;
    feedbackMsg.style.display = "block";

    if (autoHide) {
        // Auto hide after 4 seconds
        setTimeout(() => {
            if (feedbackMsg.textContent === text) {
                feedbackMsg.style.display = "none";
            }
        }, 4000);
    }
}

// Modal toast feedback
function showModalFeedback(text, type) {
    modalFeedbackMsg.textContent = text;
    modalFeedbackMsg.className = `feedback-message ${type}`;
    modalFeedbackMsg.style.display = "block";
}

// Helper: check if two sets are identical
function areSetsEqual(setA, setB) {
    if (setA.size !== setB.size) return false;
    for (let a of setA) {
        if (!setB.has(a)) return false;
    }
    return true;
}

// Start application
document.addEventListener("DOMContentLoaded", init);
