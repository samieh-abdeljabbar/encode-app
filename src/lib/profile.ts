import type { AppConfig } from "./types";

/** Build a profile context string for AI prompts from user config */
export function getProfileContext(config: AppConfig): string {
  const parts: string[] = [];
  if (config.user_role?.trim()) {
    parts.push(`The student's background: ${config.user_role.trim()}.`);
  }
  if (config.user_hobbies?.trim()) {
    parts.push(`Their hobbies/interests: ${config.user_hobbies.trim()}.`);
  }
  if (config.user_learning_style?.trim()) {
    parts.push(`They learn best with: ${config.user_learning_style.trim()}.`);
  }
  return parts.join(" ");
}
