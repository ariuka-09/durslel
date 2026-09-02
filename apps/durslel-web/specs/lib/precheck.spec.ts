import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { summarize } from "@/lib/errors";
import { precheck } from "@/lib/precheck";

const GOOD = `from manim import *
import numpy as np


class Demo(Scene):
    def construct(self):
        axes = Axes(x_range=[0, 1, 1], y_range=[0, 1, 1])
        self.play(Create(axes))
        self.add(Text("x²", font_size=28))
        self.wait(1)
`;

async function dir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "precheck-"));
}

describe("precheck", () => {
  it("passes a scene that uses only what this image can render", async () => {
    expect(await precheck(await dir(), GOOD)).toBeNull();
  });

  it.each([
    ["MathTex(r'\\\\int_0^1 x dx')", "LaTeX"],
    ["Tex('hello')", "LaTeX"],
    ["DecimalNumber(0)", "LaTeX"],
    ["axes.add_coordinates()", "LaTeX"],
    ["axes.get_axis_labels('x', 'y')", "LaTeX"],
    ["NumberLine(include_numbers=True)", "LaTeX"],
  ])("rejects %s, which needs LaTeX", async (call) => {
    const code = GOOD.replace("self.wait(1)", `self.add(${call})\n        self.wait(1)`);
    expect(await precheck(await dir(), code)).toMatch(/LaTeX/);
  });

  it("does not reject Text, which is how every label is meant to be written", async () => {
    const code = GOOD.replace('Text("x²"', 'Text("sin(x + π/2), Integer values"');
    expect(await precheck(await dir(), code)).toBeNull();
  });

  it("rejects a name manim v0.21 removed", async () => {
    // BOTTOM was a real constant until 0.19 dropped it, so the model still writes it and the
    // render dies on a NameError halfway through. Both real failures in the bench were this.
    const code = GOOD.replace("font_size=28", "font_size=28).to_edge(BOTTOM");
    const reason = await precheck(await dir(), code);
    expect(reason).toMatch(/`BOTTOM`/);
    expect(reason).toMatch(/DOWN/);
  });

  it("does not flag names the file binds itself", async () => {
    // symtable, not a regex, is what makes this hold: loop variables, comprehension targets and
    // parameters are all bound, and a false positive here throws away a scene that would render.
    const code = `from manim import *
import numpy as np


class Demo(Scene):
    def construct(self):
        for step in range(3):
            offset = step * 0.1
            self.add(Dot().shift(RIGHT * offset))
        squares = [x * x for x in range(3)]
        self.add(Text(str(sum(squares)), font_size=20))
        self.wait(1)
`;
    expect(await precheck(await dir(), code)).toBeNull();
  });

  it("rejects a file that does not parse", async () => {
    const reason = await precheck(await dir(), "class Demo(Scene:\n    pass\n");
    expect(reason).toMatch(/does not parse/);
  });
});

describe("summarize", () => {
  it("keeps the line that says what actually broke", () => {
    const raw = [
      "Traceback (most recent call last):",
      '  File "scene.py", line 9, in construct',
      "    axes.get_graph(lambda x: x)",
      "AttributeError: 'Axes' object has no attribute 'get_graph'",
    ].join("\n");

    expect(
      summarize({ kind: "manim_runtime", message: "manim exited with code 1.", raw, attempt: 1 }),
    ).toBe(
      "manim exited with code 1. AttributeError: 'Axes' object has no attribute 'get_graph'",
    );
  });

  it("falls back to the message when the log names no error", () => {
    expect(
      summarize({ kind: "timeout", message: "Killed after 120s.", raw: "rendering…", attempt: 2 }),
    ).toBe("Killed after 120s.");
  });
});
