// 에러 처리 미들웨어
import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errorParser";
import { sendDiscordErrorLog } from "../utils/discord";
import { analyzeError, ErrorContext } from "../utils/aiAnalyzer";
import { createGitHubIssue, createBranch, createDraftPR } from "../utils/github";

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let status = 500;
  let resBody: any = {};

  // 트랜잭션 충돌 에러인 경우
  if (isTransactionConflictError(err)) {
    status = 409;
    resBody = {
      success: false,
      key: "TRANSACTION.CONFLICT",
      code: "TX409",
      message: "동시 작업이 너무 많아 처리에 실패했습니다. 다시 시도해주세요.",
    };
  } else if (err instanceof AppError) {
    // 커스텀 AppError 처리
    status = err.status;
    resBody = {
      success: false,
      key: err.key ?? "UNKNOWN.ERROR",
      code: err.code,
      message: err.message,
    };
  } else {
    // 기타 에러
    console.error("❌ [Unhandled Error]", err);
    status = 500;
    resBody = {
      success: false,
      code: "E999",
      message: "서버 내부 오류가 발생했습니다.",
      ...(process.env.NODE_ENV !== "production" && {
        error: serializeError(err),
      }),
    };
  }

  // 500번대 에러는 디스코드 알림 + AI 파이프라인 실행
  if (status >= 500) {
    const errorData = serializeError(err);
    sendDiscordErrorLog(req, resBody, errorData).catch(console.error);
    triggerAIIncidentPipeline(req, errorData).catch(console.error);
  }

  return res.status(status).json(resBody);
};


// optional: error 직렬화 유틸
function serializeError(err: unknown): object {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { error: String(err) };
}


function isTransactionConflictError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as any).message === "string"
  ) {
    const message = (error as any).message as string;
    const keywords = ["too much contention", "too many"];
    return keywords.some((kw) => message.includes(kw));
  }
  return false;
}


/**
 * 500 에러 발생 시 AI 분석 → GitHub Issue → 브랜치 → Draft PR을 순차적으로 실행합니다.
 * 완전 비동기 fire-and-forget: 클라이언트 응답에 영향을 주지 않습니다.
 */
async function triggerAIIncidentPipeline(req: Request, errorData: object): Promise<void> {
  // 환경변수가 없으면 파이프라인 전체 스킵
  if (!process.env.GITHUB_TOKEN) {
    console.warn("⚠️ [AI Pipeline] GITHUB_TOKEN 미설정 — 파이프라인 건너뜀");
    return;
  }

  try {
    const user = (req as any).user || {};
    const uid = user.uid || "anonymous";

    // 1. Gemini로 에러 분석
    const ctx: ErrorContext = {
      method: req.method,
      url: req.originalUrl,
      uid,
      query: req.query as Record<string, any>,
      body: req.body || {},
      error: errorData as any,
    };

    console.log("🤖 [AI Pipeline] Gemini 에러 분석 시작...");
    const analysis = await analyzeError(ctx);

    // 2. GitHub Issue 생성
    const errorRef = (errorData as any).message ?? "Unknown Error";
    const issueTitle = `🚨 [500 Auto] ${req.method} ${req.originalUrl} — ${String(errorRef).slice(0, 60)}`;

    const issueBody = buildIssueBody(ctx, analysis, errorData);
    const issueNumber = await createGitHubIssue(issueTitle, issueBody);

    if (!issueNumber) {
      console.error("❌ [AI Pipeline] Issue 생성 실패 — 파이프라인 중단");
      return;
    }

    // 3. fix 브랜치 생성
    const branchName = `fix/auto-${issueNumber}`;
    const branchCreated = await createBranch(branchName);

    if (!branchCreated) {
      console.error("❌ [AI Pipeline] 브랜치 생성 실패 — PR 생성 건너뜀");
      return;
    }

    // 4. Draft PR 생성
    const prTitle = `fix: [Auto] #${issueNumber} ${req.method} ${req.originalUrl}`;
    const prBody = buildPRBody(issueNumber, ctx, analysis);
    await createDraftPR(prTitle, prBody, branchName);

    console.log(`✅ [AI Pipeline] 완료 — Issue #${issueNumber}, Branch: ${branchName}`);
  } catch (err) {
    console.error("❌ [AI Pipeline] 파이프라인 처리 중 오류:", err);
  }
}


function buildIssueBody(
  ctx: ErrorContext,
  analysis: { cause: string; suggestion: string; relatedFiles: string[] } | null,
  rawError: object
): string {
  const lines: string[] = [];

  lines.push("## 🔍 에러 정보");
  lines.push(`| 항목 | 내용 |`);
  lines.push(`|---|---|`);
  lines.push(`| API | \`${ctx.method} ${ctx.url}\` |`);
  lines.push(`| 요청자 UID | \`${ctx.uid}\` |`);
  lines.push(`| Query | \`${JSON.stringify(ctx.query)}\` |`);
  lines.push(`| Body | \`${JSON.stringify(ctx.body).slice(0, 200)}\` |`);
  lines.push("");

  if (analysis) {
    lines.push("## 🤖 AI 분석 결과");
    lines.push("");
    lines.push("### 원인");
    lines.push(analysis.cause);
    lines.push("");
    lines.push("### 수정 방향");
    lines.push(analysis.suggestion);
    lines.push("");
    if (analysis.relatedFiles.length > 0) {
      lines.push("### 관련 파일 추정");
      analysis.relatedFiles.forEach((f) => lines.push(`- \`${f}\``));
      lines.push("");
    }
  } else {
    lines.push("## 🤖 AI 분석");
    lines.push("AI 분석 결과를 가져오지 못했습니다.");
    lines.push("");
  }

  lines.push("## 📋 Raw Error");
  lines.push("```json");
  lines.push(JSON.stringify(rawError, null, 2).slice(0, 1500));
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push(`> 🤖 이 이슈는 AI 자동 장애 대응 파이프라인에 의해 자동 생성되었습니다.`);

  return lines.join("\n");
}


function buildPRBody(
  issueNumber: number,
  ctx: ErrorContext,
  analysis: { cause: string; suggestion: string; relatedFiles: string[] } | null
): string {
  const lines: string[] = [];

  lines.push(`Closes #${issueNumber}`);
  lines.push("");
  lines.push("## 개요");
  lines.push(`\`${ctx.method} ${ctx.url}\`에서 발생한 500 에러 자동 수정 브랜치입니다.`);
  lines.push("");

  if (analysis) {
    lines.push("## AI 분석 요약");
    lines.push(`**원인:** ${analysis.cause}`);
    lines.push("");
    lines.push(`**수정 방향:** ${analysis.suggestion}`);
  }

  lines.push("");
  lines.push("## 체크리스트");
  lines.push("- [ ] 코드 수정 완료");
  lines.push("- [ ] 로컬 테스트 통과");
  lines.push("- [ ] 리뷰어 검토 완료");
  lines.push("");
  lines.push("---");
  lines.push("> 🤖 이 PR은 AI 자동 장애 대응 파이프라인에 의해 자동 생성되었습니다.");

  return lines.join("\n");
}
