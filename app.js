// -------------------- Firebase --------------------

const firebaseConfig = {
  apiKey: "AIzaSyBsHFp5MfmldTvcDkatE4P9gXNRZ1Ivk0o",
  authDomain: "ems-dispatch-d1cd2.firebaseapp.com",
  projectId: "ems-dispatch-d1cd2",
  storageBucket: "ems-dispatch-d1cd2.firebasestorage.app",
  messagingSenderId: "529717769926",
  appId: "1:529717769926:web:6cf7c152a0ca5fbccac9c7",
  measurementId: "G-TZZFDBHVM2"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// -------------------- DOM --------------------

const statusText = document.getElementById("statusText");
const devToggle = document.getElementById("devToggle");
const board = document.getElementById("board");

const addTaskForm = document.getElementById("addTaskForm");
const addColumnForm = document.getElementById("addColumnForm");
const taskTitleInput = document.getElementById("taskTitle");
const taskDescInput = document.getElementById("taskDesc");
const taskBadgeInput = document.getElementById("taskBadge");
const taskColumnSelect = document.getElementById("taskColumn");
const taskSubSelect = document.getElementById("taskSubcategory");
const columnNameInput = document.getElementById("columnName");

const colorMenu = document.getElementById("colorMenu");
const colorMenuTitle = document.getElementById("colorMenuTitle");
const colorMenuColors = document.getElementById("colorMenuColors");

// -------------------- État --------------------

let devMode = false;
let columns = [];
let subcategories = [];
let tasks = [];

let colorMenuCallback = null;

// Heartbeat debounce
let heartbeatReloadTimer = null;

// -------------------- Utils --------------------

function setStatus(msg, ok = true){
  statusText.textContent = msg;
  statusText.classList.toggle("ok", ok);
  statusText.classList.toggle("err", !ok);
}

function formatDate(timestamp){
  if(!timestamp) return "";
  const date = timestamp.toDate();
  return date.toLocaleString("fr-FR",{
    day:"2-digit",
    month:"2-digit",
    hour:"2-digit",
    minute:"2-digit"
  });
}

function setDevMode(enabled){
  devMode = enabled;
  document.body.classList.toggle("dev-mode-on", enabled);
}

devToggle.addEventListener("change", e => {
  setDevMode(e.target.checked);
});

// Palette de couleur (comme sur Miro)
const COLOR_PALETTE = [
  "#fde68a","#fbbf24","#d97706","#ffffff","#e5e7eb",
  "#fecaca","#f97373","#ef4444","#9ca3af","#6b7280",
  "#bbf7d0","#4ade80","#22c55e","#16a34a","#4b5563",
  "#bfdbfe","#60a5fa","#3b82f6","#1d4ed8","#020617",
  "#e9d5ff","#a855f7","#7c3aed","#facc15","#f97316"
];

// Remplit le menu de couleurs
COLOR_PALETTE.forEach(color => {
  const btn = document.createElement("button");
  btn.className = "color-swatch dev-only";
  btn.style.background = color;
  btn.addEventListener("click", () => {
    if(!devMode) return;
    if(colorMenuCallback) colorMenuCallback(color);
    closeColorMenu();
  });
  colorMenuColors.appendChild(btn);
});

function openColorMenu(x,y,title,callback){
  if(!devMode) return;
  colorMenuTitle.textContent = title || "Couleur";
  colorMenuCallback = callback;
  colorMenu.style.left = x + "px";
  colorMenu.style.top = y + "px";
  colorMenu.classList.remove("hidden");
}

function closeColorMenu(){
  colorMenu.classList.add("hidden");
  colorMenuCallback = null;
}

document.addEventListener("click", e => {
  if(!colorMenu.contains(e.target)) closeColorMenu();
});

// Couleurs des cartes et tags

function applyCardColor(card,color){
  if(!color){
    card.style.background = "#ffffff";
    card.style.borderColor = "#e5e7eb";
    card.style.boxShadow = "0 2px 6px rgba(15,23,42,0.12)";
    card.style.color = "#111827";
    card.querySelectorAll(".card-title").forEach(el=>el.style.color="#111827");
    card.querySelectorAll(".card-desc").forEach(el=>el.style.color="#4b5563");
    card.querySelectorAll(".card-meta").forEach(el=>el.style.color="#6b7280");
    return;
  }
  card.style.background = color;
  card.style.borderColor = color;
  card.style.boxShadow = "0 2px 6px rgba(15,23,42,0.12)";
  const r = parseInt(color.substr(1,2),16);
  const g = parseInt(color.substr(3,2),16);
  const b = parseInt(color.substr(5,2),16);
  const lum = 0.299*r + 0.587*g + 0.114*b;
  const text = lum < 140 ? "#f9fafb" : "#111827";
  const secondary = lum < 140 ? "#e5e7eb" : "#374151";
  card.style.color = text;
  card.querySelectorAll(".card-title").forEach(el=>el.style.color=text);
  card.querySelectorAll(".card-desc").forEach(el=>el.style.color=secondary);
  card.querySelectorAll(".card-meta").forEach(el=>el.style.color=secondary);
}

function applyBadgeColor(tag,color){
  if(!color){
    tag.style.background = "";
    tag.style.borderColor = "";
    tag.style.color = "";
    return;
  }
  const r = parseInt(color.substr(1,2),16);
  const g = parseInt(color.substr(3,2),16);
  const b = parseInt(color.substr(5,2),16);
  const lum = 0.299*r + 0.587*g + 0.114*b;
  const text = lum < 140 ? "#f9fafb" : "#111827";
  tag.style.background = color;
  tag.style.borderColor = color;
  tag.style.color = text;
}

// -------------------- Heartbeat --------------------

function touchHeartbeat(){
  db.collection("meta").doc("heartbeat").set({
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge:true });
}

function listenHeartbeat(){
  db.collection("meta").doc("heartbeat").onSnapshot(doc => {
    if(!doc.exists) return;
    if(heartbeatReloadTimer) clearTimeout(heartbeatReloadTimer);
    heartbeatReloadTimer = setTimeout(() => {
      loadAllData();
      heartbeatReloadTimer = null;
    }, 400);
  });
}

// -------------------- Form selects --------------------

function updateTaskSubSelect(){
  const colId = taskColumnSelect.value;
  taskSubSelect.innerHTML = "";

  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "Sans sous-catégorie";
  taskSubSelect.appendChild(optNone);

  if(!colId) return;

  const subsForCol = subcategories
    .filter(s => s.columnId === colId)
    .sort((a,b) => (a.order || 0) - (b.order || 0));

  subsForCol.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub.id;
    opt.textContent = sub.name;
    taskSubSelect.appendChild(opt);
  });
}

