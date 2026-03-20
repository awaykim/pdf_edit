# Quick Request TEST DB 체크리스트 (2026-02-26)

## 1) 테스트 대상 고정 데이터
- [ ] 이화여대 TEST 매장: `jBqqOFhroycSp6ZRphi9`
  - [ ] 매니저 UID: `manager-event_ewha_test_test_com`
- [ ] 서대문구 TEST 매장: `wJRSbQ6rfEOUyqQH0Mig`
  - [ ] 매니저 UID: `manager-m_albang_test_com`

## 2) 사전 작업 (필수)
- [ ] `worker-a1_test_com`, `worker-a2_test_com`, `worker-a3_test_com` 유저 문서 존재 확인
- [ ] 위 3명을 이화여대 매장(`jBqqOFhroycSp6ZRphi9`)에 등록
  - [ ] register API 호출
  - [ ] confirm API 호출
  - [ ] 최종적으로 `stores/jBqqOFhroycSp6ZRphi9/workers/{uid}.isActive=true` 확인
- [ ] `EWHA_STORE_IDS`에 `jBqqOFhroycSp6ZRphi9` 포함 확인

## 3) 기능 테스트

### 3-1. 추천 인력 조회
- API: `GET /manager/store/wJRSbQ6rfEOUyqQH0Mig/workers/`
- [ ] 응답에 `recommend` 배열 존재
- [ ] `recommend`에 이화여대 매장의 `isActive=true` 인력이 포함됨
- [ ] `recommend`와 대상 매장(`wJRS...`)의 기존 근무자(pending/active/retired) 중복 없음

### 3-2. quick 요청 시 note/recommend 저장
- API: `POST /manager/quick/request`
- [ ] 요청 body에 `note`, `recommend` 전달 가능
- [ ] `shiftRequests/{quickId}`에 `note`, `recommend` 저장 확인
- API: `GET /group/alba/shift/notifications`
- [ ] 수신 알바 알림 응답 항목에 `note` 노출 확인

### 3-3. 추천 인력 매칭 시 자동 과거 근무자 등록
- API: `POST /group/alba/shift/apply` (추천된 UID로 수락)
- [ ] 대상 매장(`wJRS...`)에 `stores/{storeId}/workers/{uid}` 생성/존재
- [ ] `isActive=false`, `isPending=false`, `isRecommend=true` 확인
- [ ] `users/{uid}/stores/{storeId}`에도 `isRecommend=true` 확인
- [ ] `date == endDate`(동일 근무일) 확인


### 3-4. 추천 인력 근무지 조회
- API: `GET /manager/worker/{workerId}/workplaces`
- [ ] 대상 worker의 근무지 배열 반환
- [ ] 항목에 `isRecommend` 필드 존재
- [ ] 방금 자동 등록된 매장이 과거 근무 형태로 확인됨

### 3-5. 종료 트리거/평가
- API: `GET /manager/quick/{storeId}/notifications`
- [ ] 종료 후 `pendingEvaluations`에 누적됨
- [ ] 최초 1회 `manager:quick-shift-ended` 푸시 생성
- API: `POST /manager/quick/evaluation`
- [ ] `worked`, `rating(1~5)`, `comment` 저장 확인

### 3-6. apply 이후 알바 측 조회 검증 (추가)
- API: `GET /group/alba/my/shifts`
- [ ] apply한 quick가 내 지원 목록에 반영되는지 확인
- API: `GET /group/alba/shift/notifications`
- [ ] 다수 수신자 quick에서 타인이 apply하면, 나머지 수신자의 해당 알림이 `inactiveNotis`로 이동하는지 확인
- [ ] apply한 본인도 해당 quick 알림이 `inactiveNotis`로 보이는지 확인

## 4) *****중요 검증 (중복 금지)
- 시나리오:
  - [ ] 1회차: 추천 인력 A를 quick로 호출/매칭 완료
  - [ ] 2회차: 다시 `GET /manager/store/wJRS.../workers/` 호출
- 기대 결과:
  - [ ] A는 `retired`(또는 대상 매장 기존 worker 집합)에 존재
  - [ ] A는 `recommend`에 **재등장하지 않음**
- 판정:
  - [ ] PASS
  - [ ] FAIL (응답 스냅샷 첨부)

## 5) 필드명 주의 (오타 방지)
- 실제 요청/응답 필드명:
  - [ ] `recommend` (요청 body)
  - [ ] `isRecommend` (저장/응답)
- 주의:
  - [ ] `recommand`, `isRecommand`는 코드상 필드명이 아님

## 6) 결과 기록
- 테스트 일시:
- 환경: TEST DB (`dev/v0.9`)
- 테스트자:
- quickId 목록:
- 실패 항목:
- 비고:

