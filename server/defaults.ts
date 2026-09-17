import type { AppSettings, TargetConfig } from "../src/shared/types.js";

export const DEFAULT_TARGETS: TargetConfig[] = [
  {
    id: "router-a",
    name: "路由器 A",
    group: "local",
    host: "192.168.1.1",
    method: "icmp",
    intervalMs: 1000,
    enabled: true
  },
  {
    id: "router-b",
    name: "路由器 B",
    group: "local",
    host: "192.168.0.1",
    method: "icmp",
    intervalMs: 1000,
    enabled: true
  },
  {
    id: "lol-current",
    name: "当前 LOL",
    group: "lol",
    host: "",
    method: "icmp",
    intervalMs: 1000,
    enabled: false
  }
];

export const DEFAULT_SETTINGS: AppSettings = {
  selectedLolServerId: "noxus",
  lolServers: [
    {
      id: "noxus",
      name: "诺克萨斯",
      host: "",
      method: "icmp",
      note: "手动填入确认后的大区 IP 或域名"
    },
    {
      id: "freljord",
      name: "弗雷尔卓德",
      host: "",
      method: "icmp",
      note: "手动填入确认后的大区 IP 或域名"
    }
  ]
};

export const LEGACY_LOL_TARGETS: TargetConfig[] = [
  {
    id: "lol-noxus",
    name: "诺克萨斯",
    group: "lol",
    host: "",
    method: "icmp",
    intervalMs: 1000,
    enabled: false
  },
  {
    id: "lol-freljord",
    name: "弗雷尔卓德",
    group: "lol",
    host: "",
    method: "icmp",
    intervalMs: 1000,
    enabled: false
  }
];

export const DATA_DIR = "data";
