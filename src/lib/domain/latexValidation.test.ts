import { describe, it, expect } from "vitest";
import { katexReasonPtBr, latexParseError, latexProblem, repairLatex } from "./latexValidation";

describe("latexParseError", () => {
  it("devolve null para LaTeX que o KaTeX parseia", () => {
    expect(latexParseError("x^2")).toBeNull();
    expect(latexParseError("\\frac{1}{n^2}")).toBeNull();
  });

  it("devolve a razão do KaTeX para chave que nunca fecha", () => {
    const error = latexParseError("\\frac{1{");
    expect(error).toBeTruthy();
    expect(error).toContain("}");
    // O prefixo "KaTeX parse error:" é ruído de biblioteca dentro de uma
    // mensagem que vai para a tela do professor.
    expect(error).not.toMatch(/KaTeX parse error/);
  });

  it("trata string vazia como sem erro — quem cuida do vazio é o rascunho", () => {
    expect(latexParseError("")).toBeNull();
  });
});

// C-18: `%` starts a TeX comment, so "25% de 80 = 20" rendered as "25" and validated fine.
describe("latexParseError e o sinal %", () => {
  it.each(["25% de 80 = 20", "50% + 20% = 70%", "x%", "a \\% b%", "a \\\\% b"])("reprova %j (% cru)", (latex) => {
    const error = latexParseError(latex);
    expect(error).toMatch(/%/);
    expect(error).toContain("\\%");
  });

  it.each(["25\\% de 80 = 20", "50\\% + 20\\% = 70\\%", "\\%"])("aceita %j (% escapado)", (latex) => {
    expect(latexParseError(latex)).toBeNull();
  });
});

// C-12: a single-backslash escape in the model's JSON ("\frac") arrives as a control character.
const FF = "\u000C";
const BS = "\u0008";
const TAB = "\t";
const LF = "\n";
const CR = "\r";

describe("repairLatex", () => {

  it("escapes a raw % even when the formula ends in a lone backslash", () => {
    expect(repairLatex("5%\\").latex).toBe("5\\%\\");
  });
  it("devolve o mesmo LaTeX quando não há o que consertar", () => {
    expect(repairLatex("\\frac{1}{2}")).toEqual({ latex: "\\frac{1}{2}", repairs: [] });
  });

  it("recupera \\frac que virou FF + rac (byte de controle que nunca é LaTeX legítimo)", () => {
    expect(repairLatex(`${FF}rac{1}{2}`)).toEqual({ latex: "\\frac{1}{2}", repairs: ["\\frac"] });
  });

  it("recupera \\beta que virou BS + eta, qualquer que seja a palavra", () => {
    expect(repairLatex(`2${BS}eta`).latex).toBe("2\\beta");
    expect(repairLatex(`${BS}ar{x}`).latex).toBe("\\bar{x}");
    expect(repairLatex(`${FF}orall x`).latex).toBe("\\forall x");
  });

  it("recupera \\times, \\theta, \\neq e \\rightarrow quando a palavra seguinte é um comando conhecido", () => {
    expect(repairLatex(`3${TAB}imes 4`).latex).toBe("3\\times 4");
    expect(repairLatex(`${TAB}heta`).latex).toBe("\\theta");
    expect(repairLatex(`a${LF}eq b`).latex).toBe("a\\neq b");
    expect(repairLatex(`a${CR}ightarrow b`).latex).toBe("a\\rightarrow b");
    expect(repairLatex(`${TAB}ext{ cm}`).latex).toBe("\\text{ cm}");
  });

  it("NÃO mexe em TAB, LF e CR quando a palavra seguinte não é um comando: é espaço", () => {
    expect(repairLatex(`a${TAB}b`).latex).toBe(`a${TAB}b`);
    expect(repairLatex(`x${LF}+ y`).latex).toBe(`x${LF}+ y`);
    expect(repairLatex(`x${CR} y`).latex).toBe(`x${CR} y`);
    // "eq" after a real line break is a word we do not know: not rewritten into \neq? it IS in the list.
    expect(repairLatex(`a${LF}banana`).latex).toBe(`a${LF}banana`);
  });

  it("conserta vários numa fórmula e registra cada um", () => {
    const r = repairLatex(`${FF}rac{1}{2}${TAB}imes${BS}eta`);
    expect(r.latex).toBe("\\frac{1}{2}\\times\\beta");
    expect(r.repairs).toEqual(["\\frac", "\\times", "\\beta"]);
  });

  it("escapa o % cru (comentário em TeX) e registra", () => {
    expect(repairLatex("25% de 80")).toEqual({ latex: "25\\% de 80", repairs: ["%"] });
    expect(repairLatex("25\\% de 80")).toEqual({ latex: "25\\% de 80", repairs: [] });
    expect(repairLatex("a\\\\% b").latex).toBe("a\\\\\\% b");
  });

  it("M4: keeps an already escaped \\% and escapes only the raw ones, in any mix", () => {
    expect(repairLatex("10\\% e 25% de 80").latex).toBe("10\\% e 25\\% de 80");
    expect(repairLatex("25% e 10\\%").latex).toBe("25\\% e 10\\%");
    expect(repairLatex("\\%25% x\\%").latex).toBe("\\%25\\% x\\%");
    expect(repairLatex("a% b% c").latex).toBe("a\\% b\\% c");
  });
});

