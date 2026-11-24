import express from "express";
import cors from "cors";
import searchAIRouter from "./api/searchAI.js";
import { app as jfApp } from "./api/index-jf.js";
import imoveisRouter from "./api/imoveis.js";
import typesenseSearchRouter from "./deploy/api/typesenseSearch.js";
// Arquivo removido intencionalmente para evitar conflito de entrypoint. Use apenas src/index.js
const app = express();
app.use(cors());
app.use(express.json());

app.use("/search", searchAIRouter);
app.use("/api/imoveis", imoveisRouter);
app.use("/api", typesenseSearchRouter);
app.use("/", jfApp);

app.get("/health", (req, res) => res.status(200).send("ok"));
app.get("/", (req, res) => res.send("🔥 Backend rodando!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 API rodando na porta ${PORT}`));