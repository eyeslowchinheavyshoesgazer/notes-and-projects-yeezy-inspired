import MarkdownIt from "./vendor/markdown-it-15.0.3.mjs";
import katex from "./vendor/katex/katex.mjs";

const markdown = new MarkdownIt({ html: false });
const mathDelimiters = [
  { open: "$$", close: "$$", display: true },
  { open: "$", close: "$", display: false },
  { open: "\\(", close: "\\)", display: false },
  { open: "\\[", close: "\\]", display: true },
];

function readMathInline(state, silent) {
  const start = state.pos;
  const delimiter = mathDelimiters.find(({ open }) => state.src.startsWith(open, start));
  if (!delimiter) return false;

  const { open, close, display } = delimiter;
  const contentStart = start + open.length;
  if (open === "$" && /\s/.test(state.src[contentStart])) return false;

  for (let cursor = contentStart; cursor < state.posMax; cursor++) {
    if (state.src.startsWith(close, cursor) && cursor + close.length <= state.posMax) {
      if (open === "$" && (/\s/.test(state.src[cursor - 1]) || /[\d$]/.test(state.src[cursor + 1]))) {
        return false;
      }

      const content = state.src.slice(contentStart, cursor).trim();
      if (!content) return false;
      if (!silent) {
        const token = state.push("issue_math", "", 0);
        token.content = content;
        token.meta = { display, original: state.src.slice(start, cursor + close.length) };
      }
      state.pos = cursor + close.length;
      return true;
    }

    if (state.src[cursor] === "\\") cursor++;
  }

  return false;
}

function readMathBlock(state, start, end, silent) {
  const lineText = line => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trimEnd();
  const delimiter = mathDelimiters.find(({ open, display }) => display && open === lineText(start));
  if (!delimiter) return false;

  for (let line = start + 1; line < end; line++) {
    if (!state.isEmpty(line) && state.sCount[line] < state.blkIndent) return false;
    if (lineText(line) !== delimiter.close) continue;

    const content = state.getLines(start + 1, line, state.blkIndent, false).trim();
    if (!content) return false;
    if (!silent) {
      const token = state.push("issue_math", "", 0);
      token.content = content;
      token.meta = { display: true, original: state.getLines(start, line + 1, state.blkIndent, false) };
      state.line = line + 1;
    }
    return true;
  }

  return false;
}

markdown.inline.ruler.before("escape", "issue_math", readMathInline);
markdown.block.ruler.before("fence", "issue_math", readMathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
markdown.renderer.rules.issue_math = (tokens, index) => {
  const { content, meta } = tokens[index];
  try {
    return katex.renderToString(content, {
      displayMode: meta.display,
      trust: false,
      strict: "ignore",
      maxSize: 10,
    });
  } catch (error) {
    if (!(error instanceof katex.ParseError)) throw error;
    return markdown.utils.escapeHtml(meta.original);
  }
};

export function renderIssueMarkdown(container, source) {
  const preview = container.ownerDocument.createElement("template");
  preview.innerHTML = markdown.render(source);

  for (const image of preview.content.querySelectorAll("img")) {
    const address = image.getAttribute("src");
    image.replaceWith(image.alt && image.alt !== address ? `${image.alt} (${address})` : address);
  }
  for (const link of preview.content.querySelectorAll("a")) {
    const address = link.getAttribute("href");
    const label = link.textContent.trim();
    if (!label || label === address) link.replaceWith(address);
    else link.replaceWith(...link.childNodes, ` (${address})`);
  }

  container.replaceChildren(preview.content);
}

function inlineFormat(selected, format) {
  const content = selected.trim();
  const leading = content ? selected.slice(0, selected.indexOf(content)) : "";
  const trailing = content ? selected.slice(leading.length + content.length) : "";
  const marker = { bold: "**", italic: "*", formula: "$" }[format];
  const display = format === "formula" && content.includes("\n");
  const open = display ? "$$\n" : marker;
  const close = display ? "\n$$" : marker;
  const body = content || { bold: "bold text", italic: "italic text", formula: "x^2" }[format];
  const text = `${leading}${open}${body}${close}${trailing}`;
  return { text, start: leading.length + open.length, end: leading.length + open.length + body.length };
}

function listFormat(source, selectionStart, selectionEnd, ordered) {
  const first = selectionStart ? source.lastIndexOf("\n", selectionStart - 1) + 1 : 0;
  const endsAtBreak = selectionEnd > selectionStart && source[selectionEnd - 1] === "\n";
  const nextBreak = source.indexOf("\n", endsAtBreak ? selectionEnd - 1 : selectionEnd);
  const last = nextBreak === -1 ? source.length : nextBreak;
  const lines = source.slice(first, last).split("\n");
  let number = 0;
  let prefixLength = 0;
  let placeholderLength = 0;
  let originalPrefixLength = 0;

  const text = lines.map(line => {
    if (!line.trim() && lines.length > 1) return line;
    const indent = line.match(/^[ \t]*/)[0];
    const body = line.slice(indent.length).replace(/^(?:\d{1,9}[.)]|[-+*])(?:[ \t]+|$)/, "");
    const marker = ordered ? `${++number}. ` : "- ";
    prefixLength = indent.length + marker.length;
    originalPrefixLength = line.length - body.length;
    const item = body || "List item";
    placeholderLength = body ? 0 : item.length;
    return `${indent}${marker}${item}`;
  }).join("\n");

  if (lines.length > 1 || (selectionStart !== selectionEnd && !placeholderLength)) {
    return { first, last, text, start: 0, end: text.length };
  }

  const start = prefixLength + (placeholderLength ? 0 : Math.max(0, selectionStart - first - originalPrefixLength));
  return { first, last, text, start, end: start + placeholderLength };
}

export function applyIssueFormat(textarea, format) {
  const { value, selectionStart, selectionEnd, selectionDirection, maxLength } = textarea;
  const edit = format === "ordered" || format === "unordered"
    ? listFormat(value, selectionStart, selectionEnd, format === "ordered")
    : { first: selectionStart, last: selectionEnd, ...inlineFormat(value.slice(selectionStart, selectionEnd), format) };
  const nextLength = value.length - (edit.last - edit.first) + edit.text.length;
  textarea.focus();
  if (maxLength >= 0 && nextLength > maxLength) return false;

  textarea.setRangeText(edit.text, edit.first, edit.last);
  textarea.setSelectionRange(edit.first + edit.start, edit.first + edit.end, selectionDirection);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
