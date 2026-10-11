import express, { Request, Response } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(app);

// Support larger payload for student notebook/worksheet photos
app.use(express.json({ limit: '25mb' }));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Google AI Studio Free Tier Model (完全無料枠対象モデル: クレジットカード不要・費用ゼロ)
const FREE_TIER_MODEL = 'gemini-3.8-flash';

// Fixed Educational System Prompt (公立中学校・数学副担任モデル)
const FIXED_SYSTEM_INSTRUCTION = `あなたは公立中学校の数学の授業で生徒をサポートする「副担任の先生」です。
生徒一人ひとりの主体的な学びを支えるため、以下の指導方針を厳格に守って対話してください：

【1. 指導方針（ソクラテス式対話・アダプティブコーチング）】
- 決してすぐに答えや計算結果を教えないでください。
- 生徒が「どこまで解けたか」「どう考えたか」「何に引っかかっているか」を優しく問いかけてください。
- 生徒の試行錯誤や粘り強く考えようとした姿勢（思考プロセス）を具体的に褒めて認めてください。

【2. 誤答の価値付け】
- 間違いや勘違いを責めず、「いい着眼点だね！」「そこまで気づけたのは素晴らしいよ」「この間違いは大事な発見につながるよ」と肯定的に受け止めてください。
- 「この部分をもう一度見てみよう」「ここがもし○○だったらどうなるかな？」と、生徒自身が自己修正できるように小さなヒントを与えてください。

【3. 学び合いの促進（ピア・ラーニング）】
- 生徒が自力で正解や解決にたどり着いたときは大いに祝福し、「バッチリ解けたね！もし近くで迷っている友達がいたら、どう考えたかヒントを出して教えてあげてみてね」と周囲への声かけを促してください。

【4. 数式表現の統一（KaTeX対応）】
- 数式・変数・方程式・分数・根号などは、必ずすべて LaTeX 形式で出力してください。
- インライン数式は $...$ で囲んでください（例: $x^2 + 5x + 6 = 0$, $a = 3$）。
- 重要な式や展開手順、行を分ける計算式は $$...$$ のブロック形式で出力してください（例: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$）。

【5. 言葉遣いとトーン】
- 丁寧で親しみやすく、安心感を与える温かい語り口（中学生・高校生に伝わりやすい言葉）で接してください。
- 威圧的な表現は一切避け、生徒の自己肯定感を高める言葉を選んでください。`;

/**
 * Format and sanitize history so Gemini receives strictly alternating turns
 * (user -> model -> user -> model ... -> user) without consecutive duplicate roles.
 */
function buildAlternatingContents(
  rawHistory: any,
  currentParts: any[]
): Array<{ role: 'user' | 'model'; parts: any[] }> {
  const normalizedTurns: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  if (Array.isArray(rawHistory)) {
    for (const turn of rawHistory) {
      if ((turn.role === 'user' || turn.role === 'model') && typeof turn.text === 'string' && turn.text.trim()) {
        const role = turn.role as 'user' | 'model';
        if (normalizedTurns.length === 0) {
          // Gemini requires the first turn to be 'user'
          if (role === 'user') {
            normalizedTurns.push({ role: 'user', parts: [{ text: turn.text }] });
          }
        } else {
          const lastTurn = normalizedTurns[normalizedTurns.length - 1];
          if (lastTurn.role === role) {
            // Combine consecutive turns of the same role
            lastTurn.parts.push({ text: turn.text });
          } else {
            normalizedTurns.push({ role, parts: [{ text: turn.text }] });
          }
        }
      }
    }
  }

  // The final turn to append is the current 'user' request.
  // Therefore, the preceding turn MUST be 'model' (or empty).
  while (normalizedTurns.length > 0 && normalizedTurns[normalizedTurns.length - 1].role === 'user') {
    normalizedTurns.pop();
  }

  // Keep last 6 alternating turns to balance context and prompt limits
  const sliced = normalizedTurns.slice(-6);

  sliced.push({
    role: 'user',
    parts: currentParts,
  });

  return sliced;
}

// POST /api/chat - Stateless instant reply
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { message, image, history } = req.body;

    if (!message && !image) {
      return res.status(400).json({ error: 'Message or image is required' });
    }

    // Check GEMINI_API_KEY
    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        success: true,
        reply: '【システム通知】APIキーが設定されていないため、Gemini APIに接続できませんでした。AI Studio の Secrets 設定をご確認ください。',
      });
    }

    // Current student parts
    const currentParts: any[] = [];
    if (image && image.data) {
      const rawBase64 = image.data.includes('base64,') ? image.data.split('base64,')[1] : image.data;
      currentParts.push({
        inlineData: {
          mimeType: image.mimeType || 'image/jpeg',
          data: rawBase64,
        },
      });
    }

    currentParts.push({
      text: message || (image ? 'この画像の内容について教えてください。' : ''),
    });

    // Build sanitized alternating contents for Gemini API
    const contents = buildAlternatingContents(history, currentParts);

    const geminiResponse = await ai.models.generateContent({
      model: FREE_TIER_MODEL,
      contents: contents,
      config: {
        systemInstruction: FIXED_SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const replyText = geminiResponse.text || '先生はいつでも応援しています！もう一度質問を教えてもらえるかな？';

    res.json({
      success: true,
      reply: replyText,
    });
  } catch (error: any) {
    console.error('Chat error on server:', error);
    res.status(500).json({
      error: 'AIの応答生成中にエラーが発生しました。',
      details: error?.message || 'Unknown error',
    });
  }
});

// Production vs Development Vite setup
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server },
        watch: isHmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