function updateTaskColumnSelect(){
  const current = taskColumnSelect.value;
  taskColumnSelect.innerHTML = "";

  columns.forEach(col => {
    const opt = document.createElement("option");
    opt.value = col.id;
    opt.textContent = col.name;
    taskColumnSelect.appendChild(opt);
  });

  if(columns.length){
    const found = columns.find(c => c.id === current) || columns[0];
    taskColumnSelect.value = found.id;
  }

  updateTaskSubSelect();
}

taskColumnSelect.addEventListener("change", updateTaskSubSelect);

// -------------------- Création cartes --------------------

function createCard(id,data,label,columnId,subId){
  const card = document.createElement("div");
  card.className = "card";
  card.draggable = true;
  card.dataset.id = id;
  card.dataset.columnId = columnId;
  card.dataset.subId = subId || "";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = data.title || "(Sans titre)";

  const desc = document.createElement("div");
  desc.className = "card-desc";
  desc.textContent = data.description || "";

  const meta = document.createElement("div");
  meta.className = "card-meta";

  const leftMeta = document.createElement("div");
  leftMeta.style.display = "flex";
  leftMeta.style.alignItems = "center";
  leftMeta.style.gap = "0.3rem";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = data.badgeLabel || label || "Sans libellé";

  // Badge couleur
  tag.addEventListener("click", e => {
    if(!devMode) return;
    e.stopPropagation();
    const rect = tag.getBoundingClientRect();
    openColorMenu(rect.left, rect.bottom + 4, "Couleur du badge", async newColor => {
      try{
        await db.collection("tasks").doc(id).update({ badgeColor:newColor });
        touchHeartbeat();
      }catch(err){
        console.error(err);
        alert("Erreur lors de la mise à jour du badge.");
      }
    });
  });

  // Badge texte
  tag.addEventListener("dblclick", async e => {
    if(!devMode) return;
    e.stopPropagation();
    const currentText = data.badgeLabel || tag.textContent;
    const newText = prompt("Texte du badge :", currentText);
    if(newText === null) return;
    const trimmed = newText.trim();
    try{
      await db.collection("tasks").doc(id).update({ badgeLabel: trimmed || null });
      touchHeartbeat();
    }catch(err){
      console.error(err);
      alert("Erreur lors de la mise à jour du badge.");
    }
  });

  applyBadgeColor(tag, data.badgeColor);

  const colorBtn = document.createElement("button");
  colorBtn.className = "color-trigger small dev-only";
  colorBtn.style.background = data.color || "#22c55e";
  colorBtn.addEventListener("click", e => {
    if(!devMode) return;
    e.stopPropagation();
    const rect = colorBtn.getBoundingClientRect();
    openColorMenu(rect.left, rect.bottom + 4, "Couleur de la carte", async newColor => {
      try{
        await db.collection("tasks").doc(id).update({ color:newColor });
        touchHeartbeat();
      }catch(err){
        console.error(err);
        alert("Erreur lors de la mise à jour de la couleur de la carte.");
      }
    });
  });

  leftMeta.appendChild(tag);
  leftMeta.appendChild(colorBtn);

  const date = document.createElement("span");
  date.textContent = formatDate(data.createdAt);

  meta.appendChild(leftMeta);
  meta.appendChild(date);

  card.appendChild(title);
  if(data.description) card.appendChild(desc);
  card.appendChild(meta);

  applyCardColor(card, data.color);

  // Drag & drop cartes

  card.addEventListener("dragstart", e => {
    e.dataTransfer.setData("taskId", id);
  });

  card.addEventListener("dragover", e => {
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const pos = offsetY < rect.height/2 ? "before" : "after";
    card.dataset.dropPosition = pos;
    card.classList.toggle("card--drag-over-top", pos === "before");
    card.classList.toggle("card--drag-over-bottom", pos === "after");
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("card--drag-over-top","card--drag-over-bottom");
    delete card.dataset.dropPosition;
  });

  card.addEventListener("drop", async e => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove("card--drag-over-top","card--drag-over-bottom");

    const draggedId = e.dataTransfer.getData("taskId");
    if(!draggedId || draggedId === id) return;

    const destColumnId = columnId;
    const destSubId = subId || null;
    const draggedTask = tasks.find(t => t.id === draggedId);
    if(!draggedTask) return;

    let destTasks = tasks
      .filter(t => t.columnId === destColumnId && (t.subcategoryId || null) === destSubId && t.id !== draggedId)
      .sort((a,b) => (a.order || 0) - (b.order || 0));

    const targetIndex = destTasks.findIndex(t => t.id === id);
    if(targetIndex === -1) return;

    const position = card.dataset.dropPosition || "after";
    let insertIndex = position === "before" ? targetIndex : targetIndex + 1;

    const movedClone = { ...draggedTask, columnId:destColumnId, subcategoryId:destSubId };
    destTasks.splice(insertIndex,0,movedClone);

    const batch = db.batch();
    destTasks.forEach((t, idx) => {
      const ref = db.collection("tasks").doc(t.id);
      const dataUpdate = { order: idx };
      if(t.id === draggedId){
        dataUpdate.columnId = destColumnId;
        dataUpdate.subcategoryId = destSubId;
      }
      batch.update(ref, dataUpdate);
    });

    try{
      await batch.commit();
      touchHeartbeat();
    }catch(err){
      console.error(err);
      alert("Erreur lors du déplacement.");
    }
  });

  // Supprimer carte
  card.addEventListener("dblclick", async () => {
    if(!devMode) return;
    if(!confirm("Supprimer cette carte ?")) return;
    try{
      await db.collection("tasks").doc(id).delete();
      touchHeartbeat();
    }catch(err){
      console.error(err);
      alert("Erreur lors de la suppression.");
    }
  });

  return card;
}

