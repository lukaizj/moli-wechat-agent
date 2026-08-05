export const defaultSettings = {
  accountName: "未命名刊物",
  theme: "AI 工具与个体效率",
  audience: "想把 AI 真正用进工作流的职场人和独立创作者",
  tone: "有判断、讲人话、少套话；用真实场景解释复杂概念",
  author: "主理人",
  targetLength: 1800,
  imageStyle: "克制的编辑插画，清晰构图，具有杂志封面的视觉张力，不出现文字与水印",
  scheduleEnabled: false,
  scheduleTime: "08:30",
  timezone: "Asia/Shanghai",
  allowComments: false,
  fansOnlyComments: false,
};

export const defaultState = {
  settings: defaultSettings,
  articles: [],
  runs: [],
  scheduler: { lastRunDate: null },
};
