import { spawn } from "node:child_process";
import { access, constants, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * A gate in front of the render.
 *
 * A bad scene used to cost a full manim run — thirty to ninety seconds — before anyone found out
 * it was bad. Most of what makes a scene bad is decidable without running it, and three things
 * account for nearly all of it:
 *
 *   1. it does not parse;
 *   2. it reaches for something that renders through LaTeX, which this image does not have;
 *   3. it names something manim does not export.
 *
 * (3) is the one that actually kills renders here. The model has plenty of manim in its training
 * data, but plenty of it is *old* manim: `BOTTOM` and `TOP` were real constants until 0.19 removed
 * them, and a scene ending `.to_edge(BOTTOM)` renders for a while and then dies on a NameError
 * with nothing to show. Both of the genuine render failures in a twenty-sample bench were exactly
 * that, and the same name.
 *
 * All three are decided in about a second, so a doomed attempt is rerolled almost immediately and
 * the render budget buys real attempts instead of slow ones.
 */

const MANIM_BIN =
  process.env.MANIM_BIN ?? `${process.env.HOME}/.local/bin/manim`;

/**
 * Everything prompts/system.md forbids, matched at its call site rather than as a bare word.
 *
 * These all *exist* in manim, so the name check below cannot see them — they fail at render time
 * inside a LaTeX subprocess that is not installed. `MathTex` in a comment is harmless and a reroll
 * is not free, so each pattern requires the open paren, or the assignment, that means the code
 * actually uses the thing.
 */
const BANNED: [RegExp, string][] = [
  [
    /\b(?:Tex|MathTex|SingleStringMathTex|Title|BulletedList|DecimalNumber|Integer|Variable)\s*\(/,
    "renders through LaTeX, which is not installed",
  ],
  [
    /\.(?:add_coordinates|get_axis_labels|get_x_axis_label|get_y_axis_label)\s*\(/,
    "builds its labels with LaTeX, which is not installed",
  ],
  [
    /include_numbers\s*=\s*True/,
    "include_numbers=True draws numbers with LaTeX, which is not installed",
  ],
];

/**
 * Parse the file and name every global it reads that manim and Python between them do not define.
 *
 * `symtable` is the reason this is short and correct: it does the scope analysis, so a loop
 * variable, a comprehension target, a function parameter and a method name are all understood as
 * bound rather than reported as missing. Only genuinely free globals reach the comparison.
 *
 * Lives here as a string rather than a .py file because the Docker image copies the standalone
 * Next output and prompts/, and a loose file under lib/ would not be in either.
 */
const CHECKER = `
import builtins, symtable, sys

src = open(sys.argv[1], encoding="utf-8").read()
try:
    table = symtable.symtable(src, "scene.py", "exec")
except SyntaxError as e:
    print("syntax:%s (line %s)" % (e.msg, e.lineno))
    sys.exit(1)

import manim
known = set(dir(manim)) | set(dir(builtins))

def walk(t, out):
    for sym in t.get_symbols():
        if sym.is_referenced() and sym.is_global() and not sym.is_assigned():
            if sym.get_name() not in known:
                out.add(sym.get_name())
    for child in t.get_children():
        walk(child, out)

unknown = set()
walk(table, unknown)
if unknown:
    print("names:%s" % ",".join(sorted(unknown)))
    sys.exit(1)
`;

/**
 * The interpreter that owns manim, so the check sees the same namespace the render will.
 *
 * Resolved through the symlink first: a tool installer puts `manim` on the PATH as a link into its
 * own virtualenv, and the interpreter is the link's sibling, not the link's.
 */
async function python(): Promise<string> {
  for (const bin of [await realpath(MANIM_BIN).catch(() => MANIM_BIN), MANIM_BIN]) {
    const sibling = path.join(path.dirname(bin), "python3");
    try {
      await access(sibling, constants.X_OK);
      return sibling;
    } catch {
      // Try the next candidate.
    }
  }
  return "python3";
}

/**
 * A 3D mesh left at manim's default resolution.
 *
 * `Surface` and `Sphere` default to `(32, 32)` — 1024 quads, filled and depth-sorted on every
 * frame by the cairo renderer, since the image ships no GPU path. Measured at 10-15 seconds per
 * animation on the deployed container, which spends the whole render budget before the scene
 * ends: a sphere prompt burned three attempts and four minutes twice over on 2026-09-06, each
 * reroll dying on the per-attempt timeout with nothing to show.
 *
 * Caught here rather than left to manim because the difference is 90 seconds against one, and
 * because the repair prompt then names the actual fix instead of "it timed out".
 *
 * ponytail: counts parentheses without tokenising, so a `)` inside a string literal in the
 * argument list would end the call early. Generated scene code does not do that; if one ever
 * does, the cost is one wrong rejection and a reroll.
 */
function meshWithoutResolution(code: string): string | null {
  for (const match of code.matchAll(/\b(Surface|Sphere)\s*\(/g)) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < code.length; i++) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')' && --depth === 0) break;
    }
    if (!/\bresolution\s*=/.test(code.slice(match.index, i))) return match[1];
  }

  return null;
}

