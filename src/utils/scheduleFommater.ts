// daysOfWeeks 배열로 이루어진 스케줄을 펼치기
import { Schedule } from '@/types/models';
import { TimeUtils } from "@/utils/time";

export const spreadSchedule = (schedules: Schedule[], hireDate: Date) => {
  try {
    return schedules.flatMap((schedule) => {
        const days = schedule.daysOfWeek || [];
        return days.map((day) => {
          const { start, end } = TimeUtils.convertKorStringToNum(schedule.workingTime);
          const dateForDay = TimeUtils.getNextDate(hireDate, day);

          return {
            ...schedule,
            dayOfWeek: day,
            date: dateForDay,
            dateStr: TimeUtils.convertToKorDotDate(dateForDay),
            workingTime: {
              start: start,
              end: end,
            },
          };
        });
      });
  } catch (e) {
    return [];
  }
};
