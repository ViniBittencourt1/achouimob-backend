import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitLopes",
  displayName: "Lopes Niterói",
  baseUrl: "https://www.lopesniteroi.com.br/imoveis/a-venda",
});