/**
 * `null` when the code is worth rendering, otherwise the reason, phrased for the repair prompt —
 * the model reads this string verbatim and has to be able to act on it.
 */
export async function precheck(
  dir: string,
  code: string,
): Promise<string | null> {
  for (const [pattern, why] of BANNED) {
    const hit = code.match(pattern);
    if (hit) return `\`${hit[0]}\` ${why}. Use Text with Unicode maths instead.`;
  }

  const mesh = meshWithoutResolution(code);
  if (mesh) {
    return [
      `\`${mesh}(...)\` has no \`resolution=\`, so it defaults to (32, 32) — 1024 quads that the`,
      `cairo renderer fills and depth-sorts on every frame. That takes 10-15 seconds per animation`,
      `here and the render is killed before the scene ends. Pass \`resolution=(12, 12)\` to every`,
      `one of them: smooth at 480p and about ten times cheaper. Do not shorten the animation`,
      `instead — the cost is per frame, so a shorter scene dies exactly the same way.`,
    ].join(' ');
  }

  // The checker needs a file on disk. renderScene writes the same path with the same content, so
  // this is the write it would have done anyway, done a second earlier.
  const file = path.join(dir, "scene.py");
  await writeFile(file, code, "utf8");

  const child = spawn(await python(), ["-c", CHECKER, file]);
  let out = "";
  child.stdout.on("data", (c: Buffer) => (out += c.toString()));
  child.stderr.on("data", (c: Buffer) => (out += c.toString()));

  const exit = await new Promise<number>((resolve) => {
    // The gate failing to run is not the same as the code being wrong: let it through and let
    // manim be the judge, rather than failing every render because python moved.
    child.on("error", () => resolve(0));
    child.on("close", (c) => resolve(c ?? 0));
  });
  if (exit === 0) return null;

  const message = out.trim();
  if (message.startsWith("syntax:")) {
    return `The file does not parse: ${message.slice(7)}`;
  }
  if (message.startsWith("names:")) {
    const names = message.slice(6).split(",");
    return [
      `This scene uses ${names.map((n) => `\`${n}\``).join(", ")}, which manim v0.21.0 does not`,
      `define — \`from manim import *\` does not bring in any of them, so the render dies on a`,
      `NameError. Several constants that older manim had are gone: use DOWN/UP/LEFT/RIGHT and the`,
      `corner constants (UR, UL, DR, DL) with .to_edge()/.to_corner(), not TOP or BOTTOM.`,
      `Rewrite using only names that exist in manim v0.21.0.`,
    ].join(" ");
  }
  // Some other non-zero exit — the checker itself is unhappy. Not the scene's fault.
  return null;
}
