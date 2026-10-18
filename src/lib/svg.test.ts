import { expect, test } from "bun:test";
import { designToSvg } from "./svg";
import { normalizeDesign } from "../store/design";

const design = normalizeDesign({
  id: "d",
  name: "t",
  width: 400,
  height: 300,
  background: { kind: "linear", angle: 90, colors: ["#000000", "#ffffff"] },
  elements: [
    { id: "t1", type: "text", x: 10, y: 20, w: 200, text: "Hi <there> & you", fontFamily: "Poppins", fontSize: 40, fontWeight: 700, fill: "#ff0000", align: "center" },
    { id: "s1", type: "shape", shape: "rect", x: 0, y: 0, w: 50, h: 50, fill: "#00ff00", cornerRadius: 8, rotation: 15, opacity: 0.5 },
    { id: "i1", type: "image", src: "/m/a.png", x: 0, y: 0, w: 10, h: 10, cornerRadius: 4 },
    { id: "h", type: "shape", shape: "star", x: 0, y: 0, w: 10, h: 10, fill: "#000", hidden: true },
  ] as never,
});

test("serializes page, shapes, text and images", () => {
  const svg = designToSvg(design, { lines: { t1: ["Hi <there>", "& you"] }, images: { "/m/a.png": "data:image/png;base64,AAAA" } });
  expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"');
  expect(svg).toContain("<linearGradient");
  expect(svg).toContain('rx="8"');
  expect(svg).toContain('transform="translate(0 0) rotate(15)" opacity="0.5"');
  expect(svg).toContain("Hi &lt;there&gt;</tspan>");
  expect(svg).toContain("&amp; you</tspan>");
  expect(svg).toContain('text-anchor="middle"');
  expect(svg).toContain("fonts.googleapis.com/css2?family=Poppins");
  expect(svg).toContain('href="data:image/png;base64,AAAA"');
  expect(svg).toContain("<clipPath");
  expect(svg).not.toContain("<polygon");
});

test("images without data are skipped", () => {
  expect(designToSvg(design, { lines: {}, images: {} })).not.toContain("<image");
});
