/**
 * latexParseError — pergunta ao KaTeX se uma expressão parseia, e devolve a
 * razão em texto quando não parseia.
 *
 * O renderizador da folha chama o KaTeX com `throwOnError: false` de propósito:
 * o documento não pode parar de renderizar por causa de uma fórmula quebrada.
 * O efeito colateral é que o erro vira só um `<span class="katex-error">`
 * vermelho — cor, sem texto, não anunciado por leitor de tela, e invisível no
 * PDF (que imprime LaTeX cru). Por isso a VALIDAÇÃO é uma pergunta separada da
 * renderização, feita com `throwOnError: true` num try/catch: mesmo parser,
 * mesma resposta, só que dizível (achado 0434, WCAG 3.3.1).
 */

import katex from "katex";

const RAW_PERCENT_REASON =
  "o sinal % começa um comentário em LaTeX e esconde o resto da fórmula; escreva \\% para mostrar o símbolo";

/** A `%` not escaped by a backslash. `\\%` is a line break followed by a raw `%`. */
function hasRawPercent(latex: string): boolean {
  for (let i = 0; i < latex.length; i++) {
    if (latex[i] === "\\") i++;
    else if (latex[i] === "%") return true;
  }
  return false;
}

export interface LatexCheckOptions {
  /** A `blockMath` is drawn in display mode: `\begin{equation}` is fine there and an error inline (N-M-002). */
  displayMode?: boolean;
  /** Say KaTeX's reason in Portuguese, for the teacher's screen (N-U-003). The AI border keeps KaTeX's own words. */
  ptBr?: boolean;
}

/** What KaTeX calls the end of the formula, as a teacher would say it. */
const END = "o fim da fórmula";
const token = (text: string) => (text === "EOF" ? END : `"${text}"`);

const INVALID_VALUE: Record<string, string> = { color: "cor inválida", size: "tamanho inválido", unit: "unidade inválida" };