describe("latexProblem: o veredito único para a borda da IA", () => {
  it("é nulo para LaTeX bom e vazio", () => {
    expect(latexProblem("\\frac{1}{2}")).toBeNull();
    expect(latexProblem("")).toBeNull();
  });

  it("devolve a razão do KaTeX", () => {
    expect(latexProblem("\\frac{1{")).toMatch(/\}/);
  });

  it("reprova caractere de controle que sobrou (NUL, VT, FF, BS), mas não TAB, LF e CR", () => {
    for (const c of ["\u0000", "\u000B", FF, BS]) expect(latexProblem(`a${c}b`)).toMatch(/caractere de controle/);
    expect(latexProblem(`a${TAB}b${LF}c${CR}d`)).toBeNull();
  });
});

describe("latexParseError: same question as the sheet (N-M-002)", () => {
  const equation = "\\begin{equation} x = 1 \\end{equation}";

  it("accepts \\begin{equation} in display mode and refuses it inline, as the screen does", () => {
    expect(latexParseError(equation, { displayMode: true })).toBeNull();
    expect(latexParseError(equation)).toMatch(/display/i);
    expect(latexParseError(equation, { displayMode: false })).not.toBeNull();
  });

  it("refuses \\href and \\includegraphics: the sheet prints them in red", () => {
    expect(latexParseError("\\href{https://x.com}{ver}")).toMatch(/\\href/);
    expect(latexParseError("\\includegraphics{a.png}", { displayMode: true })).toMatch(/\\includegraphics/);
    expect(latexProblem("\\href{https://x.com}{ver}", { displayMode: true })).toMatch(/não é permitido/);
  });
});

