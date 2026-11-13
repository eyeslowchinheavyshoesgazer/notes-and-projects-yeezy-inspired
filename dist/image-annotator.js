const maxSide = 2048;
const maxImageBytes = 5 * 1024 * 1024;
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function drawMark(context, mark) {
  const { tool, color, points, text } = mark;
  const [start] = points;
  const end = points.at(-1);
  const lineWidth = context.lineWidth;
  context.fillStyle = color;
  context.strokeStyle = color;
  context.beginPath();

  if (tool === "text") {
    const size = Math.max(14, lineWidth * 5);
    context.font = `600 ${size}px sans-serif`;
    context.textBaseline = "top";
    const width = Math.min(context.measureText(text).width, context.canvas.width);
    const left = Math.min(start.x, context.canvas.width - width);
    const top = Math.min(start.y, Math.max(0, context.canvas.height - size));
    context.fillText(text, left, top, width);
  } else if (tool === "pen") {
    if (points.length === 1) {
      context.arc(start.x, start.y, lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(start.x, start.y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
  } else if (tool === "rectangle") {
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (tool === "arrow") {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length < 2) return;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = Math.min(lineWidth * 5, length * 0.45);
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    for (const offset of [-0.55, 0.55]) {
      context.moveTo(end.x, end.y);
      context.lineTo(
        end.x - head * Math.cos(angle + offset),
        end.y - head * Math.sin(angle + offset),
      );
    }
    context.stroke();
  }
}

async function exportImage(canvas, file) {
  const type = extensions[file.type] ? file.type : "image/png";
  let output = canvas;

  while (true) {
    const blob = await new Promise(resolve => output.toBlob(resolve, type, 0.92));
    if (!blob) throw new Error("The annotated image could not be saved.");
    if (blob.size <= maxImageBytes) {
      const name = file.name.replace(/\.[^.]+$/, "").replace(/-annotated$/, "");
      return new File([blob], `${name}-annotated.${extensions[blob.type]}`, { type: blob.type });
    }

    const smaller = document.createElement("canvas");
    smaller.width = Math.max(1, Math.floor(output.width * 0.75));
    smaller.height = Math.max(1, Math.floor(output.height * 0.75));
    smaller.getContext("2d").drawImage(output, 0, 0, smaller.width, smaller.height);
    output = smaller;
  }
}

export async function annotateImage(file) {
  const image = new Image();
  const source = URL.createObjectURL(file);
  image.src = source;

  const dialog = document.createElement("dialog");
  dialog.className = "image-annotator";
  dialog.setAttribute("aria-labelledby", "image-annotator-title");
  dialog.innerHTML = `
    <h2 id="image-annotator-title">Annotate image</h2>
    <div class="image-annotator-toolbar">
      <div class="image-annotator-tools" role="group" aria-label="Annotation tools">
        <button type="button" data-tool="pen" aria-pressed="true" autofocus>Pen</button>
        <button type="button" data-tool="rectangle" aria-pressed="false">Rectangle</button>
        <button type="button" data-tool="arrow" aria-pressed="false">Arrow</button>
        <button type="button" data-tool="text" aria-pressed="false">Text</button>
      </div>
      <label class="image-annotator-color">Color <input type="color" value="#e3262e"></label>
      <button type="button" data-undo disabled>Undo</button>
    </div>
    <label class="image-annotator-text" hidden>
      Annotation text
      <input type="text" maxlength="140">
    </label>
    <div class="image-annotator-stage">
      <div class="image-annotator-surface">
        <canvas tabindex="0" aria-label="Annotation canvas" aria-describedby="image-annotator-help"></canvas>
        <span class="image-annotator-cursor" aria-hidden="true"></span>
      </div>
    </div>
    <p id="image-annotator-help" class="visually-hidden">Draw with a pointer. With the keyboard, use the arrow keys to move and Space to start or finish a mark.</p>
    <p class="image-annotator-status" role="status"></p>
    <div class="image-annotator-actions">
      <button type="button" data-cancel>Cancel</button>
      <button type="button" data-save disabled>Save annotation</button>
    </div>`;

  let pendingFrame = null;
  try {
    try {
      await image.decode();
    } catch {
      throw new Error("This image could not be opened for annotation.");
    }

    const canvas = dialog.querySelector("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image annotation is unavailable in this browser.");
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(2, Math.min(canvas.width, canvas.height) / 180);

    const toolButtons = [...dialog.querySelectorAll("[data-tool]")];
    const undo = dialog.querySelector("[data-undo]");
    const save = dialog.querySelector("[data-save]");
    const status = dialog.querySelector(".image-annotator-status");
    const color = dialog.querySelector('input[type="color"]');
    const textField = dialog.querySelector(".image-annotator-text");
    const textInput = textField.querySelector("input");
    const cursor = dialog.querySelector(".image-annotator-cursor");
    const marks = [];
    let tool = "pen";
    let draft = null;
    let activePointer = null;
    let keyboardPoint = { x: canvas.width / 2, y: canvas.height / 2 };

    function render() {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const mark of marks) drawMark(context, mark);
      if (draft) drawMark(context, draft);
    }

    function scheduleRender() {
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        render();
      });
    }

    function updateControls() {
      undo.disabled = marks.length === 0;
      save.disabled = marks.length === 0;
    }

    function startMark(point) {
      status.textContent = "";
      if (tool === "text") {
        const text = textInput.value.trim();
        if (!text) {
          status.textContent = "Enter annotation text before placing it.";
          textInput.focus();
          return;
        }
        marks.push({ tool, color: color.value, points: [point], text });
        updateControls();
      } else {
        draft = { tool, color: color.value, points: [point] };
      }
      scheduleRender();
    }

    function extendMark(point) {
      if (draft.tool === "pen") draft.points.push(point);
      else draft.points[1] = point;
      scheduleRender();
    }

    function finishMark() {
      const [start] = draft.points;
      const end = draft.points.at(-1);
      if (draft.tool === "pen" || Math.hypot(end.x - start.x, end.y - start.y) >= 2) {
        marks.push(draft);
      }
      draft = null;
      updateControls();
      scheduleRender();
    }

    function pointOnCanvas(x, y) {
      return {
        x: Math.max(0, Math.min(canvas.width, x)),
        y: Math.max(0, Math.min(canvas.height, y)),
      };
    }

    function pointerPoint(event) {
      const bounds = canvas.getBoundingClientRect();
      return pointOnCanvas(
        (event.clientX - bounds.left) * canvas.width / bounds.width,
        (event.clientY - bounds.top) * canvas.height / bounds.height,
      );
    }

    function updateCursor() {
      cursor.style.left = `${keyboardPoint.x / canvas.width * 100}%`;
      cursor.style.top = `${keyboardPoint.y / canvas.height * 100}%`;
    }

    for (const button of toolButtons) {
      button.addEventListener("click", () => {
        draft = null;
        tool = button.dataset.tool;
        for (const option of toolButtons) {
          option.setAttribute("aria-pressed", String(option === button));
        }
        textField.hidden = tool !== "text";
        status.textContent = "";
        if (tool === "text") textInput.focus();
        scheduleRender();
      });
    }

    undo.addEventListener("click", () => {
      marks.pop();
      updateControls();
      scheduleRender();
    });

    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0 || activePointer !== null) return;
      draft = null;
      startMark(pointerPoint(event));
      if (draft) {
        activePointer = event.pointerId;
        canvas.setPointerCapture(activePointer);
      }
    });
    canvas.addEventListener("pointermove", event => {
      if (event.pointerId === activePointer && draft) extendMark(pointerPoint(event));
    });
    canvas.addEventListener("pointerup", event => {
      if (event.pointerId !== activePointer) return;
      activePointer = null;
      if (!draft) return;
      const point = pointerPoint(event);
      const last = draft.points.at(-1);
      if (point.x !== last.x || point.y !== last.y) extendMark(point);
      finishMark();
    });
    for (const eventName of ["pointercancel", "lostpointercapture"]) {
      canvas.addEventListener(eventName, event => {
        if (event.pointerId !== activePointer) return;
        activePointer = null;
        draft = null;
        scheduleRender();
      });
    }

    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    canvas.addEventListener("keydown", event => {
      if (activePointer !== null) return;
      const direction = directions[event.key];
      if (direction) {
        event.preventDefault();
        const step = Math.max(2, Math.min(canvas.width, canvas.height) * (event.shiftKey ? 0.08 : 0.025));
        keyboardPoint = pointOnCanvas(keyboardPoint.x + direction[0] * step, keyboardPoint.y + direction[1] * step);
        updateCursor();
        if (draft) extendMark(keyboardPoint);
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (event.repeat) return;
        if (draft) finishMark();
        else startMark(keyboardPoint);
      } else if (event.key === "Escape" && draft) {
        event.preventDefault();
        draft = null;
        scheduleRender();
      }
    });
    canvas.addEventListener("blur", () => {
      if (activePointer !== null || !draft) return;
      draft = null;
      scheduleRender();
    });

    render();
    updateCursor();

    return await new Promise((resolve, reject) => {
      let result = null;
      let saveError = null;
      dialog.addEventListener("close", () => {
        if (saveError) reject(saveError);
        else resolve(result);
      }, { once: true });
      dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
      save.addEventListener("click", async () => {
        draft = null;
        for (const control of dialog.querySelectorAll("button:not([data-cancel]), input")) {
          control.disabled = true;
        }
        canvas.inert = true;
        status.textContent = "Saving…";
        render();
        try {
          const annotated = await exportImage(canvas, file);
          if (!dialog.open) return;
          result = annotated;
        } catch {
          if (!dialog.open) return;
          saveError = new Error("The annotated image could not be saved.");
        }
        dialog.close();
      });
      document.body.append(dialog);
      dialog.showModal();
    });
  } finally {
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    dialog.remove();
    URL.revokeObjectURL(source);
  }
}
