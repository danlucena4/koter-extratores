/**
 * A CODIFICACAO EMBUTIDA no programa da fonte, para fonte Type1 sem /Encoding
 * no PDF (o PDF manda usar a codificacao da propria fonte):
 *
 *  - CFF (/FontFile3): Top DICT -> Encoding (0 = Standard, 1 = Expert, senao
 *    tabela propria) e charset (glifo -> nome); codigo -> glifo -> nome ->
 *    texto (Adobe Glyph List);
 *  - Type1 (/FontFile): "/Encoding StandardEncoding def" ou "dup 65 /A put".
 *
 * Devolve codigo -> nome de glifo, ou "standard" quando a fonte usa a
 * StandardEncoding, ou `null` quando nao deu para ler (quem chama decide).
 */

/** Os 391 nomes padrao do CFF (SID 0..390); os de "Expert" (229..378) nao aparecem em PDF de seguradora. */
const PADRAO: readonly string[] = (() => {
  const base =
    ".notdef space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl endash dagger daggerdbl periodcentered paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand questiondown grave acute circumflex tilde macron breve dotaccent dieresis ring cedilla hungarumlaut ogonek caron emdash AE ordfeminine Lslash Oslash OE ordmasculine ae dotlessi lslash oslash oe germandbls onesuperior logicalnot mu trademark Eth onehalf plusminus Thorn onequarter divide brokenbar degree thorn threequarters twosuperior registered minus eth multiply threesuperior copyright Aacute Acircumflex Adieresis Agrave Aring Atilde Ccedilla Eacute Ecircumflex Edieresis Egrave Iacute Icircumflex Idieresis Igrave Ntilde Oacute Ocircumflex Odieresis Ograve Otilde Scaron Uacute Ucircumflex Udieresis Ugrave Yacute Ydieresis Zcaron aacute acircumflex adieresis agrave aring atilde ccedilla eacute ecircumflex edieresis egrave iacute icircumflex idieresis igrave ntilde oacute ocircumflex odieresis ograve otilde scaron uacute ucircumflex udieresis ugrave yacute ydieresis zcaron".split(
      " ",
    );
  const out = [...base];
  while (out.length < 379) out.push(`expert${out.length}`);
  out.push("001.000", "001.001", "001.002", "001.003", "Black", "Bold", "Book", "Light", "Medium", "Regular", "Roman", "Semibold");
  return out;
})();

class Bytes {
  constructor(readonly b: string) {}
  u8(i: number): number {
    return this.b.charCodeAt(i) & 255;
  }
  u16(i: number): number {
    return (this.u8(i) << 8) | this.u8(i + 1);
  }
  off(i: number, tam: number): number {
    let v = 0;
    for (let k = 0; k < tam; k++) v = v * 256 + this.u8(i + k);
    return v;
  }
  /** Um INDEX do CFF em `i`: os itens e onde ele termina. */
  indice(i: number): { itens: Array<[number, number]>; fim: number } {
    const n = this.u16(i);
    if (n === 0) return { itens: [], fim: i + 2 };
    const tam = this.u8(i + 2);
    const offs: number[] = [];
    for (let k = 0; k <= n; k++) offs.push(this.off(i + 3 + k * tam, tam));
    const base = i + 3 + (n + 1) * tam - 1;
    const itens: Array<[number, number]> = [];
    for (let k = 0; k < n; k++) itens.push([base + (offs[k] as number), base + (offs[k + 1] as number)]);
    return { itens, fim: base + (offs[n] as number) };
  }
  /** Um DICT: operador -> operandos. */
  dic(ini: number, fim: number): Map<number, number[]> {
    const out = new Map<number, number[]>();
    let ops: number[] = [];
    let i = ini;
    while (i < fim) {
      const b0 = this.u8(i);
      if (b0 <= 21) {
        let op = b0;
        i++;
        if (b0 === 12) {
          op = 1200 + this.u8(i);
          i++;
        }
        out.set(op, ops);
        ops = [];
      } else if (b0 === 28) {
        ops.push(((this.u16(i + 1) << 16) >> 16) as number);
        i += 3;
      } else if (b0 === 29) {
        ops.push(this.off(i + 1, 4) | 0);
        i += 5;
      } else if (b0 === 30) {
        i++;
        let fimReal = false;
        while (!fimReal && i < fim) {
          const b = this.u8(i++);
          if ((b >> 4) === 0xf || (b & 0xf) === 0xf) fimReal = true;
        }
        ops.push(0);
      } else if (b0 >= 32 && b0 <= 246) {
        ops.push(b0 - 139);
        i++;
      } else if (b0 >= 247 && b0 <= 250) {
        ops.push((b0 - 247) * 256 + this.u8(i + 1) + 108);
        i += 2;
      } else if (b0 >= 251 && b0 <= 254) {
        ops.push(-(b0 - 251) * 256 - this.u8(i + 1) - 108);
        i += 2;
      } else i++;
    }
    return out;
  }
}

