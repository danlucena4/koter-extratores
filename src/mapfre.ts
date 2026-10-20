/**
 * A APOLICE DE AUTO DA MAPFRE EM PDF, lida como texto.
 *
 * O detalhe (`GET /policy/{id}/auto`) nao traz ano, combustivel, uso, bonus,
 * FIPE nem CEP de pernoite; o PDF da apolice traz tudo isso no quadro da
 * pagina 1. Evidencia: capture/captures/mapfre-posvenda seq 0360
 * (`/policy/document/{id}`, %PDF-1.4, 221 linhas de texto). O quadro:
 *
 *   Nome do Segurado: ... Pessoa: FISICA CPF: 000.000.000-00
 *   Data Nasc.: dd/mm/aaaa Sexo: FEMININO Est.Civil: SOLTEIRO
 *   Endereço: RUA ... Nº 100 Compl.: ...
 *   Bairro: ... Cidade: ... UF: BA CEP: 00000-000
 *   Veículo: 00;00;0; <codigo> MARCA - MODELO 1.0 ... (Flex) ...
 *   Ano Modelo: 2025 0Km: NÃO
 *   Chassi: ... Placa: ...
 *   Uso: 1 - PARTICULAR Categoria Tarifária: ...
 *   Tipo de Seguro: ... Classe de Bônus: 0
 *   Tabela de Referência: FIPE (...)(000000-0) ...
 *   - Nome do Principal Condutor: ... CPF: ...
 *   - Data de Nascimento Condutor / Sexo do Condutor: 2 - FEMININO
 *   - Estado Civil do Condutor: S - SOLTEIRO
 *   - CEP de pernoite do veículo: 00000-000 Cidade: ... UF: ..
 *   - <pergunta> ... entre 18 a 25 anos?   (resposta na linha seguinte)
 *
 * TRAVA: o numero da apolice (13 digitos) aparece sozinho numa linha do
 * cabecalho. Sem ele, o PDF e de outra apolice e nada e lido.
 */

import type { DataCia } from "./tipos.js";
import type { EnderecoLido as EnderecoDoPdf } from "./tipos.js";

export const ROTULOS_DA_APOLICE_MAPFRE = [
  "Nome do Principal Condutor",
  "Data de Nascimento Condutor",
  "Estado Civil do Condutor",
  "CEP de pernoite do veículo",
  "Tipo Isenção Imposto",
  "Tabela de Referência",
  "Categoria Tarifária",
  "Qtde Passageiros",
  "Tabela Substituta",
  "Sexo do Condutor",
  "Nome do Segurado",
  "Classe de Bônus",
  "Fator de Ajuste",
  "Tipo de Seguro",
  "Renda Mensal",
  "Ano Modelo",
  "Data Nasc.",
  "Est.Civil",
  "Atividade",
  "Endereço",
  "Veículo",
  "Bairro",
  "Cidade",
  "Chassi",
  "Compl.",
  "Pessoa",
  "Placa",
  "Sexo",
  "0Km",
  "CEP",
  "CPF",
  "Uso",
  "UF",
] as const;
export type RotuloDaApoliceMapfre = (typeof ROTULOS_DA_APOLICE_MAPFRE)[number];

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const PADRAO_ROTULO = new RegExp(`(?:^|\\s|-\\s)(${ROTULOS_DA_APOLICE_MAPFRE.map(escapar).join("|")})\\s*:`, "g");

/** Uma linha partida nos rotulos que ela tem, na ordem. */
export function camposDaLinha(linha: string): Array<{ rotulo: RotuloDaApoliceMapfre; valor: string }> {
  const achados: Array<{ rotulo: RotuloDaApoliceMapfre; ini: number; fim: number }> = [];
  PADRAO_ROTULO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PADRAO_ROTULO.exec(linha)) !== null) {
    achados.push({ rotulo: m[1] as RotuloDaApoliceMapfre, ini: m.index, fim: m.index + m[0].length });
  }
  return achados.map((a, k) => ({
    rotulo: a.rotulo,
    valor: linha.slice(a.fim, achados[k + 1]?.ini).trim(),
  }));
}

const vazio = (v: string | undefined | null): string | null => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
};
const digitos = (v: string | null): string => (v ?? "").replace(/\D/g, "");