/** KaTeX's reasons (its `ParseError` messages, without position) and what they mean to a teacher. */
const KATEX_REASONS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Undefined control sequence: (.+)$/, (m) => `o comando ${m[1]} não existe; confira se está escrito certo`],
  [/^Expected '\}', got 'EOF'$/, () => "falta fechar uma chave: acrescente o } que falta"],
  [/^Expected 'EOF', got '\}'$/, () => "há um } a mais, sem um { que o abra"],
  [/^Extra \}$/, () => "há um } a mais, sem um { que o abra"],
  [/^Expected 'EOF', got '\\right'$/, () => "\\right sem um \\left antes dele"],
  [/^Expected '(.+)', got '(.+)'$/, (m) => `esperava ${token(m[1])}, mas encontrou ${token(m[2])}`],
  [/^Double superscript$/, () => "dois expoentes seguidos na mesma base; use chaves, como x^{2^3}"],
  [/^Double subscript$/, () => "dois índices seguidos na mesma base; use chaves, como x_{a_b}"],
  [/^Expected group after '\^'$/, () => "falta o que vai no expoente depois do ^"],
  [/^Expected group after '_'$/, () => "falta o que vai no índice depois do _"],
  [/^Expected group after '(.+)'$/, (m) => `falta o argumento depois de ${m[1]}`],
  [/^Expected group as (.+)$/, (m) => `falta o argumento do comando (${m[1]})`],
  [/^Got function '(.+)' with no arguments.*$/, (m) => `o comando ${m[1]} precisa de um argumento`],
  [/^Can't use function '(.+)' in math mode$/, (m) => `${m[1]} não pode ser usado dentro de uma fórmula`],
  [/^Can't use function '(.+)' in text mode$/, (m) => `${m[1]} não pode ser usado dentro de \\text`],
  [/^Unexpected character: '(.+)'$/, (m) => `o caractere "${m[1]}" não é aceito na fórmula`],
  [/^Unsupported character: (.+)$/, (m) => `o caractere "${m[1]}" não é aceito na fórmula`],
  [/^No such environment: (.+)$/, (m) => `o ambiente ${m[1]} não existe`],
  [/^Mismatch: (.+) matched by (.+)$/, (m) => `${m[1]} foi fechado com ${m[2]}; os nomes precisam ser iguais`],
  [/^Expected (&|\\\\) or .*\\end$/, () => "esperava & (próxima coluna), \\\\ (próxima linha) ou \\end (fim da tabela)"],
  [/^Too many tab characters: &$/, () => "há & demais para as colunas desta tabela"],
  [/^Limit controls must follow a math operator$/, () => "\\limits só vale depois de um operador como \\sum ou \\int"],
  [/^Illegal delimiter: '(.+)'$/, (m) => `"${m[1]}" não é um delimitador válido`],
  [/^Invalid delimiter '(.+)' after '(.+)'$/, (m) => `"${m[1]}" não é um delimitador válido depois de ${m[2]}`],
  [/^\\middle without preceding \\left$/, () => "\\middle precisa de um \\left antes dele"],
  [/^Mismatched (.+)$/, (m) => `${m[1]} sem o par correspondente`],
  [/^Unknown accent ' ?(.+)'$/, (m) => `o acento ${m[1]} não é aceito`],
  [/^Accent (.+) unsupported in (?:math|text) mode$/, (m) => `o acento ${m[1]} não é aceito neste modo`],
  [/^Invalid (color|size|unit): ?'?(.+?)'?$/, (m) => `${INVALID_VALUE[m[1]]}: ${m[2]}`],
  [/^Too many expansions/, () => "uma definição da fórmula se repete sem parar"],
  [/^\\tag works only in display equations$/, () => "\\tag só vale em fórmula de bloco"],
  [/^Multiple \\tag$/, () => "só pode haver um \\tag na fórmula"],
  [/^\\verb ended by end of line/, () => "\\verb não foi fechado: falta o delimitador final"],
  [/^Unexpected end of input in a macro argument, expected '\}'$/, () => "falta fechar uma chave: acrescente o } que falta"],
  [/^Unexpected end of input in a macro argument/, () => "a fórmula acaba no meio de um comando; falta um argumento"],
  [/^(?:Expected l or c or r|Unknown column alignment: .+)$/, () => "o alinhamento das colunas só aceita l, c ou r"],
  [/^\{(.+)\} can be used only in display mode\.$/, (m) => `o ambiente ${m[1]} só vale em fórmula de bloco`],
  [/^only one infix operator per group$/, () => "só pode haver um \\over (ou similar) por grupo"],
];

/**
 * KaTeX's reason, in Portuguese, with the stretch of formula it points at. KaTeX ends its
 * reason with "at position N: <context>" (the offending token is underlined with U+0332);
 * the position is noise for a teacher, the context is the useful part.
 */
export function katexReasonPtBr(reason: string): string {
  const located = reason.match(/^([\s\S]*?)(?: at position \d+| at end of input): ([\s\S]*)$/);
  const what = (located ? located[1] : reason).trim();
  const near = located ? located[2].replace(/\u0332/g, "").trim() : "";
  const found = KATEX_REASONS.find(([pattern]) => pattern.test(what));
  const text = found ? found[1](what.match(found[0]) as RegExpMatchArray) : "a fórmula não pôde ser lida";
  return near ? `${text} (perto de: ${near})` : text;
}

/** Commands the sheet refuses to run (KaTeX `trust` off): it prints them in red instead of the formula. */
const UNTRUSTED_REASON = (command: string) =>
  `o comando ${command} não é permitido na folha, que o mostra em vermelho; use só a fórmula`;

/**
 * @returns `null` quando o LaTeX parseia (ou está vazio — o vazio é tratado
 * pelo rascunho do campo, ver `useLatexDraft`), ou a razão do KaTeX sem o
 * prefixo "KaTeX parse error:", que é ruído de biblioteca numa frase que vai
 * para a tela do professor.
 *
 * É a MESMA pergunta que a folha faz ao desenhar (`latexRenderer`): mesmo modo
 * (inline ou display) e, como lá, `trust` desligado. `\href` e `\includegraphics`
 * não dão erro de parse, mas a folha os desenha como texto vermelho, então aqui
 * também são recusados (N-M-002, M-005).
 */
export function latexParseError(latex: string, options: LatexCheckOptions = {}): string | null {
  if (latex.length === 0) return null;
  // C-18: `throwOnError` does not catch a TeX comment. "25% de 80 = 20" parses fine and the
  // sheet shows "25": everything after the `%` is silently dropped.
  if (hasRawPercent(latex)) return RAW_PERCENT_REASON;
  const untrusted: string[] = [];
  try {
    katex.renderToString(latex, {
      throwOnError: true,
      strict: false,
      displayMode: options.displayMode ?? false,
      output: "htmlAndMathml",
      trust: (context) => {
        untrusted.push(context.command);
        return false;
      },
    });
  } catch (error) {
    const reason = String((error as Error).message).replace(/^KaTeX parse error:\s*/, "");
    return options.ptBr ? katexReasonPtBr(reason) : reason;
  }
  return untrusted.length > 0 ? UNTRUSTED_REASON(untrusted[0]) : null;
}

// ── The AI border (C-10, C-12): repair what is recoverable, name what is not ─────

const CONTROL_LETTER: Record<string, string> = { "\u000C": "f", "\u0008": "b", "\t": "t", "\n": "n", "\r": "r" };

/**
 * FF and BS are never legitimate LaTeX, so a letters run after them is a command whose backslash
 * was eaten by a JSON escape (`\frac` -> FF + "rac"): always recoverable. TAB, LF and CR can be
 * real whitespace, so they are only rewritten when the word after them is, with the letter put
 * back, a command we know (`\times`, `\neq`...). A real line break before "banana" stays.
 */
const KNOWN_AFTER_WHITESPACE: Record<string, ReadonlySet<string>> = {
  t: new Set(["times", "theta", "tan", "tanh", "tau", "text", "tfrac", "to", "top", "tilde", "triangle", "therefore"]),
  n: new Set(["neq", "ne", "nu", "not", "neg", "nabla", "ni", "notin", "newline", "nless", "nmid"]),
  r: new Set(["rightarrow", "right", "rho", "rangle", "rfloor", "rceil", "rbrace", "rbrack"]),
};

export interface LatexRepair {
  latex: string;
  /** What was repaired, for the log: the restored command, or "%". */
  repairs: string[];
}

/** Deterministic repair of the two defects a valid-JSON answer can still carry. Never throws. */
export function repairLatex(latex: string): LatexRepair {
  const repairs: string[] = [];
  let out = latex.replace(/([\u000C\u0008\t\n\r])([A-Za-z]+)/g, (whole, control: string, word: string) => {
    const letter = CONTROL_LETTER[control];
    const always = control === "\u000C" || control === "\u0008";
    if (!always && !KNOWN_AFTER_WHITESPACE[letter].has(letter + word)) return whole;
    repairs.push(`\\${letter}${word}`);
    return `\\${letter}${word}`;
  });
  if (hasRawPercent(out)) {
    let fixed = "";
    for (let i = 0; i < out.length; i++) {
      if (out[i] === "\\") fixed += out[i] + (out[++i] ?? "");
      else fixed += out[i] === "%" ? "\\%" : out[i];
    }
    out = fixed;
    repairs.push("%");
  }
  return { latex: out, repairs };
}

/**
 * The one verdict the AI border uses: why this latex cannot be shown, or `null`. The editor's
 * rule (`latexParseError`) plus control characters that survived the repair (NUL, VT, FF, BS).
 * TAB, LF and CR stay allowed: they are whitespace.
 */
export function latexProblem(latex: string, options: LatexCheckOptions = {}): string | null {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(latex)) return "contém um caractere de controle invisível";
  return latexParseError(latex, options) ?? lostRowBreak(latex);
}

