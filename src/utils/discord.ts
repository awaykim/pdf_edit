import axios from "axios";
import { Request } from "express";
import dayjs from "dayjs";

export const sendDiscordErrorLog = async (req: Request, resBody: any, errorData: any) => {
  const webhookUrl = "";
  if (!webhookUrl) return;

  try {
    const user = (req as any).user || {};
    const uid = user.uid || "anonymous";
    const name = user.name || user.nickname || "unknown";
    
    // 1. 길어질 수 있는 데이터들을 하나의 객체로 묶기
    const fullLogData = {
      query: req.query || {},
      body: req.body || {},
      response: resBody || {},
      error: errorData || {}
    };

    // 2. 묶은 데이터를 예쁘게 JSON 문자열로 변환 후 Blob 형태로 만들기
    const fileContent = JSON.stringify(fullLogData, null, 2);
    const fileBlob = new Blob([fileContent], { type: "application/json" });

    // 3. 디스코드에 보낼 깔끔한 Embed 형태 (기본 정보만 포함)
    const embed = {
      title: "🚨 [500 Error] Server Exception 🚨",
      description: "에러의 상세 내용은 첨부된 `error_details.json` 파일을 확인해주세요.",
      color: 0xff0000,
      timestamp: dayjs().toISOString(),
      fields: [
        { name: "User ID", value: String(uid), inline: true },
        { name: "Name", value: String(name), inline: true },
        { name: "Time", value: dayjs().format("YYYY-MM-DD HH:mm:ss"), inline: true },
        { name: "API", value: `${req.method} ${req.originalUrl}`, inline: false }
      ],
    };

    // 4. multipart/form-data 생성 (파일 + Embed 같이 전송)
    const formData = new FormData();
    formData.append("payload_json", JSON.stringify({ embeds: [embed] }));
    formData.append("files[0]", fileBlob, `error_${dayjs().format('YYYYMMDD_HHmmss')}.json`);

    // Node.js 18 이상부터 기본 내장된 fetch 사용 (form-data 모듈 없이 파일 전송 가능)
    await fetch(webhookUrl, {
      method: "POST",
      body: formData,
    });

  } catch (error) {
    console.error("❌ Failed to send Discord error log:", error);
  }
};