/** Codigo -> nome de glifo da fonte CFF, "standard", ou `null`. */
export function codificacaoDoCff(dados: string): Map<number, string> | "standard" | null {
  try {
    const b = new Bytes(dados);
    const tamCab = b.u8(2);
    const nomes = b.indice(tamCab);
    const top = b.indice(nomes.fim);
    const strings = b.indice(top.fim);
    const [ti, tf] = top.itens[0] ?? [0, 0];
    const d = b.dic(ti, tf);
    if (d.has(1230)) return null; /* CIDFont: codigos sao CIDs, nao ha nome */
    const enc = d.get(16)?.[0] ?? 0;
    if (enc === 0 || enc === 1) return "standard";
    const charStrings = d.get(17)?.[0];
    if (charStrings === undefined) return null;
    const nGlifos = b.u16(charStrings);
    const nomeDoSid = (sid: number): string => {
      if (sid < PADRAO.length) return PADRAO[sid] as string;
      const it = strings.itens[sid - PADRAO.length];
      return it === undefined ? "" : dados.slice(it[0], it[1]);
    };
    /* charset: glifo -> SID */
    const sids: number[] = [0];
    const cs = d.get(15)?.[0] ?? 0;
    if (cs === 0) for (let g = 1; g < nGlifos; g++) sids.push(g);
    else if (cs > 2) {
      const fmt = b.u8(cs);
      let i = cs + 1;
      if (fmt === 0) for (let g = 1; g < nGlifos; g++, i += 2) sids.push(b.u16(i));
      else {
        while (sids.length < nGlifos && i < dados.length) {
          const primeiro = b.u16(i);
          const resto = fmt === 1 ? b.u8(i + 2) : b.u16(i + 2);
          i += fmt === 1 ? 3 : 4;
          for (let k = 0; k <= resto && sids.length < nGlifos; k++) sids.push(primeiro + k);
        }
      }
    } else return null;
    /* encoding: codigo -> glifo */
    const out = new Map<number, string>();
    const fmt = b.u8(enc);
    let i = enc + 1;
    if ((fmt & 0x7f) === 0) {
      const n = b.u8(i++);
      for (let g = 1; g <= n; g++) out.set(b.u8(i++), nomeDoSid(sids[g] ?? 0));
    } else {
      const nr = b.u8(i++);
      let g = 1;
      for (let r = 0; r < nr; r++) {
        const primeiro = b.u8(i);
        const resto = b.u8(i + 1);
        i += 2;
        for (let k = 0; k <= resto; k++) out.set(primeiro + k, nomeDoSid(sids[g++] ?? 0));
      }
    }
    if ((fmt & 0x80) !== 0) {
      const ns = b.u8(i++);
      for (let k = 0; k < ns; k++, i += 3) out.set(b.u8(i), nomeDoSid(b.u16(i + 1)));
    }
    return out;
  } catch {
    return null;
  }
}

/** Codigo -> nome de glifo da fonte Type1 (parte em texto claro do programa). */
export function codificacaoDoType1(dados: string): Map<number, string> | "standard" | null {
  const claro = dados.slice(0, Math.min(dados.length, 60000));
  if (/\/Encoding\s+StandardEncoding\s+def/.test(claro)) return "standard";
  const out = new Map<number, string>();
  for (const m of claro.matchAll(/dup\s+(\d+)\s*\/([^\s/]+)\s+put/g)) out.set(Number(m[1]), m[2] as string);
  return out.size > 0 ? out : null;
}
