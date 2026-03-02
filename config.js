export const config = {
  sttEndpoint: process.env.STT_ENDPOINT || "http://localhost:8090/inference",
  silenceMs: Number(process.env.SILENCE_MS || 3000),
};

// Prompt templates por tipo de conteúdo
export const contentPrompts = {
  default: (text) => `Você é um redator profissional e assistente de produtividade.
Reescreva o texto bruto abaixo em Markdown claro e coeso, sem inventar informações.

Transcrição Bruta:
"${text}"

Regras:
- Não inclua nada que não esteja no áudio.
- Corrija pontuação e gramática sem alterar sentido.
- Estruture em parágrafos e, se fizer sentido, adicione um Resumo e Tópicos principais.`,

  aula: (text) => `Você é um produtor de notas de aula.
Formate o conteúdo em Markdown com:
1. Resumo da aula (bullets curtos).
2. Tópicos principais em ordem.
3. Exemplos ou definições citadas.
4. Perguntas em aberto, se houver.
Não invente informações.

Transcrição:
"${text}"`,

  reuniao: (text) => `Você é um secretário de reunião.
Formate em Markdown com seções:
- Resumo executivo (3-5 bullets).
- Decisões tomadas.
- Pendências / responsáveis.
- Próximos passos com prazos quando citados.
Somente use o que está na transcrição.

Transcrição:
"${text}"`,

  entrevista: (text) => `Você é um tomador de notas de entrevista.
Formate em Markdown:
- Resumo geral.
- Perguntas e respostas (Q/A) em bullets.
- Insights/observações.
Não adicione conteúdo novo.

Transcrição:
"${text}"`,

  nota: (text) => `Limpe e formate o texto abaixo em Markdown simples, preservando fielmente o conteúdo.
Não invente, não resuma demais.

Transcrição:
"${text}"`,
};
