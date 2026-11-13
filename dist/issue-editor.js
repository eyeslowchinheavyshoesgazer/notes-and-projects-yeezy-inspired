import { applyIssueFormat, renderIssueMarkdown } from "./issue-formatting.js?v=issue-editor-3";
import { annotateImage } from "./image-annotator.js?v=issue-editor-2";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxAttachmentCount = 4;
const maxAttachmentSize = 5 * 1024 * 1024;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function createIssueEditor(fields, message) {
  const write = fields.querySelector("#issue-write");
  const preview = fields.querySelector("#issue-preview");
  const modeToggle = fields.querySelector("#issue-mode-toggle");
  const readingIcon = modeToggle.querySelector('[data-mode-icon="reading"]');
  const sourceIcon = modeToggle.querySelector('[data-mode-icon="source"]');
  const attachImage = fields.querySelector("#issue-attach");
  const attachmentList = fields.querySelector("#issue-images");
  const editorStatus = fields.querySelector("#issue-image-status");
  const template = fields.querySelector("#issue-image-template");
  const attachments = [];

  function setPreview(show) {
    write.hidden = show;
    preview.hidden = !show;
    readingIcon.toggleAttribute("hidden", show);
    sourceIcon.toggleAttribute("hidden", !show);
    const label = show ? "Switch to Source Mode" : "Switch to Reading View";
    modeToggle.setAttribute("aria-label", label);
    modeToggle.title = label;
    if (!show) return;

    const source = message.value;
    const empty = !source.trim();
    preview.classList.toggle("issue-preview-empty", empty);
    if (empty) preview.textContent = "Nothing to preview yet.";
    else renderIssueMarkdown(preview, source);
  }

  function appendImage(file) {
    const row = template.content.firstElementChild.cloneNode(true);
    const thumbnail = row.querySelector("img");
    const name = row.querySelector(".issue-image-name");
    const annotate = row.querySelector("[data-annotate]");
    const remove = row.querySelector("[data-remove]");
    const attachment = { file, url: URL.createObjectURL(file) };

    function showAttachment() {
      name.textContent = attachment.file.name;
      remove.setAttribute("aria-label", `Remove ${attachment.file.name}`);
      thumbnail.src = attachment.url;
      annotate.setAttribute("aria-label", `Annotate ${attachment.file.name}`);
    }

    annotate.addEventListener("click", async () => {
      fields.disabled = true;
      editorStatus.textContent = "";
      try {
        const annotated = await annotateImage(attachment.file);
        if (!annotated) return;
        if (annotated.size > maxAttachmentSize) {
          editorStatus.textContent = "The annotated image is larger than 5 MB.";
          return;
        }
        URL.revokeObjectURL(attachment.url);
        attachment.file = annotated;
        attachment.url = URL.createObjectURL(annotated);
        showAttachment();
        editorStatus.textContent = "Image updated.";
      } catch (error) {
        editorStatus.textContent = error.message || "Could not annotate the image.";
      } finally {
        fields.disabled = false;
        annotate.focus();
      }
    });

    remove.addEventListener("click", () => {
      const next = row.nextElementSibling ?? row.previousElementSibling;
      URL.revokeObjectURL(attachment.url);
      attachments.splice(attachments.indexOf(attachment), 1);
      row.remove();
      attachmentList.hidden = attachments.length === 0;
      editorStatus.textContent = "";
      (next?.querySelector("[data-remove]") ?? attachImage).focus();
    });

    showAttachment();
    attachments.push(attachment);
    attachmentList.append(row);
  }

  function addImages(files) {
    const problems = new Set();
    for (const file of files) {
      if (attachments.length >= maxAttachmentCount) {
        problems.add(`You can attach up to ${maxAttachmentCount} images.`);
        break;
      }
      if (!imageTypes.has(file.type)) {
        problems.add("Choose PNG, JPEG, or WebP images.");
      } else if (file.size === 0 || file.size > maxAttachmentSize) {
        problems.add("Choose non-empty images no larger than 5 MB each.");
      } else {
        appendImage(file);
      }
    }
    attachmentList.hidden = attachments.length === 0;
    editorStatus.textContent = [...problems].join(" ");
  }

  function chooseImages() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.multiple = true;
    picker.hidden = true;
    picker.accept = [...imageTypes].join(",");
    picker.addEventListener("change", () => {
      addImages(picker.files);
      picker.remove();
    }, { once: true });
    picker.addEventListener("cancel", () => picker.remove(), { once: true });
    document.body.append(picker);
    picker.click();
  }

  modeToggle.addEventListener("click", () => setPreview(preview.hidden));
  for (const button of fields.querySelectorAll("[data-format]")) {
    button.addEventListener("click", () => {
      setPreview(false);
      if (applyIssueFormat(message, button.dataset.format)) {
        editorStatus.textContent = "";
      } else {
        editorStatus.textContent = "Issue details can be up to 3,000 characters.";
      }
    });
  }
  message.addEventListener("invalid", () => setPreview(false));
  attachImage.addEventListener("click", chooseImages);
  message.addEventListener("paste", event => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    addImages(files);
  });

  return {
    readImages() {
      return Promise.all(attachments.map(({ file }) => readImage(file)));
    },
    reset() {
      for (const { url } of attachments) {
        URL.revokeObjectURL(url);
      }
      attachments.length = 0;
      attachmentList.replaceChildren();
      attachmentList.hidden = true;
      editorStatus.textContent = "";
      preview.replaceChildren();
      setPreview(false);
    },
  };
}
