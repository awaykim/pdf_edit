# AI 자동 장애 대응 파이프라인 (초압축)

## 핵심 개념
AI가 혼자 다 하는 게 아니라  
**Node 서버(감지) + AI(판단) + GitHub Actions(실행)** 구조

---

## 전체 흐름

```text
500 에러 발생
→ Node 서버가 에러 수집
→ AI로 원인 분석
→ GitHub Issue 생성
→ fix 브랜치 생성
→ GitHub Actions 실행
→ 코드 수정 + 테스트
→ 성공하면 PR 생성
→ 사람이 머지
역할 분리

Node 서버

에러 감지

AI 호출

GitHub API 호출 (issue/branch/workflow)

AI

원인 분석

수정 방향 제시

패치 생성

GitHub Actions

코드 수정 적용

테스트 / lint

PR 생성

절대 하지 말 것 (중요)

Node 서버에서:

git push ❌

테스트 실행 ❌

무거운 작업 ❌

→ 전부 Actions로 넘겨

MVP (최소 구현)
500 에러 → AI 분석 → GitHub Issue 생성
1차 자동화
500 에러 → 분석 → Issue → 브랜치 → Draft PR
최종 형태
500 에러 → 분석 → 브랜치 → 수정 → 테스트 → PR
핵심 포인트 3개

Node = 컨트롤러

AI = 두뇌

Actions = 작업자