## 7) 실행 로그 (실제 호출 기록)
- 실행 일시: `2026-02-26 15:42:10 KST`
- 목표: 사전작업 `register -> confirm` 1건 실행 (`worker-a1_test_com`)
- 호출 #1
  - Method/URL: `POST http://localhost:8080/v1/group/store/register`
  - Auth: `Bearer worker-a1_test_com`
  - Body: `{"storeId":"jBqqOFhroycSp6ZRphi9","date":"2026.02","isPrevious":false,"schedules":[]}`
  - 결과: `HTTP_STATUS:000`, `curl: (7) Failed to connect to localhost port 8080`
  - 판정: `STOP`
- 중단 사유
  - 로컬 서버 접근 불가 상태에서 테스트를 계속하면, 잘못된 실패 기록을 쌓게 되어 신뢰도가 깨짐
  - 요청 원칙(이상 징후 발생 시 즉시 중단)에 따라 중단

- 실행 일시: `2026-02-26 15:47:57 KST`
- 재시도 배경: sandbox 외부(localhost 직접 접근)로 전환 후 진행
- 호출 #2
  - Method/URL: `POST http://localhost:8080/v1/manager/store/jBqqOFhroycSp6ZRphi9/draft/worker-a1_test_com/approve`
  - Auth: `Bearer manager-event_ewha_test_test_com`
  - Body: `{"date":"2026.02","endDate":"","isPrevious":false,"schedules":[]}`
  - 결과: `HTTP 200`
  - 응답: `{"success":true,"payload":{"message":"근무자 스케줄 등록완료"}}`
  - 판정: `PASS`

- 호출 #3 (후속 검증)
  - Method/URL: `GET http://localhost:8080/v1/manager/store/jBqqOFhroycSp6ZRphi9/workers/`
  - Auth: `Bearer manager-event_ewha_test_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심: `active`에 `worker-a1_test_com` 존재, `date=2026.02`
  - 판정: `PASS`

- 실행 일시: `2026-02-26 15:49:57 KST`
- 목표: 사전작업 잔여 대상 `worker-a2_test_com`, `worker-a3_test_com` 등록/승인 완료
- 호출 #4
  - Method/URL: `POST http://localhost:8080/v1/group/store/register`
  - Auth: `Bearer worker-a2_test_com`
  - Body: `{"storeId":"jBqqOFhroycSp6ZRphi9","date":"2026.02","isPrevious":false,"schedules":[]}`
  - 결과: `HTTP 200`
  - 응답: `{"success":true,"payload":{"storeId":"jBqqOFhroycSp6ZRphi9"}}`
  - 판정: `PASS`

- 호출 #5
  - Method/URL: `POST http://localhost:8080/v1/manager/store/jBqqOFhroycSp6ZRphi9/draft/worker-a2_test_com/approve`
  - Auth: `Bearer manager-event_ewha_test_test_com`
  - Body: `{"date":"2026.02","endDate":"","isPrevious":false,"schedules":[]}`
  - 결과: `HTTP 200`
  - 응답: `{"success":true,"payload":{"message":"근무자 스케줄 등록완료"}}`
  - 판정: `PASS`

- 호출 #6
  - Method/URL: `POST http://localhost:8080/v1/group/store/register`
  - Auth: `Bearer worker-a3_test_com`
  - Body: `{"storeId":"jBqqOFhroycSp6ZRphi9","date":"2026.02","isPrevious":false,"schedules":[]}`
  - 결과: `HTTP 200`
  - 응답: `{"success":true,"payload":{"storeId":"jBqqOFhroycSp6ZRphi9"}}`
  - 판정: `PASS`

- 호출 #7
  - Method/URL: `POST http://localhost:8080/v1/manager/store/jBqqOFhroycSp6ZRphi9/draft/worker-a3_test_com/approve`
  - Auth: `Bearer manager-event_ewha_test_test_com`
  - Body: `{"date":"2026.02","endDate":"","isPrevious":false,"schedules":[]}`
  - 결과: `HTTP 200`
  - 응답: `{"success":true,"payload":{"message":"근무자 스케줄 등록완료"}}`
  - 판정: `PASS`

