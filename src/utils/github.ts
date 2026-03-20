import axios from "axios";

const GITHUB_API = "https://api.github.com";

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const defaultBranch = process.env.GITHUB_DEFAULT_BRANCH ?? "main";
  return { token, owner, repo, defaultBranch };
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** GitHub Issue 생성 → issueNumber 반환 */
export const createGitHubIssue = async (
  title: string,
  body: string,
  labels: string[] = ["bug", "ai-incident"]
): Promise<number | null> => {
  const { token, owner, repo } = getConfig();
  if (!token || !owner || !repo) {
    console.warn("⚠️ [github] 환경변수 미설정 — Issue 생성 건너뜀");
    return null;
  }
  try {
    const res = await axios.post(
      `${GITHUB_API}/repos/${owner}/${repo}/issues`,
      { title, body, labels },
      { headers: headers(token), timeout: 10000 }
    );
    console.log(`✅ [github] Issue #${res.data.number} 생성 완료`);
    return res.data.number as number;
  } catch (err) {
    console.error("❌ [github] Issue 생성 실패:", err);
    return null;
  }
};

/** 새 브랜치 생성 (fromBranch를 베이스로) */
export const createBranch = async (
  branchName: string,
  fromBranch?: string
): Promise<boolean> => {
  const { token, owner, repo, defaultBranch } = getConfig();
  if (!token || !owner || !repo) return false;

  const base = fromBranch ?? defaultBranch;
  try {
    // 1. 베이스 브랜치의 최신 SHA 조회
    const refRes = await axios.get(
      `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${base}`,
      { headers: headers(token), timeout: 10000 }
    );
    const sha: string = refRes.data.object.sha;

    // 2. 새 브랜치 생성
    await axios.post(
      `${GITHUB_API}/repos/${owner}/${repo}/git/refs`,
      { ref: `refs/heads/${branchName}`, sha },
      { headers: headers(token), timeout: 10000 }
    );

    console.log(`✅ [github] 브랜치 '${branchName}' 생성 완료 (base: ${base})`);
    return true;
  } catch (err: any) {
    // 이미 존재하는 브랜치인 경우 무시
    if (err?.response?.status === 422) {
      console.warn(`⚠️ [github] 브랜치 '${branchName}' 이미 존재`);
      return true;
    }
    console.error("❌ [github] 브랜치 생성 실패:", err);
    return false;
  }
};

/** Draft PR 생성 */
export const createDraftPR = async (
  title: string,
  body: string,
  head: string,
  base?: string
): Promise<string | null> => {
  const { token, owner, repo, defaultBranch } = getConfig();
  if (!token || !owner || !repo) return null;

  const baseBranch = base ?? defaultBranch;
  try {
    const res = await axios.post(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls`,
      { title, body, head, base: baseBranch, draft: true },
      { headers: headers(token), timeout: 10000 }
    );
    const prUrl: string = res.data.html_url;
    console.log(`✅ [github] Draft PR 생성 완료: ${prUrl}`);
    return prUrl;
  } catch (err: any) {
    const status = err?.response?.status;
    const errors = err?.response?.data?.errors;
    if (status === 422) {
      // 빈 레포이거나 head/base에 차이가 없는 경우 — PR 없이 브랜치만 생성된 상태로 진행
      console.warn(
        `⚠️ [github] Draft PR 생성 스킵 (422): head '${head}'와 base '${baseBranch}' 사이에 변경사항이 없거나 커밋이 없습니다.`,
        errors ?? ""
      );
      return null;
    }
    console.error("❌ [github] Draft PR 생성 실패:", err);
    return null;
  }
};

