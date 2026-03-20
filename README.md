# kkaeal_server

## 실행 방법
### 실행
#### 로컬 실행 
- AUTHENTICATION: userId (users/ 컬렉션의 문서 ID)
- TEST DB 사용
- ß`npm run dev:local`
#### 개발용 실행
- AUTHENTICATION: Firebase Id_token (Firebase에서 발급)
- TEST DB 사용 
- `npm run dev`
#### 프로덕션용 실행
- AUTHENTICATION: Firebase Id_token (Firebase에서 발급)
- 실제 DB 사용
- `npm run dev:prod`
### 배포
#### 개발용 서버 배포
- `dev` 브랜치에 push (git Action)
#### 프로덕션 서버 배포
- `main` 브랜치에 push (git Action)

## 프로젝트 구조
```text
.
├── Dockerfile
├── .github/workflows/
│   └── deploy.yml 
├── package.json
├── src             
│   ├── controllers
│   │   ├── alba
│   │   └── manager
│   ├── services
│   ├── routes
│   ├── middlewares
│   ├── swaggers
│   ├── firebase
│   ├── util
│   └── scripts
```
