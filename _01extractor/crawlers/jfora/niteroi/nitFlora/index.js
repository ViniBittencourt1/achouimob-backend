import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitFlora",
  displayName: "Flora Imóveis",
  baseUrl: "https://www.floraimoveis.com/imoveis/a-venda",
});
