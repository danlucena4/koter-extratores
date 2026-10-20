/**
 * O DOCUMENTO DE AUTO da HDI (`act_documento_auto_digital.htm`, o mesmo quadro
 * do PDF da apolice), lido como HTML. Evidencia: capture hdi-renovacao seqs
 * 0500/0518, hdi-apolices 0369, hdi-carteira 0291, e 15 PDFs de apolice da
 * "A vencer" (2026-10-19). Linhas `<td>Rotulo</td><td>: valor</td>`:
 *  - segurado: nome, CPF, Endereco (`RUA X, 99 / COMPL`), Bairro, Cidade
 *    (`CIDADE - UF`), CEP;
 *  - veiculo: Modelo (`0000000 - MARCA MODELO`), Codigo FIPE, Ano Fabr./Modelo,
 *    Combustivel (`5-Bi-combustivel`), Placa/UF, Chassi, Categoria, CEP
 *    Pernoite, Codigo CI, Classe de Bonus (`05 - 25,00%`), Qtde Sinistros;
 *  - perfil: Sexo e Estado Civil do condutor, Guarda do Veiculo, Utilizacao do
 *    Veiculo, "Cob Demais Condutores Resid entre 18 Ate 25 Anos", e a linha
 *    `Condutor: NOME CPF: 00000000000` + `Data de Nasc.: dd/mm/aaaa`.
 *
 * Sem trava por numero: o documento e aberto pelo identificador do proprio
 * documento (empresa + sucursal + carteira + seq), nao por busca.
 */
import type { DataCia, EnderecoLido } from "./tipos.js";

/* ------------------------------------------------------------- HTML minimo */

/* Copia das entidades de texto do integrador da HDI (so o que o documento usa). */
const ENTIDADES_DE_TEXTO: Readonly<Record<string, string>> = {
  nbsp: " ",
  ordf: "ª",
  ordm: "º",
  aacute: "á",
  agrave: "à",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  iacute: "í",
  icirc: "î",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  ccedil: "ç",
  Aacute: "Á",
  Agrave: "À",
  Acirc: "Â",
  Atilde: "Ã",
  Eacute: "É",
  Ecirc: "Ê",
  Iacute: "Í",
  Oacute: "Ó",
  Ocirc: "Ô",
  Otilde: "Õ",
  Uacute: "Ú",
  Uuml: "Ü",
  Ccedil: "Ç",
  deg: "°",
  sup2: "²",
  sup3: "³",
  frac12: "½",
  laquo: "«",
  raquo: "»",
};

/** Decodifica entidades de TEXTO sem criar `<`/`>` (o HTML inteiro ainda sera lido por regex). */
function decodificarTexto(v: string): string {
  return v
    .replace(/&([A-Za-z]+);/g, (todo, nome: string) => ENTIDADES_DE_TEXTO[nome] ?? todo)
    .replace(/&#(\d+);/g, (todo, n: string) => {
      const c = Number(n);
      return c === 60 || c === 62 || c === 38 ? todo : String.fromCharCode(c);
    });
}

