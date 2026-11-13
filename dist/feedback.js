import { createIssueEditor } from "./issue-editor.js?v=issue-editor-3";

const form = document.querySelector("#feedback-form");
const fields = document.querySelector("#feedback-fields");
const picker = document.querySelector("#work-picker");
const workInput = document.querySelector("#feedback-work");
const toggle = document.querySelector("#work-options-toggle");
const menu = document.querySelector("#work-menu");
const options = document.querySelector("#work-options");
const empty = document.querySelector("#work-options-empty");
const message = document.querySelector("#feedback-message");
const submit = document.querySelector("#feedback-submit");
const status = document.querySelector("#feedback-status");
const issueEditor = createIssueEditor(fields, message);

let works = [];
let matches = [];
let selectedWork = null;
let activeIndex = -1;

function setMenuOpen(open) {
  menu.hidden = !open;
  workInput.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-expanded", String(open));
  activeIndex = -1;
  workInput.removeAttribute("aria-activedescendant");
}

function showOptions(query) {
  const search = query.trim().toLowerCase();
  matches = works.filter(work => work.title.toLowerCase().includes(search));
  options.replaceChildren(...matches.map((work, index) => {
    const option = document.createElement("li");
    option.id = `work-option-${index}`;
    option.dataset.index = index;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.textContent = work.title;
    return option;
  }));
  empty.hidden = matches.length > 0;
  menu.scrollTop = 0;
  setMenuOpen(true);
}

function chooseWork(work) {
  selectedWork = work;
  workInput.value = work.title;
  workInput.setCustomValidity("");
  workInput.focus();
  setMenuOpen(false);
}

function moveActiveOption(direction) {
  if (menu.hidden) showOptions(selectedWork ? "" : workInput.value);
  if (matches.length === 0) return;

  options.children[activeIndex]?.setAttribute("aria-selected", "false");
  if (activeIndex === -1) {
    activeIndex = direction > 0 ? 0 : matches.length - 1;
  } else {
    activeIndex = Math.max(0, Math.min(matches.length - 1, activeIndex + direction));
  }

  const option = options.children[activeIndex];
  option.setAttribute("aria-selected", "true");
  workInput.setAttribute("aria-activedescendant", option.id);
  option.scrollIntoView({ block: "nearest" });
}

workInput.addEventListener("input", () => {
  selectedWork = null;
  workInput.setCustomValidity("");
  showOptions(workInput.value);
});

workInput.addEventListener("focus", () => showOptions(selectedWork ? "" : workInput.value));
workInput.addEventListener("click", () => {
  if (menu.hidden) showOptions(selectedWork ? "" : workInput.value);
});

workInput.addEventListener("keydown", event => {
  if (event.isComposing) return;

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
  } else if (!menu.hidden && event.key === "Escape") {
    event.preventDefault();
    setMenuOpen(false);
  } else if (!menu.hidden && event.key === "Enter") {
    event.preventDefault();
    const work = matches[activeIndex] ?? (matches.length === 1 ? matches[0] : null);
    if (work) chooseWork(work);
  }
});

picker.addEventListener("mousedown", event => {
  if (event.target.closest("[role='option'], #work-options-toggle")) event.preventDefault();
});

toggle.addEventListener("click", () => {
  const opening = menu.hidden;
  workInput.focus();
  if (opening) showOptions("");
  else setMenuOpen(false);
});

options.addEventListener("click", event => {
  const option = event.target.closest("li[data-index]");
  if (option) chooseWork(matches[Number(option.dataset.index)]);
});

picker.addEventListener("focusout", event => {
  if (!picker.contains(event.relatedTarget)) setMenuOpen(false);
});

document.addEventListener("pointerdown", event => {
  if (!menu.hidden && !picker.contains(event.target)) setMenuOpen(false);
});

message.addEventListener("input", () => message.setCustomValidity(""));
form.addEventListener("input", () => { status.textContent = ""; });

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (fields.disabled) return;

  const work = selectedWork ?? works.find(item => item.title === workInput.value.trim());
  const content = message.value;
  workInput.setCustomValidity(work ? "" : "Please select an entry from the list.");
  message.setCustomValidity(content.trim() ? "" : "Please describe the issue.");
  if (!form.reportValidity()) return;

  setMenuOpen(false);
  fields.disabled = true;
  status.textContent = "Submitting…";

  try {
    const images = await issueEditor.readImages();
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ work: work.slug, message: content, images }),
    });
    if (response.status !== 201) throw new Error("Could not save feedback");
    if (images.length) {
      const receipt = await response.json();
      if (receipt.imageCount !== images.length) {
        throw new Error("Could not confirm all images were saved");
      }
    }

    form.reset();
    issueEditor.reset();
    selectedWork = null;
    status.textContent = "Report saved.";
  } catch {
    status.textContent = "Could not submit your report. Your details are still here. Please try again.";
  } finally {
    fields.disabled = false;
  }
});

try {
  const response = await fetch("./");
  if (!response.ok) throw new Error("Could not load the catalog");

  const homepage = new DOMParser().parseFromString(await response.text(), "text/html");
  for (const entry of homepage.querySelectorAll(".catalog-grid a.entry[href]")) {
    const slug = entry.getAttribute("href").match(/\/entries\/([a-z0-9-]+)\.html$/)?.[1];
    const title = entry.querySelector(".entry-title")?.textContent ?? entry.querySelector("img")?.alt;
    if (slug && title?.trim()) works.push({ slug, title: title.trim() });
  }
  if (works.length === 0) throw new Error("No works are available");

  workInput.disabled = false;
  toggle.disabled = false;
  submit.disabled = false;
} catch {
  status.textContent = "Could not load the entries. Refresh the page to try again.";
}
