import { ToolInputError } from "./json-schema.js";

const FORBIDDEN_LABEL =
  /(?:password|passcode|api[ _-]?key|access[ _-]?token|secret|cookie|session|身份证|护照|银行卡|密码|密钥|令牌|手机号|电话号码|联系电话|邮箱|微信号|家庭住址|详细地址)/iu;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const CHINA_MOBILE = /(?:^|\D)1[3-9]\d{9}(?:\D|$)/u;
const LONG_ACCOUNT_NUMBER = /(?:^|\D)\d{15,19}(?:\D|$)/u;

export function enforceOutboundPrivacy(value: unknown): void {
  visit(value, "$");
}

function visit(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (
      FORBIDDEN_LABEL.test(value) ||
      EMAIL.test(value) ||
      CHINA_MOBILE.test(value) ||
      LONG_ACCOUNT_NUMBER.test(value)
    ) {
      throw new ToolInputError(
        `Privacy boundary blocked ${path}: do not send raw chats, full Memory, credentials, identity documents, detailed addresses, or contact details.`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visit(item, `${path}[${index}]`);
    });
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