// -------------------- Suppression colonnes & sous-cat --------------------

async function deleteColumnAndTasks(columnId,columnName){
  if(!devMode) return;
  if(!confirm(`Supprimer la catégorie "${columnName}" et toutes ses cartes ?`)) return;
  try{
    setStatus("Suppression de la catégorie...");
    const tasksSnap = await db.collection("tasks").where("columnId","==",columnId).get();
    const subsSnap = await db.collection("subcategories").where("columnId","==",columnId).get();
    const batch = db.batch();
    tasksSnap.forEach(doc => batch.delete(doc.ref));
    subsSnap.forEach(doc => batch.delete(doc.ref));
    batch.delete(db.collection("columns").doc(columnId));
    await batch.commit();
    touchHeartbeat();
    setStatus("Connecté",true);
  }catch(err){
    console.error(err);
    setStatus("Erreur suppression catégorie",false);
    alert("Erreur lors de la suppression de la catégorie.");
  }
}

async function deleteSubcategoryAndMoveTasks(subId, subName){
  if(!devMode) return;
  if(!confirm(`Supprimer la sous-catégorie "${subName}" et renvoyer ses cartes dans "Sans sous-catégorie" ?`)) return;
  try{
    setStatus("Suppression de la sous-catégorie...");
    const snap = await db.collection("tasks").where("subcategoryId","==",subId).get();
    const batch = db.batch();
    snap.forEach(doc => batch.update(doc.ref,{ subcategoryId:null }));
    batch.delete(db.collection("subcategories").doc(subId));
    await batch.commit();
    touchHeartbeat();
    setStatus("Connecté",true);
  }catch(err){
    console.error(err);
    setStatus("Erreur suppression sous-catégorie",false);
    alert("Erreur lors de la suppression de la sous-catégorie.");
  }
}

