/**
 * Tokio Marine Vida: linhas SINTETICAS na forma dos PDFs da cobranca de
 * 2026-10-22 (nomes, documentos e enderecos inventados).
 */
import { describe, expect, it } from "vitest";
import { extrairDocumento } from "../src/documento.js";

const linhas = [
  "Vida Individual",
  "Obrigado por escolher a Tokio Marine Seguradora!",
  "Tokio Marine Vida Individual",
  "Vigência: a partir das 24 horas do dia 15/06/2026 até as 24 horas do dia 15/06/2031.",
  "Ramo: 13.91 Apólice: 0001600001 Plano: 1 Proposta: 9200001",
  "Tipo de Seguro: Seguro novo",
  "Data da Emissão: 22/06/2026 15:37:15 Data da Referência: 22/06/2026",
  "E-mail: FULANO@EXEMPLO.COM",
  "Segurado: FULANO DE TAL",
  "CPF: 111.444.777-35",
  "Endereço: RUA DAS FLORES, 12 - CASA",
  "Bairro: CENTRO",
  "CEP: 44380-000 Cidade: CRUZ DAS ALMAS UF: BA",
  "Celular: (75) 98888-1234",
  "Capitais Segurados Carências Prêmios",
  "Descrição das Coberturas Franquias",
  "(R$) (*) Anuais (R$)",
  "BÁSICA (MORTE) 300.000,00 Não há Não há 603,86",
  "MORTE ACIDENTAL 300.000,00 Não há Não há 229,03",
  "INVALIDEZ PERMANENTE 300.000,00 Não há Não há 129,71",
  "TOTAL OU PARCIAL POR",
  "ACIDENTE",
  "- O Prêmio acima demonstrado em cada cobertura contempla 0,38% de IOF",
  "Nome Data de Nascimento Parentesco %",
  "FULANA DE TAL 16/12/1987 Cônjuge 50,00",
  "CICLANO DE TAL 25/06/2021 Neto(a)50,00",
  "BELTRANO DE TAL SOBRINHO 25/06/2021 Neto(a) 50,00",
  "FIGUEIREDO",
  "IMPORTANTE: FICA A CRITÉRIO DA SEGURADORA",
  "Prêmio Líquido Total: R$ 958,25 Juros: R$ 0,00 I.O.F.: R$ 4,35",
  "Prêmio Total/Anual: R$ 962,60 Cobrança: Carnê",
  "Este Seguro é garantido pela Tokio Marine Seguradora S.A. - CNPJ 33.164.021/0001-00,",
];

describe("Tokio Marine Vida", () => {
  it("e vida (nao auto) e o documento sai inteiro", () => {
    const doc = extrairDocumento(linhas);
    expect([doc?.seguradora, doc?.ramo, doc?.tipo, doc?.numero_apolice]).toEqual(["tokio", "vida", "apolice", "0001600001"]);
    expect([doc?.produto, doc?.proposta, doc?.tipo_seguro, doc?.emissao?.iso]).toEqual(["Tokio Marine Vida Individual", "9200001", "Seguro novo", "2026-06-22"]);
    expect([doc?.vigencia_inicio?.iso, doc?.vigencia_fim?.iso]).toEqual(["2026-06-15", "2031-06-15"]);
    expect([doc?.premio_liquido?.centavos, doc?.premio_total?.centavos, doc?.pagamento]).toEqual([95825, 96260, { forma: "Carnê", parcelas: null }]);
    expect(doc?.segurado).toMatchObject({ nome: "FULANO DE TAL", documento: "11144477735", email: "fulano@exemplo.com", telefones: ["75988881234"] });
    expect(doc?.segurado?.endereco).toEqual({ cep: "44380000", logradouro: "RUA DAS FLORES", numero: "12", complemento: "CASA", bairro: "CENTRO", cidade: "CRUZ DAS ALMAS", uf: "BA" });
    expect(doc?.coberturas.map((c) => [c.descricao, c.valor?.centavos, c.premio?.centavos])).toEqual([
      ["BÁSICA (MORTE)", 30000000, 60386],
      ["MORTE ACIDENTAL", 30000000, 22903],
      ["INVALIDEZ PERMANENTE TOTAL OU PARCIAL POR ACIDENTE", 30000000, 12971],
    ]);
    expect(doc?.vida?.capital_morte?.centavos).toBe(30000000);
    expect(doc?.vida?.periodicidade_premio).toBe("ANUAL");
    /* A linha sem espaco antes do % nao e beneficiario (nunca um palpite); o nome que quebra continua embaixo. */
    expect(doc?.vida?.beneficiarios.map((b) => [b.nome, b.nascimento?.iso, b.parentesco, b.percentual])).toEqual([
      ["FULANA DE TAL", "1987-12-16", "Cônjuge", 50],
      ["BELTRANO DE TAL SOBRINHO FIGUEIREDO", "2021-06-25", "Neto(a)", 50],
    ]);
  });

  it("trava: outra apolice e recusada", () => {
    expect(extrairDocumento(linhas, { numero_apolice: "1600002" })).toBeNull();
  });
});