function data(v: string | null): DataCia | null {
  const m = v === null ? null : /(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
  return m === null ? null : { iso: `${m[3]}-${m[2]}-${m[1]}`, original: m[0] };
}

/** `"2 - FEMININO"` / `"S - SOLTEIRO"` -> o texto, sem o codigo. */
export function semCodigo(v: string | null): string | null {
  return v === null ? null : vazio(v.replace(/^[A-Z0-9]{1,3}\s+-\s+/, ""));
}

const COMBUSTIVEL_ENTRE_PARENTESES = /\((flex|gasolina|diesel|[aá]lcool|etanol|el[eé]trico|h[ií]brido)\)/i;

/**
 * `"00;00;0; CG123 MARCA - MODELO 1.0 XX 111 (Aut.) (Flex) A/G 4p"` -> marca,
 * modelo e combustivel. Os codigos da frente sao tirados; o modelo fica com o
 * texto que a cia escreveu, sem o combustivel entre parenteses.
 */
export function veiculoDaApoliceMapfre(v: string | null): {
  marca: string | null;
  modelo: string | null;
  combustivel: string | null;
} {
  if (v === null) return { marca: null, modelo: null, combustivel: null };
  const combustivel = COMBUSTIVEL_ENTRE_PARENTESES.exec(v)?.[1] ?? null;
  const sem = v.replace(/^[\d;\s]+/, "").replace(/^[A-Z]{1,4}\d+\s+/, "");
  const corte = sem.indexOf(" - ");
  if (corte < 0) return { marca: null, modelo: vazio(sem), combustivel };
  return {
    marca: vazio(sem.slice(0, corte)),
    modelo: vazio(sem.slice(corte + 3).replace(COMBUSTIVEL_ENTRE_PARENTESES, " ")),
    combustivel,
  };
}

export interface ApoliceMapfreLida {
  segurado_nome: string | null;
  segurado_documento: string | null;
  segurado_nascimento: DataCia | null;
  segurado_sexo: string | null;
  segurado_estado_civil: string | null;
  endereco: EnderecoDoPdf | null;
  marca: string | null;
  modelo: string | null;
  combustivel: string | null;
  ano_modelo: number | null;
  zero_km: boolean | null;
  chassi: string | null;
  placa: string | null;
  uso: string | null;
  classe_bonus: number | null;
  codigo_fipe: string | null;
  condutor_nome: string | null;
  condutor_cpf: string | null;
  condutor_nascimento: DataCia | null;
  condutor_sexo: string | null;
  condutor_estado_civil: string | null;
  cep_pernoite: string | null;
  menores_25: string | null;
  /** Codigo de identificacao (so no layout do kit). */
  ci?: string | null;
  /** "Tipo de isenção" (so no layout do kit): "SEM ISENÇÃO". */
  isencao_fiscal?: string | null;
  /** "Atividade" do segurado (so na PROPOSTA): a profissao, como a MAPFRE escreve. */
  segurado_atividade?: string | null;
}

/** O numero da apolice sozinho numa linha (com a data de emissao atras). */
export function pdfEDaApoliceMapfre(linhas: readonly string[], numeroApolice: string): boolean {
  const n = digitos(numeroApolice);
  if (n.length < 8) return false;
  const padrao = new RegExp(`(?:^|\\s)${n}(?:\\s|$)`);
  return linhas.slice(0, 40).some((l) => padrao.test(l));
}

/** Le o quadro. `null` quando o PDF nao e o da apolice pedida (ver TRAVA). */
export function lerApoliceMapfre(linhas: readonly string[], numeroApolice: string): ApoliceMapfreLida | null {
  if (!pdfEDaApoliceMapfre(linhas, numeroApolice)) return null;

  const limite = Math.min(linhas.length, 90);
  const seg = new Map<RotuloDaApoliceMapfre, string>();
  const cond = new Map<RotuloDaApoliceMapfre, string>();
  let menores25: string | null = null;
  for (let i = 0; i < limite; i++) {
    const linha = linhas[i] as string;
    /* As linhas do questionario comecam com "- ": CPF, Cidade e UF de la sao do condutor/pernoite. */
    const doCondutor = /^\s*-\s/.test(linha);
    for (const { rotulo, valor } of camposDaLinha(linha)) {
      const alvo = doCondutor ? cond : seg;
      if (!alvo.has(rotulo) && valor.length > 0) alvo.set(rotulo, valor);
    }
    if (menores25 === null && /\b18\s*(?:a|à|e)\s*25\s*anos/i.test(linha)) {
      menores25 = semCodigo(vazio(linhas[i + 1]));
    }
  }

  const g = (r: RotuloDaApoliceMapfre) => vazio(seg.get(r));
  const c = (r: RotuloDaApoliceMapfre) => vazio(cond.get(r));

  const doc = digitos(g("CPF"));
  const cpfCondutor = digitos(c("CPF"));
  const enderecoCru = g("Endereço");
  const [logradouro, numero] = enderecoCru === null ? [null, null] : enderecoCru.split(/\s+N[ºo°]\s*/);
  const cep = digitos(g("CEP"));
  const uf = g("UF")?.toUpperCase() ?? null;
  const endereco: EnderecoDoPdf = {
    cep: cep.length === 8 ? cep : null,
    logradouro: vazio(logradouro),
    numero: vazio(numero),
    complemento: g("Compl."),
    bairro: g("Bairro"),
    cidade: g("Cidade"),
    uf: uf !== null && /^[A-Z]{2}$/.test(uf) ? uf : null,
  };
  const veiculo = veiculoDaApoliceMapfre(g("Veículo"));
  const ano = Number(digitos(g("Ano Modelo")).slice(0, 4));
  const zero = g("0Km");
  const bonus = digitos(g("Classe de Bônus"));
  const fipe = /(\d{6}-\d)/.exec(g("Tabela de Referência") ?? "")?.[1] ?? null;
  const pernoite = digitos(c("CEP de pernoite do veículo")?.split(/\s/)[0] ?? null);

  return {
    segurado_nome: g("Nome do Segurado"),
    segurado_documento: doc.length === 11 || doc.length === 14 ? doc : null,
    segurado_nascimento: data(g("Data Nasc.")),
    segurado_sexo: g("Sexo"),
    segurado_estado_civil: g("Est.Civil"),
    endereco: Object.values(endereco).every((x) => x === null) ? null : endereco,
    marca: veiculo.marca,
    modelo: veiculo.modelo,
    combustivel: veiculo.combustivel,
    ano_modelo: Number.isInteger(ano) && ano >= 1900 && ano <= 2100 ? ano : null,
    zero_km: zero === null ? null : /^S/i.test(zero) ? true : /^N/i.test(zero) ? false : null,
    chassi: g("Chassi"),
    placa: g("Placa")?.replace(/[^A-Z0-9]/gi, "").toUpperCase() || null,
    uso: g("Uso"),
    classe_bonus: bonus.length > 0 && bonus.length <= 2 ? Number(bonus) : null,
    codigo_fipe: fipe,
    condutor_nome: c("Nome do Principal Condutor"),
    condutor_cpf: cpfCondutor.length === 11 ? cpfCondutor : null,
    condutor_nascimento: data(c("Data de Nascimento Condutor")),
    condutor_sexo: semCodigo(c("Sexo do Condutor")),
    condutor_estado_civil: semCodigo(c("Estado Civil do Condutor")),
    cep_pernoite: pernoite.length === 8 ? pernoite : null,
    menores_25: menores25,
  };
}

/* ------------------------------------------------------------------------ */
/* Layout 2: o PDF da APOLICE publicado no kit                              */
/* ------------------------------------------------------------------------ */

/**
 * O PDF "policy" que a lista de documentos da MAPFRE publica tem OUTRO quadro
 * (sonda ao vivo 2026-10-15, 845 linhas, so a forma dos rotulos foi lida):
 *
 *   Produto: 000 Nº Apólice: 0000000 0000 00          (numero com espacos)
 *   Versão de cálculo: ... CI: 0000000000 0000
 *   Nome: ... / Nome Social: / Tipo de pessoa: FÍSICA CPF: 000.000.0 00-00
 *   Endereço: ... / Bairro: ... CEP: 00 000-000 / Cidade: ... UF: ..
 *   Nome do principal condutor: ...
 *   CPF: ... Data de nascimento: ... / Sexo: ... / Estado Civil: ...
 *   CEP do local onde o veículo pernoita: 00 000-000
 *   Marca/Modelo: ... / Ano do modelo: 0000 Placa: ... / 0KM: NÃO
 *   Nº Chassi: ... / Uso: PARTICULAR / Código na Tabela de Referência: 000000-0
 *
 * O gerador desenha letra por letra; o texto chega com espacos a mais dentro
 * de numeros e a menos entre palavras ("principalcondutor"). Por isso os
 * rotulos casam sem exigir espaco, e os campos numericos perdem os espacos.
 * "Nome:", "CPF:", "CEP:" e "Cidade:" repetem nos blocos do corretor e da
 * seguradora: o bloco do segurado comeca no "Nome:" seguido de "Nome Social:".
 */
const ROTULOS_DO_KIT = [
  "CEP do local onde o veículo pernoita",
  "Código na Tabela de Referência",
  "Data de emissão da apólice",
  "Nome do principal condutor",
  "Capacidade/passageiros",
  "Telefone residencial",
  "Categoria tarifária",
  "Tabela de Referência",
  "Telefone comercial",
  "Data de nascimento",
  "Versão de cálculo",
  "Telefone celular",
  "Código na MAPFRE",
  "Tipo de isenção",
  "Tipo de pessoa",
  "Ano do modelo",
  "Estado Civil",
  "Marca/Modelo",
  "Nome Social",
  "Nº Apólice",
  "Nº Chassi",
  "Blindagem",
  "Endereço",
  "CPF/CNPJ",
  "Telefone",
  "Endosso",
  "Produto",
  "Bairro",
  "Cidade",
  "Itens",
  "Nº Via",
  "Placa",
  "Nome",
  "Sexo",
  "CNPJ",
  "0KM",
  "CEP",
  "CPF",
  "Uso",
  "CI",
  "UF",
] as const;
type RotuloDoKit = (typeof ROTULOS_DO_KIT)[number];

/* Espaco entre palavras do rotulo e opcional: o gerador as vezes o come. */
const PADRAO_DO_KIT = new RegExp(
  `(?:^|[\\s\\d])(${ROTULOS_DO_KIT.map((r) => escapar(r).replace(/\s+/g, "\\s*")).join("|")})\\s*:`,
  "giu",
);
const chaveDoRotulo = (achado: string): RotuloDoKit | undefined => {
  const sem = achado.replace(/\s+/g, "").toLowerCase();
  return ROTULOS_DO_KIT.find((r) => r.replace(/\s+/g, "").toLowerCase() === sem);
};

interface Ocorrencia {
  linha: number;
  rotulo: RotuloDoKit;
  valor: string;
}

function ocorrenciasDoKit(linhas: readonly string[]): Ocorrencia[] {
  const out: Ocorrencia[] = [];
  const limite = Math.min(linhas.length, 220);
  for (let i = 0; i < limite; i++) {
    const linha = linhas[i] as string;
    const achados: Array<{ rotulo: RotuloDoKit; ini: number; fim: number }> = [];
    PADRAO_DO_KIT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PADRAO_DO_KIT.exec(linha)) !== null) {
      const rotulo = chaveDoRotulo(m[1] as string);
      if (rotulo === undefined) continue;
      const ini = m.index + m[0].indexOf(m[1] as string);
      achados.push({ rotulo, ini, fim: m.index + m[0].length });
    }
    achados.forEach((a, k) => {
      out.push({ linha: i, rotulo: a.rotulo, valor: linha.slice(a.fim, achados[k + 1]?.ini).trim() });
    });
  }
  return out;
}

