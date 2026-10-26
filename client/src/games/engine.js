export function createElement(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

export function createButton(text, className = "game-button") {
  const button = createElement("button", className, text);
  button.type = "button";
  return button;
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function randomInt(minimum, maximum) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

export function checkLineWinner(board, lines) {
  for (const line of lines) {
    const [first, ...rest] = line;
    if (board[first] && rest.every((index) => board[index] === board[first])) return board[first];
  }
  return null;
}

export function slide2048Line(line) {
  const values = line.filter(Boolean);
  const merged = [];
  let score = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) {
      const value = values[index] * 2;
      merged.push(value);
      score += value;
      index += 1;
    } else {
      merged.push(values[index]);
    }
  }
  while (merged.length < line.length) merged.push(0);
  return { line: merged, score };
}

export function formatScore(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

export function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event;
  return {
    x: ((source.clientX - rect.left) / rect.width) * canvas.width,
    y: ((source.clientY - rect.top) / rect.height) * canvas.height,
  };
}

export function attachPress(element, callback) {
  const handler = (event) => {
    event.preventDefault();
    callback(event);
  };
  element.addEventListener("pointerdown", handler);
  return () => element.removeEventListener("pointerdown", handler);
}

export function makeCanvas(width = 720, height = 460) {
  const canvas = createElement("canvas", "game-canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute("role", "img");
  return canvas;
}

export function createStatus(text = "") {
  return createElement("p", "game-status", text);
}

export function createHud(items = []) {
  const hud = createElement("div", "game-hud");
  for (const item of items) {
    const block = createElement("div", "hud-item");
    block.append(createElement("span", "", item.label), createElement("strong", item.className || "", item.value));
    hud.append(block);
  }
  return hud;
}