- 호출 #8 (최종 검증)
  - Method/URL: `GET http://localhost:8080/v1/manager/store/jBqqOFhroycSp6ZRphi9/workers/`
  - Auth: `Bearer manager-event_ewha_test_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심:
    - `active` = `worker-a1_test_com`, `worker-a2_test_com`, `worker-a3_test_com`
    - 모두 `date=2026.02`
  - 판정: `PASS`

- 실행 일시: `2026-02-26 15:50:58 KST`
- 목표: 기능 테스트 `3-1 추천 인력 조회` 검증
- 호출 #9
  - Method/URL: `GET http://localhost:8080/v1/manager/store/wJRSbQ6rfEOUyqQH0Mig/workers/`
  - Auth: `Bearer manager-m_albang_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심:
    - `pending=[]`, `active=[]`, `retired=[]`
    - `recommend=[worker-a1_test_com, worker-a2_test_com, worker-a3_test_com]`
  - 판정: `PASS`
  - 비고: 이 시점엔 대상 매장에 기존 근무자(특히 retired)가 없어, `retired vs recommend` 중복 금지는 후속 매칭 테스트에서 재검증 필요

- 실행 일시: `2026-02-26 15:58:50 KST`
- 목표: 기능 테스트 `3-2 quick 요청(note/recommend 저장)` 검증
- 호출 #10
  - Method/URL: `POST http://localhost:8080/v1/manager/quick/request`
  - Auth: `Bearer manager-m_albang_test_com`
  - Body:
    - `storeId=wJRSbQ6rfEOUyqQH0Mig`
    - `shiftDate=2026.02.26`
    - `workingTime={start:\"오후 10:00\", end:\"오후 11:00\"}`
    - `recipients=[worker-a1_test_com, worker-a2_test_com]`
    - `note=\"테스트 메모: 저녁 피크 지원\"`
    - `recommend=[worker-a1_test_com]`
  - 결과: `HTTP 200`
  - 응답: `{"success":true,"payload":{"quickId":"E1Yj4zYYpC38ISMsJppl"}}`
  - 판정: `PASS`

- 호출 #11 (문서 직접 검증)
  - Method: Firestore 직접 조회 (`shiftRequests/E1Yj4zYYpC38ISMsJppl`)
  - 결과:
    - `exists=true`
    - `note=\"테스트 메모: 저녁 피크 지원\"`
    - `recommend=[\"worker-a1_test_com\"]`
    - `storeId=\"wJRSbQ6rfEOUyqQH0Mig\"`
    - `isQuick=true`
  - 판정: `PASS`

- 호출 #12 (알바 알림 응답 검증)
  - Method/URL: `GET http://localhost:8080/v1/group/alba/shift/notifications`
  - Auth: `Bearer worker-a1_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심:
    - `activeNotis`의 `requestId=E1Yj4zYYpC38ISMsJppl` 항목 존재
    - 해당 항목 `note=\"테스트 메모: 저녁 피크 지원\"` 노출 확인
  - 판정: `PASS`

- 실행 일시: `2026-02-26 16:07:39 KST`
- 목표: `apply 이후 getMyShifts/notifications 상태` + `다수 수신자 중 한 명 apply 시 만료(inactive) 알림 전환` 검증
- 호출 #13
  - Method/URL: `POST http://localhost:8080/v1/manager/quick/request`
  - Auth: `Bearer manager-m_albang_test_com`
  - Body 핵심:
    - `shiftDate=2026.02.27`, `workingTime=오후 9:00~오후 10:00`
    - `recipients=[worker-a1_test_com, worker-a2_test_com, worker-a3_test_com]`
    - `note=\"다수 수신자 만료 알림 테스트\"`, `recommend=[worker-a2_test_com]`
  - 결과: `HTTP 200`, `quickId=FBGLqbXjVXE5EwtaPViW`
  - 판정: `PASS`

- 호출 #14
  - Method/URL: `POST http://localhost:8080/v1/group/alba/shift/apply`
  - Auth: `Bearer worker-a2_test_com`
  - Body: `{"notiId":"FBGLqbXjVXE5EwtaPViW"}`
  - 결과: `HTTP 200`, `근무 요청 수락 및 스케줄 등록 완료`
  - 판정: `PASS`

- 호출 #15 (`getMyShifts` 확인)
  - Method/URL: `GET http://localhost:8080/v1/group/alba/my/shifts`
  - Auth: `Bearer worker-a2_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심: `id=FBGLqbXjVXE5EwtaPViW`, `status=matched`, `isMatched=true`, `isExpired=true` 확인
  - 판정: `PASS`
  - 관찰: quick 요청은 `userId`가 없어 `requesterName=\"알 수 없음\"`으로 표시됨