const compacto = (v: string | null): string | null => (v === null ? null : vazio(v.replace(/\s+/g, "")));

/** O "Nº Apólice" do kit, sem os espacos que o gerador poe no meio. */
export function numeroDoKit(linhas: readonly string[]): string | null {
  const o = ocorrenciasDoKit(linhas.slice(0, 40)).find((x) => x.rotulo === "Nº Apólice");
  const d = digitos(o?.valor ?? null);
  return d.length >= 8 ? d : null;
}

const COMBUSTIVEL_NO_TEXTO = /\b(FLEX|GASOLINA|DIESEL|[AÁ]LCOOL|ETANOL|EL[EÉ]TRICO|H[IÍ]BRIDO)\b/i;

/** Le o quadro do kit. `null` quando o "Nº Apólice" nao e o pedido. */
export function lerApoliceMapfreKit(linhas: readonly string[], numeroApolice: string): ApoliceMapfreLida | null {
  const n = digitos(numeroApolice);
  if (n.length < 8 || numeroDoKit(linhas) !== n) return null;

  const oc = ocorrenciasDoKit(linhas);
  const inicioSegurado =
    oc.find((o) => o.rotulo === "Nome" && oc.some((x) => x.rotulo === "Nome Social" && x.linha > o.linha && x.linha <= o.linha + 2))
      ?.linha ?? -1;
  const inicioCondutor = oc.find((o) => o.rotulo === "Nome do principal condutor")?.linha ?? -1;
  const fimSegurado = inicioCondutor > inicioSegurado ? inicioCondutor : Number.POSITIVE_INFINITY;

  const doSegurado = (r: RotuloDoKit): string | null =>
    inicioSegurado < 0
      ? null
      : vazio(oc.find((o) => o.rotulo === r && o.linha >= inicioSegurado && o.linha < fimSegurado && o.valor.length > 0)?.valor);
  const doCondutor = (r: RotuloDoKit): string | null =>
    inicioCondutor < 0 ? null : vazio(oc.find((o) => o.rotulo === r && o.linha >= inicioCondutor && o.valor.length > 0)?.valor);
  const unico = (r: RotuloDoKit): string | null => vazio(oc.find((o) => o.rotulo === r && o.valor.length > 0)?.valor);

  const doc = digitos(doSegurado("CPF") ?? doSegurado("CPF/CNPJ") ?? doSegurado("CNPJ"));
  const cpfCondutor = digitos(doCondutor("CPF"));
  const enderecoCru = doSegurado("Endereço");
  const partes = enderecoCru === null ? null : /^(\D*?)[\s,]*(\d+)(.*)$/.exec(enderecoCru);
  const cep = digitos(doSegurado("CEP"));
  const uf = compacto(doSegurado("UF"))?.toUpperCase() ?? null;
  const endereco: EnderecoDoPdf = {
    cep: cep.length === 8 ? cep : null,
    logradouro: vazio(partes === null ? enderecoCru : partes[1]),
    numero: vazio(partes?.[2]),
    complemento: vazio(partes?.[3]?.replace(/^[\s,-]+/, "")),
    bairro: doSegurado("Bairro"),
    cidade: doSegurado("Cidade"),
    uf: uf !== null && /^[A-Z]{2}$/.test(uf) ? uf : null,
  };

  const marcaModelo = unico("Marca/Modelo");
  const [marca, ...resto] = (marcaModelo ?? "").split(" ");
  const ano = Number(digitos(compacto(unico("Ano do modelo"))).slice(0, 4));
  const zero = compacto(unico("0KM"));
  const fipe = /(\d{6}-\d)/.exec(compacto(unico("Código na Tabela de Referência")) ?? "")?.[1] ?? null;
  const pernoite = digitos(doCondutor("CEP do local onde o veículo pernoita") ?? unico("CEP do local onde o veículo pernoita"));
  const ci = digitos(unico("CI"));

  /* Fora do quadro de rotulos com ":" (sondagem dos PDFs da A vencer, 2026-10-19):
   * "Classe de bônus 10" sem dois-pontos, e a resposta dos 18 a 25 anos na
   * linha de baixo, letra por letra ("N Ã O"). */
  /* O gerador separa os digitos as vezes ("1 0" = 10): junta e exige o numero no fim da linha. */
  const bonus = linhas
    .map((l) => /^Classe\s*de\s*b[ôo]nus\s*(\d\s?\d?)\s*$/i.exec(l.trim())?.[1]?.replace(/\s/g, ""))
    .find((x) => x !== undefined);
  const iPergunta = linhas.findIndex((l) => /residentes\s*entre.*anos\s*\?/i.test(l));
  const respostaBruta =
    iPergunta < 0 ? null : (linhas.slice(iPergunta + 1, iPergunta + 6).find((l) => /[A-Za-zÀ-ú]/.test(l)) ?? null);
  const resposta = respostaBruta === null ? null : respostaBruta.replace(/\s+/g, "").toUpperCase();
  const menores25 = resposta === "SIM" ? "SIM" : resposta === "NÃO" || resposta === "NAO" ? "NAO" : null;
  /* Estado civil do condutor: o kit quebra a opcao em duas linhas e come os espacos. */
  const ecBruto = doCondutor("Estado Civil");
  const ecCondutor =
    ecBruto !== null && /^CASADO\s*OU\s*RESIDE/i.test(ecBruto) ? "CASADO OU RESIDE COM COMPANHEIRO(A)" : ecBruto;

  return {
    segurado_nome: doSegurado("Nome"),
    segurado_documento: doc.length === 11 || doc.length === 14 ? doc : null,
    segurado_nascimento: null,
    segurado_sexo: null,
    segurado_estado_civil: null,
    endereco: Object.values(endereco).every((x) => x === null) ? null : endereco,
    marca: vazio(marca),
    modelo: vazio(resto.join(" ")),
    combustivel: COMBUSTIVEL_NO_TEXTO.exec(marcaModelo ?? "")?.[1] ?? null,
    ano_modelo: Number.isInteger(ano) && ano >= 1900 && ano <= 2100 ? ano : null,
    zero_km: zero === null ? null : /^S/i.test(zero) ? true : /^N/i.test(zero) ? false : null,
    chassi: compacto(unico("Nº Chassi"))?.toUpperCase() ?? null,
    placa: compacto(unico("Placa"))?.replace(/[^A-Z0-9]/gi, "").toUpperCase() || null,
    uso: unico("Uso"),
    classe_bonus: bonus === undefined ? null : Number(bonus),
    codigo_fipe: fipe,
    condutor_nome: doCondutor("Nome do principal condutor"),
    condutor_cpf: cpfCondutor.length === 11 ? cpfCondutor : null,
    condutor_nascimento: data(compacto(doCondutor("Data de nascimento"))),
    condutor_sexo: doCondutor("Sexo"),
    condutor_estado_civil: ecCondutor,
    cep_pernoite: pernoite.length === 8 ? pernoite : null,
    menores_25: menores25,
    ci: ci.length >= 8 ? ci : null,
    isencao_fiscal: unico("Tipo de isenção"),
  };
}