// Environments whose rows end in a double backslash: inside them a lone backslash plus a space is a row break that lost a bar.
const ROW_ENVIRONMENT = /\\begin\{(array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|cases|aligned|align\*?|gathered|split|eqnarray\*?)\}([\s\S]*?)\\end\{\1\}/g;

const TEXT_COMMAND = /\\(?:text|textbf|textit|textrm|mathrm|mbox|operatorname)\s*\{/g;
const TEXT_MARK = "\u0001";

/** Each `\text{...}`-like group (balanced braces) as one mark: what is typed inside it is prose, not cells. */
function maskTextGroups(body: string): string {
  let out = "";
  let cursor = 0;
  for (const match of body.matchAll(TEXT_COMMAND)) {
    const start = match.index as number;
    const open = start + match[0].length - 1;
    if (open < cursor) continue;
    let depth = 0;
    let end = body.length - 1; // KaTeX already accepted the formula, so a group always closes
    for (let j = open; j < body.length; j++) {
      if (body[j] === "{") depth++;
      else if (body[j] === "}" && --depth === 0) {
        end = j;
        break;
      }
    }
    out += body.slice(cursor, start) + TEXT_MARK;
    cursor = end + 1;
  }
  return out + body.slice(cursor);
}

/** A control space right after a text group or right before one (`\text{se}\ x > 0`, `x > 0\ \text{ou}`) spaces the words of a case. */
const touchesTextGroup = (body: string, at: number): boolean =>
  body[at - 1] === TEXT_MARK || body.slice(at + 1).replace(/^\s+/, "").startsWith(TEXT_MARK);

/** Commands that are a sign or a relation: a control space right after one spaces the sign from its number. */
const OPERATOR_COMMAND =
  /\\(?:times|cdot|div|pm|mp|ast|star|circ|bullet|oplus|ominus|otimes|le|leq|ge|geq|ne|neq|ll|gg|approx|equiv|sim|simeq|cong|propto|to|gets|rightarrow|leftarrow|Rightarrow|Leftarrow|Leftrightarrow|leftrightarrow|mapsto|implies|iff|in|notin|ni|subset|supset|subseteq|supseteq|cup|cap|setminus|vee|wedge|land|lor|mid|parallel|perp)$/;

/**
 * N-M-004: a control space that comes right after a sign, a relation, an opening bracket, a
 * separator, a column mark or the start of a row (`+\ 380` in a worked sum, `=\ 5`) is spacing, not
 * a row break: a row ends after an operand. Only the space that follows an operand (a digit, a
 * letter, a closing bracket, a `\frac{}{}`) can be a lost bar.
 */
function followsOperator(body: string, at: number): boolean {
  let j = at - 1;
  while (j >= 0 && /\s/.test(body[j])) j--;
  if (j < 0) return true;
  const previous = body[j];
  if (/[+\-=<>*/:,;([{&!]/.test(previous)) return true;
  if (previous === "\\" && body[j - 1] === "\\") return true; // right after a real row break
  return OPERATOR_COMMAND.test(body.slice(0, j + 1));
}

/**
 * L7-2: a JSON double backslash that lost a bar becomes a backslash + space, which KaTeX accepts as a "control
 * space": a matrix or a worked sum collapses into one line with no error. Inside a matrix-like
 * environment a control space has no use (nobody types it between cells), so it is the lost row
 * break. Outside such an environment `10\\ cm` is legitimate and is never flagged. 0 of the 344
 * real formulas has one.
 */
function lostRowBreak(latex: string): string | null {
  for (const match of latex.matchAll(ROW_ENVIRONMENT)) {
    const body = maskTextGroups(match[2]);
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== "\\") continue;
      if (body[i + 1] === "\\") i++; // a real `\\\\`
      else if (/^\s/.test(body.slice(i + 1, i + 2)) && !touchesTextGroup(body, i) && !followsOperator(body, i)) {
        return "uma quebra de linha da matriz ou da conta armada perdeu uma barra (apareceu \\ seguido de espaço); use \\\\ entre as linhas";
      }
    }
  }
  return null;
}
