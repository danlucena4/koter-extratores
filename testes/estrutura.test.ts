/**
 * Pecas comuns (leitura.ts, tabela.ts) e o reconhecimento de ENDOSSO em
 * residencial e vida. Linhas SINTETICAS (nada real).
 */
import { describe, expect, it } from "vitest";
import { dinheiroDoTexto } from "../src/allianz-residencial.js";
import { extrairDocumento, identificarDocumento, numeroDoEndosso } from "../src/documento.js";
import { chaveDeTexto, dinheiro, ufDe } from "../src/leitura.js";
import { dinheiroPtBr } from "../src/tabela.js";

describe("pecas comuns", () => {
  it("chave de texto: sem acento, maiusculas, so letras e digitos", () => {
    expect(chaveDeTexto("Incêndio, Raio / Explosão")).toBe("INCENDIO RAIO EXPLOSAO");
  });

  it("UF pela sigla ou pelo nome do estado", () => {
    expect([ufDe("BA"), ufDe("Bahia"), ufDe("são paulo"), ufDe("XX"), ufDe(null)]).toEqual(["BA", "BA", "SP", null, null]);
  });

  it("dinheiro: um conversor so, tres formas de achar", () => {
    /* No meio do texto. */
    expect(dinheiro("Prêmio Total : R$ 1.234,56")?.centavos).toBe(123456);
    /* Celula inteira: texto a mais e recusado. */
    expect(dinheiroPtBr("R$ 1.234,56")?.original).toBe("1.234,56");
    expect(dinheiroPtBr("1.234,56 mais")).toBeNull();
    /* Allianz: exige "R$", 0,00 e nulo e o original leva o "R$". */
    expect(dinheiroDoTexto("Preço líquido: R$ 1.000,00")).toEqual({ centavos: 100000, moeda: "BRL", original: "R$ 1.000,00" });
    expect(dinheiroDoTexto("R$ 0,00")).toBeNull();
    expect(dinheiroDoTexto("1.000,00")).toBeNull();
  });
});

describe("endosso em residencial e vida", () => {
  it("o numero impresso de cada cia", () => {
    expect(numeroDoEndosso(["Página 2 de 6 Nº Apólice: 5177202563140000001 Nº Endosso: 1"])).toBe(1);
    expect(numeroDoEndosso(["Nº. do Endosso: 2"])).toBe(2);
    expect(numeroDoEndosso(["Endosso: 00000 Itens: 1 Nº Via: 1"])).toBe(0);
    expect(numeroDoEndosso(["Endosso nº: 1 Número da proposta: 82 64600001"])).toBe(1);
    expect(numeroDoEndosso(["Ramo: 014 Produto: 405"])).toBeNull();
  });

  const porto = (cabecalho: string) => [
    "Seguro Residencial Habitual",
    "Porto Seguro Cia. de Seguros Gerais",
    "DADOS DA APÓLICE",
    cabecalho,
    "Número da apólice: 114 04 4000001 Ramo: 114",
    "Vigência: A partir das 24h do dia 03/02/2026 até as 24h do dia 22/11/2026.",
    "LOCAL SEGURADO",
    "Tipo de residência: CASAS DE ALVENARIA",
    "COBERTURAS CONTRATADAS",
    "RC FAMILIAR R$ 60.500,00 R$ 10,00",
    "PREÇO LÍQUIDO DAS COBERTURAS R$ 10,00",
    "CNPJ: 61.198.164/0001-60.",
  ];

  it("Porto: endosso nº 1 e endosso, e lido inteiro; a apolice continua apolice", () => {
    expect(identificarDocumento(porto("Apólice: *Renovação* Número da proposta: 19 16000001"))).toMatchObject({ seguradora: "porto", ramo: "residencial", tipo: "apolice" });
    const doc = extrairDocumento(porto("Endosso nº: 1 Número da proposta: 82 64600001"));
    expect([doc?.ramo, doc?.tipo, doc?.numero_apolice]).toEqual(["residencial", "endosso", "4000001"]);
    expect(doc?.sinais.at(-1)).toBe("Tipo de residência; endosso 1");
    expect(doc?.coberturas.map((c) => [c.descricao, c.valor?.centavos, c.premio?.centavos])).toEqual([["RC FAMILIAR", 6050000, 1000]]);
    expect([doc?.vigencia_inicio?.iso, doc?.vigencia_fim?.iso]).toEqual(["2026-02-03", "2026-11-22"]);
  });
});