/** Qualquer dos dois layouts; `null` quando nenhum e o da apolice pedida. */
export function lerApoliceMapfreQualquer(linhas: readonly string[], numeroApolice: string): ApoliceMapfreLida | null {
  return lerApoliceMapfre(linhas, numeroApolice) ?? lerApoliceMapfreKit(linhas, numeroApolice);
}

/* ------------------------------------------------------------------------ */
/* A PROPOSTA (documento "Proposta (PDF)" da mesma apolice)                  */
/* ------------------------------------------------------------------------ */

/** O que so a proposta traz do SEGURADO (a apolice do kit nao imprime). */
export interface PropostaMapfreLida {
  segurado_nascimento: DataCia | null;
  segurado_sexo: string | null;
  segurado_estado_civil: string | null;
  segurado_atividade: string | null;
}

/**
 * Le o bloco "Dados do Segurado / Correspondencia" da proposta (7 PDFs da A
 * vencer, 2026-10-19):
 *
 *   Nome do Segurado: <nome> Tipo Pessoa: FISICA CPF: 000.000.000-00
 *   Data Nasc.: dd/mm/aaaa Sexo: MASCULINO Est.Civil: CASADO
 *   E-mail: <email> Atividade: ADMINISTRADOR
 *
 * O bloco "Dados do Responsavel pelo Pagamento" repete os rotulos com o
 * PAGADOR: so a PRIMEIRA ocorrencia (o segurado) vale.
 *
 * TRAVA: a proposta nao imprime o numero da apolice. O CPF do segurado nela
 * tem que ser o da apolice; sem CPF para comparar, nada e lido.
 */