// -------------------- Rendu complet du board --------------------

function renderBoard(){
  board.innerHTML = "";

  columns.forEach(column => {
    const colArticle = document.createElement("article");
    colArticle.className = "column";
    if(column.color){
      colArticle.style.borderColor = column.color;
      colArticle.style.boxShadow = "0 6px 14px rgba(15,23,42,0.12)";
    }

    const header = document.createElement("div");
    header.className = "column-header";

    const headerLeft = document.createElement("div");
    headerLeft.style.display = "flex";
    headerLeft.style.alignItems = "center";
    headerLeft.style.gap = ".35rem";

    const titleSpan = document.createElement("span");
    titleSpan.className = "column-title";
    titleSpan.textContent = column.name;

    // Renommer colonne
    titleSpan.addEventListener("dblclick", () => {
      if(!devMode) return;
      const input = document.createElement("input");
      input.type = "text";
      input.value = column.name;
      input.style.fontSize = ".9rem";
      input.style.padding = "0.1rem 0.3rem";
      input.style.borderRadius = "0.5rem";
      input.style.border = "1px solid #9ca3af";
      input.style.outline = "none";
      headerLeft.replaceChild(input, titleSpan);
      input.focus();
      input.select();

      const finish = async save => {
        const newName = input.value.trim();
        headerLeft.replaceChild(titleSpan,input);
        if(save && newName && newName !== column.name){
          try{
            await db.collection("columns").doc(column.id).update({ name:newName });
            touchHeartbeat();
          }catch(err){
            console.error(err);
            alert("Erreur lors du renommage.");
          }
        }
      };

      input.addEventListener("blur", () => finish(true));
      input.addEventListener("keydown", e => {
        if(e.key === "Enter") finish(true);
        if(e.key === "Escape") finish(false);
      });
    });

    const countSpan = document.createElement("span");
    countSpan.className = "column-count";

    headerLeft.appendChild(titleSpan);
    headerLeft.appendChild(countSpan);

    const headerActions = document.createElement("div");
    headerActions.className = "column-actions";

    const colColorBtn = document.createElement("button");
    colColorBtn.className = "color-trigger dev-only";
    colColorBtn.style.background = column.color || "#22c55e";
    colColorBtn.addEventListener("click", e => {
      if(!devMode) return;
      e.stopPropagation();
      const rect = colColorBtn.getBoundingClientRect();
      openColorMenu(rect.left, rect.bottom + 4, "Couleur de la colonne", async newColor => {
        try{
          await db.collection("columns").doc(column.id).update({ color:newColor });
          touchHeartbeat();
        }catch(err){
          console.error(err);
          alert("Erreur lors du changement de couleur.");
        }
      });
    });

    const addSubBtn = document.createElement("button");
    addSubBtn.className = "icon-btn dev-only";
    addSubBtn.title = "Ajouter une sous-catégorie";
    addSubBtn.textContent = "+";
    addSubBtn.addEventListener("click", async () => {
      if(!devMode) return;
      const name = prompt("Nom de la nouvelle sous-catégorie :");
      if(!name) return;
      try{
        const currentSubs = subcategories.filter(s => s.columnId === column.id);
        const order = currentSubs.length
          ? Math.max(...currentSubs.map(s => s.order || 0)) + 1
          : 0;
        await db.collection("subcategories").add({
          columnId: column.id,
          name: name.trim(),
          order,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        touchHeartbeat();
      }catch(err){
        console.error(err);
        alert("Erreur lors de l'ajout de la sous-catégorie.");
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn dev-only";
    deleteBtn.title = "Supprimer la catégorie";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () => {
      deleteColumnAndTasks(column.id, column.name);
    });

    headerActions.appendChild(colColorBtn);
    headerActions.appendChild(addSubBtn);
    headerActions.appendChild(deleteBtn);

    header.appendChild(headerLeft);
    header.appendChild(headerActions);

    const body = document.createElement("div");
    body.className = "column-body";

    const tasksForColumn = tasks.filter(t => t.columnId === column.id);
    countSpan.textContent = tasksForColumn.length;

    const subsForCol = subcategories
      .filter(s => s.columnId === column.id)
      .sort((a,b) => (a.order || 0) - (b.order || 0));

    // ---- Bloc "Sans sous-catégorie" ----

    const noSubTasks = tasksForColumn.filter(t => !t.subcategoryId);
    const noSubBlock = document.createElement("div");
    noSubBlock.className = "subcategory subcategory--none";

    const nsHeader = document.createElement("div");
    nsHeader.className = "subcategory-header";

    const nsTitle = document.createElement("span");
    nsTitle.className = "subcategory-title";
    nsTitle.textContent = "Sans sous-catégorie";

    const nsCount = document.createElement("span");
    nsCount.className = "subcategory-count";
    nsCount.textContent = noSubTasks.length;

    nsHeader.appendChild(nsTitle);
    nsHeader.appendChild(nsCount);

    const noSubBody = document.createElement("div");
    noSubBody.className = "subcategory-body";
    noSubBody.dataset.columnId = column.id;
    noSubBody.dataset.subId = "";

    noSubTasks
      .slice()
      .sort((a,b) => (a.order || 0) - (b.order || 0))
      .forEach(item => {
        const label = column.name;
        const card = createCard(item.id,item,label,column.id,null);
        noSubBody.appendChild(card);
      });

    noSubBody.addEventListener("dragover", e => {
      e.preventDefault();
      noSubBody.classList.add("subcategory-body--hover");
    });
    noSubBody.addEventListener("dragleave", () => {
      noSubBody.classList.remove("subcategory-body--hover");
    });
    noSubBody.addEventListener("drop", async e => {
      e.preventDefault();
      noSubBody.classList.remove("subcategory-body--hover");
      const id = e.dataTransfer.getData("taskId");
      if(!id) return;
      try{
        const destTasks = tasks
          .filter(t => t.columnId === column.id && !t.subcategoryId && t.id !== id)
          .sort((a,b) => (a.order || 0) - (b.order || 0));
        const newOrder = destTasks.length ? (destTasks[destTasks.length-1].order || 0) + 1 : 0;
        await db.collection("tasks").doc(id).update({
          columnId: column.id,
          subcategoryId: null,
          order: newOrder
        });
        touchHeartbeat();
      }catch(err){
        console.error(err);
        alert("Erreur lors du déplacement.");
      }
    });

    noSubBlock.appendChild(nsHeader);
    noSubBlock.appendChild(noSubBody);
    body.appendChild(noSubBlock);

    // ---- Sous-catégories avec drag & drop ----

    subsForCol.forEach(sub => {
      const subBlock = document.createElement("div");
      subBlock.className = "subcategory";
      subBlock.draggable = devMode; // drag seulement en mode dev
      subBlock.dataset.subId = sub.id;

      if(sub.color){
        subBlock.style.borderColor = sub.color;
        subBlock.style.boxShadow = "0 2px 6px rgba(15,23,42,0.08)";
      }

      const subHeader = document.createElement("div");
      subHeader.className = "subcategory-header";

      const subHeaderLeft = document.createElement("div");
      subHeaderLeft.style.display = "flex";
      subHeaderLeft.style.alignItems = "center";
      subHeaderLeft.style.gap = ".25rem";

      const subTitle = document.createElement("span");
      subTitle.className = "subcategory-title";
      subTitle.textContent = sub.name;

      subTitle.addEventListener("dblclick", () => {
        if(!devMode) return;
        const input = document.createElement("input");
        input.type = "text";
        input.value = sub.name;
        input.style.fontSize = ".8rem";
        input.style.padding = "0.05rem 0.3rem";
        input.style.borderRadius = "0.4rem";
        input.style.border = "1px solid #9ca3af";
        input.style.outline = "none";
        subHeaderLeft.replaceChild(input, subTitle);
        input.focus();
        input.select();

        const finish = async save => {
          const newName = input.value.trim();
          subHeaderLeft.replaceChild(subTitle,input);
          if(save && newName && newName !== sub.name){
            try{
              await db.collection("subcategories").doc(sub.id).update({ name:newName });
              touchHeartbeat();
            }catch(err){
              console.error(err);
              alert("Erreur lors du renommage de la sous-catégorie.");
            }
          }
        };

        input.addEventListener("blur", () => finish(true));
        input.addEventListener("keydown", e => {
          if(e.key==="Enter") finish(true);
          if(e.key==="Escape") finish(false);
        });
      });

      const subCount = document.createElement("span");
      subCount.className = "subcategory-count";

      subHeaderLeft.appendChild(subTitle);
      subHeaderLeft.appendChild(subCount);

      const subActions = document.createElement("div");
      subActions.style.display = "flex";
      subActions.style.alignItems = "center";
      subActions.style.gap = ".2rem";

      const subColorBtn = document.createElement("button");
      subColorBtn.className = "color-trigger small dev-only";
      subColorBtn.style.background = sub.color || "#22c55e";
      subColorBtn.addEventListener("click", e => {
        if(!devMode) return;
        e.stopPropagation();
        const rect = subColorBtn.getBoundingClientRect();
        openColorMenu(rect.left, rect.bottom + 4, "Couleur de la sous-catégorie", async newColor => {
          try{
            await db.collection("subcategories").doc(sub.id).update({ color:newColor });
            touchHeartbeat();
          }catch(err){
            console.error(err);
            alert("Erreur lors du changement de couleur.");
          }
        });
      });

      const delSubBtn = document.createElement("button");
      delSubBtn.className = "icon-btn dev-only";
      delSubBtn.title = "Supprimer la sous-catégorie";
      delSubBtn.textContent = "🗑";
      delSubBtn.addEventListener("click", () => {
        deleteSubcategoryAndMoveTasks(sub.id, sub.name);
      });

      subActions.appendChild(subColorBtn);
      subActions.appendChild(delSubBtn);

      subHeader.appendChild(subHeaderLeft);
      subHeader.appendChild(subActions);

      const subBody = document.createElement("div");
      subBody.className = "subcategory-body";
      subBody.dataset.columnId = column.id;
      subBody.dataset.subId = sub.id;

      const tasksForSub = tasksForColumn
        .filter(t => t.subcategoryId === sub.id)
        .sort((a,b) => (a.order || 0) - (b.order || 0));
      subCount.textContent = tasksForSub.length;

      tasksForSub.forEach(item => {
        const label = sub.name;
        const card = createCard(item.id,item,label,column.id,sub.id);
        subBody.appendChild(card);
      });

      subBody.addEventListener("dragover", e => {
        e.preventDefault();
        subBody.classList.add("subcategory-body--hover");
      });
      subBody.addEventListener("dragleave", () => {
        subBody.classList.remove("subcategory-body--hover");
      });
      subBody.addEventListener("drop", async e => {
        e.preventDefault();
        subBody.classList.remove("subcategory-body--hover");
        const id = e.dataTransfer.getData("taskId");
        if(!id) return;
        try{
          const destTasks = tasks
            .filter(t => t.columnId === column.id && t.subcategoryId === sub.id && t.id !== id)
            .sort((a,b) => (a.order || 0) - (b.order || 0));
          const newOrder = destTasks.length ? (destTasks[destTasks.length-1].order || 0) + 1 : 0;
          await db.collection("tasks").doc(id).update({
            columnId: column.id,
            subcategoryId: sub.id,
            order: newOrder
          });
          touchHeartbeat();
        }catch(err){
          console.error(err);
          alert("Erreur lors du déplacement.");
        }
      });

      // Drag & drop des sous-catégories (devMode uniquement)
      if(devMode){
        subBlock.addEventListener("dragstart", e => {
          e.dataTransfer.setData("subId", sub.id);
          subBlock.classList.add("dragging-sub");
        });
        subBlock.addEventListener("dragend", () => {
          subBlock.classList.remove("dragging-sub");
        });
        subBlock.addEventListener("dragover", e => {
          if(!devMode) return;
          e.preventDefault();
          const rect = subBlock.getBoundingClientRect();
          const offsetY = e.clientY - rect.top;
          if(offsetY < rect.height/2){
            subBlock.classList.add("sub-drop-top");
            subBlock.classList.remove("sub-drop-bottom");
          }else{
            subBlock.classList.add("sub-drop-bottom");
            subBlock.classList.remove("sub-drop-top");
          }
        });
        subBlock.addEventListener("dragleave", () => {
          subBlock.classList.remove("sub-drop-top","sub-drop-bottom");
        });
        subBlock.addEventListener("drop", async e => {
          if(!devMode) return;
          e.preventDefault();
          const draggedSubId = e.dataTransfer.getData("subId");
          subBlock.classList.remove("sub-drop-top","sub-drop-bottom");
          if(!draggedSubId || draggedSubId === sub.id) return;

          let siblings = subcategories
            .filter(s => s.columnId === column.id)
            .sort((a,b) => (a.order || 0) - (b.order || 0));

          const fromIndex = siblings.findIndex(s => s.id === draggedSubId);
          const toIndex = siblings.findIndex(s => s.id === sub.id);
          if(fromIndex === -1 || toIndex === -1) return;

          let insertAt = toIndex;
          if(subBlock.classList.contains("sub-drop-bottom")) insertAt++;

          const moved = siblings.splice(fromIndex,1)[0];
          siblings.splice(insertAt,0,moved);

          const batch = db.batch();
          siblings.forEach((s,i) => {
            batch.update(db.collection("subcategories").doc(s.id),{ order:i });
          });

          try{
            await batch.commit();
            touchHeartbeat();
          }catch(err){
            console.error(err);
            alert("Erreur lors du déplacement de la sous-catégorie.");
          }
        });
      }

      subBlock.appendChild(subHeader);
      subBlock.appendChild(subBody);
      body.appendChild(subBlock);
    });

    colArticle.appendChild(header);
    colArticle.appendChild(body);
    board.appendChild(colArticle);
  });

  updateTaskColumnSelect();
}

// -------------------- Chargement des données --------------------

async function loadAllData(){
  try{
    setStatus("Chargement...");
    const [colSnap, subSnap, taskSnap] = await Promise.all([
      db.collection("columns").orderBy("order","asc").get(),
      db.collection("subcategories").orderBy("order","asc").get(),
      db.collection("tasks").orderBy("order","asc").get()
    ]);
    columns = colSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    subcategories = subSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    tasks = taskSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderBoard();
    setStatus("Connecté",true);
  }catch(err){
    console.error(err);
    setStatus("Erreur de chargement",false);
  }
}

// -------------------- Création par défaut de 3 colonnes (au besoin) --------------------

async function createDefaultColumnsIfEmpty(){
  const snap = await db.collection("columns").limit(1).get();
  if(!snap.empty) return;
  const names = ["À faire","En cours","Terminé"];
  const batch = db.batch();
  names.forEach((name,idx) => {
    const ref = db.collection("columns").doc();
    batch.set(ref,{
      name,
      order:idx,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
  touchHeartbeat();
}

// -------------------- Form events --------------------

addTaskForm.addEventListener("submit", async e => {
  e.preventDefault();
  if(!devMode) return;
  const title = taskTitleInput.value.trim();
  const description = taskDescInput.value.trim();
  const badgeLabel = taskBadgeInput.value.trim() || null;
  const columnId = taskColumnSelect.value;
  const subId = taskSubSelect.value || null;
  if(!title || !columnId) return;

  try{
    const existing = tasks
      .filter(t => t.columnId === columnId && (t.subcategoryId || null) === (subId || null))
      .sort((a,b) => (a.order || 0) - (b.order || 0));
    const order = existing.length ? (existing[existing.length-1].order || 0) + 1 : 0;

    await db.collection("tasks").add({
      title,
      description,
      badgeLabel,
      columnId,
      subcategoryId: subId,
      order,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    touchHeartbeat();
    taskTitleInput.value = "";
    taskDescInput.value = "";
    taskBadgeInput.value = "";
  }catch(err){
    console.error(err);
    alert("Erreur lors de l'ajout de la carte.");
  }
});

addColumnForm.addEventListener("submit", async e => {
  e.preventDefault();
  if(!devMode) return;
  const name = columnNameInput.value.trim();
  if(!name) return;
  try{
    const order = columns.length ? Math.max(...columns.map(c => c.order || 0)) + 1 : 0;
    await db.collection("columns").add({
      name,
      order,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    touchHeartbeat();
    columnNameInput.value = "";
  }catch(err){
    console.error(err);
    alert("Erreur lors de l'ajout de la catégorie.");
  }
});

// -------------------- Init --------------------

(async function init(){
  setDevMode(false);           // mode dev OFF par défaut
  await createDefaultColumnsIfEmpty();
  listenHeartbeat();           // écoute le heartbeat
  await loadAllData();         // premier chargement
})();