/** Conteudo de celula: sem tags, espacos normalizados, entidades decodificadas. */
function textoDaCelula(html: string): string {
  return decodificarTexto(html.replace(/<[^>]*>/g, " "))
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function ouNulo(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** O valor da celula seguinte ao rotulo (ou da depois dela, se a seguinte e so o dois-pontos). */
function aposRotulo(html: string, rotulo: string): string | null {
  const re = new RegExp(`<td[^>]*>\\s*(?:<b>)?\\s*${rotulo}\\s*(?:</b>)?\\s*</td>((?:\\s*<td[^>]*>[\\s\\S]*?</td>){1,2})`, "i");
  const seguintes = re.exec(html)?.[1];
  if (seguintes === undefined) return null;
  for (const m of seguintes.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)) {
    const v = textoDaCelula(m[1] ?? "").replace(/^:\s*/, "").trim();
    if (v.length > 0) return v;
  }
  return null;
}

/** So o bloco do SEGURADO: o documento repete Endereco/CEP/Cidade no bloco do corretor. */
function ateOBlocoDoCorretor(html: string): string {
  const i = html.search(/<td[^>]*>\s*Corretor\s*<\/td>/i);
  return i > 0 ? html.slice(0, i) : html;
}

const digitos = (v: string | null): string => (v ?? "").replace(/\D/g, "");

/* ------------------------------------------------------------- leitores */

/** `"RUA X, 99 / CASA 2"` -> logradouro, numero, complemento. */
export function enderecoDoDocumentoHdi(v: string | null): { logradouro: string | null; numero: string | null; complemento: string | null } {
  if (v === null) return { logradouro: null, numero: null, complemento: null };
  const [antes, ...depois] = v.split(/\s+\/\s+/);
  const m = /^(.*?),\s*(\S+)\s*$/.exec(antes ?? "");
  return {
    logradouro: ouNulo(m === null ? antes : m[1]),
    numero: ouNulo(m?.[2]),
    complemento: ouNulo(depois.join(" / ")),
  };
}

/** `"10-Passeio - Nacional"` / `"5-Bi-combustivel"` -> sem o codigo da frente. */
export function semCodigoHdi(v: string | null): string | null {
  return v === null ? null : ouNulo(v.replace(/^\s*\d+\s*-\s*/, ""));
}

/**
 * "Guarda do Veiculo" junta residencia e trabalho numa resposta. So as
 * respostas VISTAS (15 apolices) sao partidas; a parte da residencia segue com
 * o texto da cia, porque ele nao diz se o portao e eletronico.
 */
export function garagensDaGuardaHdi(guarda: string | null): { residencia: string | null; trabalho: string | null } {
  if (guarda === null) return { residencia: null, trabalho: null };
  const t = guarda.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  if (t === "NAO POSSUI GARAGEM") return { residencia: "NAO POSSUI GARAGEM", trabalho: null };
  if (t === "NA RESIDENCIA E LOCAL DE TRABALHO") return { residencia: guarda, trabalho: "SIM" };
  if (t === "NA RESIDENCIA, SEM GARAGEM NO LOCAL DE TRABALHO") return { residencia: guarda, trabalho: "SEM GARAGEM NO LOCAL DE TRABALHO" };
  return { residencia: guarda, trabalho: null };
}

/** `<td>Condutor: NOME CPF: 00000000000</td><td>Data de Nasc.: dd/mm/aaaa</td>`. */
export function condutorDoDocumentoHdi(html: string): { nome: string | null; cpf: string | null; nascimento: DataCia | null } | null {
  const m = /<td[^>]*>\s*Condutor:\s*([^<]*?)\s*CPF:\s*([\d.\-\s]*?)\s*<\/td>\s*<td[^>]*>\s*Data de Nasc\.:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(html);
  if (m === null) return null;
  const cpf = (m[2] ?? "").replace(/\D/g, "");
  return {
    nome: ouNulo(m[1]),
    cpf: cpf.length === 11 ? cpf : null,
    nascimento: { iso: `${m[5]}-${m[4]}-${m[3]}`, original: `${m[3]}/${m[4]}/${m[5]}` },
  };
}

/** O que o documento de auto da HDI imprime, cru. */
export interface DocumentoAutoHdiLido {
  segurado_nome: string | null;
  /** CPF/CNPJ so com digitos (11 ou 14), senao null. */
  segurado_documento: string | null;
  endereco: EnderecoLido | null;
  /** Modelo sem o codigo da frente ("MARCA MODELO ..."). */
  modelo_descricao: string | null;
  marca: string | null;
  modelo: string | null;
  codigo_fipe: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  combustivel: string | null;
  placa: string | null;
  chassi: string | null;
  /** "Utilizacao do Veiculo" do perfil; sem ela, a Categoria sem codigo. */
  categoria_uso: string | null;
  cep_pernoite: string | null;
  ci: string | null;
  classe_bonus: number | null;
  sinistros: number | null;
  condutor_sexo: string | null;
  condutor_estado_civil: string | null;
  condutor_nome: string | null;
  condutor_cpf: string | null;
  condutor_nascimento: DataCia | null;
  guarda_do_veiculo: string | null;
  garagem_residencia: string | null;
  garagem_trabalho: string | null;
  utilizacao: string | null;
  cobertura_18_25: string | null;
}

export function lerDocumentoAutoHdi(html: string): DocumentoAutoHdiLido {
  const limpo = decodificarTexto(html);
  const doSegurado = ateOBlocoDoCorretor(limpo);
  const r = (rotulo: string) => aposRotulo(limpo, rotulo);

  const nome = aposRotulo(doSegurado, "Nome de Registro do Segurado") ?? aposRotulo(doSegurado, "Nome Social do Segurado");
  const doc = digitos(aposRotulo(doSegurado, "CPF") ?? aposRotulo(doSegurado, "CNPJ"));
  const end = enderecoDoDocumentoHdi(aposRotulo(doSegurado, "Endere[cç]o"));
  const cidadeUf = aposRotulo(doSegurado, "Cidade");
  const mCidade = cidadeUf === null ? null : /^(.*?)\s*-\s*([A-Z]{2})\s*$/.exec(cidadeUf);
  const cep = digitos(aposRotulo(doSegurado, "CEP"));
  const endereco: EnderecoLido = {
    cep: cep.length === 8 ? cep : null,
    logradouro: end.logradouro,
    numero: end.numero,
    complemento: end.complemento,
    bairro: aposRotulo(doSegurado, "Bairro"),
    cidade: ouNulo(mCidade === null ? cidadeUf : mCidade[1]),
    uf: mCidade?.[2] ?? null,
  };

  const modeloCru = r("Modelo");
  const modeloSemCodigo = modeloCru === null ? null : ouNulo(modeloCru.replace(/^\s*\d+\s*-\s*/, ""));
  const [marca, ...resto] = (modeloSemCodigo ?? "").split(" ");
  const anos = /(\d{4})\s*\/\s*(\d{4})/.exec(r("Ano Fabr\\.\\/Modelo") ?? "");
  const pernoite = digitos(r("CEP Pernoite"));
  const ci = digitos(r("C[oó]digo CI"));
  const bonus = /^\s*(\d{1,2})\s*-/.exec(r("Classe de B[oô]nus") ?? "")?.[1];
  const sinistros = r("Qtde Sinistros");
  const guarda = r("Guarda do Veiculo");
  const garagens = garagensDaGuardaHdi(guarda);
  const utilizacao = r("Utilizacao do Veiculo");
  const cond = condutorDoDocumentoHdi(limpo);

  return {
    segurado_nome: nome,
    segurado_documento: doc.length === 11 || doc.length === 14 ? doc : null,
    endereco: Object.values(endereco).every((x) => x === null) ? null : endereco,
    modelo_descricao: modeloSemCodigo,
    marca: ouNulo(marca),
    modelo: ouNulo(resto.join(" ")),
    codigo_fipe: /(\d{6}-\d)/.exec(r("C[oó]digo FIPE") ?? "")?.[1] ?? null,
    ano_fabricacao: anos === null ? null : Number(anos[1]),
    ano_modelo: anos === null ? null : Number(anos[2]),
    combustivel: semCodigoHdi(r("Combust[ií]vel")),
    placa: (r("Placa\\/UF") ?? "").split(/\s+-\s+/)[0]?.replace(/[^A-Z0-9]/gi, "").toUpperCase() || null,
    chassi: ouNulo(r("Chassi")?.replace(/\s+/g, "").toUpperCase()),
    categoria_uso: utilizacao ?? semCodigoHdi(r("Categoria")),
    cep_pernoite: pernoite.length === 8 ? pernoite : null,
    ci: ci.length >= 8 ? ci : null,
    classe_bonus: bonus === undefined ? null : Number(bonus),
    sinistros: sinistros !== null && /^\d+$/.test(sinistros) ? Number(sinistros) : null,
    condutor_sexo: r("Sexo"),
    condutor_estado_civil: r("Estado Civil"),
    condutor_nome: cond?.nome ?? null,
    condutor_cpf: cond?.cpf ?? null,
    condutor_nascimento: cond?.nascimento ?? null,
    guarda_do_veiculo: guarda,
    garagem_residencia: garagens.residencia,
    garagem_trabalho: garagens.trabalho,
    utilizacao,
    cobertura_18_25: r("Cob Demais Condutores Resid entre \\d+ At[eé] \\d+ Anos"),
  };
}