describe("latexProblem: lost row break (L7-2)", () => {
  it("flags a backslash followed by a space inside a matrix or a worked sum", () => {
    expect(latexProblem("\\begin{array}{rr} 3 & 4 \\ + & 2 \\end{array}")).toMatch(/quebra de linha/);
    expect(latexProblem("\\begin{pmatrix} 1 & 2 \\ 3 & 4 \\end{pmatrix}")).toMatch(/quebra de linha/);
    expect(latexProblem("\\begin{cases} x & 1 \\\n y & 2 \\end{cases}")).toMatch(/quebra de linha/);
  });

  // N-M-004: the control space after a sign is how a worked sum keeps the sign and the number in one column.
  it("does not flag a control space right after an operator (a sign before a number)", () => {
    expect(latexProblem("\\begin{array}{r} 1.250 \\\\ +\\ 380 \\\\ \\hline 1.630 \\end{array}")).toBeNull();
    expect(latexProblem("\\begin{array}{r} 1.250 \\\\ + \\ 380 \\\\ \\hline 1.630 \\end{array}")).toBeNull();
    expect(latexProblem("\\begin{array}{r} 9 \\\\ -\\ 4 \\\\ \\hline 5 \\end{array}")).toBeNull();
    expect(latexProblem("\\begin{array}{r} 12 \\\\ \\times\\ 3 \\\\ \\hline 36 \\end{array}")).toBeNull();
    expect(latexProblem("\\begin{array}{rl} x &=\\ 5 \\\\ y &<\\ 2 \\end{array}")).toBeNull();
    expect(latexProblem("\\begin{array}{r} \\cdot\\ 3 \\\\ \\div\\ 4 \\\\ \\pm\\ 2 \\end{array}")).toBeNull();
    expect(latexProblem("\\begin{array}{c} (\\ x \\\\ [\\ y \\end{array}")).toBeNull();
    expect(latexProblem("\\begin{array}{cc} 1 & \\ 2 \\\\ 3 & \\ 4 \\end{array}")).toBeNull();
    expect(latexProblem("\\begin{pmatrix} \\ 2 \\\\ 3 \\end{pmatrix}")).toBeNull(); // nothing before it: start of the body
  });

  it("a control space right after a real row break is spacing, not a lost bar", () => {
    expect(latexProblem("\\begin{pmatrix} 1 \\\\ \\ 2 \\end{pmatrix}")).toBeNull();
    expect(latexProblem("\\begin{pmatrix} 1 \\\\\\ 2 \\end{pmatrix}")).toBeNull();
  });

  it("still flags a control space that follows another control space (not a row break, not an operator)", () => {
    expect(latexProblem("\\begin{array}{r} 1 \\\\ +\\ \\ 2 \\end{array}")).not.toBeNull();
  });

  it("still flags the control space that ends an operand (a lost row break)", () => {
    expect(latexProblem("\\begin{array}{r} 1.250 \\ + 380 \\ 1.630 \\end{array}")).toMatch(/quebra de linha/);
    expect(latexProblem("\\begin{pmatrix} a & b \\ c & d \\end{pmatrix}")).toMatch(/quebra de linha/);
    expect(latexProblem("\\begin{pmatrix} \\frac{1}{2} & 1 \\ 3 & 4 \\end{pmatrix}")).toMatch(/quebra de linha/);
    expect(latexProblem("\\begin{pmatrix} (1) & 2 \\ 3 & 4 \\end{pmatrix}")).toMatch(/quebra de linha/);
    expect(latexProblem("\\begin{array}{c} 1 \\ 2 \\end{array}")).toMatch(/quebra de linha/);
    expect(latexProblem("\\begin{array}{c} \\alpha \\ \\beta \\end{array}")).toMatch(/quebra de linha/);
  });

  // L9BC-10: a lost bar glued to a text group cannot be told from a valid control space (`\text{se}\ x`). There is no
  // criterion that accuses `\text{sim}\ 0` without also accusing the piecewise function, so it is NOT accused (documented).
  it("does not accuse a control space glued to a text group, even when it could be a lost bar", () => {
    expect(latexProblem("\\begin{array}{c} \\text{sim}\\ 0 \\\\ \\text{nao}\\ 1 \\end{array}")).toBeNull();
  });

  it("does not flag a real row break, or a control space outside an environment", () => {
    expect(latexProblem("\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}")).toBeNull();
    expect(latexProblem("\\begin{array}{c} 1 \\\\ \\hline 2 \\end{array}")).toBeNull();
    expect(latexProblem("10\\ cm")).toBeNull();
    expect(latexProblem("a \\ b")).toBeNull();
    expect(latexProblem("\\begin{pmatrix} 1 & 2 \\end{pmatrix} + 10\\ cm")).toBeNull();
  });

  it("does not flag a command followed by a space", () => {
    expect(latexProblem("\\begin{pmatrix} 1 & \\alpha \\\\ 3 & 4 \\end{pmatrix}")).toBeNull();
  });

  // L9A-7: a control space is how the words of a case are spaced, in text and next to it.
  it("does not flag the control space of a text group in a piecewise function", () => {
    expect(latexProblem("f(x)=\\begin{cases} 1 & \\text{se}\\ x>0 \\\\ 0 & \\text{caso\\ um} \\end{cases}")).toBeNull();
    expect(latexProblem("\\begin{cases} 1 & x>0\\ \\text{ou} \\\\ 0 & \\mathrm{outro\\ caso} \\end{cases}")).toBeNull();
    expect(latexProblem("\\begin{cases} 1 & \\textbf{se}\\ x>0 \\\\ 0 & \\operatorname{senão\\ nada} \\end{cases}")).toBeNull();
  });

  it("still flags a lost row break next to a text group that is not touching it", () => {
    expect(latexProblem("\\begin{cases} \\text{a} & 1 \\ 2 & \\text{b} \\end{cases}")).toMatch(/quebra de linha/);
    expect(latexProblem("\\begin{pmatrix} 1 & 2 \\ 3 & \\text{x} \\end{pmatrix}")).toMatch(/quebra de linha/);
  });

  it("a text command nested in another text command is one group", () => {
    expect(latexProblem("\\begin{cases} 1 & \\text{se \\textbf{a}\\ b}\\ x>0 \\end{cases}")).toBeNull();
  });
});

