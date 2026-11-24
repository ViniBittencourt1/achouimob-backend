import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitLuis",
  displayName: "Luis Imóveis",
  baseUrl: "https://www.luisimoveis.com.br/imoveis/a-venda",
});