- 호출 #16 (`a1 notifications` 확인)
  - Method/URL: `GET http://localhost:8080/v1/group/alba/shift/notifications`
  - Auth: `Bearer worker-a1_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심: `FBGLqbXjVXE5EwtaPViW`가 `inactiveNotis`에 존재, `isMyShift=false`, `isExpired=true`, `isMatched=true`
  - 판정: `PASS`

- 호출 #17 (`a3 notifications` 확인)
  - Method/URL: `GET http://localhost:8080/v1/group/alba/shift/notifications`
  - Auth: `Bearer worker-a3_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심: `FBGLqbXjVXE5EwtaPViW`가 `inactiveNotis`에 존재, `isMyShift=false`, `isExpired=true`, `isMatched=true`
  - 판정: `PASS`

- 호출 #18 (`a2 notifications` 확인)
  - Method/URL: `GET http://localhost:8080/v1/group/alba/shift/notifications`
  - Auth: `Bearer worker-a2_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심: `FBGLqbXjVXE5EwtaPViW`가 `inactiveNotis`에 존재, `isMyShift=true`, `isExpired=true`, `isMatched=true`
  - 판정: `PASS`

- 호출 #19 (`a2 schedules` 날짜 스케줄 확인)
  - Method/URL: `GET http://localhost:8080/v1/group/alba/schedules`
  - Auth: `Bearer worker-a2_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심: `exceptionalSchedules`에 아래 항목 존재
    - `scheduleId=FBGLqbXjVXE5EwtaPViW`
    - `date=2026-02-27T00:00:00.000Z`
    - `workingTime=오후 9:00~오후 10:00`
    - `isQuick=true`, `status=urgentAccepted`, `isActive=true`
  - 판정: `PASS`

- 실행 일시: `2026-02-26 16:14:52 KST`
- 목표: 기능 테스트 `3-4 추천 인력 근무지 정보 조회` 검증
- 호출 #20
  - Method/URL: `GET http://localhost:8080/v1/manager/worker/worker-a2_test_com/workplaces`
  - Auth: `Bearer manager-m_albang_test_com`
  - 결과: `HTTP 200`
  - 응답 핵심:
    - `storeId=wJRSbQ6rfEOUyqQH0Mig` 항목 존재
    - 해당 항목 `isActive=false`, `endDate=2026.02`, `isRecommend=true`
    - `isRecommend` 필드 노출/저장 확인
  - 판정: `PASS`

- 실행 일시: `2026-02-26 16:31:09 KST`
- 목표: 기능 테스트 `3-5 종료 트리거 + pendingEvaluations + 평가 저장` 검증
- 시나리오 quick: `lWVSz8qAAVNtcrcdCyFa` (`2026.02.26 오후 4:20~오후 4:30`)
- 호출 #21
  - Method/URL: `POST http://localhost:8080/v1/manager/quick/request`
  - Auth: `Bearer manager-m_albang_test_com`
  - 결과: `HTTP 200`, `quickId=lWVSz8qAAVNtcrcdCyFa`
  - 판정: `PASS`

- 호출 #22
  - Method/URL: `POST http://localhost:8080/v1/group/alba/shift/apply`
  - Auth: `Bearer worker-a3_test_com`
  - Body: `{"notiId":"lWVSz8qAAVNtcrcdCyFa"}`
  - 결과: `HTTP 200`
  - 판정: `PASS`

- 호출 #23 (종료 전)
  - Method/URL: `GET http://localhost:8080/v1/manager/quick/wJRSbQ6rfEOUyqQH0Mig/notifications`
  - Auth: `Bearer manager-m_albang_test_com`
  - 확인: `pendingEvaluations`에 `lWVSz8qAAVNtcrcdCyFa` 없음 (`prePending=false`)
  - 판정: `PASS`

- 호출 #24 (종료 후)
  - Method/URL: `GET http://localhost:8080/v1/manager/quick/wJRSbQ6rfEOUyqQH0Mig/notifications`
  - Auth: `Bearer manager-m_albang_test_com`
  - 확인:
    - `pendingEvaluations`에 `lWVSz8qAAVNtcrcdCyFa` 포함 (`postPending=true`)
    - `inactive` 항목 `evaluation.required=true`, `isEvaluated=false` 확인
  - 판정: `PASS`

- 호출 #25 (평가 저장)
  - Method/URL: `POST http://localhost:8080/v1/manager/quick/evaluation`
  - Auth: `Bearer manager-m_albang_test_com`
  - Body: `{"quickId":"lWVSz8qAAVNtcrcdCyFa","worked":true,"rating":5,"comment":"종료 트리거 테스트 평가"}`
  - 결과: `HTTP 200`
  - 판정: `PASS`

- 호출 #26 (문서 확인)
  - Method: Firestore 직접 조회 (`shiftRequests/lWVSz8qAAVNtcrcdCyFa`)
  - 확인:
    - `status=matched`, `isExpired=true`
    - `evaluation.isEvaluated=true`
    - `evaluation.worked=true`
    - `evaluation.rating=5`
    - `evaluation.comment=\"종료 트리거 테스트 평가\"`
    - `evaluation.evaluatorId=\"manager-m_albang_test_com\"`
  - 판정: `PASS`

- 비고
  - `requestedAt`가 트리거 직후 응답에서는 sentinel 형태(`{}`)로 보였다가, 문서 조회에서는 정상 Timestamp로 저장됨
  - 테스트 원칙상 “종료 시각이 지난 quick 생성” 시나리오(`Ux1XTngRm1AlBIYOHETz`)는 판정에서 제외함
