import { join } from "node:path";

/**
 * A pasta dos PDFs de estudo, FORA do repositorio (tem dado de cliente): uma
 * subpasta por cia, como o baixador do multicalculo grava
 * (`<EXTRATORES_PDFS>/<cia>/<n>.pdf` + `<n>.json` com o identificador).
 */
export function pastaDosPdfs(cia: string): string {
  const base = process.env["EXTRATORES_PDFS"]?.trim();
  if (!base) {
    console.error("defina EXTRATORES_PDFS com a pasta dos PDFs (ex.: C:/projeto-api/.data/pdfs-renovacao)");
    process.exit(2);
  }
  return join(base, cia);
}