export function lerPropostaMapfre(linhas: readonly string[], cpfSegurado: string | null): PropostaMapfreLida | null {
  const esperado = digitos(cpfSegurado);
  if (esperado.length !== 11 && esperado.length !== 14) return null;
  const iNome = linhas.findIndex((l) => /^Nome do Segurado:.*\bCPF:\s*[\d.\-/]+/i.test(l));
  if (iNome < 0) return null;
  const cpf = digitos(/\bCPF:\s*([\d.\-/]+)/i.exec(linhas[iNome] as string)?.[1] ?? null);
  if (cpf !== esperado) return null;

  const bloco = linhas.slice(iNome, iNome + 12);
  const pessoa = bloco
    .map((l) => /^Data Nasc\.:\s*(\d{2}\/\d{2}\/\d{4})\s+Sexo:\s*(MASCULINO|FEMININO)\s+Est\.Civil:\s*(.+)$/i.exec(l))
    .find((m) => m !== null);
  const atividade = bloco.map((l) => /\bAtividade:\s*(\S.*)$/i.exec(l)?.[1]).find((x) => x !== undefined);
  return {
    segurado_nascimento: data(pessoa?.[1] ?? null),
    segurado_sexo: pessoa?.[2] ?? null,
    segurado_estado_civil: vazio(pessoa?.[3]),
    segurado_atividade: vazio(atividade),
  };
}

/** A apolice completada com a proposta: so o que a apolice deixou vazio. */
export function comProposta(apolice: ApoliceMapfreLida, proposta: PropostaMapfreLida): ApoliceMapfreLida {
  return {
    ...apolice,
    segurado_nascimento: apolice.segurado_nascimento ?? proposta.segurado_nascimento,
    segurado_sexo: apolice.segurado_sexo ?? proposta.segurado_sexo,
    segurado_estado_civil: apolice.segurado_estado_civil ?? proposta.segurado_estado_civil,
    segurado_atividade: apolice.segurado_atividade ?? proposta.segurado_atividade,
  };
}
