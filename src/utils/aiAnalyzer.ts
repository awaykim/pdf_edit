import axios from "axios";

export interface ErrorContext {
  method: string;
  url: string;
  uid: string;
  query: Record<string, any>;
  body: Record<string, any>;
  error: {
    name?: string;
    message?: string;
    stack?: string;
  };
}

export interface AIAnalysisResult {
  cause: string;
  suggestion: string;
  relatedFiles: string[];
}

/**
 * Gemini API를 호출하여 500 에러의 원인과 수정 방향을 분석합니다.
 * GEMINI_API_KEY 환경변수가 없으면 null을 반환합니다.
 */
export const analyzeError = async (
  ctx: ErrorContext
): Promise<AIAnalysisResult | null> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ [aiAnalyzer] GEMINI_API_KEY가 없어 AI 분석을 건너뜁니다.");
    return null;
  }

  const prompt = `
당신은 Node.js/TypeScript Express 서버의 시니어 개발자입니다.
아래 500 에러 정보를 분석하고 JSON 형식으로 답변해주세요.

## 에러 정보
- API: ${ctx.method} ${ctx.url}
- 요청자 UID: ${ctx.uid}
- Query: ${JSON.stringify(ctx.query)}
- Body: ${JSON.stringify(ctx.body)}
- 에러명: ${ctx.error.name ?? "Unknown"}
- 메시지: ${ctx.error.message ?? "없음"}
- 스택:
${ctx.error.stack ?? "없음"}

## 응답 형식 (JSON만 출력, 다른 텍스트 금지)
{
  "cause": "에러 원인 요약 (2-3문장)",
  "suggestion": "코드 수정 방향 및 가이드 (구체적으로)",
  "relatedFiles": ["관련 파일 경로 추정 목록 (src/... 형식)"]
}
`.trim();

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      },
      { timeout: 15000 }
    );

    const rawText: string =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) ??
      rawText.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      console.warn("⚠️ [aiAnalyzer] Gemini 응답 파싱 실패:", rawText);
      return {
        cause: "AI 분석 결과를 파싱하지 못했습니다.",
        suggestion: rawText.slice(0, 500),
        relatedFiles: [],
      };
    }

    const parsed = JSON.parse(jsonMatch[1]);
    return {
      cause: parsed.cause ?? "",
      suggestion: parsed.suggestion ?? "",
      relatedFiles: Array.isArray(parsed.relatedFiles) ? parsed.relatedFiles : [],
    };
  } catch (err) {
    console.error("❌ [aiAnalyzer] Gemini API 호출 실패:", err);
    return null;
  }
};
