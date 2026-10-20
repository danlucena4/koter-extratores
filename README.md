# koter-extratores

Extração de dados de documentos de seguradoras (PDF de apólice e de proposta) para a
**renovação** do Koter: o que está impresso no documento, cru, como a seguradora escreveu.

É **puro**: sem rede, sem portal, sem sessão. Quem baixa o documento (a automação: o
multicálculo, o koter-automation-api) chama o extrator; quem traduz para a cotação também é
o consumidor.

## Regra de ouro: só dado verdadeiro

- **Trava:** cada leitor confere que o documento é o pedido (número da apólice no cabeçalho;
  na proposta da MAPFRE, o CPF do segurado). Sem a trava, devolve `null`.
- Só sai o que tem **rótulo reconhecido**. Rótulo ausente ou valor fora do formato: o campo
  sai `null`, nunca um palpite.
- Valores saem **crus** (o texto da seguradora). Tradução para as opções da cotação, "a
  conferir" e padrões são de quem consome.

## Uso: uma entrada só

```ts
import { extrairDocumento } from "koter-extratores";

const doc = extrairDocumento(bytesDoPdf);                                  // reconhece sozinho
const doc = extrairDocumento(bytesDoPdf, { numero_apolice: "1234567890123" }); // com trava
const prop = extrairDocumento(bytesDaProposta, { cpf_segurado: "11144477735" });
```

`extrairDocumento` reconhece a **seguradora** (marca no cabeçalho, CNPJ, desempate pela que
aparece primeiro), o **ramo** (auto, residencial, vida) e o **tipo** (apólice, endosso,
proposta), lê o número impresso e devolve tudo num formato só (`DocumentoExtraido`, em
`src/modelo.ts`):

- apólice: número, item, proposta, emissão, vigência, produto, tipo de seguro, apólice
  renovada (número e seguradora);
- segurado: nome, CPF/CNPJ, nascimento, sexo, estado civil, profissão, renda, e-mail,
  telefones, endereço;
- auto: veículo (marca, modelo, anos, placa, chassi, FIPE, combustível, 0 km, categoria,
  blindagem, kit gás, alienação), uso, CEP e endereço de pernoite, bônus, CI, sinistros,
  antifurto, modalidade e % da FIPE, condutor (com vínculo) e o questionário inteiro
  (`respostas`: toda pergunta e resposta como impressas, além dos campos conhecidos);
- coberturas (descrição, LMI, limite em texto, prêmio, franquia), assistências,
  cláusulas, franquias (casco, vidros, faróis...), prêmio líquido e total, pagamento;
- residencial (imóvel, tipo, ocupação, LMI básica) e vida (capital de morte, renda).

| Seguradora | Auto | Endosso | Proposta | Residencial | Vida |
|---|---|---|---|---|---|
| MAPFRE | ✔ | | ✔ | ✔ | ✔ |
| Porto / Itaú / Azul | ✔ (inclui Proteção Combinada Itaú) | | | ✔ (Porto) | |
| Allianz | ✔ | ✔ | ✔ | ✔ | ✔ |
| Yelum / Aliro | ✔ | | | | ✔ (Yelum) |
| Tokio Marine | ✔ | | | ✔ | |
| Zurich | ✔ | | | | |
| Bradesco | ✔ (dois layouts) | | | | |
| HDI | ✔ (PDF e documento HTML) | ✔ | | ✔ | |

Pier, Youse e Justos não têm renovação própria.

## O motor de PDF (`src/pdf/`)

Sem dependência (só `zlib`): objetos e **object streams**, filtros Flate/ASCII85/ASCIIHex/LZW
(com preditores), árvore de páginas, fontes com **larguras reais** (`/Widths`, `/W`),
`/ToUnicode`, `/Differences` e a **codificação embutida** no programa da fonte (CFF e Type1),
estado gráfico e de texto completo (`cm`, `Tc`, `Tw`, `Tz`, `TJ`, `Tm`...), formulários e
campos preenchidos. As linhas saem da geometria (espaço onde há vão, texto girado à parte,
falso negrito descartado), com a **posição de cada palavra**, o que permite ler quadros de
"rótulos em cima, valores embaixo" pela coluna (`quadroPorColuna`, `tabelaPorColunas`).

As funções de antes (`lerApoliceYelum`, `lerApoliceBradesco`, `linhasDoPdf`...) continuam com a
mesma assinatura; as de MAPFRE auto, Bradesco e Zurich usam os leitores novos por baixo
(`src/compat.ts`).

Instalação (direto do git):

```bash
npm install github:danlucena4/koter-extratores
```

O `prepare` compila o `dist/` na instalação.

## Desenvolvimento

```bash
npm install
npm test
npm run typecheck
```

Os testes usam **linhas sintéticas** no formato visto nos PDFs reais (rótulos da seguradora,
valores inventados). Nenhum PDF real entra no repositório (`*.pdf` no `.gitignore`).

### Estudar um layout novo

Os PDFs ficam fora do repositório, numa pasta com uma subpasta por seguradora
(`<pasta>/<cia>/<n>.pdf` + `<n>.json` com o identificador), como o baixador do multicálculo
grava (`apps/api/scripts/_baixar-pdfs-renovacao.mts`, só leitura).

```bash
export EXTRATORES_PDFS=C:/projeto-api/.data/pdfs-renovacao
npx tsx scripts/layout.ts mapfre saida.txt     # layout mascarado (palavra que varia vira ▒, digito vira #)
npx tsx scripts/respostas.ts hdi "Guarda|Utiliza"   # linhas de pergunta e resposta, sem nome/CPF/placa
npx tsx scripts/cobertura.ts yelum             # quanto o leitor acha, campo a campo
npx tsx scripts/regressao.ts gravar antes      # roda tudo sobre os PDFs reais e grava (fora do git)
npx tsx scripts/regressao.ts comparar antes depois   # o que mudou, so o caminho do campo
```

O levantamento de 2026-10-19 (o que cada seguradora imprime e o que não imprime) está no
multicálculo: `docs/renovacao-pdf/LAYOUTS.md`.
