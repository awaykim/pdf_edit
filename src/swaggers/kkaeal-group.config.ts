// 스웨거
import swaggerJSDoc from "swagger-jsdoc";

const isDeployed = process.env.NODE_ENV !== "local";

const groupOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "Kkaeal API",
      version: "0.9.1",
      description: "깨알 알바 API 문서",
    },
    servers: [
      {
        url: "https://kkaeal-group-api-824924020289.asia-northeast3.run.app/v1",
        description: "Release Server | 실제 배포 서버",
      },
      {
        url: "https://kkaeal-dev-api-824924020289.asia-northeast3.run.app/v1",
        description: "Development Server | 개발용 서버",
      },

      {
        url: "http://localhost:8080/v1",
        description: "Local Server | 로컬 개발용",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
 apis: isDeployed
    ? ["./dist/routes/*.js", "./dist/routes/*/*.js"]
    : ["./src/routes/*.ts", "./src/routes/*/*.ts"],
};

export const groupSwaggerSpec = swaggerJSDoc(groupOptions);
