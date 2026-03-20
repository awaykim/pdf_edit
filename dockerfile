
# Stage 1: 빌더 스테이지 - TypeScript 코드를 JavaScript로 컴파일합니다.
FROM node:20 AS builder

WORKDIR /app

# package.json 및 package-lock.json 복사 (의존성 캐싱을 위해 먼저 복사)
COPY package*.json ./

# 모든 의존성 설치 (빌드에 필요한 devDependencies 포함)
RUN npm install

# 모든 소스 코드 복사
COPY . .

# TypeScript 애플리케이션 빌드
# 이 명령어가 'dist' 디렉토리를 생성합니다.
RUN npm run build

# Stage 2: 최종 경량화된 프로덕션 이미지 생성
# 이 스테이지에서는 빌드된 JavaScript 코드와 프로덕션 의존성만 포함합니다.
FROM node:20-slim 
# 더 작은 Node.js 이미지를 사용하여 최종 이미지 크기를 줄입니다.

# 환경 변수 설정 (Cloud Run이 PORT 환경 변수를 주입하므로 Dockerfile에서 PORT를 설정할 필요 없음)
# ENV NODE_ENV=development # 이 부분은 GitHub Actions에서 주입하므로 필요 없습니다.

WORKDIR /app

# 프로덕션 의존성만 설치
# package.json을 다시 복사하여 devDependencies를 제외하고 설치합니다.
COPY package*.json ./
RUN npm install --omit=dev

# 빌더 스테이지에서 컴파일된 'dist' 디렉토리를 최종 이미지로 복사
COPY --from=builder /app/dist ./dist

# 컨테이너가 8080 포트에서 수신 대기할 것임을 문서화 (선택 사항이지만 좋은 습관)
EXPOSE 8080

# 애플리케이션 실행 명령어
# 컴파일된 JavaScript 파일을 직접 실행합니다.
CMD ["node", "dist/index.js"]
