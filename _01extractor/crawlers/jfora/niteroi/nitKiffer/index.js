import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitKiffer",
  displayName: "Kiffer Imóveis",
  baseUrl: "https://www.kifferimoveis.com.br/imoveis/a-venda",
});
