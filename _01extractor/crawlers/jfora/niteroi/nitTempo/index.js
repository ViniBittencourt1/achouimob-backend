import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitTempo",
  displayName: "Tempo Imóveis",
  baseUrl: "https://www.tempoimoveisrj.com/imoveis/a-venda",
});
