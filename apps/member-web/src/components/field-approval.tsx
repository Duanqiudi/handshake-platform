import type { CapsuleFieldName, CapsuleFields } from "../api";
import { Icon } from "./icons";

export const capsuleFieldLabels: Record<CapsuleFieldName, { label: string; description: string }> =
  {
    goal: { label: "这次组队目标", description: "只说明 7 天内希望完成什么" },
    offers: { label: "我能提供", description: "技能或经验，不需要证明身份" },
    seeks: { label: "我在寻找", description: "希望搭档补齐的能力" },
    availability: { label: "可投入时间", description: "时间段或总时长，不必公开日程表" },
    collaborationStyles: { label: "协作偏好", description: "同步频率、反馈与交付习惯" },
    projectInterests: { label: "项目兴趣", description: "用于方向相似度，而非个人画像" },
    location: { label: "协作地点", description: "推荐只填写远程或城市级别" },
    languages: { label: "工作语言", description: "项目沟通和文档语言" },
  };

const fieldOrder = Object.keys(capsuleFieldLabels) as CapsuleFieldName[];

export function FieldApproval({
  fields,
  approved,
  onChange,
  disabled = false,
}: {
  fields: CapsuleFields;
  approved: CapsuleFieldName[];
  onChange(next: CapsuleFieldName[]): void;
  disabled?: boolean;
}) {
  const toggle = (field: CapsuleFieldName) => {
    onChange(
      approved.includes(field) ? approved.filter((item) => item !== field) : [...approved, field],
    );
  };
  return (
    <div className="approval-list">
      {fieldOrder.map((name) => {
        const isApproved = approved.includes(name);
        const value = fields[name];
        const display = Array.isArray(value) ? value.join(" · ") : value;
        return (
          <div className={`approval-row${isApproved ? " approval-row--approved" : ""}`} key={name}>
            <button
              className="approval-toggle"
              type="button"
              role="switch"
              aria-checked={isApproved}
              aria-label={`${isApproved ? "停止公开" : "允许公开"}${capsuleFieldLabels[name].label}`}
              disabled={disabled}
              onClick={() => toggle(name)}
            >
              <span>{isApproved ? <Icon name="check" size={13} /> : null}</span>
            </button>
            <div className="approval-row__label">
              <strong>{capsuleFieldLabels[name].label}</strong>
              <small>{capsuleFieldLabels[name].description}</small>
            </div>
            <p className={display.trim() === "" ? "is-empty" : ""}>
              {display.trim() === "" ? "AI 没有提供这个字段" : display}
            </p>
            <span className={`approval-state${isApproved ? " is-on" : ""}`}>
              {isApproved ? "允许用于匹配" : "不会发送"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
