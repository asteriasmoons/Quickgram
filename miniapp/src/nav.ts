import type { TabId } from "./types";

export interface NavItem {
  id: TabId;
  label: string;
  icon: string;
}

export const navItems: NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: "/miniapp/icons/home.svg"
  },
  {
    id: "library",
    label: "Library",
    icon: "/miniapp/icons/library.svg"
  }
];