describe("katexReasonPtBr: a razão do KaTeX em português para a tela do professor (N-U-003)", () => {
  const ENGLISH = /Expected|Undefined|Double|Unexpected|got '|Mismatch|No such|Can't|Extra|Invalid|Limit|Unknown|Too many/;

  // Fórmulas de verdade: o KaTeX é quem escreve a razão, aqui só se confere a tradução.
  const real: [string, string, { displayMode?: boolean }?][] = [
    ["\\foo", "o comando \\foo não existe", {}],
    ["\\frac{1{", "falta fechar uma chave", {}],
    ["x^2^3", "dois expoentes seguidos", {}],
    ["x_1_2", "dois índices seguidos", {}],
    ["a}", "há um } a mais", {}],
    ["x^", "falta o que vai no expoente", {}],
    ["x_", "falta o que vai no índice", {}],
    ["\\begin{foo}x\\end{foo}", "o ambiente foo não existe", {}],
    ["\\begin{matrix}1\\end{cases}", "\\begin{matrix} foi fechado com \\end{cases}", {}],
    ["\\left( x", 'esperava "\\right", mas encontrou o fim da fórmula', {}],
    ["\\right)", "\\right sem um \\left antes dele", {}],
    ["\\limits", "\\limits só vale depois de um operador", {}],
    ["\\tag{1}", "\\tag só vale em fórmula de bloco", {}],
    ["\\verb|a", "\\verb não foi fechado", {}],
    ["x^\\sqrt", "o comando \\sqrt precisa de um argumento", {}],
    ["$", "$ não pode ser usado dentro de uma fórmula", {}],
    ["\\begin{array}{q}1\\end{array}", "o alinhamento das colunas só aceita l, c ou r", {}],
    ["\\middle| x", "\\middle precisa de um \\left antes dele", {}],
    ["\\hskip 3zz", "unidade inválida: zz", {}],
    ["a \\over b \\over c", "só pode haver um \\over", {}],
    ["\\begin{equation}x\\end{equation}", "o ambiente equation só vale em fórmula de bloco", {}],
    ["\\begin{matrix} 1 \\\\ 2", "esperava & (próxima coluna)", {}],
    ["\\text{a$}", 'esperava "$", mas encontrou o fim da fórmula', {}],
  ];

  for (const [latex, expected, options] of real) {
    it(`${JSON.stringify(latex)} → ${expected}`, () => {
      const message = latexParseError(latex, { ...options, ptBr: true }) as string;
      expect(message).toContain(expected);
      expect(message).not.toMatch(ENGLISH);
      expect(message).not.toContain("\u0332");
    });
  }

  it("mostra o trecho da fórmula a que a razão se refere, sem a marca de sublinhado do KaTeX", () => {
    expect(latexParseError("x^2^3", { ptBr: true })).toBe("dois expoentes seguidos na mesma base; use chaves, como x^{2^3} (perto de: x^2^3)");
  });

  it("sem pedir o português, devolve as palavras do KaTeX (a borda da IA não muda)", () => {
    expect(latexParseError("x^2^3")).toMatch(/^Double superscript/);
  });

  it("não traduz o que o próprio projeto já disse em português", () => {
    expect(latexParseError("25% de 80", { ptBr: true })).toMatch(/começa um comentário/);
    expect(latexParseError("\\href{https://x.com}{ver}", { ptBr: true })).toMatch(/não é permitido/);
  });

  // Razões que o KaTeX só dá em casos raros: a tradução vem da tabela.
  const synthetic: [string, string][] = [
    ["Unexpected character: 'ø' at position 3: ab…", 'o caractere "ø" não é aceito na fórmula'],
    ["Unsupported character: ø", 'o caractere "ø" não é aceito na fórmula'],
    ["Extra }", "há um } a mais"],
    ["Expected group as first argument to \\frac", "falta o argumento do comando (first argument to \\frac)"],
    ["Can't use function '\\foo' in text mode", "\\foo não pode ser usado dentro de \\text"],
    ["Illegal delimiter: 'x'", '"x" não é um delimitador válido'],
    ["Invalid delimiter 'x' after '\\left'", '"x" não é um delimitador válido depois de \\left'],
    ["Mismatched \\right", "\\right sem o par correspondente"],
    ["Unknown accent ' ^'", "o acento ^ não é aceito"],
    ["Accent ^ unsupported in text mode", "o acento ^ não é aceito neste modo"],
    ["Invalid color: 'zzz'", "cor inválida: zzz"],
    ["Invalid size: '3zz'", "tamanho inválido: 3zz"],
    ["Too many expansions: infinite loop or need to increase maxExpand setting", "se repete sem parar"],
    ["Multiple \\tag", "só pode haver um \\tag"],
    ["Too many tab characters: &", "há & demais"],
    ["Expected 'x', got 'y'", 'esperava "x", mas encontrou "y"'],
    ["Expected group after '\\frac'", "falta o argumento depois de \\frac"],
    ["Unexpected end of input in a macro argument, expected ']'", "falta um argumento"],
    ["Expected \\\\ or \\cr or \\end", "esperava & (próxima coluna)"],
    ["Expected 'EOF', got '}'", "há um } a mais"],
    ["Expected '}', got 'EOF'", "falta fechar uma chave"],
    ["Can't use function '$' in math mode", "$ não pode ser usado dentro de uma fórmula"],
    ["Algo que o KaTeX inventou amanhã", "a fórmula não pôde ser lida"],
  ];
  for (const [raw, expected] of synthetic) {
    it(`${raw} → ${expected}`, () => {
      expect(katexReasonPtBr(raw)).toContain(expected);
    });
  }
});
