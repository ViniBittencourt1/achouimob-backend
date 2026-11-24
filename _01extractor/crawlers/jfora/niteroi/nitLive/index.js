import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitLive",
  displayName: "Live Negócios Imobiliários",
  baseUrl: "https://www.livenegocioimobiliario.com.br/imoveis/a-venda",
});
