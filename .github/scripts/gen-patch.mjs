/**
 * gen-patch.mjs
 * GitHub Actions에서 실행되는 Gemini 코드 패치 생성 스크립트.
 *
 * 환경변수:
 *   GEMINI_API_KEY  — Gemini API 키 (필수)
 *   ISSUE_NUMBER    — 연결된 GitHub Issue 번호
 *   GH_TOKEN        — GitHub Token (Issue 내용 조회용)
 *   REPO            — owner/repo 형식
 *
 * 동작:
 *   1. GitHub Issue 내용 조회 (에러 정보 + AI 분석 포함)
 *   2. git log로 최근 변경 파일 확인
 *   3. Gemini에 패치 요청
 *   4. 응답에서 파일 수정 내용 파싱 후 적용
 *   5. GITHUB_OUTPUT에 changed=true/false 출력
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ISSUE_NUMBER   = process.env.ISSUE_NUMBER;
const GH_TOKEN       = process.env.GH_TOKEN;
const REPO           = process.env.REPO;
const GITHUB_OUTPUT  = process.env.GITHUB_OUTPUT;

// GITHUB_OUTPUT에 값 쓰기
function writeOutput(key, value) {
  const line = `${key}=${value}\n`;
  if (GITHUB_OUTPUT) {
    import("fs").then(({ appendFileSync }) => appendFileSync(GITHUB_OUTPUT, line));
  }
  console.log(`OUTPUT ${line.trim()}`);
}

async function fetchIssueBody() {
  if (!ISSUE_NUMBER || !GH_TOKEN || !REPO) return null;

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}`,
    {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (!res.ok) {
    console.warn(`⚠️ Issue 조회 실패: ${res.status}`);
    return null;
  }
  const data = await res.json();
  return data.body ?? null;
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    console.warn("⚠️ GEMINI_API_KEY 없음 — 패치 생성 건너뜀");
    return null;
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!res.ok) {
    console.error(`❌ Gemini API 오류: ${res.status}`);
    return null;
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

/**
 * Gemini 응답에서 파일 패치 블록을 파싱합니다.
 * 기대 형식:
 * ### FILE: src/controllers/foo.ts
 * ```typescript
 * ... full file content ...
 * ```
 */
function parsePatches(text) {
  const patches = [];
  const fileBlockRegex = /###\s*FILE:\s*(.+?)\n```[\w]*\n([\s\S]*?)```/g;
  let match;
  while ((match = fileBlockRegex.exec(text)) !== null) {
    patches.push({ filePath: match[1].trim(), content: match[2] });
  }
  return patches;
}

async function main() {
  console.log("🤖 [gen-patch] AI 패치 생성 시작...");

  // 1. Issue 내용 조회
  const issueBody = await fetchIssueBody();
  if (!issueBody) {
    console.warn("⚠️ Issue 내용을 가져오지 못했습니다. 패치 생성 건너뜀.");
    writeOutput("changed", "false");
    return;
  }
  console.log(`📋 Issue #${ISSUE_NUMBER} 내용 로드 완료`);

  // 2. 관련 파일 목록 (git log 기반 최근 변경 파일)
  let recentFiles = "";
  try {
    recentFiles = execSync("git log --name-only --pretty=format: -10 HEAD~5..HEAD 2>/dev/null | sort -u | head -20").toString().trim();
  } catch {}

  // 3. Gemini 패치 요청
  const prompt = `
당신은 Node.js/TypeScript Express 서버의 시니어 개발자입니다.
아래 GitHub Issue 내용을 바탕으로 테스트 코드를 작성해주세요.

## GitHub Issue 내용
${issueBody.slice(0, 3000)}

## 지침
- 테스트용으로 src/routes/test.ts 파일에 console.log("Hello AI Test") 를 아무 곳에나 한 줄 추가하세요.
- 실제 에러 수정이나 다른 파일 변경은 절대 하지 마세요.
- 반드시 변경된 전체 파일 내용을 응답에 포함하세요:

### FILE: src/routes/test.ts
\`\`\`typescript
// 전체 파일 내용
\`\`\`
`.trim();

  const response = await callGemini(prompt);
  if (!response) {
    writeOutput("changed", "false");
    return;
  }

  if (response.includes("NO_CHANGES")) {
    console.log("ℹ️ Gemini: 수정 필요 없음");
    writeOutput("changed", "false");
    return;
  }

  // 4. 패치 파싱 및 적용
  const patches = parsePatches(response);
  if (patches.length === 0) {
    console.warn("⚠️ 파싱 가능한 패치가 없습니다. Gemini 응답:\n", response.slice(0, 500));
    writeOutput("changed", "false");
    return;
  }

  let anyApplied = false;
  for (const { filePath, content } of patches) {
    // 보안: src/ 내부 파일만 수정 허용
    if (!filePath.startsWith("src/")) {
      console.warn(`⚠️ '${filePath}'는 src/ 외부 — 건너뜀`);
      continue;
    }
    if (!existsSync(filePath)) {
      console.warn(`⚠️ '${filePath}' 파일이 존재하지 않음 — 건너뜀`);
      continue;
    }
    writeFileSync(filePath, content, "utf-8");
    console.log(`✅ 패치 적용: ${filePath}`);
    anyApplied = true;
  }

  writeOutput("changed", anyApplied ? "true" : "false");
  console.log(`🤖 [gen-patch] 완료 — 적용된 파일: ${patches.length}개`);
}

main().catch((err) => {
  console.error("❌ [gen-patch] 치명적 오류:", err);
  writeOutput("changed", "false");
  process.exit(0); // 실패해도 Actions 전체는 계속
});
