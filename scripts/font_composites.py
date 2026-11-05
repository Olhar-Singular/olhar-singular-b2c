"""
font_composites.py — troca glifos COMPOSTOS por contornos simples (achado A1, lote 4b).

Por quê: o fontkit (usado pelo @react-pdf) guarda o primeiro objeto de glifo criado
para cada id, com os `codePoints` da primeira chamada. Um glifo buscado como COMPONENTE
de outro (o `a` dentro do `á`, o `A` dentro do `Α` grego) nasce sem code point e fica
assim no cache do processo: o `a` pintado depois sai certo no papel mas sem entrada no
ToUnicode do PDF, e `pdftotext`, o copiar-colar e o leitor de tela perdem a letra
("Escreva Por Teste Nome" vira "reva P r Teste N me"). Sem composto, não há glifo
nascido como componente. Guarda: `greekHomoglyph.test.tsx` e `fontAssets.test.ts`.
"""

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


def decompose_composites(font: TTFont) -> int:
    """Devolve quantos glifos compostos foram trocados por contornos simples."""
    glyf = font["glyf"]
    glyph_set = font.getGlyphSet()
    count = 0
    for name in font.getGlyphOrder():
        if not glyf[name].isComposite():
            continue
        recording = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(recording)
        pen = TTGlyphPen(None)
        recording.replay(pen)
        glyf[name] = pen.glyph()
        count += 1
    return count
