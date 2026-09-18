import type { ProjectPlanDay } from "./types.js";

const PLAN_CONTENT = [
  {
    title: "对齐问题与分工",
    objective: "把目标用户、核心问题、成功标准和两人的责任写清楚。",
    deliverables: ["一页项目说明", "明确的角色分工", "7 天完成标准"],
  },
  {
    title: "验证真实需求",
    objective: "用快速访谈或公开证据确认问题值得解决。",
    deliverables: ["至少 3 条用户证据", "收敛后的核心场景"],
  },
  {
    title: "确定方案与原型",
    objective: "画出最短用户路径并确定能在剩余时间内完成的技术方案。",
    deliverables: ["可点击或可讲解的原型", "技术方案与接口清单"],
  },
  {
    title: "完成核心功能",
    objective: "优先打通一条端到端主路径。",
    deliverables: ["可运行的核心流程", "已知问题清单"],
  },
  {
    title: "集成与补齐体验",
    objective: "合并双方成果，补齐关键空状态、错误提示和演示数据。",
    deliverables: ["端到端集成版本", "稳定的合成演示数据"],
  },
  {
    title: "测试与打磨表达",
    objective: "修复阻断问题，并把项目价值、取舍和个人贡献讲清楚。",
    deliverables: ["回归测试结果", "面试讲解提纲", "演示脚本"],
  },
  {
    title: "发布作品并复盘",
    objective: "完成最终演示，整理作品集材料并记录下一步。",
    deliverables: ["可直接演示的最终版本", "作品集说明", "双方合作复盘"],
  },
] as const;

export function createSevenDayPlan(startDate: string): readonly ProjectPlanDay[] {
  const start = parseCalendarDate(startDate);

  return PLAN_CONTENT.map((content, index) => ({
    day: (index + 1) as ProjectPlanDay["day"],
    date: formatCalendarDate(addUtcDays(start, index)),
    title: content.title,
    objective: content.objective,
    deliverables: [...content.deliverables],
  }));
}

function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Project start date must use YYYY-MM-DD format.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || formatCalendarDate(parsed) !== value) {
    throw new Error("Project start date is not a valid calendar date.");
  }
  return parsed;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.valueOf());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
